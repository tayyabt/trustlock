/**
 * Lockfile format detection and parser router.
 *
 * Public API:
 *   detectFormat(lockfilePath) → { format, version }
 *   parseLockfile(lockfilePath, packageJsonPath) → ResolvedDependency[]
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseNpm } from './npm.js';
import { parsePnpm, _parseLockfileVersion as _parsePnpmVersion } from './pnpm.js';

const SUPPORTED_NPM_VERSIONS = new Set([1, 2, 3]);
const SUPPORTED_PNPM_VERSIONS = new Set([5, 6, 9]);

/**
 * Determine format and version from a parsed lockfile object and filename.
 * Calls process.exit(2) on unrecognized format or unsupported version.
 *
 * @param {object} parsed   - Parsed lockfile JSON.
 * @param {string} filename - Lockfile basename (e.g. "package-lock.json").
 * @returns {{ format: string, version: number }}
 */
function _detectFromParsed(parsed, filename) {
  if (filename === 'package-lock.json') {
    const version = parsed.lockfileVersion;
    if (version == null || !SUPPORTED_NPM_VERSIONS.has(version)) {
      console.error(
        `Unsupported npm lockfile version ${version}. trustlock supports v1, v2, v3.`
      );
      process.exit(2);
    }
    return { format: 'npm', version };
  }

  // yarn.lock support deferred to v0.2 (F11-S2)
  console.error(`Unrecognized lockfile format: ${filename}`);
  process.exit(2);
}

/**
 * Read a lockfile, detect its format and schema version.
 *
 * @param {string} lockfilePath - Absolute or relative path to the lockfile.
 * @returns {Promise<{ format: string, version: number }>}
 */
export async function detectFormat(lockfilePath) {
  const filename = basename(lockfilePath);

  let content;
  try {
    content = await readFile(lockfilePath, 'utf8');
  } catch {
    console.error(`Lockfile not found: ${lockfilePath}`);
    process.exit(2);
  }

  // pnpm branch — YAML, not JSON (auto-detect: pnpm-lock.yaml; or --lockfile <any>.yaml)
  if (filename === 'pnpm-lock.yaml' || filename.endsWith('.yaml')) {
    const version = _parsePnpmVersion(content);
    if (!SUPPORTED_PNPM_VERSIONS.has(version)) {
      console.error(
        `Unsupported pnpm lockfile version ${version}. trustlock supports v5, v6, v9.`
      );
      process.exit(2);
    }
    return { format: 'pnpm', version };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to parse lockfile as JSON: ${lockfilePath}: ${err.message}`);
    process.exit(2);
  }

  return _detectFromParsed(parsed, filename);
}

/**
 * Parse a lockfile into a ResolvedDependency array.
 *
 * Reads the lockfile, detects format, and delegates to the format-specific parser.
 * Calls process.exit(2) on any fatal error (missing files, unsupported version).
 *
 * @param {string} lockfilePath      - Path to the lockfile.
 * @param {string} packageJsonPath   - Path to the companion package.json.
 * @returns {Promise<ResolvedDependency[]>}
 */
export async function parseLockfile(lockfilePath, packageJsonPathOrProjectRoot) {
  const filename = basename(lockfilePath);

  // Read lockfile
  let lockfileContent;
  try {
    lockfileContent = await readFile(lockfilePath, 'utf8');
  } catch {
    console.error(`Lockfile not found: ${lockfilePath}`);
    process.exit(2);
  }

  // pnpm branch — YAML, not JSON; second argument is projectRoot (string | null)
  // Auto-detect: pnpm-lock.yaml by convention; any .yaml file via --lockfile override
  if (filename === 'pnpm-lock.yaml' || filename.endsWith('.yaml')) {
    // parsePnpm validates the version and calls process.exit(2) if unsupported
    return parsePnpm(lockfileContent, packageJsonPathOrProjectRoot);
  }

  // npm branch — Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(lockfileContent);
  } catch (err) {
    console.error(`Failed to parse lockfile as JSON: ${lockfilePath}: ${err.message}`);
    process.exit(2);
  }

  // Detect format (exits on unsupported version)
  const { format } = _detectFromParsed(parsed, filename);

  // Read package.json (needed by npm parser for directDependency classification)
  const packageJsonPath = packageJsonPathOrProjectRoot;
  let packageJsonContent;
  try {
    packageJsonContent = await readFile(packageJsonPath, 'utf8');
  } catch {
    console.error(`package.json not found: ${packageJsonPath}`);
    process.exit(2);
  }

  if (format === 'npm') {
    return parseNpm(lockfileContent, packageJsonContent);
  }

  // Unreachable: _detectFromParsed exits on non-npm formats
  /* c8 ignore next 2 */
  console.error(`Unsupported format: ${format}`);
  /* c8 ignore next */
  process.exit(2);
}
