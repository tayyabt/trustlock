import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { detectFormat, parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── process.exit intercept ────────────────────────────────────────────────────
// Saved once at module load so afterEach can always restore safely.
const _realExit = process.exit;
const _realConsoleError = console.error;

afterEach(() => {
  process.exit = _realExit;
  console.error = _realConsoleError;
});

/**
 * Run an async fn that is expected to call process.exit(2).
 * Intercepts exit and console.error, returns captured messages.
 * Asserts exit code is 2.
 */
async function expectExit2(fn) {
  const messages = [];
  console.error = (...args) => messages.push(args.join(' '));
  process.exit = (code) => {
    throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code });
  };

  let exitCode = null;
  await assert.rejects(
    fn,
    (err) => {
      exitCode = err.exitCode;
      return /process\.exit/.test(err.message);
    }
  );

  process.exit = _realExit;
  console.error = _realConsoleError;

  assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
  return messages;
}

// ── Temp file helpers ─────────────────────────────────────────────────────────

async function withTempDir(cb) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dep-fence-test-'));
  try {
    return await cb(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeLockfile(dir, lockfileVersion, extra = {}) {
  const content = { name: 'test-project', version: '1.0.0', lockfileVersion, ...extra };
  const lockfilePath = path.join(dir, 'package-lock.json');
  await writeFile(lockfilePath, JSON.stringify(content), 'utf8');
  return lockfilePath;
}

async function writePackageJson(dir, content = {}) {
  const pkgPath = path.join(dir, 'package.json');
  await writeFile(pkgPath, JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: {}, devDependencies: {}, ...content }), 'utf8');
  return pkgPath;
}

// ── detectFormat: version detection ──────────────────────────────────────────

describe('detectFormat — npm version detection', () => {
  test('returns { format: "npm", version: 1 } for lockfileVersion 1', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 1);
      const result = await detectFormat(lockfilePath);
      assert.deepEqual(result, { format: 'npm', version: 1 });
    });
  });

  test('returns { format: "npm", version: 2 } for lockfileVersion 2', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 2, { packages: {}, dependencies: {} });
      const result = await detectFormat(lockfilePath);
      assert.deepEqual(result, { format: 'npm', version: 2 });
    });
  });

  test('returns { format: "npm", version: 3 } for lockfileVersion 3', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 3, { packages: {} });
      const result = await detectFormat(lockfilePath);
      assert.deepEqual(result, { format: 'npm', version: 3 });
    });
  });
});

// ── detectFormat: unknown/missing version ────────────────────────────────────

describe('detectFormat — unsupported version', () => {
  test('exit 2 for lockfileVersion 4 with exact error message', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 4);
      const messages = await expectExit2(() => detectFormat(lockfilePath));
      assert.ok(
        messages.some((m) => m.includes('Unsupported npm lockfile version 4')),
        `Expected "Unsupported npm lockfile version 4", got: ${JSON.stringify(messages)}`
      );
      assert.ok(
        messages.some((m) => m.includes('dep-fence supports v1, v2, v3')),
        `Expected "dep-fence supports v1, v2, v3", got: ${JSON.stringify(messages)}`
      );
    });
  });

  test('exit 2 when lockfileVersion field is missing', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = path.join(dir, 'package-lock.json');
      await writeFile(lockfilePath, JSON.stringify({ name: 'p', version: '1.0.0' }), 'utf8');
      const messages = await expectExit2(() => detectFormat(lockfilePath));
      assert.ok(
        messages.some((m) => m.includes('Unsupported npm lockfile version')),
        `Expected unsupported version message, got: ${JSON.stringify(messages)}`
      );
    });
  });
});

// ── detectFormat: file / parse errors ────────────────────────────────────────

describe('detectFormat — file and parse errors', () => {
  test('exit 2 when lockfile path does not exist', async () => {
    const messages = await expectExit2(() =>
      detectFormat('/nonexistent/path/to/package-lock.json')
    );
    assert.ok(
      messages.some((m) => m.includes('Lockfile not found')),
      `Expected "Lockfile not found", got: ${JSON.stringify(messages)}`
    );
  });

  test('exit 2 for non-JSON lockfile content', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = path.join(dir, 'package-lock.json');
      await writeFile(lockfilePath, 'NOT VALID JSON <<<', 'utf8');
      const messages = await expectExit2(() => detectFormat(lockfilePath));
      assert.ok(
        messages.some((m) => m.includes('Failed to parse lockfile as JSON')),
        `Expected JSON parse error, got: ${JSON.stringify(messages)}`
      );
    });
  });

  test('exit 2 for unrecognized filename (e.g. pnpm-lock.yaml)', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = path.join(dir, 'pnpm-lock.yaml');
      await writeFile(lockfilePath, '{}', 'utf8');
      const messages = await expectExit2(() => detectFormat(lockfilePath));
      assert.ok(
        messages.some((m) => m.includes('Unrecognized lockfile format')),
        `Expected "Unrecognized lockfile format", got: ${JSON.stringify(messages)}`
      );
    });
  });
});

// ── parseLockfile: router dispatch ────────────────────────────────────────────

describe('parseLockfile — router dispatch to npm parser', () => {
  test('returns an array for a valid v1 lockfile', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 1, { dependencies: {} });
      const pkgPath = await writePackageJson(dir);
      const result = await parseLockfile(lockfilePath, pkgPath);
      assert.ok(Array.isArray(result), 'parseLockfile must return an array');
    });
  });

  test('returns an array for a valid v2 lockfile', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 2, { packages: {}, dependencies: {} });
      const pkgPath = await writePackageJson(dir);
      const result = await parseLockfile(lockfilePath, pkgPath);
      assert.ok(Array.isArray(result), 'parseLockfile must return an array');
    });
  });

  test('returns an array for a valid v3 lockfile', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 3, { packages: {} });
      const pkgPath = await writePackageJson(dir);
      const result = await parseLockfile(lockfilePath, pkgPath);
      assert.ok(Array.isArray(result), 'parseLockfile must return an array');
    });
  });
});

// ── parseLockfile: error cases ────────────────────────────────────────────────

describe('parseLockfile — error cases', () => {
  test('exit 2 when lockfile does not exist', async () => {
    const messages = await expectExit2(() =>
      parseLockfile('/nonexistent/package-lock.json', '/nonexistent/package.json')
    );
    assert.ok(
      messages.some((m) => m.includes('Lockfile not found')),
      `Expected "Lockfile not found", got: ${JSON.stringify(messages)}`
    );
  });

  test('exit 2 when package.json does not exist', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 2, { packages: {} });
      const messages = await expectExit2(() =>
        parseLockfile(lockfilePath, path.join(dir, 'no-package.json'))
      );
      assert.ok(
        messages.some((m) => m.includes('package.json not found')),
        `Expected "package.json not found", got: ${JSON.stringify(messages)}`
      );
    });
  });

  test('exit 2 for unknown lockfileVersion in parseLockfile', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = await writeLockfile(dir, 4);
      const pkgPath = await writePackageJson(dir);
      const messages = await expectExit2(() => parseLockfile(lockfilePath, pkgPath));
      assert.ok(
        messages.some((m) => m.includes('Unsupported npm lockfile version 4')),
        `Expected "Unsupported npm lockfile version 4", got: ${JSON.stringify(messages)}`
      );
    });
  });

  test('exit 2 for non-JSON lockfile content in parseLockfile', async () => {
    await withTempDir(async (dir) => {
      const lockfilePath = path.join(dir, 'package-lock.json');
      await writeFile(lockfilePath, 'BAD JSON +++', 'utf8');
      const pkgPath = await writePackageJson(dir);
      const messages = await expectExit2(() => parseLockfile(lockfilePath, pkgPath));
      assert.ok(
        messages.some((m) => m.includes('Failed to parse lockfile as JSON')),
        `Expected JSON parse error, got: ${JSON.stringify(messages)}`
      );
    });
  });
});
