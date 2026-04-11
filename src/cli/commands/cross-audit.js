/**
 * `trustlock audit --compare` — cross-project audit command (F17).
 *
 * Reads lockfiles from multiple project directories and produces a unified
 * report of version drift, provenance inconsistency, and allowlist inconsistency.
 *
 * This is a passive, informational command:
 *   - No policy evaluation; `.trustlockrc.json` is read ONLY for `scripts.allowlist`.
 *   - No baseline modification.
 *   - Always exits 0 (unless fewer than two dirs, or a dir is not found).
 *
 * Exit codes:
 *   0 — command completed (with or without inconsistencies found)
 *   2 — fatal: fewer than two directories supplied, or a directory not found
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';

import { parseLockfile } from '../../lockfile/parser.js';
import { _parseLockfileVersion as _parsePnpmVersion } from '../../lockfile/pnpm.js';
import { readBaseline } from '../../baseline/manager.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lockfile candidates checked per directory (in preference order). */
const LOCKFILE_CANDIDATES = ['package-lock.json', 'pnpm-lock.yaml'];

/** Supported pnpm lockfile versions — must match pnpm.js. */
const SUPPORTED_PNPM_VERSIONS = new Set([5, 6, 9]);

// ---------------------------------------------------------------------------
// ANSI helpers (inline — ADR-001: zero runtime deps; mirrors terminal.js style)
// ---------------------------------------------------------------------------

const ANSI_RED    = '\x1b[31m';
const ANSI_GREEN  = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_DIM    = '\x1b[2m';
const ANSI_RESET  = '\x1b[0m';
const ANSI_RE     = /\x1b\[[0-9;]*m/g;

function _isColorDisabled() {
  const noColor = process.env.NO_COLOR;
  const term    = process.env.TERM;
  return (noColor !== undefined && noColor !== '') || term === 'dumb';
}

function _color(code, text) { return `${code}${text}${ANSI_RESET}`; }
function _dim(t)    { return _color(ANSI_DIM, t); }
function _green(t)  { return _color(ANSI_GREEN, t); }
function _yellow(t) { return _color(ANSI_YELLOW, t); }
function _red(t)    { return _color(ANSI_RED, t); }

function _out(text) {
  return _isColorDisabled() ? text.replace(ANSI_RE, '') : text;
}

// ---------------------------------------------------------------------------
// source.path filter (C12 — uv.lock path exclusion)
//
// In uv.lock, workspace-local path dependencies are represented as entries
// with no URL protocol in their `resolved` field (e.g. resolved = "../local-pkg").
// These must be excluded from all cross-project comparison passes.
//
// For npm `file:` entries, `resolved` contains the "file:" protocol, so they
// are NOT affected by this filter.
//
// For currently supported formats (npm, pnpm), this is a no-op — the filter
// is a placeholder for future uv.lock support.
// ---------------------------------------------------------------------------

/**
 * Remove source.path entries from a dep array.
 * A source.path entry has sourceType "file" AND a resolved value that does
 * not contain a URL protocol ("://" or a leading protocol like "file:").
 *
 * @param {import('../../lockfile/models.js').ResolvedDependency[]} deps
 * @returns {import('../../lockfile/models.js').ResolvedDependency[]}
 */
export function filterSourcePathEntries(deps) {
  return deps.filter((dep) => {
    if (dep.sourceType !== 'file') return true;
    const resolved = dep.resolved ?? '';
    // Keep npm file: entries (have protocol); exclude bare-path entries (no protocol)
    return resolved.includes(':');
  });
}

// ---------------------------------------------------------------------------
// Comparison passes
// ---------------------------------------------------------------------------

/**
 * Compute version drift: packages present in ≥2 directories at differing versions.
 * Packages present in only one directory are not reported.
 *
 * @param {Array<{ dir: string, deps: import('../../lockfile/models.js').ResolvedDependency[] }>} projects
 * @returns {Array<{ name: string, entries: Array<{ dir: string, version: string }> }>}
 */
export function computeVersionDrift(projects) {
  // Map name → { dir → version }
  const byName = new Map();
  for (const { dir, deps } of projects) {
    for (const dep of deps) {
      if (!byName.has(dep.name)) byName.set(dep.name, new Map());
      byName.get(dep.name).set(dir, dep.version);
    }
  }

  const drift = [];
  for (const [name, dirVersions] of byName) {
    if (dirVersions.size < 2) continue; // present in only one directory — skip
    const versions = new Set(dirVersions.values());
    if (versions.size === 1) continue; // same version everywhere — no drift
    drift.push({
      name,
      entries: [...dirVersions.entries()].map(([dir, version]) => ({ dir, version })),
    });
  }

  return drift.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute provenance inconsistency: packages at the same name but different
 * versions, where provenance state (verified vs unverified) differs across
 * directories.
 *
 * Provenance status comes from the baseline for each directory. Packages with
 * "unknown" provenance in any directory are excluded from this check.
 *
 * @param {Array<{ dir: string, deps: import('../../lockfile/models.js').ResolvedDependency[], provenanceMap: Map<string, string> }>} projects
 * @returns {Array<{ name: string, entries: Array<{ dir: string, version: string, provenanceStatus: string }> }>}
 */
export function computeProvenanceInconsistency(projects) {
  // Map name → Array<{ dir, version, provenanceStatus }>
  const byName = new Map();
  for (const { dir, deps, provenanceMap } of projects) {
    for (const dep of deps) {
      const status = provenanceMap.get(dep.name) ?? 'unknown';
      if (!byName.has(dep.name)) byName.set(dep.name, []);
      byName.get(dep.name).push({ dir, version: dep.version, provenanceStatus: status });
    }
  }

  const inconsistencies = [];
  for (const [name, entries] of byName) {
    if (entries.length < 2) continue; // only in one directory

    // Filter out entries with unknown provenance
    const knownEntries = entries.filter((e) => e.provenanceStatus !== 'unknown');
    if (knownEntries.length < 2) continue; // not enough known entries to compare

    // Check: must have different versions (same version = not an inconsistency)
    const versions = new Set(knownEntries.map((e) => e.version));
    if (versions.size === 1) continue; // same version — no inconsistency per story spec

    // Check: provenance state differs among known entries
    const statuses = new Set(knownEntries.map((e) => e.provenanceStatus));
    if (statuses.size === 1) continue; // same provenance state everywhere

    inconsistencies.push({ name, entries: knownEntries });
  }

  return inconsistencies.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute allowlist inconsistency: packages in one directory's `scripts.allowlist`
 * that are absent from at least one other directory's `scripts.allowlist`.
 *
 * @param {Array<{ dir: string, allowlist: string[] }>} projects
 * @returns {Array<{ name: string, presentIn: string[], absentIn: string[] }>}
 */
export function computeAllowlistInconsistency(projects) {
  if (projects.length < 2) return [];

  // Union of all allowlisted package names
  const allNames = new Set();
  const allowlistSets = projects.map(({ allowlist }) => new Set(allowlist));
  for (const s of allowlistSets) {
    for (const name of s) allNames.add(name);
  }

  const inconsistencies = [];
  for (const name of allNames) {
    const presentIn = [];
    const absentIn  = [];
    for (let i = 0; i < projects.length; i++) {
      if (allowlistSets[i].has(name)) {
        presentIn.push(projects[i].dir);
      } else {
        absentIn.push(projects[i].dir);
      }
    }
    if (absentIn.length > 0 && presentIn.length > 0) {
      inconsistencies.push({ name, presentIn, absentIn });
    }
  }

  return inconsistencies.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Per-directory data loading
// ---------------------------------------------------------------------------

/**
 * Detect and parse the lockfile in a directory, or return null if none found.
 * Emits a stderr warning and returns null when the lockfile is missing or
 * uses an unsupported pnpm version — does NOT call process.exit.
 *
 * @param {string} dir  Absolute directory path
 * @returns {Promise<import('../../lockfile/models.js').ResolvedDependency[]|null>}
 */
async function _detectAndParse(dir) {
  let lockfilePath = null;

  for (const candidate of LOCKFILE_CANDIDATES) {
    const fp = join(dir, candidate);
    try {
      await stat(fp);
      lockfilePath = fp;
      break;
    } catch {
      // not found — try next candidate
    }
  }

  if (!lockfilePath) {
    process.stderr.write(`warning: no recognised lockfile in ${dir} — skipping\n`);
    return null;
  }

  // Pre-validate pnpm version to avoid process.exit(2) inside parsePnpm.
  if (lockfilePath.endsWith('pnpm-lock.yaml')) {
    let content;
    try {
      content = await readFile(lockfilePath, 'utf8');
    } catch {
      process.stderr.write(`warning: could not read ${lockfilePath} — skipping\n`);
      return null;
    }
    const version = _parsePnpmVersion(content);
    if (!SUPPORTED_PNPM_VERSIONS.has(version)) {
      process.stderr.write(
        `warning: unsupported pnpm lockfile version ${version} in ${dir} — skipping\n`
      );
      return null;
    }
  }

  // Delegate to the existing format-detection router.
  const packageJsonPath = join(dir, 'package.json');
  const deps = await parseLockfile(lockfilePath, packageJsonPath);
  return filterSourcePathEntries(deps);
}

/**
 * Read `scripts.allowlist` from `.trustlockrc.json` in a directory.
 * Returns [] if the file is absent or cannot be parsed; ignores `extends`.
 *
 * @param {string} dir  Absolute directory path
 * @returns {Promise<string[]>}
 */
async function _readAllowlist(dir) {
  const rcPath = join(dir, '.trustlockrc.json');
  try {
    const content = await readFile(rcPath, 'utf8');
    const rc = JSON.parse(content);
    const allowlist = rc?.scripts?.allowlist;
    return Array.isArray(allowlist) ? allowlist : [];
  } catch {
    return [];
  }
}

/**
 * Build a provenance map for a directory from its baseline.
 * Returns a Map<packageName, provenanceStatus> where provenanceStatus is
 * "verified", "unverified", or "unknown".
 *
 * @param {string} dir  Absolute directory path
 * @param {import('../../lockfile/models.js').ResolvedDependency[]} deps
 * @returns {Promise<Map<string, string>>}
 */
async function _buildProvenanceMap(dir, deps) {
  const baselinePath = join(dir, '.trustlock', 'baseline.json');
  const baseline = await readBaseline(baselinePath);

  const map = new Map();
  for (const dep of deps) {
    if (baseline.error) {
      map.set(dep.name, 'unknown');
      continue;
    }
    const profile = baseline.packages?.[dep.name];
    if (!profile || profile.version !== dep.version) {
      // Package not in baseline or version mismatch — provenance unknown
      map.set(dep.name, 'unknown');
    } else {
      map.set(dep.name, profile.provenanceStatus ?? 'unknown');
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format and write the cross-audit report to stdout.
 *
 * @param {ReturnType<typeof computeVersionDrift>} drift
 * @param {ReturnType<typeof computeProvenanceInconsistency>} provenanceIssues
 * @param {ReturnType<typeof computeAllowlistInconsistency>} allowlistIssues
 * @param {string[]} dirs  The directory labels (short names or paths)
 */
function _printReport(drift, provenanceIssues, allowlistIssues, dirs) {
  const lines = [];

  lines.push(_dim('CROSS-PROJECT AUDIT'));
  lines.push(_dim(`Comparing ${dirs.length} directories: ${dirs.join(', ')}`));
  lines.push('');

  // ── VERSION DRIFT ──────────────────────────────────────────────────────────
  lines.push(_dim('VERSION DRIFT'));
  lines.push('');
  if (drift.length === 0) {
    lines.push(_dim('  No version drift detected. \u2713'));
  } else {
    for (const { name, entries } of drift) {
      lines.push(_yellow(`  ${name}`));
      for (const { dir, version } of entries) {
        lines.push(`    ${dir}  ${version}`);
      }
    }
  }
  lines.push('');

  // ── PROVENANCE INCONSISTENCY ───────────────────────────────────────────────
  lines.push(_dim('PROVENANCE INCONSISTENCY'));
  lines.push('');
  if (provenanceIssues.length === 0) {
    lines.push(_dim('  No provenance inconsistencies. \u2713'));
  } else {
    for (const { name, entries } of provenanceIssues) {
      lines.push(_yellow(`  ${name}`));
      for (const { dir, version, provenanceStatus } of entries) {
        const statusLabel = provenanceStatus === 'verified' ? _green('verified') : _red('unverified');
        lines.push(`    ${dir}  ${version}  ${statusLabel}`);
      }
    }
  }
  lines.push('');

  // ── ALLOWLIST INCONSISTENCY ────────────────────────────────────────────────
  lines.push(_dim('ALLOWLIST INCONSISTENCY'));
  lines.push('');
  if (allowlistIssues.length === 0) {
    lines.push(_dim('  No allowlist inconsistencies. \u2713'));
  } else {
    for (const { name, presentIn, absentIn } of allowlistIssues) {
      lines.push(_yellow(`  ${name}`));
      lines.push(`    allowlisted in: ${presentIn.join(', ')}`);
      lines.push(`    absent in:      ${absentIn.join(', ')}`);
    }
  }
  lines.push('');

  process.stdout.write(_out(lines.join('\n') + '\n'));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run the `audit --compare` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _cwd?: string }} [_opts]  Injectable override for cwd (tests)
 */
export async function run(args, { _cwd } = {}) {
  const cwd = _cwd ?? process.cwd();

  // The audit command is positionals[0]; directories follow as positionals[1..n].
  const dirs = args.positionals.slice(1);

  if (dirs.length < 2) {
    process.stderr.write('--compare requires at least two directories.\n');
    process.exitCode = 2;
    return;
  }

  // Resolve paths: absolute as-is, relative from cwd.
  const resolvedDirs = dirs.map((d) => (isAbsolute(d) ? d : resolve(cwd, d)));

  // Validate all directories exist before starting any work.
  for (const dir of resolvedDirs) {
    let s;
    try {
      s = await stat(dir);
    } catch {
      process.stderr.write(`Directory not found: ${dir}.\n`);
      process.exitCode = 2;
      return;
    }
    if (!s.isDirectory()) {
      process.stderr.write(`Directory not found: ${dir}.\n`);
      process.exitCode = 2;
      return;
    }
  }

  // Load per-directory data.
  const projects = [];
  for (const dir of resolvedDirs) {
    const deps = await _detectAndParse(dir);
    if (deps === null) continue; // skip — warning already emitted

    const [allowlist, provenanceMap] = await Promise.all([
      _readAllowlist(dir),
      _buildProvenanceMap(dir, deps),
    ]);

    projects.push({ dir, deps, allowlist, provenanceMap });
  }

  // Run comparison passes.
  const drift            = computeVersionDrift(projects);
  const provenanceIssues = computeProvenanceInconsistency(projects);
  const allowlistIssues  = computeAllowlistInconsistency(
    projects.map(({ dir, allowlist }) => ({ dir, allowlist }))
  );

  // Print report.
  _printReport(drift, provenanceIssues, allowlistIssues, resolvedDirs);

  // Exit 0 always (informational command, D6).
}
