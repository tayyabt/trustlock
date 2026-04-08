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

import { readFile } from 'node:fs/promises';

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
