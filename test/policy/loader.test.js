/**
 * Tests for src/policy/loader.js
 *
 * Coverage (F15-S2 acceptance criteria):
 *   - loadPolicy: no-extends flat config (with and without --profile)
 *   - loadPolicy: extends URL → merged config, floor enforcement, profile composition
 *   - loadPolicy: extends URL, remote unreachable + no cache → exits 2 error
 *   - loadPolicy: extends local path → merged config
 *   - loadPolicy: profile not found → exits 2 error
 *   - C-NEW-4: cross-audit.js does NOT import loadPolicy
 *
 * Test runner: node --test
 * Network tests use a local node:http mock server on 127.0.0.1.
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPolicy } from '../../src/policy/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir() {
  return mkdtemp(join(tmpdir(), 'loader-test-'));
}

async function writeConfig(dir, config) {
  const configPath = join(dir, '.trustlockrc.json');
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  return configPath;
}

async function makeCacheDir(dir) {
  const cacheDir = join(dir, '.cache');
  await mkdir(cacheDir, { recursive: true });
  return cacheDir;
}

/**
 * Temporarily capture writes to process.stderr.
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

// ---------------------------------------------------------------------------
// AC: loader.js exports loadPolicy
// ---------------------------------------------------------------------------

test('loadPolicy is exported as a named async function', () => {
  assert.strictEqual(typeof loadPolicy, 'function');
  // calling it returns a promise
  const result = loadPolicy({ configPath: '/nonexistent', cacheDir: '/tmp', profile: null });
  assert.ok(result instanceof Promise);
  // clean up the rejected promise
  result.catch(() => {});
});

// ---------------------------------------------------------------------------
// AC: no-extends flat config (basic normalization)
// ---------------------------------------------------------------------------

describe('no-extends flat config', () => {
  let dir, configPath, cacheDir;

  beforeEach(async () => {
    dir = await makeTmpDir();
    cacheDir = await makeCacheDir(dir);
    configPath = await writeConfig(dir, {
      cooldown_hours: 48,
      provenance: { required_for: ['*'] },
    });
  });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('returns normalized PolicyConfig with defaults applied for missing fields', async () => {
    const policy = await loadPolicy({ configPath, cacheDir, profile: null });
    assert.strictEqual(policy.cooldown_hours, 48);
    assert.deepStrictEqual(policy.provenance.required_for, ['*']);
    // defaults applied
    assert.strictEqual(typeof policy.pinning.required, 'boolean');
    assert.ok(Array.isArray(policy.scripts.allowlist));
    assert.ok(Array.isArray(policy.sources.allowed));
    assert.strictEqual(typeof policy.transitive.max_new, 'number');
  });

  test('skips resolveExtends when extends key is absent', async () => {
    // If extends were called with a bad URL it would throw; absence means it is skipped.
    const policy = await loadPolicy({ configPath, cacheDir, profile: null });
    assert.ok(policy !== undefined); // loaded without error
    assert.ok(!('extends' in policy)); // extends key stripped from result
  });

  test('returns config without profile key when profile is null', async () => {
    const policy = await loadPolicy({ configPath, cacheDir, profile: null });
    // provenance.required_for is ['*'] from config — no profile applied
    assert.deepStrictEqual(policy.provenance.required_for, ['*']);
  });
});

// ---------------------------------------------------------------------------
// AC: missing config → throws exitCode 2
// ---------------------------------------------------------------------------

test('throws exitCode 2 when .trustlockrc.json is missing', async () => {
  const dir = await makeTmpDir();
  try {
    await assert.rejects(
      () => loadPolicy({ configPath: join(dir, '.trustlockrc.json'), cacheDir: join(dir, '.cache'), profile: null }),
      (err) => {
        assert.strictEqual(err.exitCode, 2);
        assert.ok(err.message.includes('Policy file not found'));
        assert.strictEqual(err.cause?.code, 'ENOENT');
        return true;
      }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: --profile overlay applied (no extends)
// ---------------------------------------------------------------------------

describe('profile overlay on flat config (no extends)', () => {
  let dir, configPath, cacheDir;

  beforeEach(async () => {
    dir = await makeTmpDir();
    cacheDir = await makeCacheDir(dir);
    configPath = await writeConfig(dir, { cooldown_hours: 72 });
  });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('applies built-in strict profile: cooldown_hours = 168, provenance required for all', async () => {
    const policy = await loadPolicy({ configPath, cacheDir, profile: 'strict' });
    assert.strictEqual(policy.cooldown_hours, 168);
    assert.deepStrictEqual(policy.provenance.required_for, ['*']);
  });

  test('applies built-in relaxed profile: cooldown_hours = 24', async () => {
    const policy = await loadPolicy({ configPath, cacheDir, profile: 'relaxed' });
    assert.strictEqual(policy.cooldown_hours, 24);
    assert.strictEqual(policy.provenance.block_on_regression, false);
  });

  test('throws exitCode 2 on unknown profile name', async () => {
    await assert.rejects(
      () => loadPolicy({ configPath, cacheDir, profile: 'nonexistent' }),
      (err) => {
        assert.strictEqual(err.exitCode, 2);
        assert.ok(err.message.includes('"nonexistent"'));
        return true;
      }
    );
  });

  test('applies user-defined profile from config', async () => {
    configPath = await writeConfig(dir, {
      cooldown_hours: 72,
      profiles: {
        fast: { cooldown_hours: 80 },
      },
    });
    const policy = await loadPolicy({ configPath, cacheDir, profile: 'fast' });
    assert.strictEqual(policy.cooldown_hours, 80);
  });
});

// ---------------------------------------------------------------------------
// AC: extends URL → merged config with mock HTTP server
// ---------------------------------------------------------------------------

describe('extends: remote URL', () => {
  let server, serverUrl;
  let dir, cacheDir;
  let servedPolicy;

  before(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(servedPolicy));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    serverUrl = `http://127.0.0.1:${port}/org-policy.json`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dir = await makeTmpDir();
    cacheDir = await makeCacheDir(dir);
  });

  test('AC: extends URL → loadPolicy returns merged config with org values floor-enforced', async () => {
    // Org policy: cooldown_hours=72
    servedPolicy = { cooldown_hours: 72, provenance: { block_on_publisher_change: true } };

    // Repo config: cooldown_hours=96 (above org floor — allowed), extends org
    const configPath = await writeConfig(dir, {
      extends: serverUrl,
      cooldown_hours: 96,
    });

    const policy = await loadPolicy({ configPath, cacheDir, profile: null });

    // Repo value wins for scalar (96 >= 72 — floor satisfied)
    assert.strictEqual(policy.cooldown_hours, 96);
    // Org value flows through for non-overridden keys
    assert.strictEqual(policy.provenance?.block_on_publisher_change, true);
  });

  test('AC: repo floor violation → loadPolicy throws exitCode 2', async () => {
    servedPolicy = { cooldown_hours: 72 };

    const configPath = await writeConfig(dir, {
      extends: serverUrl,
      cooldown_hours: 24, // below org minimum of 72 — floor violation
    });

    await assert.rejects(
      () => loadPolicy({ configPath, cacheDir, profile: null }),
      (err) => {
        assert.strictEqual(err.exitCode, 2);
        assert.ok(err.message.includes('cooldown_hours=24'));
        assert.ok(err.message.includes('org minimum of 72'));
        return true;
      }
    );
  });

  test('AC: extends URL + --profile strict → profile floor check runs against merged (extends+repo) config', async () => {
    // Org: cooldown_hours=72, repo: cooldown_hours=96. Merged=96. Then strict profile sets 168.
    servedPolicy = { cooldown_hours: 72 };

    const configPath = await writeConfig(dir, {
      extends: serverUrl,
      cooldown_hours: 96,
    });

    const policy = await loadPolicy({ configPath, cacheDir, profile: 'strict' });

    // strict profile: cooldown_hours=168, provenance.required_for=['*']
    assert.strictEqual(policy.cooldown_hours, 168);
    assert.deepStrictEqual(policy.provenance.required_for, ['*']);
  });

  test('AC: F14 composition — user profile floor check uses merged (extends+repo) config, not just repo config', async () => {
    // Org: cooldown_hours=72. Repo: cooldown_hours=96. Merged=96.
    // User profile tries to set cooldown_hours=80 (< 96 merged) → floor violation.
    servedPolicy = { cooldown_hours: 72 };

    const configPath = await writeConfig(dir, {
      extends: serverUrl,
      cooldown_hours: 96,
      profiles: { myprofile: { cooldown_hours: 80 } },
    });

    await assert.rejects(
      () => loadPolicy({ configPath, cacheDir, profile: 'myprofile' }),
      (err) => {
        // Floor check for user profile runs against merged=96; 80 < 96
        assert.ok(err.message.includes('cooldown_hours=80'));
        return true;
      }
    );
  });

  test('AC: remote unreachable + no cache → loadPolicy rejects with exitCode 2', async () => {
    // Point to a port that is not listening (use the server's port after close simulation
    // by using a port that is not listening — stop the server temporarily).
    // Instead: use a non-listening port directly.
    const configPath = await writeConfig(dir, {
      extends: 'http://127.0.0.1:1', // port 1 is never listening
    });

    await assert.rejects(
      () => loadPolicy({ configPath, cacheDir, profile: null }),
      (err) => {
        assert.strictEqual(err.exitCode, 2);
        assert.ok(
          err.message.includes('could not fetch org policy') ||
          err.message.includes('no cached copy exists')
        );
        return true;
      }
    );
  });

  test('array union: repo scripts.allowlist adds to org allowlist; org entries preserved', async () => {
    servedPolicy = { scripts: { allowlist: ['rimraf', 'husky'] } };

    const configPath = await writeConfig(dir, {
      extends: serverUrl,
      scripts: { allowlist: ['my-script'] },
    });

    const policy = await loadPolicy({ configPath, cacheDir, profile: null });

    // Union: org entries preserved, repo entry added
    assert.ok(policy.scripts.allowlist.includes('rimraf'));
    assert.ok(policy.scripts.allowlist.includes('husky'));
    assert.ok(policy.scripts.allowlist.includes('my-script'));
  });
});

// ---------------------------------------------------------------------------
// AC: extends local path → merged config
// ---------------------------------------------------------------------------

describe('extends: local path', () => {
  let dir, cacheDir;

  beforeEach(async () => {
    dir = await makeTmpDir();
    cacheDir = await makeCacheDir(dir);
  });

  after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('resolves local path relative to .trustlockrc.json and merges', async () => {
    // Write org policy file
    const orgPolicyPath = join(dir, 'org-policy.json');
    await writeFile(orgPolicyPath, JSON.stringify({ cooldown_hours: 72 }), 'utf8');

    const configPath = await writeConfig(dir, {
      extends: './org-policy.json',
      cooldown_hours: 96,
    });

    const policy = await loadPolicy({ configPath, cacheDir, profile: null });
    assert.strictEqual(policy.cooldown_hours, 96);
  });

  test('local path not found → throws exitCode 2', async () => {
    const configPath = await writeConfig(dir, {
      extends: './nonexistent-policy.json',
    });

    await assert.rejects(
      () => loadPolicy({ configPath, cacheDir, profile: null }),
      (err) => {
        assert.strictEqual(err.exitCode, 2);
        assert.ok(err.message.includes('extends path not found'));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// AC: C-NEW-4 — cross-audit.js does NOT import loadPolicy
// ---------------------------------------------------------------------------

test('C-NEW-4: cross-audit.js does not import loadPolicy', async () => {
  const crossAuditPath = join(__dirname, '../../src/cli/commands/cross-audit.js');
  const content = await readFile(crossAuditPath, 'utf8');
  assert.ok(
    !content.includes('loadPolicy'),
    'cross-audit.js must NOT reference loadPolicy (C-NEW-4 permanent carve-out)'
  );
});

// ---------------------------------------------------------------------------
// AC: pass-through fields (require_reason, max_expiry_days) survive normalization
// ---------------------------------------------------------------------------

test('approval-specific fields (require_reason, max_expiry_days) pass through normalization', async () => {
  const dir = await makeTmpDir();
  const cacheDir = await makeCacheDir(dir);
  const configPath = await writeConfig(dir, {
    cooldown_hours: 72,
    require_reason: false,
    max_expiry_days: 14,
  });
  try {
    const policy = await loadPolicy({ configPath, cacheDir, profile: null });
    assert.strictEqual(policy.require_reason, false);
    assert.strictEqual(policy.max_expiry_days, 14);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
