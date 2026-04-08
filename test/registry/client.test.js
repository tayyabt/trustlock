import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryClient } from '../../src/registry/client.js';

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock cache object.
 *
 * `entries` is a map of key → { data, fresh } (or null for cache-miss).
 * `written` accumulates every cache.set call for assertions.
 * `reads` accumulates every cache.get call so tests can verify no-read paths.
 */
function mockCache(entries = {}) {
  const written = [];
  const reads = [];

  async function get(key) {
    reads.push(key);
    return entries[key] ?? null;
  }

  async function set(key, data) {
    written.push({ key, data });
  }

  return { get, set, written, reads };
}

/**
 * Build a mock fetch function that resolves with `data` or rejects with an
 * error carrying `code`.
 */
function mockFetch(data) {
  return async () => data;
}

function mockFetchFail(code = 'NETWORK_ERROR') {
  return async () => {
    const err = new Error(`mock ${code}`);
    err.code = code;
    throw err;
  };
}

// ---------------------------------------------------------------------------
// Factory shape
// ---------------------------------------------------------------------------

test('createRegistryClient returns the three public methods', () => {
  const client = createRegistryClient({
    _cache: mockCache(),
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });
  assert.equal(typeof client.fetchPackageMetadata, 'function');
  assert.equal(typeof client.getVersionMetadata, 'function');
  assert.equal(typeof client.getAttestations, 'function');
});

// ---------------------------------------------------------------------------
// Fresh cache hit
// ---------------------------------------------------------------------------

test('fetchPackageMetadata: fresh cache hit returns cached data without HTTP call', async () => {
  const packageData = { name: 'lodash', time: { '4.17.21': '2021-01-01T00:00:00.000Z' } };
  const cache = mockCache({ lodash: { data: packageData, fresh: true } });
  let fetchCalled = false;
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: async () => { fetchCalled = true; return {}; },
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('lodash');
  assert.deepEqual(result, { data: packageData, warnings: [] });
  assert.equal(fetchCalled, false, 'HTTP should not be called on fresh cache hit');
});

test('getVersionMetadata: fresh cache hit returns cached data without HTTP call', async () => {
  const versionData = { name: 'lodash', version: '4.17.21', scripts: {}, _npmUser: { name: 'jdalton' } };
  const cache = mockCache({ 'lodash@4.17.21': { data: versionData, fresh: true } });
  let fetchCalled = false;
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: async () => { fetchCalled = true; return {}; },
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.getVersionMetadata('lodash', '4.17.21');
  assert.deepEqual(result, { data: versionData, warnings: [] });
  assert.equal(fetchCalled, false);
});

test('getAttestations: fresh cache hit (null attestation) returns null data no warning', async () => {
  // Attestations cached as { _value: null } to survive the JSON round-trip.
  const cache = mockCache({ 'attestations:lodash@4.17.21': { data: { _value: null }, fresh: true } });
  let fetchCalled = false;
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: async () => { fetchCalled = true; return null; },
  });

  const result = await client.getAttestations('lodash', '4.17.21');
  assert.deepEqual(result, { data: null, warnings: [] });
  assert.equal(fetchCalled, false);
});

// ---------------------------------------------------------------------------
// Stale cache + successful refresh
// ---------------------------------------------------------------------------

test('fetchPackageMetadata: stale cache + successful refresh returns fresh data, updates cache', async () => {
  const staleData = { name: 'express', time: { '4.18.2': '2022-01-01T00:00:00.000Z' } };
  const freshData = { name: 'express', time: { '4.18.2': '2022-01-01T00:00:00.000Z', '5.0.0': '2024-01-01T00:00:00.000Z' } };
  const cache = mockCache({ express: { data: staleData, fresh: false } });
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch(freshData),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('express');
  assert.deepEqual(result, { data: freshData, warnings: [] });
  assert.equal(cache.written.length, 1);
  assert.equal(cache.written[0].key, 'express');
  assert.deepEqual(cache.written[0].data, freshData);
});

// ---------------------------------------------------------------------------
// Stale cache + failed refresh → stale data with warning
// ---------------------------------------------------------------------------

test('fetchPackageMetadata: stale cache + failed refresh returns stale data with warning', async () => {
  const staleData = { name: 'react', time: {} };
  const cache = mockCache({ react: { data: staleData, fresh: false } });
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetchFail('NETWORK_ERROR'),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('react');
  assert.equal(result.data, staleData);
  assert.deepEqual(result.warnings, ['stale registry data']);
});

test('getVersionMetadata: stale cache + failed refresh returns stale data with warning', async () => {
  const staleData = { name: 'react', version: '18.0.0', scripts: {}, _npmUser: { name: 'fb' } };
  const cache = mockCache({ 'react@18.0.0': { data: staleData, fresh: false } });
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetchFail('REGISTRY_ERROR'),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.getVersionMetadata('react', '18.0.0');
  assert.equal(result.data, staleData);
  assert.deepEqual(result.warnings, ['stale registry data']);
});

test('getAttestations: stale cache (null attestation) + failed refresh returns stale null with warning', async () => {
  const cache = mockCache({ 'attestations:react@18.0.0': { data: { _value: null }, fresh: false } });
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetchFail('NETWORK_ERROR'),
  });

  const result = await client.getAttestations('react', '18.0.0');
  assert.deepEqual(result, { data: null, warnings: ['stale registry data'] });
});

// ---------------------------------------------------------------------------
// No cache + failed fetch → skipped with warning
// ---------------------------------------------------------------------------

test('fetchPackageMetadata: no cache + failed fetch returns null with skipped warning', async () => {
  const cache = mockCache({}); // all misses
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetchFail('NETWORK_TIMEOUT'),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('unknown-pkg');
  assert.deepEqual(result, { data: null, warnings: ['skipped: registry unreachable'] });
});

test('getVersionMetadata: no cache + failed fetch returns null with skipped warning', async () => {
  const cache = mockCache({});
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetchFail('NETWORK_ERROR'),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.getVersionMetadata('unknown-pkg', '1.0.0');
  assert.deepEqual(result, { data: null, warnings: ['skipped: registry unreachable'] });
});

// ---------------------------------------------------------------------------
// Attestation 404 (fetchAttestations returns null — not an error)
// ---------------------------------------------------------------------------

test('getAttestations: 404 (no attestations) returns { data: null, warnings: [] }', async () => {
  const cache = mockCache({}); // cache miss
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null), // provenance.js returns null for 404
  });

  const result = await client.getAttestations('lodash', '4.17.21');
  assert.deepEqual(result, { data: null, warnings: [] });
  // The null result is cached (under { _value: null } envelope)
  assert.equal(cache.written.length, 1);
  assert.equal(cache.written[0].key, 'attestations:lodash@4.17.21');
  assert.deepEqual(cache.written[0].data, { _value: null });
});

test('getAttestations: real attestation data returned correctly', async () => {
  const attestationData = { attestations: [{ type: 'SLSA', predicateType: 'slsa.dev/provenance/v1' }] };
  const cache = mockCache({});
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({}),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(attestationData),
  });

  const result = await client.getAttestations('chalk', '5.3.0');
  assert.deepEqual(result, { data: attestationData, warnings: [] });
  // Cached under { _value: attestationData }
  assert.deepEqual(cache.written[0].data, { _value: attestationData });
});

// ---------------------------------------------------------------------------
// noCache: true — bypasses cache read, still writes on success
// ---------------------------------------------------------------------------

test('noCache: true bypasses cache read, fetches fresh, writes result to cache', async () => {
  const freshData = { name: 'lodash', time: {} };
  // Even if we had a fresh entry, it must not be read.
  const cache = mockCache({ lodash: { data: { old: true }, fresh: true } });
  const client = createRegistryClient({
    noCache: true,
    _cache: cache,
    _fetchFullMetadata: mockFetch(freshData),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('lodash');
  assert.deepEqual(result, { data: freshData, warnings: [] });
  // cache.get must never be called
  assert.equal(cache.reads.length, 0);
  // cache.set must be called with fresh data
  assert.equal(cache.written.length, 1);
  assert.deepEqual(cache.written[0].data, freshData);
});

test('noCache: true + failed fetch returns null with skipped warning (no stale fallback)', async () => {
  // Even with a stale entry present, noCache skips the read so there's no fallback.
  const cache = mockCache({ lodash: { data: { old: true }, fresh: false } });
  const client = createRegistryClient({
    noCache: true,
    _cache: cache,
    _fetchFullMetadata: mockFetchFail('NETWORK_ERROR'),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('lodash');
  assert.deepEqual(result, { data: null, warnings: ['skipped: registry unreachable'] });
  assert.equal(cache.reads.length, 0);
});

// ---------------------------------------------------------------------------
// Warning annotations are arrays of strings
// ---------------------------------------------------------------------------

test('warnings are always arrays of strings', async () => {
  const cache = mockCache({});
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch({ name: 'pkg' }),
    _fetchVersionMetadata: mockFetch({ name: 'pkg', version: '1.0.0' }),
    _fetchAttestations: mockFetch(null),
  });

  const r1 = await client.fetchPackageMetadata('pkg');
  assert.ok(Array.isArray(r1.warnings));
  r1.warnings.forEach((w) => assert.equal(typeof w, 'string'));

  const r2 = await client.getVersionMetadata('pkg', '1.0.0');
  assert.ok(Array.isArray(r2.warnings));

  const r3 = await client.getAttestations('pkg', '1.0.0');
  assert.ok(Array.isArray(r3.warnings));
});

// ---------------------------------------------------------------------------
// Concurrency limiter — caps at 10 parallel in-flight requests
// ---------------------------------------------------------------------------

test('concurrency limiter caps in-flight requests at 10', async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  // Resolvers for each fetch, so we can control when they complete.
  const resolvers = [];

  function controlledFetch() {
    return async () => {
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      await new Promise((resolve) => resolvers.push(resolve));
      inFlight--;
      return { name: 'pkg' };
    };
  }

  const cache = mockCache({}); // all misses — every call goes to HTTP
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: controlledFetch(),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const TOTAL = 15;
  // Fire 15 requests concurrently.
  const promises = Array.from({ length: TOTAL }, (_, i) =>
    client.fetchPackageMetadata(`pkg-${i}`)
  );

  // Give the event loop a tick so all queued microtasks can settle.
  await new Promise((resolve) => setImmediate(resolve));

  // Exactly 10 should be in-flight; the other 5 are waiting.
  assert.equal(inFlight, 10, `expected 10 in-flight, got ${inFlight}`);
  assert.equal(peakInFlight, 10, `expected peak of 10, got ${peakInFlight}`);

  // Drain remaining resolvers to let the test finish cleanly.
  while (resolvers.length > 0) {
    const toRelease = resolvers.splice(0, 1);
    toRelease[0]();
    await new Promise((resolve) => setImmediate(resolve));
  }

  await Promise.all(promises);
  assert.equal(peakInFlight, 10);
});

// ---------------------------------------------------------------------------
// Scoped package names
// ---------------------------------------------------------------------------

test('scoped package name (@scope/pkg) used as cache key without mangling by client', async () => {
  const freshData = { name: '@babel/core', time: {} };
  const cache = mockCache({});
  const client = createRegistryClient({
    _cache: cache,
    _fetchFullMetadata: mockFetch(freshData),
    _fetchVersionMetadata: mockFetch({}),
    _fetchAttestations: mockFetch(null),
  });

  const result = await client.fetchPackageMetadata('@babel/core');
  assert.deepEqual(result, { data: freshData, warnings: [] });
  // The cache key should be the raw package name; cache.js encodes it for filenames.
  assert.equal(cache.written[0].key, '@babel/core');
});
