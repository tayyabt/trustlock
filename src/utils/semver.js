/**
 * Semver subset utilities for trustlock.
 * Handles exact version comparison and range operator detection.
 * Full range resolution is not needed — lockfiles resolve to exact versions.
 */

// Matches: major.minor.patch[-preRelease][+buildMetadata]
// Rejects v-prefix and non-numeric version components.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w][\w.-]*))?(?:\+([\w][\w.-]*))?$/;

/**
 * Parse a semver version string.
 * @param {string} str
 * @returns {{ major: number, minor: number, patch: number, preRelease: string|null, buildMetadata: string|null } | null}
 */
export function parseVersion(str) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  const m = SEMVER_RE.exec(trimmed);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    preRelease: m[4] ?? null,
    buildMetadata: m[5] ?? null,
  };
}

/**
 * Compare two semver version strings.
 * Build metadata is ignored per semver spec.
 * Pre-release versions sort before the release (1.0.0-alpha < 1.0.0).
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (!va || !vb) {
    throw new Error(`compareVersions: invalid version string(s): "${a}", "${b}"`);
  }

  for (const field of ['major', 'minor', 'patch']) {
    if (va[field] < vb[field]) return -1;
    if (va[field] > vb[field]) return 1;
  }

  // Pre-release: a version without pre-release is greater than one with pre-release
  // e.g. 1.0.0-alpha < 1.0.0
  if (va.preRelease !== null && vb.preRelease === null) return -1;
  if (va.preRelease === null && vb.preRelease !== null) return 1;
  if (va.preRelease !== null && vb.preRelease !== null) {
    if (va.preRelease < vb.preRelease) return -1;
    if (va.preRelease > vb.preRelease) return 1;
  }

  return 0;
}

// Range operator prefixes and exact tokens.
// Order matters: check multi-char operators before single-char.
const RANGE_OPERATORS = ['>=', '<=', '||', '^', '~', '>', '<', '*', 'x', 'X'];

/**
 * Return true if the string starts with (or equals) a range operator.
 * @param {string} str
 * @returns {boolean}
 */
export function isRangeOperator(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  return RANGE_OPERATORS.some((op) => trimmed.startsWith(op));
}
