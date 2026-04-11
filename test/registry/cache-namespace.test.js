import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCache } from '../../src/registry/cache.js';

// ---------------------------------------------------------------------------
// Cache key namespace collision prevention — C-NEW-3 (c)
//
// Verifies that the PyPI cache key `pypi/{name}/{version}` does not collide
// with any npm cache key for the same package and version.
//
// npm cache keys used by client.js:
//   - Full packument:      `{name}`               e.g. "requests"
//   - Version metadata:   `{name}@{version}`      e.g. "requests@2.28.0"
//   - Attestations:       `attestations:{name}@{version}`
//
// PyPI cache key:
//   - Version metadata:   `pypi/{name}/{version}` e.g. "pypi/requests/2.28.0"
// ---------------------------------------------------------------------------

async function withTempCache(fn) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'trustlock-cache-test-'));
  try {
    await fn(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

const LONG_TTL = 24 * 60 * 60 * 1000; // 24 hours — always fresh in tests

test('pypi cache key is distinct from npm full-packument cache key', async () => {
  await withTempCache(async (cacheDir) => {
    const cache = createCache(cacheDir);

    const pypiData = { publisherAccount: 'ken-reitz', publishedAt: '2022-06-29T15:12:00.000000Z', hasAttestations: true };
    const npmPackumentData = { name: 'requests', versions: {}, time: {} };

    await cache.set('pypi/requests/2.28.0', pypiData);
    await cache.set('requests', npmPackumentData);

    // The npm packument key must not have overwritten the pypi entry
    const pypiEntry = await cache.get('pypi/requests/2.28.0', LONG_TTL);
    assert.ok(pypiEntry !== null, 'PyPI cache entry missing after npm write');
    assert.deepEqual(pypiEntry.data, pypiData);

    // The npm packument entry must also be intact
    const npmEntry = await cache.get('requests', LONG_TTL);
    assert.ok(npmEntry !== null, 'npm packument cache entry missing');
    assert.deepEqual(npmEntry.data, npmPackumentData);
  });
});

test('pypi cache key is distinct from npm version-metadata cache key', async () => {
  await withTempCache(async (cacheDir) => {
    const cache = createCache(cacheDir);

    const pypiData = { publisherAccount: 'ken-reitz', publishedAt: '2022-06-29T15:12:00.000000Z', hasAttestations: false };
    const npmVersionData = { name: 'requests', version: '2.28.0', scripts: {}, _npmUser: { name: 'kr' } };

    await cache.set('pypi/requests/2.28.0', pypiData);
    await cache.set('requests@2.28.0', npmVersionData);

    // Verify the pypi entry survived the npm@version write
    const pypiEntry = await cache.get('pypi/requests/2.28.0', LONG_TTL);
    assert.ok(pypiEntry !== null, 'PyPI cache entry was overwritten by npm version write');
    assert.deepEqual(pypiEntry.data, pypiData);

    // Verify npm version entry is distinct
    const npmEntry = await cache.get('requests@2.28.0', LONG_TTL);
    assert.ok(npmEntry !== null, 'npm version cache entry missing');
    assert.deepEqual(npmEntry.data, npmVersionData);
  });
});

test('fetching requests@2.28.0 as npm does not overwrite pypi/requests/2.28.0 cache entry', async () => {
  await withTempCache(async (cacheDir) => {
    const cache = createCache(cacheDir);

    const pypiData = { publisherAccount: 'ken-reitz', publishedAt: '2022-06-29T15:12:00.000000Z', hasAttestations: true };

    // Simulate a PyPI fetch: store under pypi/{name}/{version}
    await cache.set('pypi/requests/2.28.0', pypiData);

    // Simulate an npm version fetch: store under {name}@{version}
    const npmData = { name: 'requests', version: '2.28.0', _npmUser: { name: 'kennethreitz' } };
    await cache.set('requests@2.28.0', npmData);

    // The pypi cache entry must still be intact
    const pypiEntry = await cache.get('pypi/requests/2.28.0', LONG_TTL);
    assert.ok(pypiEntry !== null, 'pypi/requests/2.28.0 entry was overwritten');
    assert.deepEqual(pypiEntry.data, pypiData);

    // The npm cache key must be different from the pypi cache key
    assert.notEqual('pypi/requests/2.28.0', 'requests@2.28.0');
    assert.notEqual('pypi/requests/2.28.0', 'requests');
  });
});

test('multiple pypi packages use distinct cache keys', async () => {
  await withTempCache(async (cacheDir) => {
    const cache = createCache(cacheDir);

    const dataA = { publisherAccount: 'author-a', publishedAt: '2023-01-01T00:00:00.000000Z', hasAttestations: false };
    const dataB = { publisherAccount: 'author-b', publishedAt: '2023-06-01T00:00:00.000000Z', hasAttestations: true };

    await cache.set('pypi/requests/2.28.0', dataA);
    await cache.set('pypi/flask/2.3.0', dataB);

    const entryA = await cache.get('pypi/requests/2.28.0', LONG_TTL);
    const entryB = await cache.get('pypi/flask/2.3.0', LONG_TTL);

    assert.deepEqual(entryA.data, dataA);
    assert.deepEqual(entryB.data, dataB);
  });
});
