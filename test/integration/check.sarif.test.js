/**
 * Integration tests for `trustlock check --sarif`.
 *
 * Spawns the real CLI as a child process. Verifies:
 *   - SARIF 2.1.0 document emitted to stdout when --sarif is active
 *   - Correct exit codes in advisory and --enforce modes
 *   - --quiet suppresses SARIF output (G-NEW-2)
 *   - --json --sarif mutual exclusion enforced by args.js
 *   - stdout purity: no non-JSON fragments when --sarif is active
 *   - stderr retains diagnostic output regardless of --sarif
 *
 * Block trigger: `hasInstallScripts: true` activates the `execution:scripts` rule.
 * This rule requires no registry calls, so no cache population is needed for the
 * blocked package itself.
 *
 * All tests use temp directories cleaned up in `finally` blocks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const CLI_PATH     = join(PROJECT_ROOT, 'src', 'cli', 'index.js');

// ---------------------------------------------------------------------------
// Helpers (mirrors cli-e2e.test.js patterns)
// ---------------------------------------------------------------------------

/**
 * Spawn the CLI as a child process, capturing stdout and stderr separately.
 *
 * @param {string[]} args  CLI arguments
 * @param {string}   cwd   Working directory
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function spawnCli(args, cwd) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** SHA-256 hex of `str`. */
function sha256hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Build a minimal package-lock.json v3 object.
 *
 * @param {{ name: string, version: string, hasInstallScripts?: boolean }[]} deps
 */
function buildLockfileV3(deps) {
  const packages = {
    '': {
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(deps.map((d) => [d.name, `^${d.version}`])),
    },
  };
  for (const dep of deps) {
    packages[`node_modules/${dep.name}`] = {
      version: dep.version,
      resolved: `https://registry.npmjs.org/${dep.name}/-/${dep.name}-${dep.version}.tgz`,
      integrity: `sha512-fake-${dep.name}-${dep.version}`,
      hasInstallScripts: dep.hasInstallScripts ?? false,
    };
  }
  return { name: 'test-project', version: '1.0.0', lockfileVersion: 3, requires: true, packages };
}

/** Write package-lock.json and return the content string. */
async function writeLockfile(dir, deps) {
  const content = JSON.stringify(buildLockfileV3(deps), null, 2) + '\n';
  await writeFile(join(dir, 'package-lock.json'), content, 'utf8');
  return content;
}

/**
 * Pre-populate the registry cache for a package so `check` makes no HTTP calls.
 *
 * @param {string} cacheDir
 * @param {string} name
 * @param {string} version
 */
async function populateCache(cacheDir, name, version) {
  const now = Date.now();
  const publishedAt = '2024-01-01T00:00:00.000Z'; // old enough to pass cooldown

  await writeFile(
    join(cacheDir, `${name}.json`),
    JSON.stringify({ name, time: { [version]: publishedAt }, _cachedAt: now }),
    'utf8'
  );
  await writeFile(
    join(cacheDir, `attestations:${name}@${version}.json`),
    JSON.stringify({ _value: null, _cachedAt: now }),
    'utf8'
  );
}

const DEFAULT_POLICY = {
  cooldown_hours: 72,
  pinning: { required: false },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: [] },
  transitive: { max_new: 5 },
};

/**
 * Set up a fully initialized trustlock project.
 *
 * Creates git repo, package.json, package-lock.json, .trustlockrc.json,
 * .trustlock scaffold (baseline, approvals, .cache, .gitignore), and initial commit.
 *
 * @param {string} tmpDir
 * @param {{ deps?: object[], policy?: object }} [opts]
 * @returns {Promise<{ lockfileContent: string, lockfileHash: string }>}
 */
async function setupInitializedProject(tmpDir, opts = {}) {
  const { deps = [{ name: 'safe-pkg', version: '1.0.0' }], policy = {} } = opts;

  execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@trustlock.test"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config commit.gpgSign false', { cwd: tmpDir, stdio: 'ignore' });

  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(deps.map((d) => [d.name, `^${d.version}`])),
    }, null, 2) + '\n',
    'utf8'
  );

  const lockfileContent = await writeLockfile(tmpDir, deps);
  const lockfileHash = sha256hex(lockfileContent);

  await writeFile(
    join(tmpDir, '.trustlockrc.json'),
    JSON.stringify({ ...DEFAULT_POLICY, ...policy }, null, 2) + '\n',
    'utf8'
  );

  const trustlockDir = join(tmpDir, '.trustlock');
  const cacheDir = join(trustlockDir, '.cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(trustlockDir, 'approvals.json'), '[]\n', 'utf8');
  await writeFile(join(trustlockDir, '.gitignore'), '.cache/\n', 'utf8');

  const now = new Date().toISOString();
  const packages = {};
  for (const dep of deps) {
    packages[dep.name] = {
      name:              dep.name,
      version:           dep.version,
      admittedAt:        now,
      provenanceStatus:  'unknown',
      hasInstallScripts: dep.hasInstallScripts ?? false,
      sourceType:        'registry',
    };
  }
  await writeFile(
    join(trustlockDir, 'baseline.json'),
    JSON.stringify({ schema_version: 1, created_at: now, lockfile_hash: lockfileHash, packages }, null, 2) + '\n',
    'utf8'
  );

  for (const dep of deps) {
    await populateCache(cacheDir, dep.name, dep.version);
  }

  execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

  return { lockfileContent, lockfileHash };
}

/** Create a unique temp directory for a test. */
async function makeTmpDir() {
  const dir = join(tmpdir(), `trustlock-sarif-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Test: --json --sarif mutual exclusion
// ---------------------------------------------------------------------------

test('check --json --sarif: exits 2 with mutex error; check.js never reaches formatter', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir);
    // Add a new package so check has something to evaluate.
    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg', version: '1.0.0' },
      { name: 'new-pkg',  version: '1.0.0' },
    ]);
    await populateCache(cacheDir, 'new-pkg', '1.0.0');

    const result = spawnCli(['check', '--json', '--sarif'], tmpDir);

    assert.equal(result.exitCode, 2, `expected exit 2 from mutex check; got ${result.exitCode}`);
    assert.match(result.stderr, /Cannot use --json and --sarif together/,
      `expected mutex error on stderr; got: ${result.stderr}`);
    // stdout must not contain any JSON (check.js never reached formatter)
    assert.equal(result.stdout.trim(), '', `stdout must be empty; got: ${result.stdout}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: check --sarif with blocked packages (advisory mode, exit 0)
// ---------------------------------------------------------------------------

test('check --sarif: blocked packages → valid SARIF 2.1.0 on stdout; exit 0 (advisory)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // Baseline: safe-pkg only.
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a blocked package (hasInstallScripts=true, not in allowlist).
    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif'], tmpDir);

    // Advisory mode: exit 0 even with blocked packages.
    assert.equal(result.exitCode, 0,
      `advisory check --sarif must exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    // stdout must be parseable SARIF 2.1.0.
    let doc;
    assert.doesNotThrow(
      () => { doc = JSON.parse(result.stdout); },
      `stdout must be parseable JSON SARIF; got: ${result.stdout}`
    );
    assert.equal(doc.version, '2.1.0', 'SARIF version must be 2.1.0');
    assert.ok(Array.isArray(doc.runs), 'runs must be an array');
    assert.ok(doc.runs[0].results.length >= 1,
      `runs[0].results must have at least one blocked finding; got ${doc.runs[0].results.length}`);

    // Verify the blocked package appears in results.
    const ruleIds = doc.runs[0].results.map((r) => r.ruleId);
    assert.ok(ruleIds.includes('scripts'),
      `expected "scripts" ruleId in results; got: ${JSON.stringify(ruleIds)}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: check --sarif all admitted
// ---------------------------------------------------------------------------

test('check --sarif: all admitted → valid SARIF, runs[0].results is empty, exit 0', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // Baseline: safe-pkg only.
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a clean package (no install scripts) — will be admitted.
    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',  version: '1.0.0' },
      { name: 'clean-pkg', version: '3.0.0', hasInstallScripts: false },
    ]);
    await populateCache(cacheDir, 'clean-pkg', '3.0.0');

    const result = spawnCli(['check', '--sarif'], tmpDir);

    assert.equal(result.exitCode, 0,
      `check --sarif all-admitted must exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    let doc;
    assert.doesNotThrow(
      () => { doc = JSON.parse(result.stdout); },
      `stdout must be parseable SARIF; got: ${result.stdout}`
    );
    assert.equal(doc.version, '2.1.0');
    assert.equal(doc.runs[0].results.length, 0,
      `all-admitted must produce empty results array; got ${doc.runs[0].results.length}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: check --sarif --enforce with blocked packages → exit 1
// ---------------------------------------------------------------------------

test('check --sarif --enforce: blocked packages → valid SARIF on stdout; exit 1', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif', '--enforce'], tmpDir);

    // --enforce with any blocked package → exit 1.
    assert.equal(result.exitCode, 1,
      `check --sarif --enforce with block must exit 1; got ${result.exitCode}\nstderr: ${result.stderr}`);

    // SARIF must still be emitted to stdout (before process exits).
    let doc;
    assert.doesNotThrow(
      () => { doc = JSON.parse(result.stdout); },
      `stdout must be parseable SARIF even on exit 1; got: ${result.stdout}`
    );
    assert.equal(doc.version, '2.1.0');
    assert.ok(doc.runs[0].results.length >= 1,
      'SARIF results must include the blocked finding');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: check --sarif --enforce all admitted → exit 0
// ---------------------------------------------------------------------------

test('check --sarif --enforce: all admitted → valid SARIF on stdout; exit 0', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a clean package (no scripts, no cooldown issue since cache has old date).
    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',  version: '1.0.0' },
      { name: 'clean-pkg', version: '3.0.0', hasInstallScripts: false },
    ]);
    await populateCache(cacheDir, 'clean-pkg', '3.0.0');

    const result = spawnCli(['check', '--sarif', '--enforce'], tmpDir);

    assert.equal(result.exitCode, 0,
      `check --sarif --enforce all-admitted must exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    let doc;
    assert.doesNotThrow(
      () => { doc = JSON.parse(result.stdout); },
      `stdout must be parseable SARIF; got: ${result.stdout}`
    );
    assert.equal(doc.version, '2.1.0');
    assert.equal(doc.runs[0].results.length, 0, 'no blocked findings → empty results');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: check --quiet --sarif → no stdout output (G-NEW-2)
// ---------------------------------------------------------------------------

test('check --quiet --sarif: no SARIF written to stdout; exit code unaffected', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a blocked package to ensure policy is evaluated.
    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif', '--quiet'], tmpDir);

    // --quiet suppresses SARIF output; advisory mode exits 0.
    assert.equal(result.exitCode, 0,
      `check --quiet --sarif must exit 0 (advisory); got ${result.exitCode}\nstderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), '',
      `--quiet must suppress SARIF stdout; got: ${result.stdout}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: stdout purity — no non-SARIF fragments on stdout when --sarif active
// ---------------------------------------------------------------------------

test('check --sarif: stdout is pure SARIF JSON; stderr carries diagnostic output', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif'], tmpDir);

    // stdout must be parseable as a complete JSON document (pure SARIF).
    let doc;
    assert.doesNotThrow(
      () => { doc = JSON.parse(result.stdout); },
      `stdout must be valid JSON SARIF; got: ${result.stdout.slice(0, 200)}`
    );
    assert.equal(doc.version, '2.1.0', 'stdout must be a SARIF 2.1.0 document');

    // stderr must NOT contain SARIF JSON fragments (no $schema, no "version":"2.1.0").
    assert.doesNotMatch(result.stderr, /\$schema/, 'stderr must not contain SARIF $schema');
    assert.doesNotMatch(result.stderr, /"version"\s*:\s*"2\.1\.0"/, 'stderr must not contain SARIF version string');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: SARIF document structure completeness
// ---------------------------------------------------------------------------

test('check --sarif: SARIF document has correct tool.driver.name and 8 rules', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif'], tmpDir);

    const doc = JSON.parse(result.stdout);
    assert.equal(doc.runs[0].tool.driver.name, 'trustlock');
    assert.equal(doc.runs[0].tool.driver.rules.length, 8,
      'driver.rules must contain exactly 8 entries');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test: lockfileUri in artifactLocation uses relative path to projectRoot
// ---------------------------------------------------------------------------

test('check --sarif: artifactLocation.uri is lockfile path relative to projectRoot', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    const cacheDir = join(tmpDir, '.trustlock', '.cache');
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '2.0.0', hasInstallScripts: true },
    ]);
    await populateCache(cacheDir, 'scripted-pkg', '2.0.0');

    const result = spawnCli(['check', '--sarif'], tmpDir);

    const doc = JSON.parse(result.stdout);
    const uri = doc.runs[0].artifacts[0].location.uri;
    // Should be 'package-lock.json' (relative, not absolute).
    assert.ok(!uri.startsWith('/'), `uri must be relative, not absolute; got: ${uri}`);
    assert.match(uri, /package-lock\.json$/, `uri must end with package-lock.json; got: ${uri}`);

    // If results exist, their artifactLocation.uri must also be relative.
    if (doc.runs[0].results.length > 0) {
      const resultUri = doc.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
      assert.ok(!resultUri.startsWith('/'), `result uri must be relative; got: ${resultUri}`);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
