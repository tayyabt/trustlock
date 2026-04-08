/**
 * Baseline manager — data model, create, and read.
 *
 * Baseline structure:
 *   schema_version  {number}   Always 1 for v0.1
 *   created_at      {string}   ISO 8601 UTC timestamp
 *   lockfile_hash   {string}   SHA-256 hex of raw lockfile content (caller-computed)
 *   packages        {Object}   Map of package name → TrustProfile
 *
 * TrustProfile structure:
 *   name              {string}          Package name
 *   version           {string}          Resolved exact version
 *   admittedAt        {string}          ISO 8601 UTC timestamp of admission
 *   provenanceStatus  {string}          "verified" | "unverified" | "unknown"
 *   hasInstallScripts {boolean|null}    From lockfile; null when unavailable
 *   sourceType        {string}          "registry" | "git" | "file" | "url"
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gitAdd } from '../utils/git.js';

const SCHEMA_VERSION = 1;

/**
 * Build a new Baseline from resolved dependencies.
 *
 * The caller computes lockfileHash (SHA-256 of raw lockfile content).
 * provenanceStatus defaults to "unknown" — callers with registry data
 * may update individual entries before persisting.
 *
 * @param {import('../lockfile/models.js').ResolvedDependency[]} dependencies
 * @param {string} lockfileHash
 * @returns {{ schema_version: number, created_at: string, lockfile_hash: string, packages: Object }}
 */
export function createBaseline(dependencies, lockfileHash) {
  const now = new Date().toISOString();
  const packages = {};

  for (const dep of dependencies) {
    packages[dep.name] = {
      name: dep.name,
      version: dep.version,
      admittedAt: now,
      provenanceStatus: 'unknown',
      hasInstallScripts: dep.hasInstallScripts != null ? dep.hasInstallScripts : null,
      sourceType: dep.sourceType,
    };
  }

  return {
    schema_version: SCHEMA_VERSION,
    created_at: now,
    lockfile_hash: lockfileHash,
    packages,
  };
}

/**
 * Load and validate the baseline file.
 *
 * Returns a structured error (never throws) for the three expected failure modes:
 *   { error: "not_initialized" }             — file does not exist
 *   { error: "corrupted" }                   — file contains invalid JSON
 *   { error: "unsupported_schema", version } — schema_version is not 1
 *
 * The caller decides the exit code (exit 2 for corrupted/invalid per conventions).
 *
 * @param {string} baselinePath  Absolute or relative path to baseline.json
 * @returns {Promise<Object>} Baseline object or structured error
 */
export async function readBaseline(baselinePath) {
  let content;
  try {
    content = await readFile(baselinePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: 'not_initialized' };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { error: 'corrupted' };
  }

  if (parsed.schema_version !== SCHEMA_VERSION) {
    return { error: 'unsupported_schema', version: parsed.schema_version };
  }

  return parsed;
}

/**
 * Merge newly admitted dependencies into an existing baseline.
 *
 * Algorithm:
 *   - Packages present in admittedDeps with the same name+version as the old baseline
 *     retain their original TrustProfile (preserving admittedAt and provenanceStatus).
 *   - Packages present in admittedDeps with a new name or changed version receive a
 *     fresh TrustProfile with the current timestamp.
 *   - Packages in the old baseline that are absent from admittedDeps are silently
 *     dropped (D3 — removed deps are never re-evaluated).
 *
 * Mode guards (D1, D10) are the caller's responsibility — this function does not check
 * --dry-run or --enforce flags. The caller must only invoke this when all packages are
 * admitted (all-or-nothing).
 *
 * @param {{ schema_version: number, created_at: string, lockfile_hash: string, packages: Object }} baseline
 * @param {import('../lockfile/models.js').ResolvedDependency[]} admittedDeps  Full current dep set
 * @param {string} lockfileHash  SHA-256 hex of the current lockfile content
 * @returns {{ schema_version: number, created_at: string, updated_at: string, lockfile_hash: string, packages: Object }}
 */
export function advanceBaseline(baseline, admittedDeps, lockfileHash) {
  const now = new Date().toISOString();
  const packages = {};

  for (const dep of admittedDeps) {
    const oldProfile = baseline.packages[dep.name];
    if (oldProfile && oldProfile.version === dep.version) {
      packages[dep.name] = oldProfile;
    } else {
      packages[dep.name] = {
        name: dep.name,
        version: dep.version,
        admittedAt: now,
        provenanceStatus: 'unknown',
        hasInstallScripts: dep.hasInstallScripts != null ? dep.hasInstallScripts : null,
        sourceType: dep.sourceType,
      };
    }
  }

  return {
    schema_version: baseline.schema_version,
    created_at: baseline.created_at,
    updated_at: now,
    lockfile_hash: lockfileHash,
    packages,
  };
}

/**
 * Write the baseline to disk (atomic rename) and auto-stage it via `git add`.
 *
 * If `gitAdd` fails (e.g., baseline file is in .gitignore), a warning is written to
 * stderr but no exception is raised — the file on disk is still valid.
 *
 * Per ADR-002 the staged path is always `.dep-fence/baseline.json` regardless of where
 * baselinePath is written on disk.
 *
 * @param {Object} baseline  Baseline object to persist
 * @param {string} baselinePath  Path to write the baseline JSON file
 * @param {{ _gitAdd?: function }} [opts]  Internal — override gitAdd for unit tests
 * @returns {Promise<void>}
 */
export async function writeAndStage(baseline, baselinePath, { _gitAdd = gitAdd } = {}) {
  const dir = dirname(baselinePath);
  const tmp = join(dir, `.baseline-tmp.${process.pid}`);
  await writeFile(tmp, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  await rename(tmp, baselinePath);

  try {
    _gitAdd('.dep-fence/baseline.json');
  } catch {
    process.stderr.write('Warning: could not auto-stage baseline file\n');
  }
}
