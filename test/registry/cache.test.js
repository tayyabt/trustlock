import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCache } from '../../src/registry/cache.js';

async function withTmpDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dep-fence-cache-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('get returns null for a missing cache file', async () => {
  await withTmpDir(async (dir) => {
    const cache = createCache(join(dir, 'cache'));
    const result = await cache.get('some-package', 60_000);
    assert.equal(result, null);
  });
});

test('get returns null for a corrupted cache file', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'some-package.json'), 'NOT_VALID_JSON', 'utf8');
    const cache = createCache(cacheDir);
    const result = await cache.get('some-package', 60_000);
    assert.equal(result, null);
  });
});

test('set writes data and get returns fresh result within TTL', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cache = createCache(cacheDir);
    const payload = { name: 'lodash', version: '4.17.21' };
    await cache.set('lodash', payload);
    const result = await cache.get('lodash', 60_000);
    assert.notEqual(result, null);
    assert.equal(result.fresh, true);
    assert.deepEqual(result.data, payload);
  });
});

test('set writes _cachedAt into the JSON file', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cache = createCache(cacheDir);
    const before = Date.now();
    await cache.set('lodash', { name: 'lodash' });
    const after = Date.now();
    const raw = JSON.parse(await readFile(join(cacheDir, 'lodash.json'), 'utf8'));
    assert.ok(typeof raw._cachedAt === 'number', '_cachedAt should be a number');
    assert.ok(raw._cachedAt >= before && raw._cachedAt <= after, '_cachedAt should be current timestamp');
  });
});

test('get returns stale result when TTL is expired', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    // Write a file with _cachedAt far in the past
    const oldTimestamp = Date.now() - 3_600_000; // 1 hour ago
    const payload = { name: 'express', version: '4.18.2', _cachedAt: oldTimestamp };
    await writeFile(join(cacheDir, 'express.json'), JSON.stringify(payload), 'utf8');
    const cache = createCache(cacheDir);
    const result = await cache.get('express', 60_000); // 1 minute TTL → stale
    assert.notEqual(result, null);
    assert.equal(result.fresh, false);
    assert.deepEqual(result.data, { name: 'express', version: '4.18.2' });
  });
});

test('set creates cache directory if it does not exist', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'does', 'not', 'exist');
    const cache = createCache(cacheDir);
    // cacheDir does not exist yet — set() must create it
    await cache.set('react', { name: 'react' });
    const result = await cache.get('react', 60_000);
    assert.notEqual(result, null);
    assert.equal(result.fresh, true);
    assert.equal(result.data.name, 'react');
  });
});

test('scoped package key @scope/name is encoded to a safe filename', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cache = createCache(cacheDir);
    const payload = { name: '@babel/core', version: '7.24.0' };
    await cache.set('@babel/core', payload);
    // The file should be named @babel%2fcore.json (not @babel/core.json which is a path)
    const raw = JSON.parse(await readFile(join(cacheDir, '@babel%2fcore.json'), 'utf8'));
    assert.equal(raw.name, '@babel/core');
    // And get() should resolve the same key
    const result = await cache.get('@babel/core', 60_000);
    assert.notEqual(result, null);
    assert.equal(result.fresh, true);
    assert.deepEqual(result.data, payload);
  });
});

test('concurrent writes for the same key produce valid JSON', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cache = createCache(cacheDir);
    // Fire 10 concurrent writes
    const writes = Array.from({ length: 10 }, (_, i) =>
      cache.set('pkg', { version: String(i) })
    );
    await Promise.all(writes);
    // The file must be valid JSON (not corrupted by interleaved writes)
    const raw = JSON.parse(await readFile(join(cacheDir, 'pkg.json'), 'utf8'));
    assert.ok(typeof raw.version === 'string', 'version should be a string');
    assert.ok(typeof raw._cachedAt === 'number', '_cachedAt should be present');
  });
});

test('invalidate removes the cache file', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    const cache = createCache(cacheDir);
    await cache.set('react', { name: 'react' });
    assert.notEqual(await cache.get('react', 60_000), null);
    await cache.invalidate('react');
    assert.equal(await cache.get('react', 60_000), null);
  });
});

test('invalidate is a no-op for a non-existent key', async () => {
  await withTmpDir(async (dir) => {
    const cache = createCache(join(dir, 'cache'));
    // Should not throw
    await cache.invalidate('does-not-exist');
  });
});

test('get does not throw when cache file is empty', async () => {
  await withTmpDir(async (dir) => {
    const cacheDir = join(dir, 'cache');
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, 'pkg.json'), '', 'utf8');
    const cache = createCache(cacheDir);
    const result = await cache.get('pkg', 60_000);
    assert.equal(result, null);
  });
});
