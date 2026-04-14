import { httpGetJson } from './http.js';

// Named constants — C7: no hardcoded URL string literals in fetch calls
const PYPI_JSON_API = 'https://pypi.org/pypi';
const PYPI_SIMPLE_API = 'https://pypi.org/simple';
const PYPI_SIMPLE_ACCEPT = 'application/vnd.pypi.simple.v1+json';

/**
 * Extract the publisher identity from a PyPI version JSON response.
 *
 * Priority:
 *  1. `urls[].uploader` — first non-null/non-empty value across all release files
 *  2. `info.maintainer_email` — first address if comma-separated
 *  3. `null` — both sources absent
 *
 * @param {object} data - Parsed PyPI `/pypi/{name}/{version}/json` response
 * @returns {string|null}
 */
function extractPublisher(data) {
  const urls = Array.isArray(data.urls) ? data.urls : [];

  for (const entry of urls) {
    if (entry.uploader != null && entry.uploader !== '') {
      return entry.uploader;
    }
  }

  const email = data.info?.maintainer_email;
  if (email != null && email !== '') {
    // Take the first address from a potentially comma-separated list.
    return email.split(',')[0].trim();
  }

  return null;
}

/**
 * Extract the canonical publish date from a PyPI version JSON response.
 *
 * Uses the earliest `upload_time_iso_8601` across all release files in `urls[]`.
 * Returns `null` when `urls[]` is empty or no entry has `upload_time_iso_8601`.
 *
 * @param {object} data - Parsed PyPI `/pypi/{name}/{version}/json` response
 * @returns {string|null} ISO 8601 UTC timestamp string, or null
 */
function extractPublishDate(data) {
  const urls = Array.isArray(data.urls) ? data.urls : [];

  let earliest = null;
  for (const entry of urls) {
    const ts = entry.upload_time_iso_8601;
    if (!ts) continue;
    if (earliest === null || ts < earliest) {
      earliest = ts;
    }
  }

  return earliest;
}

/**
 * Check whether a PyPI package has attestations via the PyPI Simple API.
 *
 * Calls `PYPI_SIMPLE_API/{name}/` with the v1 JSON Accept header and inspects
 * the `files[]` array for any entry that has a non-null `attestations` field.
 *
 * Returns `false` on any error (network, 404, malformed JSON) so that the main
 * metadata is still usable even when the Simple API is unreachable.
 *
 * @param {string} name - Package name
 * @param {Function} fetchSimpleJson - Injectable fetch function for tests
 * @returns {Promise<boolean>}
 */
async function checkAttestations(name, fetchSimpleJson) {
  try {
    const url = `${PYPI_SIMPLE_API}/${name}/`;
    const data = await fetchSimpleJson(url);
    const files = Array.isArray(data.files) ? data.files : [];
    return files.some((f) => f.attestations != null);
  } catch {
    return false;
  }
}

/**
 * Fetch version-specific metadata for a PyPI package.
 *
 * Calls the PyPI JSON API at `PYPI_JSON_API/{name}/{version}/json` and the
 * PyPI Simple API for attestation presence. Returns a normalised object that
 * downstream policy rules can consume.
 *
 * Throws a classified error (`REGISTRY_NOT_FOUND`, `REGISTRY_RATE_LIMITED`,
 * `REGISTRY_ERROR`, `NETWORK_TIMEOUT`, `NETWORK_ERROR`) on HTTP or network
 * failures so that `registry/client.js:withDegradation` can apply the ADR-003
 * degradation hierarchy (stale cache / skip).
 *
 * @param {string} name - Package name (normalised PyPI name)
 * @param {string} version - Exact version string
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts._https] - Injectable https module (tests only)
 * @param {Function} [opts._fetchVersionJson] - Injectable for the main JSON API call (tests only)
 * @param {Function} [opts._fetchSimpleJson] - Injectable for the Simple API call (tests only)
 * @returns {Promise<{ publisherAccount: string|null, publishedAt: string|null, hasAttestations: boolean }>}
 */
export async function fetchVersionMetadata(name, version, opts = {}) {
  const {
    timeoutMs = 30_000,
    _https,
    _fetchVersionJson,
    _fetchSimpleJson,
  } = opts;

  const httpOpts = { timeoutMs, _https };

  const fetchVersionJson = _fetchVersionJson
    ?? ((url) => httpGetJson(url, httpOpts));

  const fetchSimpleJson = _fetchSimpleJson
    ?? ((url) => httpGetJson(url, { ...httpOpts, headers: { Accept: PYPI_SIMPLE_ACCEPT } }));

  const url = `${PYPI_JSON_API}/${name}/${version}/json`;
  const data = await fetchVersionJson(url);

  const publisherAccount = extractPublisher(data);
  const publishedAt = extractPublishDate(data);
  const hasAttestations = await checkAttestations(name, fetchSimpleJson);

  return { publisherAccount, publishedAt, hasAttestations };
}
