import { httpGetJson } from './http.js';

const REGISTRY_BASE = 'https://registry.npmjs.org';

/**
 * Encode a package name for safe use in a registry URL.
 * Handles scoped packages: @scope/name → @scope%2fname
 *
 * @param {string} name
 * @returns {string}
 */
function encodePackageName(name) {
  return name.replace('/', '%2f');
}

/**
 * Fetch the full packument for a package from the npm registry.
 * The packument includes the `time` object (version publish dates) needed
 * for cooldown checks.
 *
 * Throws a classified error on HTTP failures or network problems.
 * Error codes: REGISTRY_NOT_FOUND, REGISTRY_RATE_LIMITED, REGISTRY_ERROR,
 *              NETWORK_TIMEOUT, NETWORK_ERROR.
 *
 * @param {string} name - Package name (scoped or unscoped)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts._https] - Injectable https module (for unit tests only)
 * @returns {Promise<object>}
 */
export async function fetchFullMetadata(name, opts = {}) {
  const url = `${REGISTRY_BASE}/${encodePackageName(name)}`;
  return httpGetJson(url, opts);
}

/**
 * Fetch version-specific metadata for a package from the npm registry.
 * Includes `scripts` and `_npmUser` fields needed for install-script and
 * publisher-identity checks.
 *
 * The returned object is augmented with a `publisherAccount` field extracted
 * from `_npmUser.name` — the npm account that published this version. Absent
 * or missing `_npmUser.name` yields `null`.
 *
 * Throws a classified error on HTTP failures or network problems.
 *
 * @param {string} name - Package name (scoped or unscoped)
 * @param {string} version - Exact version string
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts._https] - Injectable https module (for unit tests only)
 * @returns {Promise<object>}
 */
export async function fetchVersionMetadata(name, version, opts = {}) {
  const url = `${REGISTRY_BASE}/${encodePackageName(name)}/${version}`;
  const data = await httpGetJson(url, opts);
  return { ...data, publisherAccount: data._npmUser?.name ?? null };
}
