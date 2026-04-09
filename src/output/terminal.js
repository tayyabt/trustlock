/**
 * Terminal formatter for dep-fence.
 *
 * Renders check results, audit reports, and status messages with ANSI colors
 * for human consumption. All functions return plain strings; the caller (CLI)
 * is responsible for writing to stdout/stderr.
 *
 * Respects NO_COLOR (any non-empty value) and TERM=dumb — all ANSI escape
 * codes are suppressed when either is set.
 *
 * Input shapes:
 *   DependencyCheckResult: { name: string, version: string,
 *     checkResult: { decision: string, findings: Finding[], approvalCommand: string|null } }
 *   Finding: { rule: string, severity: 'block'|'warn', message: string, detail: object }
 *   AuditReport: { totalPackages: number, provenancePct: number,
 *     packagesWithInstallScripts: string[], sourceTypeCounts: object,
 *     ageDistribution: { under24h: number, under72h: number, over72h: number },
 *     cooldownViolationCount: number, blockOnRegression: boolean }
 *
 * ADR-001: zero runtime dependencies — ANSI codes are manual constants.
 */

import { formatHumanReadableTimestamp } from '../utils/time.js';
import { FINDING_RULE_TO_APPROVAL_NAME } from '../approvals/models.js';

// ---------------------------------------------------------------------------
// ANSI color constants (ADR-001: no color library)
// ---------------------------------------------------------------------------

const ANSI_RED    = '\x1b[31m';
const ANSI_GREEN  = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_DIM    = '\x1b[2m';
const ANSI_RESET  = '\x1b[0m';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when ANSI colors must be suppressed.
 * Checks NO_COLOR (any non-empty value) and TERM=dumb.
 */
function isColorDisabled() {
  const noColor = process.env.NO_COLOR;
  const term    = process.env.TERM;
  return (noColor !== undefined && noColor !== '') || term === 'dumb';
}

function red(text, disabled)    { return disabled ? text : `${ANSI_RED}${text}${ANSI_RESET}`; }
function green(text, disabled)  { return disabled ? text : `${ANSI_GREEN}${text}${ANSI_RESET}`; }
function yellow(text, disabled) { return disabled ? text : `${ANSI_YELLOW}${text}${ANSI_RESET}`; }
function dim(text, disabled)    { return disabled ? text : `${ANSI_DIM}${text}${ANSI_RESET}`; }

// ---------------------------------------------------------------------------
// Approval command builder
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

/**
 * Build a copy-pasteable `dep-fence approve` command.
 * @param {string} name - Package name (e.g. "lodash", "@scope/pkg")
 * @param {string} version - Exact resolved version
 * @param {string[]} blockingRules - Rule identifiers from block-severity findings
 * @returns {string}
 */
function buildApprovalCommand(name, version, blockingRules) {
  const pkgAtVersion = shellEscape(`${name}@${version}`);
  const overrideFlags = blockingRules.map((r) => `--override ${shellEscape(r)}`).join(' ');
  return `dep-fence approve ${pkgAtVersion} ${overrideFlags}`.trimEnd();
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
  const noColor = isColorDisabled();
  return dim(String(message), noColor) + '\n';
}

/**
 * Format an array of per-package check results for terminal display.
 * Returns "No dependency changes" (via formatStatusMessage) for an empty array.
 *
 * @param {DependencyCheckResult[]} results
 * @returns {string}
 */
export function formatCheckResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return formatStatusMessage('No dependency changes');
  }

  const noColor = isColorDisabled();
  const sections = [];

  for (const { name, version, checkResult } of results) {
    const { decision, findings = [] } = checkResult;
    const lines = [];

    // Decision line — colored by outcome
    const pkg = `${name}@${version}`;
    if (decision === 'blocked') {
      lines.push(red(`${pkg}  blocked`, noColor));
    } else if (decision === 'admitted_with_approval') {
      lines.push(green(`${pkg}  admitted (with approval)`, noColor));
    } else {
      lines.push(green(`${pkg}  admitted`, noColor));
    }

    // Findings — all findings printed, no truncation
    for (const finding of findings) {
      const tag    = finding.severity === 'block' ? '[block]' : '[warn] ';
      let detail   = '';

      // D4: cooldown findings include human-readable clears_at timestamp
      if (finding.detail && finding.detail.clears_at) {
        const human = formatHumanReadableTimestamp(finding.detail.clears_at);
        detail = ` (clears ${human})`;
      }

      const text = `  ${tag} ${finding.message}${detail}`;
      lines.push(finding.severity === 'block' ? yellow(text, noColor) : dim(text, noColor));
    }

    // Approval command for blocked packages
    if (decision === 'blocked') {
      const blockingRules = findings
        .filter((f) => f.severity === 'block')
        .map((f) => FINDING_RULE_TO_APPROVAL_NAME.get(f.rule) ?? f.rule);
      const cmd = buildApprovalCommand(name, version, blockingRules);
      lines.push(dim(`  Run to approve: ${cmd}`, noColor));
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n') + '\n';
}

/**
 * Format an audit report for terminal display.
 * Includes summary statistics and conditional heuristic suggestions.
 *
 * @param {AuditReport} report
 * @returns {string}
 */
export function formatAuditReport(report) {
  const {
    totalPackages             = 0,
    provenancePct             = 0,
    packagesWithInstallScripts = [],
    sourceTypeCounts           = {},
    ageDistribution            = {},
    cooldownViolationCount     = 0,
    blockOnRegression          = false,
  } = report;

  const noColor = isColorDisabled();
  const lines   = [];

  // Header
  lines.push('Audit Summary');
  lines.push(dim(`  Total packages:   ${totalPackages}`, noColor));
  lines.push(dim(`  Provenance:       ${Number(provenancePct).toFixed(0)}%`, noColor));

  // Install scripts
  if (packagesWithInstallScripts.length > 0) {
    lines.push(dim(`  Install scripts (${packagesWithInstallScripts.length}): ${packagesWithInstallScripts.join(', ')}`, noColor));
  } else {
    lines.push(dim('  Install scripts:  none', noColor));
  }

  // Source type breakdown
  const sourceEntries = Object.entries(sourceTypeCounts);
  if (sourceEntries.length > 0) {
    const breakdown = sourceEntries.map(([k, v]) => `${k}:${v}`).join(', ');
    lines.push(dim(`  Source types:     ${breakdown}`, noColor));
  }

  // Age distribution
  const { under24h = 0, under72h = 0, over72h = 0 } = ageDistribution;
  lines.push(dim(`  Age:              <24h:${under24h}  24–72h:${under72h}  >72h:${over72h}`, noColor));

  // Conditional heuristic suggestions
  const suggestions = [];

  if (totalPackages > 0 && cooldownViolationCount / totalPackages > 0.5) {
    suggestions.push('High cooldown violation rate — consider lowering cooldown_hours');
  }

  if (provenancePct === 0 && blockOnRegression) {
    suggestions.push('No packages have provenance — block_on_regression has no effect');
  }

  if (provenancePct === 0) {
    suggestions.push(
      'Consider relaxing block_on_regression since no packages have provenance (0% provenance)',
    );
  }

  if (suggestions.length > 0) {
    lines.push('');
    lines.push(yellow('  Suggestions:', noColor));
    for (const s of suggestions) {
      lines.push(yellow(`    \u2022 ${s}`, noColor));
    }
  }

  return lines.join('\n') + '\n';
}
