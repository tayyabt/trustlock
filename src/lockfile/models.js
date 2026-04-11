/**
 * ResolvedDependency — common data model returned by all lockfile parsers.
 *
 * Fields:
 *   name            {string}          Package name (e.g. "lodash", "@scope/pkg")
 *   version         {string}          Resolved exact version (e.g. "4.17.21")
 *   resolved        {string|null}     Resolved URL; null in rare v1 lockfiles
 *   integrity       {string|null}     Hash (sha512-...) or null for git/file deps
 *   isDev           {boolean}         True if the package is a devDependency
 *   hasInstallScripts {boolean|null}  True/false from v3; null from v1/v2 (unavailable)
 *   sourceType      {string}          One of SOURCE_TYPES values
 *   directDependency {boolean}        True if listed directly in package.json
 *   ecosystem       {string}          One of ECOSYSTEMS values — registry dispatch discriminant
 *   pinned          {boolean}         True for exact-version pins; false for ranges (Python parsers)
 *   via             {string|null}     pip-compile "# via" annotation (Python only); null otherwise
 */

/** Source type constants — use these instead of raw strings. */
export const SOURCE_TYPES = {
  registry: 'registry',
  git: 'git',
  file: 'file',
  url: 'url',
};

/** Ecosystem discriminant — used by registry/client.js to route to the correct adapter. */
export const ECOSYSTEMS = {
  npm: 'npm',
  pypi: 'pypi',
};

const VALID_ECOSYSTEMS = new Set(Object.values(ECOSYSTEMS));

const VALID_SOURCE_TYPES = new Set(Object.values(SOURCE_TYPES));

/**
 * Validate and coerce a plain object into a ResolvedDependency.
 *
 * @param {object} dep - Raw dependency object from a lockfile parser.
 * @returns {ResolvedDependency} Validated plain object.
 * @throws {Error} If required fields are missing or sourceType is invalid.
 */
export function validateDependency(dep) {
  if (dep == null || typeof dep !== 'object') {
    throw new Error('validateDependency: input must be a non-null object');
  }

  if (!dep.name || typeof dep.name !== 'string') {
    throw new Error('validateDependency: missing required field "name"');
  }

  if (!dep.version || typeof dep.version !== 'string') {
    throw new Error('validateDependency: missing required field "version"');
  }

  if (!dep.sourceType || typeof dep.sourceType !== 'string') {
    throw new Error('validateDependency: missing required field "sourceType"');
  }

  if (!VALID_SOURCE_TYPES.has(dep.sourceType)) {
    throw new Error(
      `validateDependency: invalid sourceType "${dep.sourceType}". ` +
      `Must be one of: ${[...VALID_SOURCE_TYPES].join(', ')}`
    );
  }

  if (!dep.ecosystem || typeof dep.ecosystem !== 'string') {
    throw new Error('validateDependency: missing required field "ecosystem"');
  }

  if (!VALID_ECOSYSTEMS.has(dep.ecosystem)) {
    throw new Error(
      `validateDependency: invalid ecosystem "${dep.ecosystem}". ` +
      `Must be one of: ${[...VALID_ECOSYSTEMS].join(', ')}`
    );
  }

  return {
    name: dep.name,
    version: dep.version,
    resolved: dep.resolved != null ? dep.resolved : null,
    integrity: dep.integrity != null ? dep.integrity : null,
    isDev: !!dep.isDev,
    hasInstallScripts: dep.hasInstallScripts != null ? !!dep.hasInstallScripts : null,
    sourceType: dep.sourceType,
    directDependency: !!dep.directDependency,
    ecosystem: dep.ecosystem,
    pinned: dep.pinned != null ? !!dep.pinned : true,
    via: dep.via != null ? dep.via : null,
  };
}
