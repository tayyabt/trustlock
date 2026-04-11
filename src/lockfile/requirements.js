/**
 * pip requirements.txt parser.
 *
 * Handles:
 *   - Exact pins:            requests==2.31.0
 *   - Unpinned ranges:       requests>=2.28.0  → pinned: false
 *   - URL requirements:      pkg @ https://...  → sourceType: 'url'
 *   - Hash lines:            --hash=sha256:abc  → stored as integrity
 *   - pip-compile # via:     inline and multi-line via annotations
 *   - PEP 508 normalization: lowercase + hyphen/underscore equivalence
 *
 * Pure function — no I/O, no network, no imports from src/registry/.
 *
 * Public API:
 *   parseRequirements(content) → ResolvedDependency[]
 */

import { validateDependency, SOURCE_TYPES, ECOSYSTEMS } from './models.js';

// Range operators that indicate an unpinned requirement
const RANGE_OPERATORS = ['>=', '<=', '~=', '!=', '>', '<'];

/**
 * Normalize a package name per PEP 508:
 *   - Lowercase
 *   - Replace all underscores with hyphens (hyphen/underscore equivalence)
 *   - Strip leading/trailing whitespace
 *
 * @param {string} name
 * @returns {string}
 */
function _normalizeName(name) {
  return name.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Determine whether a version specifier is an exact pin (==).
 *
 * @param {string} specifier - e.g. "==2.31.0" or ">=2.28.0"
 * @returns {boolean}
 */
function _isExactPin(specifier) {
  return specifier.startsWith('==') && !specifier.startsWith('===');
}

/**
 * Extract the first --hash=<algo>:<digest> value from a continuation line.
 * If a package has multiple --hash lines, only the first is stored as integrity;
 * the rest are alternative digests acceptable by pip but not needed for this model.
 *
 * @param {string} line
 * @returns {string|null}
 */
function _extractHash(line) {
  const m = line.match(/--hash=([a-zA-Z0-9]+:[A-Fa-f0-9]+)/);
  return m ? m[1] : null;
}

/**
 * Collapse physical continuation lines (trailing backslash) into logical lines.
 * Also handles the pip-compile style where hash lines appear as indented
 * continuations after a backslash-terminated package line.
 *
 * Returns an array of logical line objects:
 *   { packageLine: string, hashLines: string[], rawAfterLines: string[] }
 *
 * where rawAfterLines is the list of raw lines that followed the package line
 * (comment lines starting with # included, for via processing).
 *
 * @param {string} content
 * @returns {Array<{ packageLine: string, hashLines: string[], rawAfterLines: string[] }>}
 */
function _groupLines(content) {
  const rawLines = content.split('\n');
  const groups = [];

  let i = 0;
  while (i < rawLines.length) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // Skip blank lines and comment-only lines at the top level
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Global options (--index-url, --trusted-host, etc.) — skip
    if (trimmed.startsWith('-')) {
      // But check if it's a continuation line like "    --hash=..."
      // Those are handled below as part of a package group.
      i++;
      continue;
    }

    // This is a package line (possibly with trailing backslash)
    let packageLine = trimmed.replace(/\s*\\$/, '');
    const hashLines = [];
    const rawAfterLines = [];

    // Consume continuation lines (backslash-terminated)
    let hasContinuation = raw.trimEnd().endsWith('\\');
    i++;

    while (hasContinuation && i < rawLines.length) {
      const contRaw = rawLines[i];
      const contTrimmed = contRaw.trim();
      hasContinuation = contRaw.trimEnd().endsWith('\\');
      const contClean = contTrimmed.replace(/\s*\\$/, '');

      if (contClean.startsWith('--hash=')) {
        hashLines.push(contClean);
      }
      i++;
    }

    // Collect any immediately following comment lines (pip-compile # via)
    while (i < rawLines.length) {
      const nextRaw = rawLines[i];
      const nextTrimmed = nextRaw.trim();
      if (nextTrimmed.startsWith('#')) {
        rawAfterLines.push(nextTrimmed);
        i++;
      } else {
        break;
      }
    }

    groups.push({ packageLine, hashLines, rawAfterLines });
  }

  return groups;
}

/**
 * Extract the via annotation text from comment lines following a package entry.
 *
 * pip-compile emits two forms:
 *   Single-package:  "    # via requests"
 *   Multi-package:   "    # via\n    #   pkgA\n    #   pkgB"
 *
 * @param {string[]} commentLines - trimmed comment lines (start with #)
 * @returns {string|null}
 */
function _extractVia(commentLines) {
  if (commentLines.length === 0) return null;

  for (let i = 0; i < commentLines.length; i++) {
    const line = commentLines[i];
    // Match "# via something" or "# via"
    const viaMatch = line.match(/^#\s+via\s*(.*)$/);
    if (!viaMatch) continue;

    const inline = viaMatch[1].trim();

    if (inline) {
      // Single-package form: "# via requests"
      return inline;
    }

    // Multi-package form: next lines are "#   pkgA", "#   pkgB"
    const names = [];
    for (let j = i + 1; j < commentLines.length; j++) {
      const subMatch = commentLines[j].match(/^#\s{2,}(\S+)$/);
      if (subMatch) {
        names.push(subMatch[1]);
      } else {
        break;
      }
    }

    if (names.length > 0) {
      return names.join(', ');
    }

    return null;
  }

  return null;
}

/**
 * Parse a single package line into its components.
 *
 * Handles:
 *   - "requests==2.31.0"               → exact pin
 *   - "requests>=2.28.0"               → unpinned
 *   - "Pillow==9.0.0"                  → normalized to "pillow"
 *   - "pkg @ https://..."              → URL requirement
 *
 * @param {string} line
 * @returns {{ name: string, version: string, pinned: boolean, sourceType: string, url: string|null }|null}
 */
function _parsePackageLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) return null;

  // URL requirement: "pkg @ https://..."
  const urlMatch = trimmed.match(/^([A-Za-z0-9_\-.]+)\s*@\s*(https?:\/\/\S+)$/);
  if (urlMatch) {
    return {
      name: _normalizeName(urlMatch[1]),
      version: '0.0.0', // URL requirements have no version in the specifier
      pinned: true,      // URL is a fixed reference — treated as pinned
      sourceType: SOURCE_TYPES.url,
      url: urlMatch[2],
    };
  }

  // Standard requirement: name followed by version specifier
  const specMatch = trimmed.match(/^([A-Za-z0-9_\-.]+)\s*([><=!~][=<>!~]?.+)?$/);
  if (!specMatch) return null;

  const rawName = specMatch[1];
  const specifier = specMatch[2] ? specMatch[2].trim() : null;

  const name = _normalizeName(rawName);

  if (!specifier) {
    // No version at all — unpinned
    return { name, version: '', pinned: false, sourceType: SOURCE_TYPES.registry, url: null };
  }

  // Check for range operators (unpinned)
  const isRange = RANGE_OPERATORS.some((op) => specifier.startsWith(op));

  if (isRange || !_isExactPin(specifier)) {
    return {
      name,
      version: specifier, // Store the full specifier as version for display
      pinned: false,
      sourceType: SOURCE_TYPES.registry,
      url: null,
    };
  }

  // Exact pin: "==2.31.0"
  const version = specifier.slice(2).trim(); // strip "=="
  return { name, version, pinned: true, sourceType: SOURCE_TYPES.registry, url: null };
}

/**
 * Parse a pip requirements.txt file into a ResolvedDependency array.
 *
 * @param {string} content - Raw requirements.txt content.
 * @returns {import('./models.js').ResolvedDependency[]}
 */
export function parseRequirements(content) {
  const groups = _groupLines(content);
  const results = [];

  for (const { packageLine, hashLines, rawAfterLines } of groups) {
    const parsed = _parsePackageLine(packageLine);
    if (!parsed) continue;

    // Extract integrity: first --hash line wins; others are alternatives
    let integrity = null;
    for (const hashLine of hashLines) {
      const h = _extractHash(hashLine);
      if (h) {
        integrity = h;
        break;
      }
    }

    const via = _extractVia(rawAfterLines);

    results.push(validateDependency({
      name: parsed.name,
      version: parsed.version || '0.0.0',
      resolved: parsed.url,
      integrity,
      isDev: false,           // requirements.txt has no dev/prod distinction
      hasInstallScripts: null,
      sourceType: parsed.sourceType,
      directDependency: true, // all requirements.txt entries are direct
      ecosystem: ECOSYSTEMS.pypi,
      pinned: parsed.pinned,
      via,
    }));
  }

  return results;
}
