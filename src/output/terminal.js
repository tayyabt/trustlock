/**
 * Terminal formatter for trustlock v0.2.
 *
 * Renders check results, approve confirmations, audit reports, and status
 * messages with ANSI colors for human consumption. All functions return plain
 * strings; the caller (CLI) is responsible for writing to stdout/stderr.
 *
 * Respects NO_COLOR (any non-empty value) and TERM=dumb — ANSI codes are
 * stripped at the output boundary of each exported function.
 *
 * ADR-001: zero runtime dependencies — no imports from other src/ modules.
 * All needed logic (timestamp formatting, rule name mapping) is inlined.
 *
 * Input shapes:
 *
 * @typedef {Object} BlockedEntry
 * @property {string} name
 * @property {string} version
 * @property {string} [oldVersion]
 * @property {Array<{rule: string, severity: 'block'|'warn', message: string, detail?: object}>} findings
 *
 * @typedef {Object} AdmittedWithApprovalEntry
 * @property {string} name
 * @property {string} version
 * @property {string} approver
 * @property {string} expires_at  - ISO 8601 UTC timestamp
 * @property {string} reason
 *
 * @typedef {Object} GroupedCheckResults
 * @property {BlockedEntry[]} blocked
 * @property {AdmittedWithApprovalEntry[]} admitted_with_approval
 * @property {Array<{name: string, version: string}>} new_packages
 * @property {Array<{name: string, version?: string}>} admitted
 *
 * @typedef {Object} ApproveEntry
 * @property {string} package
 * @property {string} version
 * @property {string[]} overrides
 * @property {string} approver
 * @property {string} expires_at  - ISO 8601 UTC timestamp
 * @property {string} reason
 *
 * @typedef {Object} AuditReport
 * @property {number}  totalPackages
 * @property {number}  provenancePct               - 0–100
 * @property {boolean} blockOnRegression
 * @property {string[]} unallowlistedInstallScripts - packages with unallowlisted install scripts
 * @property {string[]} [allowlistedInstallScripts] - packages with allowlisted install scripts
 * @property {{under24h: number, under72h: number, over72h: number}} ageDistribution
 * @property {number}  [exactPinnedCount]
 * @property {number}  [rangePinnedCount]
 * @property {Object.<string, number>} sourceTypeCounts - e.g. { registry: 8, git: 2 }
 */

// ---------------------------------------------------------------------------
// ANSI color constants (ADR-001: no color library)
// ---------------------------------------------------------------------------

const ANSI_RED    = '\x1b[31m';
const ANSI_GREEN  = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_DIM    = '\x1b[2m';
const ANSI_RESET  = '\x1b[0m';

// ---------------------------------------------------------------------------
// Rule-to-override-name map (inlined — no import from approvals/models)
// ---------------------------------------------------------------------------

/**
 * Maps finding rule IDs to the short override names used in trustlock approve --override.
 */
const RULE_TO_OVERRIDE_NAME = new Map([
  ['exposure:cooldown',                 'cooldown'],
  ['execution:scripts',                 'scripts'],
  ['execution:sources',                 'sources'],
  ['trust-continuity:provenance',       'provenance'],
  ['exposure:pinning',                  'pinning'],
  ['delta:new-dependency',              'new-dep'],
  ['delta:transitive-surprise',         'transitive'],
  ['trust-continuity:publisher-change', 'publisher-change'],
]);

/** Rule ID for publisher-change — gets ⚠ marker + "Verify" line. */
const PUBLISHER_CHANGE_RULE = 'trust-continuity:publisher-change';

// ---------------------------------------------------------------------------
// Color helpers (always emit ANSI; stripping happens at the output boundary)
// ---------------------------------------------------------------------------

function red(text)    { return `${ANSI_RED}${text}${ANSI_RESET}`; }
function green(text)  { return `${ANSI_GREEN}${text}${ANSI_RESET}`; }
function yellow(text) { return `${ANSI_YELLOW}${text}${ANSI_RESET}`; }
function dim(text)    { return `${ANSI_DIM}${text}${ANSI_RESET}`; }

// ---------------------------------------------------------------------------
// ANSI stripping (applied at output boundary)
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip all ANSI escape codes from a string. */
function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

/**
 * Returns true when ANSI colors must be suppressed.
 * Checks NO_COLOR (any non-empty value) and TERM=dumb.
 */
function isColorDisabled() {
  const noColor = process.env.NO_COLOR;
  const term    = process.env.TERM;
  return (noColor !== undefined && noColor !== '') || term === 'dumb';
}

// ---------------------------------------------------------------------------
// Timestamp formatting (inlined — no import from utils/time)
// ---------------------------------------------------------------------------

/**
 * Format an ISO 8601 timestamp as an absolute date/time string.
 * Uses local timezone when TZ env var is set; UTC otherwise.
 * @param {string} isoString
 * @returns {string}
 */
function formatAbsoluteTimestamp(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);

  const hasTZ    = process.env.TZ !== undefined && process.env.TZ !== '';
  const timeZone = hasTZ ? process.env.TZ : 'UTC';

  try {
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone,
    }).format(d);
    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    }).format(d);
    const tzLabel = hasTZ ? ` (${timeZone})` : ' UTC';
    return `${datePart} at ${timePart}${tzLabel}`;
  } catch {
    // Invalid TZ value — fall back to UTC
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(d);
    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    }).format(d);
    return `${datePart} at ${timePart} UTC`;
  }
}

// ---------------------------------------------------------------------------
// Shell escaping
// ---------------------------------------------------------------------------

/**
 * Shell-escape a single argument using single-quote wrapping.
 * Handles embedded single quotes via the '\'' idiom.
 * @param {string} arg
 * @returns {string}
 */
function shellEscape(arg) {
  return `'${String(arg).replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// Approval command builder
// ---------------------------------------------------------------------------

/**
 * Build a combined trustlock approve command with all overrides in one flag.
 * Includes --reason and --expires placeholders so the output is copy-pasteable.
 * @param {string} name
 * @param {string} version
 * @param {string[]} overrideNames
 * @returns {string}
 */
function buildApprovalCommand(name, version, overrideNames) {
  if (overrideNames.length === 0) return '';
  const pkgAtVersion = shellEscape(`${name}@${version}`);
  const combined     = shellEscape(overrideNames.join(','));
  return `trustlock approve ${pkgAtVersion} --override ${combined} --reason "..." --expires 7d`;
}

// ---------------------------------------------------------------------------
// Wall-time formatting
// ---------------------------------------------------------------------------

/**
 * Format a wall-time duration in ms as a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatWallTime(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Section renderers (internal — always emit ANSI, stripping at boundary)
// ---------------------------------------------------------------------------

/**
 * Render the summary line.
 * @param {{changed: number, blocked: number, admitted: number}} counts
 * @param {number} wallTimeMs
 * @returns {string}
 */
function renderSummaryLine(counts, wallTimeMs) {
  const { changed, blocked, admitted } = counts;
  const timeStr = formatWallTime(wallTimeMs);
  const text = `${changed} package${changed !== 1 ? 's' : ''} changed \xB7 ${blocked} blocked \xB7 ${admitted} admitted \xB7 ${timeStr}`;
  return blocked > 0 ? yellow(text) : dim(text);
}

/**
 * Render the BLOCKED section (one block per package).
 * @param {BlockedEntry[]} blocked
 * @returns {string}
 */
function renderBlockedSection(blocked) {
  const lines = [];
  lines.push(red('BLOCKED'));
  lines.push(dim('Policy violations — this commit will not proceed until resolved.'));
  lines.push('');

  for (const { name, version, oldVersion, findings = [] } of blocked) {
    const blockFindings = findings.filter((f) => f.severity === 'block');
    const hasPublisherChange = blockFindings.some((f) => f.rule === PUBLISHER_CHANGE_RULE);

    // Rule tags for the header line
    const ruleTags = blockFindings
      .map((f) => `[${RULE_TO_OVERRIDE_NAME.get(f.rule) ?? f.rule}]`)
      .join(' ');

    // Package header: ⚠ marker only for publisher-change
    const versionDisplay = oldVersion ? `${oldVersion} \u2192 ${version}` : version;
    const marker = hasPublisherChange ? '\u26A0 ' : '  ';
    const pkgLine = `${marker}${name}  ${versionDisplay}  ${ruleTags}`;
    lines.push(red(pkgLine));

    // Publisher-change: Verify line always appears first, before diagnoses
    if (hasPublisherChange) {
      lines.push(yellow('  Verify the change is legitimate before approving.'));
    }

    // One diagnosis line per block-severity finding
    for (const finding of blockFindings) {
      lines.push(`  ${finding.message}`);
      if (finding.detail && finding.detail.clears_at) {
        const ts = formatAbsoluteTimestamp(finding.detail.clears_at);
        lines.push(dim(`  Unblocks at: ${ts}`));
      }
      if (finding.detail && Array.isArray(finding.detail.scriptNames) && finding.detail.scriptNames.length > 0) {
        lines.push(dim(`  Scripts: ${finding.detail.scriptNames.join(', ')}`));
      }
    }

    // Combined approve command (single --override with all rule names joined)
    const overrideNames = blockFindings
      .map((f) => RULE_TO_OVERRIDE_NAME.get(f.rule))
      .filter(Boolean);

    if (overrideNames.length > 0) {
      const cmd = buildApprovalCommand(name, version, overrideNames);
      lines.push('');
      lines.push(dim(`  ${cmd}`));
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render the ADMITTED WITH APPROVAL section.
 * @param {AdmittedWithApprovalEntry[]} entries
 * @returns {string}
 */
function renderAdmittedWithApprovalSection(entries) {
  const lines = [];
  lines.push(yellow('ADMITTED (with approval)'));
  lines.push(dim('Passed because an explicit override is on record.'));
  lines.push('');

  for (const { name, version, approver, expires_at, reason } of entries) {
    const expiry     = formatAbsoluteTimestamp(expires_at);
    const reasonPart = reason ? ` \xB7 ${reason}` : '';
    lines.push(
      yellow(`  ${name}@${version}`) +
      `  Approved by ${approver} \xB7 expires ${expiry}${reasonPart}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render the NEW PACKAGES section.
 * @param {Array<{name: string, version: string}>} entries
 * @returns {string}
 */
function renderNewPackagesSection(entries) {
  const lines = [];
  lines.push(yellow('NEW PACKAGES'));
  lines.push(dim('First-time additions to this project — review before committing.'));
  lines.push('');

  for (const { name, version } of entries) {
    lines.push(yellow(`  ${name}@${version}`));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render the ADMITTED section (names only).
 * @param {Array<{name: string, version?: string}>} entries
 * @returns {string}
 */
function renderAdmittedSection(entries) {
  const lines = [];
  lines.push(green('ADMITTED'));
  lines.push('');
  lines.push(dim('  ' + entries.map((e) => e.name).join('  ')));
  lines.push('');
  return lines.join('\n');
}

/**
 * Render the baseline status footer (always last).
 * @param {boolean} anyBlocked
 * @param {number} blockedCount
 * @returns {string}
 */
function renderBaselineFooter(anyBlocked, blockedCount) {
  if (anyBlocked) {
    return yellow(
      `Baseline not advanced \u2014 ${blockedCount} package${blockedCount !== 1 ? 's' : ''} blocked.`,
    );
  }
  return green('Baseline advanced.');
}

// ---------------------------------------------------------------------------
// Public formatters
// ---------------------------------------------------------------------------

/**
 * Format a single-line status message with dim styling.
 * Used for informational messages like "No dependency changes".
 * @param {string} message
 * @returns {string}
 */
export function formatStatusMessage(message) {
  const out = dim(String(message)) + '\n';
  return isColorDisabled() ? stripAnsi(out) : out;
}

/**
 * Format grouped check results for terminal display.
 *
 * Section order: summary → BLOCKED → ADMITTED WITH APPROVAL → NEW PACKAGES →
 * ADMITTED → baseline footer.
 *
 * The ADMITTED section is omitted when it would be the only non-trivial section
 * (i.e., no blocks, no approvals, no new packages — pure admission collapses to
 * summary + footer).
 *
 * @param {GroupedCheckResults} groupedResults
 * @param {number} [wallTimeMs] - Wall time in ms; not measured internally
 * @returns {string}
 */
export function formatCheckResults(groupedResults, wallTimeMs = 0) {
  const {
    blocked                = [],
    admitted_with_approval = [],
    new_packages           = [],
    admitted               = [],
  } = groupedResults ?? {};

  const totalAll = blocked.length + admitted_with_approval.length + admitted.length;
  if (totalAll === 0 && new_packages.length === 0) {
    return formatStatusMessage('No dependency changes');
  }

  const parts = [];

  // 1. Summary line
  const totalChanged  = blocked.length + admitted_with_approval.length + admitted.length;
  const admittedCount = admitted_with_approval.length + admitted.length;
  parts.push(renderSummaryLine(
    { changed: totalChanged, blocked: blocked.length, admitted: admittedCount },
    wallTimeMs,
  ));
  parts.push('');

  // 2. BLOCKED
  if (blocked.length > 0) {
    parts.push(renderBlockedSection(blocked));
  }

  // 3. ADMITTED WITH APPROVAL
  if (admitted_with_approval.length > 0) {
    parts.push(renderAdmittedWithApprovalSection(admitted_with_approval));
  }

  // 4. NEW PACKAGES
  if (new_packages.length > 0) {
    parts.push(renderNewPackagesSection(new_packages));
  }

  // 5. ADMITTED — omit when this is the only non-empty section (pure admission case)
  const hasInterestingSections =
    blocked.length > 0 || admitted_with_approval.length > 0 || new_packages.length > 0;
  if (admitted.length > 0 && hasInterestingSections) {
    parts.push(renderAdmittedSection(admitted));
  }

  // 6. Baseline footer — always last
  parts.push(renderBaselineFooter(blocked.length > 0, blocked.length));

  const out = parts.join('\n') + '\n';
  return isColorDisabled() ? stripAnsi(out) : out;
}

/**
 * Format an approve confirmation for terminal or JSON-mode display.
 *
 * When terminalMode is true, appends a "Commit this file." reminder.
 * When terminalMode is false (JSON mode), the reminder is omitted.
 *
 * @param {ApproveEntry} entry
 * @param {boolean} terminalMode
 * @returns {string}
 */
export function formatApproveConfirmation(entry, terminalMode) {
  const { package: pkg, version, overrides = [], approver, expires_at, reason } = entry;
  const lines = [];

  lines.push(green('\u2713 Approval recorded.'));
  lines.push('');
  lines.push(`  Package:   ${pkg}@${version}`);
  lines.push(`  Overrides: ${overrides.join(', ')}`);
  lines.push(`  Approver:  ${approver}`);
  lines.push(`  Expires:   ${formatAbsoluteTimestamp(expires_at)}`);
  if (reason) {
    lines.push(`  Reason:    ${reason}`);
  }

  if (terminalMode === true) {
    lines.push('');
    lines.push(dim('Commit this file.'));
  }

  const out = lines.join('\n') + '\n';
  return isColorDisabled() ? stripAnsi(out) : out;
}

/**
 * Format an audit report for terminal display.
 *
 * Sections in order:
 *   REGRESSION WATCH → INSTALL SCRIPTS → AGE SNAPSHOT → PINNING → NON-REGISTRY SOURCES
 *
 * @param {AuditReport} report
 * @returns {string}
 */
export function formatAuditReport(report) {
  const {
    totalPackages               = 0,
    provenancePct               = 0,
    blockOnRegression           = false,
    unallowlistedInstallScripts = [],
    allowlistedInstallScripts   = [],
    ageDistribution             = {},
    exactPinnedCount,
    rangePinnedCount,
    sourceTypeCounts            = {},
  } = report;

  const lines = [];

  // ── REGRESSION WATCH ──────────────────────────────────────────────────────
  lines.push(dim('REGRESSION WATCH'));
  lines.push(dim('Checks whether packages lost provenance attestations (a cryptographic record linking the package to its source code and build system).'));
  lines.push('');

  if (provenancePct === 0) {
    lines.push(dim('  No packages with provenance detected. \u2713'));
  } else {
    const withProvenance = Math.round((provenancePct / 100) * totalPackages);
    lines.push(dim(
      `  ${withProvenance} of ${totalPackages} packages have provenance attestation (${Math.round(provenancePct)}%).`,
    ));
    if (blockOnRegression) {
      lines.push(dim('  block_on_regression: enabled'));
    }
  }
  lines.push('');

  // ── INSTALL SCRIPTS ───────────────────────────────────────────────────────
  lines.push(dim('INSTALL SCRIPTS'));
  lines.push(dim('Packages that run code at install time (preinstall / install / postinstall scripts).'));
  lines.push('');

  if (unallowlistedInstallScripts.length === 0 && allowlistedInstallScripts.length === 0) {
    lines.push(dim('  None. \u2713'));
  } else {
    for (const pkg of unallowlistedInstallScripts) {
      lines.push(yellow(`  \u2717 ${pkg}`));
    }
    for (const pkg of allowlistedInstallScripts) {
      lines.push(dim(`  \u2713 ${pkg}`));
    }
  }
  lines.push('');

  // ── AGE SNAPSHOT ──────────────────────────────────────────────────────────
  const { under24h = 0, under72h = 0, over72h = 0 } = ageDistribution;
  lines.push(dim('AGE SNAPSHOT'));
  lines.push(dim('Time since each package version was published to the registry.'));
  lines.push('');
  lines.push(dim(`  < 24h:   ${under24h}`));
  lines.push(dim(`  24\u201372h:  ${under72h}`));
  lines.push(dim(`  > 72h:   ${over72h}`));
  lines.push('');

  // ── PINNING ───────────────────────────────────────────────────────────────
  lines.push(dim('PINNING'));
  lines.push(dim('Whether dependencies are locked to exact versions vs. semver ranges.'));
  lines.push('');

  if (exactPinnedCount !== undefined && rangePinnedCount !== undefined) {
    lines.push(dim(`  ${exactPinnedCount} exactly pinned, ${rangePinnedCount} using range specifiers.`));
  } else {
    lines.push(dim('  Pinning data not available.'));
  }
  lines.push('');

  // ── NON-REGISTRY SOURCES ─────────────────────────────────────────────────
  lines.push(dim('NON-REGISTRY SOURCES'));
  lines.push(dim('Packages installed from git URLs, local paths, or HTTP tarballs instead of the npm registry.'));
  lines.push('');

  const nonRegistryEntries = Object.entries(sourceTypeCounts).filter(([k]) => k !== 'registry');
  if (nonRegistryEntries.length === 0) {
    lines.push(dim('  All packages from registry. \u2713'));
  } else {
    for (const [type, count] of nonRegistryEntries) {
      lines.push(yellow(`  ${type}: ${count}`));
    }
  }
  lines.push('');

  const out = lines.join('\n') + '\n';
  return isColorDisabled() ? stripAnsi(out) : out;
}
