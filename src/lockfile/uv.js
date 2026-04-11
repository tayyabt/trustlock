/**
 * uv.lock parser — purpose-built line-by-line TOML subset.
 *
 * Handles only the TOML constructs that uv.lock actually emits:
 *   - [[package]] section headers
 *   - key = "value" scalar pairs (quoted and unquoted)
 *   - source = { type = "...", url = "...", path = "..." } inline tables
 *   - Dependency arrays (skipped — not needed for registry dispatch)
 *
 * Unknown constructs outside this scope are skipped silently (uv may add
 * new fields in minor versions that trustlock does not care about).
 *
 * Source type dispatch:
 *   source.registry → sourceType: 'registry'
 *   source.path     → sourceType: 'file'   (policy engine excludes these — C12)
 *   source.git      → sourceType: 'git'
 *   (absent)        → sourceType: 'registry' (default)
 *
 * Pure function — no I/O, no network, no imports from src/registry/.
 *
 * Public API:
 *   parseUv(content) → ResolvedDependency[]
 */

import { validateDependency, SOURCE_TYPES, ECOSYSTEMS } from './models.js';

/**
 * Strip surrounding double or single quotes from a TOML scalar value.
 *
 * @param {string} s
 * @returns {string}
 */
function _unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse a TOML inline table into a plain object.
 * Scoped to the flat key=value pairs uv.lock emits inside { }.
 *
 * Examples uv.lock emits:
 *   { registry = "https://pypi.org/simple" }
 *   { path = "../my-lib" }
 *   { git = "https://github.com/example/repo.git?rev=abc" }
 *   { url = "https://files.../pkg.tar.gz", hash = "sha256:abc" }
 *
 * @param {string} raw - The inline-table string including outer braces.
 * @returns {object}
 */
function _parseInlineTable(raw) {
  const result = {};
  // Strip outer braces
  const inner = raw.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return result;

  // Split on commas that are NOT inside quotes
  // Simple approach: walk character by character
  const pairs = [];
  let current = '';
  let inQuote = false;
  let quoteChar = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === ',') {
      pairs.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) pairs.push(current.trim());

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = _unquote(pair.slice(eqIdx + 1).trim());
    result[key] = value;
  }

  return result;
}

/**
 * Classify a uv.lock `source` inline table into a SOURCE_TYPES value.
 *
 * @param {object|null} source - Parsed inline table or null.
 * @returns {string}
 */
function _classifySource(source) {
  if (!source) return SOURCE_TYPES.registry;

  // uv.lock uses "registry", "path", or "git" as the first key in the inline table
  if ('path' in source) return SOURCE_TYPES.file;
  if ('git' in source) return SOURCE_TYPES.git;
  if ('registry' in source) return SOURCE_TYPES.registry;

  // Future source types — default to registry (unknown constructs silently skipped)
  return SOURCE_TYPES.registry;
}

/**
 * Parse a uv.lock file into a ResolvedDependency array.
 *
 * Processes [[package]] sections only. All other top-level sections
 * (e.g. `version`, `requires-python`, `[manifest]`) are skipped.
 *
 * @param {string} content - Raw uv.lock file content.
 * @returns {import('./models.js').ResolvedDependency[]}
 */
export function parseUv(content) {
  const lines = content.split('\n');
  const results = [];

  let inPackage = false;
  let currentPkg = null;

  const flush = () => {
    if (!currentPkg || !currentPkg.name || !currentPkg.version) {
      currentPkg = null;
      return;
    }
    const sourceType = _classifySource(currentPkg.source);
    results.push(validateDependency({
      name: currentPkg.name,
      version: currentPkg.version,
      resolved: null,
      integrity: null,
      isDev: false,
      hasInstallScripts: null,
      sourceType,
      directDependency: false,
      ecosystem: ECOSYSTEMS.pypi,
    }));
    currentPkg = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // [[package]] section header — start new package
    if (trimmed === '[[package]]') {
      flush();
      inPackage = true;
      currentPkg = { name: null, version: null, source: null };
      continue;
    }

    // Any other section header exits package context
    if (trimmed.startsWith('[') && !trimmed.startsWith('[[package]]')) {
      flush();
      inPackage = false;
      continue;
    }

    if (!inPackage || !currentPkg) continue;

    // Skip blank lines and comment lines within a package block
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Parse key = value pairs
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const rawValue = trimmed.slice(eqIdx + 1).trim();

    if (key === 'name') {
      currentPkg.name = _unquote(rawValue);
    } else if (key === 'version') {
      currentPkg.version = _unquote(rawValue);
    } else if (key === 'source') {
      // Inline table: source = { ... }
      if (rawValue.startsWith('{')) {
        currentPkg.source = _parseInlineTable(rawValue);
      }
      // Multi-line source tables are not emitted by uv — skip silently
    }
    // All other keys (dependencies, sdist, wheels, etc.) are skipped silently
  }

  flush();
  return results;
}
