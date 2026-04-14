import { createCache } from './cache.js';
import { fetchFullMetadata, fetchVersionMetadata as fetchVersionMeta } from './npm-registry.js';
import { fetchAttestations as fetchAttestationsHttp } from './provenance.js';
import { fetchVersionMetadata as fetchPypiVersionMeta } from './pypi.js';

const TTL_FULL_METADATA_MS = 1 * 60 * 60 * 1000;     // 1 hour
const TTL_VERSION_METADATA_MS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_ATTESTATIONS_MS = 1 * 60 * 60 * 1000;       // 1 hour
const CONCURRENCY_LIMIT = 10;

/**
 * Create a semaphore that caps the number of concurrently executing async
 * functions to `maxConcurrent`.
 *
 * @param {number} maxConcurrent
 * @returns {{ run: (fn: () => Promise<*>) => Promise<*> }}
 */
function createSemaphore(maxConcurrent) {
  let active = 0;
  const queue = [];

  function release() {
    active--;
    if (queue.length > 0) {
      // Pre-increment for the next waiter so it doesn't need to increment.
      active++;
      queue.shift()();
    }
  }

  async function run(fn) {
    if (active < maxConcurrent) {
      active++;
    } else {
      await new Promise((resolve) => queue.push(resolve));
      // active was already incremented by the release() that unblocked us.
    }
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { run };
}

/**
 * Create the registry client facade.
 *
 * Integrates the file-based cache (S01) with the HTTP adapters (S02),
 * applies the ADR-003 degradation hierarchy:
 *   1. Fresh cache → return data, no warning
 *   2. Stale cache + successful refresh → return fresh data, no warning
 *   3. Stale cache + failed refresh → return stale data, warn "stale registry data"
 *   4. No cache + failed fetch → return null, warn "skipped: registry unreachable"
 *
 * Enforces a shared concurrency limit of 10 parallel in-flight HTTP requests
 * across all three public methods on a single client instance.
 *
 * @param {object} options
 * @param {string} options.cacheDir - Directory for file-based cache.
 * @param {boolean} [options.noCache=false] - When true, bypasses cache reads
 *   (still writes successful fetches so subsequent runs benefit).
 * @param {object} [options._cache] - Injectable cache instance (tests only).
 * @param {Function} [options._fetchFullMetadata] - Injectable (tests only).
 * @param {Function} [options._fetchVersionMetadata] - Injectable (tests only).
 * @param {Function} [options._fetchAttestations] - Injectable (tests only).
 * @param {Function} [options._fetchPypiVersionMetadata] - Injectable PyPI adapter (tests only).
 * @returns {{ fetchPackageMetadata: Function, getVersionMetadata: Function, getAttestations: Function }}
 */
export function createRegistryClient({
  cacheDir,
  noCache = false,
  _cache,
  _fetchFullMetadata,
  _fetchVersionMetadata,
  _fetchAttestations,
  _fetchPypiVersionMetadata,
} = {}) {
  const cache = _cache ?? createCache(cacheDir);
  const doFetchFullMetadata = _fetchFullMetadata ?? fetchFullMetadata;
  const doFetchVersionMetadata = _fetchVersionMetadata ?? fetchVersionMeta;
  const doFetchAttestations = _fetchAttestations ?? fetchAttestationsHttp;
  const doFetchPypiVersionMetadata = _fetchPypiVersionMetadata ?? fetchPypiVersionMeta;

  const semaphore = createSemaphore(CONCURRENCY_LIMIT);

  /**
   * Core degradation helper.
   *
   * @param {string} key - Cache key.
   * @param {number} ttlMs - TTL in milliseconds.
   * @param {() => Promise<*>} fetchFn - Factory that performs the HTTP fetch.
   * @returns {Promise<{ data: *, warnings: string[] }>}
   */
  async function withDegradation(key, ttlMs, fetchFn) {
    // Step 1: check cache (unless --no-cache).
    let cached = null;
    if (!noCache) {
      cached = await cache.get(key, ttlMs);
    }

    // Fresh cache hit — no network call needed.
    if (cached && cached.fresh) {
      return { data: cached.data, warnings: [] };
    }

    // Step 2: attempt a fresh fetch (through the concurrency limiter).
    let freshData;
    let fetchError = null;
    try {
      freshData = await semaphore.run(fetchFn);
    } catch (err) {
      fetchError = err;
    }

    if (!fetchError) {
      // Successful fetch — write to cache and return fresh data.
      await cache.set(key, freshData);
      return { data: freshData, warnings: [] };
    }

    // Fetch failed — apply degradation.
    if (cached) {
      // Stale cache fallback (tier 2).
      return { data: cached.data, warnings: ['stale registry data'] };
    }

    // No cache, no network (tier 3).
    return { data: null, warnings: ['skipped: registry unreachable'] };
  }

  /**
   * Fetch package metadata with ecosystem-based dispatch.
   *
   * Accepts either a plain string `name` (backward-compatible npm path) or a
   * `ResolvedDependency`-shaped object `{ name, version, ecosystem }`:
   *
   *   - `ecosystem === 'pypi'` → PyPI JSON API; cache key `pypi/{name}/{version}`;
   *     returns `{ publisherAccount, publishedAt, hasAttestations }`.
   *   - `ecosystem === 'npm'`, absent, or undefined → npm full-packument path
   *     (existing behaviour); cache key is the package name; TTL 1 hour.
   *
   * @param {string | { name: string, version?: string, ecosystem?: string }} nameOrDep
   * @returns {Promise<{ data: object|null, warnings: string[] }>}
   */
  async function fetchPackageMetadata(nameOrDep) {
    // Support both the legacy string form and the new dep-object form.
    if (typeof nameOrDep === 'string') {
      return withDegradation(
        nameOrDep,
        TTL_FULL_METADATA_MS,
        () => doFetchFullMetadata(nameOrDep),
      );
    }

    const { name, version, ecosystem } = nameOrDep;

    if (ecosystem === 'pypi') {
      // PyPI path: version-specific metadata; 24-hour TTL (immutable once published).
      return withDegradation(
        `pypi/${name}/${version}`,
        TTL_VERSION_METADATA_MS,
        () => doFetchPypiVersionMetadata(name, version),
      );
    }

    // Default: npm full-packument path (handles absent/undefined ecosystem for
    // backward compatibility with any callers that predate the ecosystem field).
    return withDegradation(
      name,
      TTL_FULL_METADATA_MS,
      () => doFetchFullMetadata(name),
    );
  }

  /**
   * Fetch version-specific metadata (includes `scripts`, `_npmUser`).
   * Cache key: `name@version`. TTL: 24 hours (version data is immutable).
   *
   * @param {string} name
   * @param {string} version
   * @returns {Promise<{ data: object|null, warnings: string[] }>}
   */
  async function getVersionMetadata(name, version) {
    return withDegradation(
      `${name}@${version}`,
      TTL_VERSION_METADATA_MS,
      () => doFetchVersionMetadata(name, version),
    );
  }

  /**
   * Fetch SLSA attestations for a package version.
   * Returns `{ data: null, warnings: [] }` when the package has no attestations
   * (normal for most packages — not treated as an error).
   * Cache key: `attestations:name@version`. TTL: 1 hour.
   *
   * The attestation data is stored in the cache under a `{ _value }` envelope
   * so that a `null` (no-attestation) result survives the JSON round-trip
   * without being coerced to `{}` by the cache's object spread.
   *
   * @param {string} name
   * @param {string} version
   * @returns {Promise<{ data: object|null, warnings: string[] }>}
   */
  async function getAttestations(name, version) {
    const result = await withDegradation(
      `attestations:${name}@${version}`,
      TTL_ATTESTATIONS_MS,
      // Wrap in { _value } so null survives the cache JSON round-trip.
      () => doFetchAttestations(name, version).then((d) => ({ _value: d })),
    );

    if (result.data === null) {
      // Network failure / no-cache path — data is already null.
      return result;
    }

    // Unwrap the { _value } envelope (may be null for 404 attestations).
    return { data: result.data._value, warnings: result.warnings };
  }

  return { fetchPackageMetadata, getVersionMetadata, getAttestations };
}
