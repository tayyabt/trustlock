import { httpGetJson } from './http.js';

const ATTESTATIONS_BASE = 'https://registry.npmjs.org/-/npm/v1/attestations';

/**
 * Encode a package name for safe use in a URL.
 * Handles scoped packages: @scope/name → @scope%2fname
 *
 * @param {string} name
 * @returns {string}
 */
function encodePackageName(name) {
  return name.replace('/', '%2f');
}

/**
 * Fetch SLSA attestations for a specific package version from the npm registry.
 *
 * Returns `null` when the package has no attestations (HTTP 404) — this is a
 * normal state for most packages and is not treated as an error.
 *
 * Throws a classified error for all other HTTP failures or network problems.
 * Error codes: REGISTRY_RATE_LIMITED, REGISTRY_ERROR, NETWORK_TIMEOUT,
 *              NETWORK_ERROR.
 *
 * @param {string} name - Package name (scoped or unscoped)
 * @param {string} version - Exact version string
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts._https] - Injectable https module (for unit tests only)
 * @returns {Promise<object | null>}
 */
export async function fetchAttestations(name, version, opts = {}) {
  const url = `${ATTESTATIONS_BASE}/${encodePackageName(name)}@${version}`;
  try {
    return await httpGetJson(url, opts);
  } catch (err) {
    if (err.code === 'REGISTRY_NOT_FOUND') return null;
    throw err;
  }
}
