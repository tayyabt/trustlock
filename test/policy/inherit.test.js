/**
 * Tests for src/policy/inherit.js
 *
 * Coverage:
 *   - mergePolicy: scalar override, floor enforcement, array union, object deep-merge,
 *     nested numeric floor enforcement
 *   - resolveExtends: local path (happy path, not found, chained extends),
 *     remote URL with mock HTTP server (fresh cache, stale+reachable, stale+unreachable,
 *     no cache+unreachable, non-JSON response, chained extends)
 *
 * Test runner: node --test
 * No real network calls — HTTP tests use a node:http mock server on 127.0.0.1.
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExtends, mergePolicy } from '../../src/policy/inherit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Temporarily capture writes to process.stderr.
 * Returns { result, stderr } where stderr is the concatenated string.
 *
 * @param {() => Promise<any>} fn
 * @returns {Promise<{ result: any, stderr: string }>}
 */
async function captureStderr(fn) {
  const chunks = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    const result = await fn();
    return { result, stderr: chunks.join('') };
  } finally {
    process.stderr.write = original;
  }
}

/**
 * Write a cache entry to `{cacheDir}/org-policy.json`.
 */
async function writeCacheEntry(cacheDir, policy, fetchedAt) {
  const entry = {
    fetched_at: typeof fetchedAt === 'string' ? fetchedAt : fetchedAt.toISOString(),
    policy,
  };
  await writeFile(
    join(cacheDir, 'org-policy.json'),
    JSON.stringify(entry, null, 2),
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// mergePolicy — unit tests (no I/O)
// ---------------------------------------------------------------------------

describe('mergePolicy', () => {
  test('scalar override: repo value wins', () => {
    const merged = mergePolicy(
      { cooldown_hours: 72 },
      { cooldown_hours: 96 }
    );
    assert.equal(merged.cooldown_hours, 96);
  });

  test('scalar override: boolean repo value wins', () => {
    const merged = mergePolicy(
      { pinning: { required: false } },
      { pinning: { required: true } }
    );
    assert.equal(merged.pinning.required, true);
  });

  test('scalar numeric floor: repo below base throws with exact message', () => {
    assert.throws(
      () => mergePolicy({ cooldown_hours: 72 }, { cooldown_hours: 24 }),
      (err) => {
        assert.equal(err.exitCode, 2);
        assert.equal(
          err.message,
          'Policy error: repo config sets cooldown_hours=24, below org minimum of 72. Repos may only tighten org policy.'
        );
        return true;
      }
    );
  });

  test('scalar numeric floor: repo equal to base is allowed', () => {
    const merged = mergePolicy({ cooldown_hours: 72 }, { cooldown_hours: 72 });
    assert.equal(merged.cooldown_hours, 72);
  });

  test('array union: entries from both base and repo are preserved', () => {
    const merged = mergePolicy(
      { scripts: { allowlist: ['build'] } },
      { scripts: { allowlist: ['test'] } }
    );
    assert.deepEqual(merged.scripts.allowlist.sort(), ['build', 'test']);
  });

  test('array union: repo cannot remove base entries', () => {
    // Repo sends only ["test"] but base has ["build"] — base entry is preserved.
    const merged = mergePolicy(
      { scripts: { allowlist: ['build', 'lint'] } },
      { scripts: { allowlist: ['test'] } }
    );
    assert.ok(merged.scripts.allowlist.includes('build'), 'base entry "build" must be preserved');
    assert.ok(merged.scripts.allowlist.includes('lint'), 'base entry "lint" must be preserved');
    assert.ok(merged.scripts.allowlist.includes('test'), 'repo entry "test" must be included');
  });

  test('array union: no duplicates when both sides share an entry', () => {
    const merged = mergePolicy(
      { scripts: { allowlist: ['build', 'test'] } },
      { scripts: { allowlist: ['test', 'lint'] } }
    );
    const count = merged.scripts.allowlist.filter((e) => e === 'test').length;
    assert.equal(count, 1, '"test" should appear exactly once');
  });

  test('object deep-merge: base keys not in repo fall through', () => {
    const merged = mergePolicy(
      { provenance: { required_for: ['*'] } },
      { provenance: { block_on_publisher_change: false } }
    );
    assert.deepEqual(merged.provenance.required_for, ['*'], 'base key should fall through');
    assert.equal(merged.provenance.block_on_publisher_change, false, 'repo key should be present');
  });

  test('object deep-merge: repo object key overrides base key', () => {
    const merged = mergePolicy(
      { pinning: { required: false } },
      { pinning: { required: true } }
    );
    assert.equal(merged.pinning.required, true);
  });

  test('nested numeric floor: throws with the nested key name', () => {
    assert.throws(
      () => mergePolicy(
        { transitive: { max_new: 10 } },
        { transitive: { max_new: 2 } }
      ),
      (err) => {
        assert.equal(err.exitCode, 2);
        assert.ok(err.message.includes('max_new=2'), `message should include "max_new=2", got: ${err.message}`);
        assert.ok(err.message.includes('10'), `message should include base value 10, got: ${err.message}`);
        return true;
      }
    );
  });

  test('base keys absent from repo fall through unchanged', () => {
    const merged = mergePolicy(
      { cooldown_hours: 72, pinning: { required: false } },
      { cooldown_hours: 96 }
    );
    assert.equal(merged.pinning.required, false, 'base key not in repo should fall through');
  });

  test('extends key in repo is silently skipped', () => {
    const merged = mergePolicy(
      { cooldown_hours: 72 },
      { cooldown_hours: 96, extends: 'https://example.com/policy.json' }
    );
    assert.equal(merged.cooldown_hours, 96);
    assert.ok(!('extends' in merged), 'extends key must not appear in merged result');
  });
});

// ---------------------------------------------------------------------------
// resolveExtends: local path
// ---------------------------------------------------------------------------

describe('resolveExtends: local path', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'inherit-local-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('reads policy file relative to configFilePath directory', async () => {
    const orgPolicy = { cooldown_hours: 72 };
    const policyFile = join(tmpDir, 'org-policy.json');
    const configFile = join(tmpDir, '.trustlockrc.json');
    await writeFile(policyFile, JSON.stringify(orgPolicy), 'utf8');
    // configFilePath exists only conceptually — resolveExtends uses its dirname
    await writeFile(configFile, '{}', 'utf8');

    const cacheDir = join(tmpDir, '.cache');
    const result = await resolveExtends('org-policy.json', configFile, cacheDir);
    assert.deepEqual(result, orgPolicy);
  });

  test('does not write cache file for local path', async () => {
    const orgPolicy = { cooldown_hours: 48 };
    const policyFile = join(tmpDir, 'no-cache-org.json');
    const configFile = join(tmpDir, '.trustlockrc.json');
    await writeFile(policyFile, JSON.stringify(orgPolicy), 'utf8');

    const cacheDir = join(tmpDir, '.cache-local');
    await resolveExtends('no-cache-org.json', configFile, cacheDir);

    // Cache directory should not exist (no cache written for local paths).
    await assert.rejects(
      () => stat(join(cacheDir, 'org-policy.json')),
      'cache file must not be written for local extends'
    );
  });

  test('throws with path in message when local file not found', async () => {
    const configFile = join(tmpDir, '.trustlockrc.json');
    const cacheDir = join(tmpDir, '.cache-notfound');

    await assert.rejects(
      () => resolveExtends('does-not-exist.json', configFile, cacheDir),
      (err) => {
        assert.equal(err.exitCode, 2, 'exitCode must be 2');
        assert.ok(
          err.message.includes('does-not-exist.json') || err.message.includes(tmpDir),
          `message should include the path, got: ${err.message}`
        );
        return true;
      }
    );
  });

  test('strips chained extends from local policy and emits stderr warning', async () => {
    const orgPolicy = {
      cooldown_hours: 72,
      extends: 'https://grandparent.example.com/policy.json',
    };
    const policyFile = join(tmpDir, 'chained-local.json');
    const configFile = join(tmpDir, '.trustlockrc.json');
    await writeFile(policyFile, JSON.stringify(orgPolicy), 'utf8');

    const cacheDir = join(tmpDir, '.cache-chain-local');
    const { result, stderr } = await captureStderr(() =>
      resolveExtends('chained-local.json', configFile, cacheDir)
    );

    assert.ok(!('extends' in result), 'extends key must be stripped from local policy');
    assert.equal(result.cooldown_hours, 72);
    assert.ok(
      stderr.includes('Warning: chained extends in org policy is not supported. Ignoring.'),
      `stderr should contain chained-extends warning, got: ${stderr}`
    );
  });

  test('returns null when extendsValue is falsy', async () => {
    const configFile = join(tmpDir, '.trustlockrc.json');
    const cacheDir = join(tmpDir, '.cache-null');
    const result = await resolveExtends(null, configFile, cacheDir);
    assert.equal(result, null);

    const result2 = await resolveExtends('', configFile, cacheDir);
    assert.equal(result2, null);
  });
});

// ---------------------------------------------------------------------------
// resolveExtends: remote URL (mock HTTP server)
// ---------------------------------------------------------------------------

describe('resolveExtends: remote URL', () => {
  let server;
  let port;
  let tmpDir;

  // Per-test server state (reset in each test).
  let requestCount = 0;
  let responseBody = '';
  let dropConnection = false;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'inherit-http-'));

    server = createServer((req, res) => {
      requestCount++;
      if (dropConnection) {
        req.socket.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responseBody);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    requestCount = 0;
    dropConnection = false;
    responseBody = JSON.stringify({ cooldown_hours: 72 });
  });

  test('fresh cache (<1h): returns cached policy without making HTTP request', async () => {
    const cacheDir = join(tmpDir, 'fresh-cache');
    const url = `http://127.0.0.1:${port}/policy.json`;
    const cachedPolicy = { cooldown_hours: 48, _source: 'cache' };

    // Write a fresh cache entry (timestamp = now).
    await mkdtemp(join(tmpdir(), 'x-')).then(async (d) => { await rm(d, { recursive: true }); }); // warm up
    const { mkdirSync } = await import('node:fs');
    mkdirSync(cacheDir, { recursive: true });
    await writeCacheEntry(cacheDir, cachedPolicy, new Date());

    requestCount = 0;
    const result = await resolveExtends(url, '/fake/.trustlockrc.json', cacheDir);

    assert.deepEqual(result, cachedPolicy, 'should return cached policy');
    assert.equal(requestCount, 0, 'no HTTP request should be made when cache is fresh');
  });

  test('stale cache (>1h) + server reachable: fetches fresh policy and refreshes cache', async () => {
    const cacheDir = join(tmpDir, 'stale-reachable');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(cacheDir, { recursive: true });

    const url = `http://127.0.0.1:${port}/policy.json`;
    const stalePolicy = { cooldown_hours: 24, _source: 'stale' };
    const freshPolicy = { cooldown_hours: 72, _source: 'fresh' };

    // Write a stale cache entry (timestamp = 2 hours ago).
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await writeCacheEntry(cacheDir, stalePolicy, staleTime);

    // Server will respond with freshPolicy.
    responseBody = JSON.stringify(freshPolicy);
    requestCount = 0;

    const result = await resolveExtends(url, '/fake/.trustlockrc.json', cacheDir);

    assert.deepEqual(result, freshPolicy, 'should return freshly fetched policy');
    assert.equal(requestCount, 1, 'exactly one HTTP request should be made');

    // Verify cache was refreshed.
    const cacheRaw = await readFile(join(cacheDir, 'org-policy.json'), 'utf8');
    const cacheEntry = JSON.parse(cacheRaw);
    assert.deepEqual(cacheEntry.policy, freshPolicy, 'cache should contain the freshly fetched policy');
    const cacheAge = Date.now() - new Date(cacheEntry.fetched_at).getTime();
    assert.ok(cacheAge < 5000, 'fetched_at should be recent (within 5 seconds)');
  });

  test('stale cache + server unreachable: uses stale cache and emits stderr warning', async () => {
    const cacheDir = join(tmpDir, 'stale-unreachable');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(cacheDir, { recursive: true });

    const url = `http://127.0.0.1:${port}/policy.json`;
    const stalePolicy = { cooldown_hours: 36, _source: 'stale' };
    const staleTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await writeCacheEntry(cacheDir, stalePolicy, staleTimestamp);

    dropConnection = true;
    requestCount = 0;

    const { result, stderr } = await captureStderr(() =>
      resolveExtends(url, '/fake/.trustlockrc.json', cacheDir)
    );

    assert.deepEqual(result, stalePolicy, 'should return stale cached policy');
    assert.ok(
      stderr.includes('Warning: could not reach policy URL, using cached copy from'),
      `stderr should contain stale-cache warning, got: ${stderr}`
    );
    assert.ok(
      stderr.includes(staleTimestamp),
      `stderr warning should include the fetched_at timestamp, got: ${stderr}`
    );
  });

  test('no cache + server unreachable: rejects with error containing the URL', async () => {
    const cacheDir = join(tmpDir, 'no-cache-unreachable');
    const url = `http://127.0.0.1:${port}/policy.json`;

    dropConnection = true;
    requestCount = 0;

    await assert.rejects(
      () => resolveExtends(url, '/fake/.trustlockrc.json', cacheDir),
      (err) => {
        assert.equal(err.exitCode, 2, 'exitCode must be 2');
        assert.ok(
          err.message.includes(url),
          `error message should contain the URL, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('no cached copy exists'),
          `error message should mention no cached copy, got: ${err.message}`
        );
        return true;
      }
    );
  });

  test('non-JSON response: rejects with parse error containing the URL', async () => {
    const cacheDir = join(tmpDir, 'non-json');
    const url = `http://127.0.0.1:${port}/policy.json`;

    responseBody = 'this is not json <!DOCTYPE html>';
    requestCount = 0;

    await assert.rejects(
      () => resolveExtends(url, '/fake/.trustlockrc.json', cacheDir),
      (err) => {
        assert.equal(err.exitCode, 2, 'exitCode must be 2');
        assert.ok(
          err.message.includes(url),
          `parse error message should include the URL, got: ${err.message}`
        );
        return true;
      }
    );
  });

  test('chained extends in remote policy: stripped from result and stderr warning emitted', async () => {
    const cacheDir = join(tmpDir, 'chained-remote');
    const url = `http://127.0.0.1:${port}/policy.json`;

    const policyWithChain = {
      cooldown_hours: 72,
      extends: 'https://grandparent.example.com/policy.json',
    };
    responseBody = JSON.stringify(policyWithChain);
    requestCount = 0;

    const { result, stderr } = await captureStderr(() =>
      resolveExtends(url, '/fake/.trustlockrc.json', cacheDir)
    );

    assert.ok(!('extends' in result), 'extends key must be stripped from remote policy');
    assert.equal(result.cooldown_hours, 72);
    assert.ok(
      stderr.includes('Warning: chained extends in org policy is not supported. Ignoring.'),
      `stderr should contain chained-extends warning, got: ${stderr}`
    );

    // Verify the cached policy also has extends stripped.
    const cacheRaw = await readFile(join(cacheDir, 'org-policy.json'), 'utf8');
    const cacheEntry = JSON.parse(cacheRaw);
    assert.ok(
      !('extends' in cacheEntry.policy),
      'cached policy must not contain extends key'
    );
  });

  test('cache file is written with correct format after successful fetch', async () => {
    const cacheDir = join(tmpDir, 'cache-format');
    const url = `http://127.0.0.1:${port}/policy.json`;
    const serverPolicy = { cooldown_hours: 72, pinning: { required: true } };

    responseBody = JSON.stringify(serverPolicy);
    requestCount = 0;

    await resolveExtends(url, '/fake/.trustlockrc.json', cacheDir);

    const cacheRaw = await readFile(join(cacheDir, 'org-policy.json'), 'utf8');
    const cacheEntry = JSON.parse(cacheRaw);

    assert.ok(
      typeof cacheEntry.fetched_at === 'string',
      'cache entry must have fetched_at string'
    );
    assert.ok(
      !isNaN(new Date(cacheEntry.fetched_at).getTime()),
      'fetched_at must be a valid ISO date'
    );
    assert.deepEqual(cacheEntry.policy, serverPolicy, 'cache entry.policy must match fetched policy');
  });
});

// ---------------------------------------------------------------------------
// AC2 compliance: no src/registry import
// ---------------------------------------------------------------------------

test('inherit.js does not import from src/registry/', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname: dn, join: j } = await import('node:path');

  const __dirname = dn(fileURLToPath(import.meta.url));
  const srcPath = j(__dirname, '../../src/policy/inherit.js');
  const src = await rf(srcPath, 'utf8');

  assert.ok(
    !src.includes('src/registry'),
    'inherit.js must not import from src/registry/ (C6 compliance)'
  );
});
