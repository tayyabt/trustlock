/**
 * Baseline manager — data model, create, read, and advance.
 *
 * Baseline structure:
 *   schema_version  {number}   1 (legacy) or 2 (v0.2+)
 *   created_at      {string}   ISO 8601 UTC timestamp
 *   lockfile_hash   {string}   SHA-256 hex of raw lockfile content (caller-computed)
 *   packages        {Object}   Map of package name → TrustProfile
 *
 * TrustProfile structure (schema_version 2):
 *   name              {string}          Package name
 *   version           {string}          Resolved exact version
 *   admittedAt        {string}          ISO 8601 UTC timestamp of admission
 *   provenanceStatus  {string}          "verified" | "unverified" | "unknown"
 *   hasInstallScripts {boolean|null}    From lockfile; null when unavailable
 *   sourceType        {string}          "registry" | "git" | "file" | "url"
 *   publisherAccount  {string|null}     npm account that published this version;
 *                                       null for unmigrated (schema_version 1) entries
 *
 * Schema migration (ADR-006):
 *   - readBaseline accepts schema_version 1 and 2. Schema 1 entries have no
 *     publisherAccount field (treated as null by publisher.js).
 *   - advanceBaseline always writes schema_version 2, populating publisherAccount
 *     from the publisherAccounts map (caller-supplied). Packages absent from the
 *     map receive publisherAccount: null (deferred migration per ADR-006).
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gitAdd } from '../utils/git.js';

/** Schema version written by advanceBaseline and read by readBaseline. */
const WRITE_SCHEMA_VERSION = 2;

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
    schema_version: 1,
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
 *   { error: "unsupported_schema", version } — schema_version is not 1 or 2
 *
 * Accepts both schema_version 1 (v0.1 legacy) and schema_version 2 (v0.2+).
 * Schema version 1 entries will not have a `publisherAccount` field; callers
 * should treat an absent field as null (ADR-006 lazy migration).
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

  if (parsed.schema_version !== 1 && parsed.schema_version !== 2) {
    return { error: 'unsupported_schema', version: parsed.schema_version };
  }

  return parsed;
}

/**
 * Merge newly admitted dependencies into an existing baseline.
 *
 * Always writes schema_version 2 (ADR-006). Every TrustProfile entry in the
 * output includes a `publisherAccount` field:
 *   - Unchanged packages (same name+version): retain original profile, normalise
 *     publisherAccount to `null` if absent (v1 migration for unchanged packages).
 *   - Changed/new packages: fresh TrustProfile; publisherAccount taken from
 *     `publisherAccounts[dep.name]` when supplied, otherwise `null`.
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
 * @param {Object.<string, string|null>} [publisherAccounts={}]  Map of package name →
 *   publisher account string from the current check run. Packages absent from this map
 *   receive `publisherAccount: null` (deferred migration per ADR-006).
 * @returns {{ schema_version: number, created_at: string, updated_at: string, lockfile_hash: string, packages: Object }}
 */
export function advanceBaseline(baseline, admittedDeps, lockfileHash, publisherAccounts = {}) {
  const now = new Date().toISOString();
  const packages = {};

  for (const dep of admittedDeps) {
    const oldProfile = baseline.packages[dep.name];
    if (oldProfile && oldProfile.version === dep.version) {
      // Unchanged: retain original profile, ensure publisherAccount is present (v1→v2 coercion).
      packages[dep.name] = {
        ...oldProfile,
        publisherAccount: oldProfile.publisherAccount ?? null,
      };
    } else {
      // Changed or new: fresh TrustProfile; publisher from check run or null.
      packages[dep.name] = {
        name: dep.name,
        version: dep.version,
        admittedAt: now,
        provenanceStatus: 'unknown',
        hasInstallScripts: dep.hasInstallScripts != null ? dep.hasInstallScripts : null,
        sourceType: dep.sourceType,
        publisherAccount: Object.prototype.hasOwnProperty.call(publisherAccounts, dep.name)
          ? publisherAccounts[dep.name]
          : null,
      };
    }
  }

  return {
    schema_version: WRITE_SCHEMA_VERSION,
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
 * Per ADR-002 the staged path is always `.trustlock/baseline.json` regardless of where
 * baselinePath is written on disk.
 *
 * @param {Object} baseline  Baseline object to persist
 * @param {string} baselinePath  Path to write the baseline JSON file
 * @param {{ _gitAdd?: function, gitRoot?: string }} [opts]  Internal — override gitAdd for unit tests; gitRoot sets cwd for git add
 * @returns {Promise<void>}
 */
export async function writeAndStage(baseline, baselinePath, { _gitAdd = gitAdd, gitRoot } = {}) {
  const dir = dirname(baselinePath);
  const tmp = join(dir, `.baseline-tmp.${process.pid}`);
  await writeFile(tmp, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  await rename(tmp, baselinePath);

  try {
    _gitAdd('.trustlock/baseline.json', { gitRoot });
  } catch {
    process.stderr.write('Warning: could not auto-stage baseline file\n');
  }
}
