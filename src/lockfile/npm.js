/**
 * npm lockfile parser — v1, v2, v3.
 *
 * Public API:
 *   parseNpm(lockfileContent, packageJsonContent) → ResolvedDependency[]
 */

import { validateDependency, SOURCE_TYPES } from './models.js';

/**
 * Classify the source type of a dependency from its resolved URL.
 *
 * @param {string|null|undefined} resolved
 * @returns {string} One of SOURCE_TYPES values.
 */
function _classifySource(resolved) {
  if (!resolved) {
    return SOURCE_TYPES.registry;
  }
  if (resolved.startsWith('git+') || resolved.startsWith('github:')) {
    return SOURCE_TYPES.git;
  }
  if (resolved.startsWith('file:')) {
    return SOURCE_TYPES.file;
  }
  if (
    resolved.startsWith('https://registry.npmjs.org') ||
    resolved.startsWith('http://registry.npmjs.org')
  ) {
    return SOURCE_TYPES.registry;
  }
  // Any other URL (private registries, custom CDNs, etc.)
  return SOURCE_TYPES.url;
}

/**
 * Parse a v1 lockfile's nested `dependencies` tree into a flat array.
 * Recursively walks nested `dependencies` within each entry.
 *
 * @param {object} dependencies - The `dependencies` object from the lockfile.
 * @param {Set<string>} directSet - Package names listed directly in package.json (deps + devDeps).
 * @param {Set<string>} devSet    - Package names listed only in devDependencies.
 * @returns {ResolvedDependency[]}
 */
function _parseV1(dependencies, directSet, devSet) {
  if (!dependencies || typeof dependencies !== 'object') {
    return [];
  }

  const results = [];

  for (const [name, entry] of Object.entries(dependencies)) {
    const resolved = entry.resolved != null ? entry.resolved : null;
    const sourceType = _classifySource(resolved);
    const isDev = devSet.has(name) && !directSet.has(name)
      ? true
      : (entry.dev === true);

    results.push(validateDependency({
      name,
      version: entry.version,
      resolved,
      integrity: entry.integrity != null ? entry.integrity : null,
      isDev,
      hasInstallScripts: null,
      sourceType,
      directDependency: directSet.has(name),
    }));

    // Recurse into nested dependencies
    if (entry.dependencies && typeof entry.dependencies === 'object') {
      const nested = _parseV1(entry.dependencies, directSet, devSet);
      results.push(...nested);
    }
  }

  return results;
}

/**
 * Parse a v2 or v3 lockfile's `packages` map into a flat array.
 * Skips the root entry ("").
 *
 * @param {object} packages       - The `packages` object from the lockfile.
 * @param {Set<string>} directSet - Package names listed directly in package.json.
 * @param {Set<string>} devSet    - Package names listed only in devDependencies.
 * @param {number} version        - Lockfile version (2 or 3).
 * @returns {ResolvedDependency[]}
 */
function _parseV2V3(packages, directSet, devSet, version) {
  if (!packages || typeof packages !== 'object') {
    return [];
  }

  const results = [];

  for (const [key, entry] of Object.entries(packages)) {
    // Skip the root package entry
    if (key === '') {
      continue;
    }

    // Strip "node_modules/" prefix (handles nested like "node_modules/a/node_modules/b")
    const lastSlash = key.lastIndexOf('node_modules/');
    const name = lastSlash >= 0 ? key.slice(lastSlash + 'node_modules/'.length) : key;

    const resolved = entry.resolved != null ? entry.resolved : null;
    const sourceType = _classifySource(resolved);
    const isDev = devSet.has(name) && !directSet.has(name)
      ? true
      : (entry.dev === true);

    // v3: use hasInstallScripts from the entry; v2: null (registry must supply)
    const hasInstallScripts = version === 3
      ? (entry.hasInstallScripts != null ? Boolean(entry.hasInstallScripts) : null)
      : null;

    results.push(validateDependency({
      name,
      version: entry.version,
      resolved,
      integrity: entry.integrity != null ? entry.integrity : null,
      isDev,
      hasInstallScripts,
      sourceType,
      directDependency: directSet.has(name),
    }));
  }

  return results;
}

/**
 * Parse an npm lockfile (v1, v2, or v3) into a ResolvedDependency array.
 *
 * @param {string} lockfileContent     - Raw lockfile JSON string.
 * @param {string} packageJsonContent  - Raw package.json JSON string.
 * @returns {ResolvedDependency[]}
 */
export function parseNpm(lockfileContent, packageJsonContent) {
  const lockfile = JSON.parse(lockfileContent);
  const packageJson = JSON.parse(packageJsonContent);

  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};

  // directSet: anything listed in either section of package.json
  const directSet = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);
  // devSet: only devDependencies (used to set isDev for direct devDeps)
  const devOnlySet = new Set(
    Object.keys(devDeps).filter((name) => !(name in deps))
  );

  const version = lockfile.lockfileVersion;

  if (version === 1) {
    return _parseV1(lockfile.dependencies || {}, directSet, devOnlySet);
  }

  if (version === 2 || version === 3) {
    // v2 must prefer `packages` over backward-compat `dependencies`
    const packages = lockfile.packages || {};
    return _parseV2V3(packages, directSet, devOnlySet, version);
  }

  // Caller (parser.js) already exits on unsupported versions; guard for direct use.
  throw new Error(
    `Unsupported npm lockfile version ${version}. dep-fence supports v1, v2, v3.`
  );
}
