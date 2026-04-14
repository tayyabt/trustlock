/**
 * End-to-end integration tests for trustlock CLI.
 *
 * Tests spawn `node src/cli/index.js` as a real child process and verify:
 *   - Exit codes
 *   - stdout / stderr content
 *   - Filesystem state (files created, content correct)
 *   - git staging of baseline.json after admission (ADR-002)
 *
 * Registry isolation: tests pre-populate `.trustlock/.cache/` with fresh-timestamp
 * JSON files so no real npm registry calls are made during `check` invocations.
 *
 * Block trigger: packages with `hasInstallScripts: true` are blocked by the
 * `execution:scripts` rule (local-only check, no registry data needed).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execSync } from 'node:child_process';
import { mkdir, rm, writeFile, readFile, access, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const CLI_PATH     = join(PROJECT_ROOT, 'src', 'cli', 'index.js');

// ---------------------------------------------------------------------------
// Core helper: spawn CLI as a real child process
// ---------------------------------------------------------------------------

/**
 * Spawn `trustlock` CLI as a child process with the given args and cwd.
 * NO_COLOR=1 is set so terminal output is stripped of ANSI codes for assertions.
 *
 * @param {string[]} args   CLI arguments
 * @param {string}   cwd    Working directory for the subprocess
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

// ---------------------------------------------------------------------------
// Fixture / project helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, version: string, hasInstallScripts?: boolean }} PkgDesc
 */

/**
 * Build a minimal package-lock.json v3 object from package descriptors.
 * All packages are placed as direct registry dependencies.
 *
 * @param {PkgDesc[]} deps
 * @returns {object}
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

/**
 * Write package-lock.json v3 to `dir` and return the exact content string.
 *
 * @param {string}   dir
 * @param {PkgDesc[]} deps
 * @returns {Promise<string>}  Written content (used to compute lockfile hash)
 */
async function writeLockfile(dir, deps) {
  const content = JSON.stringify(buildLockfileV3(deps), null, 2) + '\n';
  await writeFile(join(dir, 'package-lock.json'), content, 'utf8');
  return content;
}

/**
 * SHA-256 hex of `str`.
 * @param {string} str
 * @returns {string}
 */
function sha256hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Pre-populate the trustlock file cache for a single package so `check` makes no
 * real HTTP calls. Writes two cache entries:
 *   1. Full metadata (`<name>.json`)  — used by cooldown rule
 *   2. Attestations (`attestations:<name>@<version>.json`) — used by provenance rule
 *
 * Both entries have `_cachedAt = Date.now()` (fresh within 1-hour TTL).
 * `publishedAt` defaults to 2024-01-01 so age > 72 hours (cooldown threshold).
 *
 * @param {string} cacheDir
 * @param {string} name
 * @param {string} version
 * @param {{ publishedAt?: string }} [opts]
 */
async function populateCache(cacheDir, name, version, opts = {}) {
  const { publishedAt = '2024-01-01T00:00:00.000Z' } = opts;
  const now = Date.now();

  // Full packument — cache key = name, file = <name>.json
  await writeFile(
    join(cacheDir, `${name}.json`),
    JSON.stringify({ name, time: { [version]: publishedAt }, _cachedAt: now }),
    'utf8'
  );

  // Attestations — cache key = attestations:<name>@<version>
  // The { _value } envelope allows null (no-attestation) to survive the JSON round-trip.
  await writeFile(
    join(cacheDir, `attestations:${name}@${version}.json`),
    JSON.stringify({ _value: null, _cachedAt: now }),
    'utf8'
  );
}

/** Default policy mirrors `trustlock init` defaults. */
const DEFAULT_POLICY = {
  cooldown_hours: 72,
  pinning: { required: false },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: [] },
  transitive: { max_new: 5 },
};

/**
 * Set up a fully initialized trustlock project in `tmpDir` without spawning a CLI
 * subprocess. Creates git repo, package.json, package-lock.json, .trustlockrc.json,
 * .trustlock scaffold (approvals.json, baseline.json, .cache/, .gitignore), and
 * an initial git commit.
 *
 * @param {string}   tmpDir
 * @param {{ deps?: PkgDesc[], policy?: object }} [opts]
 * @returns {Promise<{ lockfileContent: string, lockfileHash: string }>}
 */
async function setupInitializedProject(tmpDir, opts = {}) {
  const { deps = [{ name: 'safe-pkg', version: '1.0.0' }], policy = {} } = opts;

  // Initialize git repo with test identity and no GPG signing.
  execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.email "test@trustlock.test"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git config commit.gpgSign false', { cwd: tmpDir, stdio: 'ignore' });

  // package.json
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(deps.map((d) => [d.name, `^${d.version}`])),
    }, null, 2) + '\n',
    'utf8'
  );

  // package-lock.json
  const lockfileContent = await writeLockfile(tmpDir, deps);
  const lockfileHash = sha256hex(lockfileContent);

  // .trustlockrc.json
  await writeFile(
    join(tmpDir, '.trustlockrc.json'),
    JSON.stringify({ ...DEFAULT_POLICY, ...policy }, null, 2) + '\n',
    'utf8'
  );

  // .trustlock/ scaffold
  const trustlockDir = join(tmpDir, '.trustlock');
  const cacheDir    = join(trustlockDir, '.cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(trustlockDir, 'approvals.json'), '[]\n', 'utf8');
  await writeFile(join(trustlockDir, '.gitignore'), '.cache/\n', 'utf8');

  // baseline.json — reflects the current lockfile exactly
  const now      = new Date().toISOString();
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

  // Pre-populate cache for every dep so check makes no HTTP calls.
  for (const dep of deps) {
    await populateCache(cacheDir, dep.name, dep.version);
  }

  // Initial commit (working tree clean; baseline staged and committed).
  execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'ignore' });

  return { lockfileContent, lockfileHash };
}

/**
 * Create a unique temp directory for a test.
 * @returns {Promise<string>}
 */
async function makeTmpDir() {
  const dir = join(tmpdir(), `trustlock-e2e-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// AC: init test
// ---------------------------------------------------------------------------

test('init: creates .trustlockrc.json, baseline.json, approvals.json, .cache/, .gitignore', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // Only git + raw project files — no trustlock scaffold.
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@trustlock.test"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config commit.gpgSign false', { cwd: tmpDir, stdio: 'ignore' });

    // Single-package project to minimise registry round-trips.
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: { 'init-test-pkg': '^1.0.0' } }, null, 2),
      'utf8'
    );
    await writeLockfile(tmpDir, [{ name: 'init-test-pkg', version: '1.0.0' }]);

    const result = spawnCli(['init'], tmpDir);

    // Exit 0 regardless of registry reachability (offline degrades gracefully).
    assert.equal(result.exitCode, 0,
      `init should exit 0; exit code was ${result.exitCode}\nstderr: ${result.stderr}`);

    // .trustlockrc.json must exist with valid default policy shape.
    const policy = JSON.parse(await readFile(join(tmpDir, '.trustlockrc.json'), 'utf8'));
    assert.equal(typeof policy.cooldown_hours, 'number', 'cooldown_hours must be a number');
    assert.ok(Array.isArray(policy.scripts?.allowlist), 'scripts.allowlist must be an array');

    const trustlockDir = join(tmpDir, '.trustlock');

    // approvals.json must exist as empty array.
    assert.deepEqual(
      JSON.parse(await readFile(join(trustlockDir, 'approvals.json'), 'utf8')),
      [],
      'approvals.json must start as []'
    );

    // .cache/ must exist as a directory.
    assert.ok((await stat(join(trustlockDir, '.cache'))).isDirectory(), '.cache must be a directory');

    // .gitignore must include .cache/.
    const gitignore = await readFile(join(trustlockDir, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.cache/'), '.gitignore must include .cache/');

    // baseline.json must exist with schema_version 1 and at least 1 package.
    const baseline = JSON.parse(await readFile(join(trustlockDir, 'baseline.json'), 'utf8'));
    assert.equal(baseline.schema_version, 1, 'schema_version must be 1');
    assert.ok(
      typeof baseline.lockfile_hash === 'string' && baseline.lockfile_hash.length === 64,
      'lockfile_hash must be a 64-char hex string'
    );
    assert.ok('init-test-pkg' in baseline.packages, 'baseline must contain init-test-pkg');
    assert.equal(baseline.packages['init-test-pkg'].version, '1.0.0');

    // stdout must mention baselined package count.
    assert.ok(
      result.stdout.includes('Baselined 1 packages'),
      `stdout must include "Baselined 1 packages"; got: ${result.stdout}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check no-changes test
// ---------------------------------------------------------------------------

test('check: no-changes — prints "No dependency changes", exit 0', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir);

    const result = spawnCli(['check'], tmpDir);

    assert.equal(result.exitCode, 0,
      `check no-changes should exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('No dependency changes'),
      `stdout must include "No dependency changes"; got: ${result.stdout}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check admit test — baseline advancement + ADR-002 git staging
// ---------------------------------------------------------------------------

test('check: admit — updates and stages baseline after new safe package is admitted (ADR-002)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a new safe package (no install scripts → admits under default policy).
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'new-safe-pkg', version: '2.0.0' },
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'new-safe-pkg', '2.0.0');

    const result = spawnCli(['check'], tmpDir);

    assert.equal(result.exitCode, 0,
      `check admit should exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('admitted'),
      `stdout must include "admitted"; got: ${result.stdout}`
    );

    // Baseline must be advanced — new-safe-pkg must be in it.
    const baseline = JSON.parse(
      await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8')
    );
    assert.ok(
      'new-safe-pkg' in baseline.packages,
      'new-safe-pkg must be in baseline after admission'
    );
    assert.equal(baseline.packages['new-safe-pkg'].version, '2.0.0');

    // ADR-002: baseline.json must be staged via `git add`.
    const staged = execSync('git diff --cached --name-only', { cwd: tmpDir, encoding: 'utf8' });
    assert.ok(
      staged.includes('.trustlock/baseline.json'),
      `baseline.json must be staged after admission; git diff --cached: ${staged}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check block test — D1 (all-or-nothing: partial block prevents all advancement)
// ---------------------------------------------------------------------------

test('check: block — blocked package prints reason and approval command, baseline NOT advanced (D1)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // Baseline: safe-pkg@1.0.0 only.
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Modify lockfile: change safe-pkg to 2.0.0 AND add scripted-pkg (blocked).
    // D1 test: safe-pkg would admit but the blocked scripted-pkg prevents all advancement.
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '2.0.0' },                               // changed — would admit
      { name: 'scripted-pkg', version: '1.0.0', hasInstallScripts: true },       // blocked by scripts rule
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'safe-pkg',     '2.0.0');
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'scripted-pkg', '1.0.0');

    const result = spawnCli(['check'], tmpDir);

    // Advisory mode: exit 0 even with a block.
    assert.equal(result.exitCode, 0,
      `advisory check must exit 0 even with a block; got ${result.exitCode}`);

    // Output must identify the blocked package and include a block reason.
    assert.ok(result.stdout.includes('blocked'),
      `stdout must include "blocked"; got: ${result.stdout}`);
    assert.ok(result.stdout.includes('scripted-pkg'),
      `stdout must name scripted-pkg; got: ${result.stdout}`);
    assert.ok(result.stdout.includes('install scripts'),
      `stdout must mention install scripts; got: ${result.stdout}`);

    // Output must include a generated approval command.
    assert.ok(
      result.stdout.includes('Run to approve:') || result.stdout.includes('trustlock approve'),
      `stdout must include an approval command hint; got: ${result.stdout}`
    );

    // D1: baseline NOT advanced — safe-pkg must still be at 1.0.0 (not 2.0.0).
    const baseline = JSON.parse(
      await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8')
    );
    assert.equal(
      baseline.packages['safe-pkg']?.version, '1.0.0',
      'D1: safe-pkg must remain at 1.0.0 because scripted-pkg blocked the whole batch'
    );
    assert.ok(
      !('scripted-pkg' in baseline.packages),
      'scripted-pkg must NOT appear in baseline after a block'
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: approve + re-check test
// ---------------------------------------------------------------------------

test('approve + re-check: admitted with approval after scripted-pkg is approved', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add scripted-pkg to lockfile.
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '1.0.0', hasInstallScripts: true },
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'scripted-pkg', '1.0.0');

    // First check → blocked (advisory exit 0).
    const blockResult = spawnCli(['check'], tmpDir);
    assert.equal(blockResult.exitCode, 0);
    assert.ok(blockResult.stdout.includes('blocked'));

    // Approve scripted-pkg with --as to bypass git config lookup.
    const approveResult = spawnCli([
      'approve', 'scripted-pkg@1.0.0',
      '--override', 'scripts',
      '--reason',   'integration test: approved for testing',
      '--as',       'Test User',
      '--expires',  '7d',
    ], tmpDir);
    assert.equal(approveResult.exitCode, 0,
      `approve should exit 0; got ${approveResult.exitCode}\nstderr: ${approveResult.stderr}`);
    assert.ok(
      approveResult.stdout.includes('Approval recorded'),
      `approve must print "Approved"; got: ${approveResult.stdout}`
    );

    // approvals.json must contain the new entry.
    const approvals = JSON.parse(
      await readFile(join(tmpDir, '.trustlock', 'approvals.json'), 'utf8')
    );
    assert.equal(approvals.length, 1, 'approvals.json must have 1 entry');
    assert.equal(approvals[0].package, 'scripted-pkg');
    assert.equal(approvals[0].version, '1.0.0');
    assert.deepEqual(approvals[0].overrides, ['scripts']);

    // Re-check → admitted with approval, commit would succeed.
    const reCheckResult = spawnCli(['check'], tmpDir);
    assert.equal(reCheckResult.exitCode, 0,
      `re-check should exit 0; got ${reCheckResult.exitCode}\nstderr: ${reCheckResult.stderr}`);
    assert.ok(
      reCheckResult.stdout.includes('admitted'),
      `re-check must output "admitted"; got: ${reCheckResult.stdout}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check --enforce block test — exit 1, baseline not written (D10)
// ---------------------------------------------------------------------------

test('check --enforce: exits 1 on block, baseline not written (D10)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '1.0.0', hasInstallScripts: true },
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'scripted-pkg', '1.0.0');

    const baselineBefore = await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8');

    const result = spawnCli(['check', '--enforce'], tmpDir);

    // --enforce + block → exit 1.
    assert.equal(result.exitCode, 1,
      `--enforce block must exit 1; got ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);

    // D10: baseline must not have changed.
    const baselineAfter = await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8');
    assert.equal(baselineAfter, baselineBefore,
      'D10: baseline must not be written under --enforce');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check --enforce pass test — exit 0, baseline NOT written (D10)
// ---------------------------------------------------------------------------

test('check --enforce: exits 0 on pass, baseline NOT written (D10)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a new safe package that would normally cause baseline advancement.
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'new-safe-pkg', version: '3.0.0' },
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'new-safe-pkg', '3.0.0');

    const result = spawnCli(['check', '--enforce'], tmpDir);

    // --enforce + all pass → exit 0.
    assert.equal(result.exitCode, 0,
      `--enforce pass must exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    // D10: --enforce never advances baseline, even on pass.
    const baseline = JSON.parse(
      await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8')
    );
    assert.ok(
      !('new-safe-pkg' in baseline.packages),
      'D10: --enforce must not add new-safe-pkg to baseline even on pass'
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: check --dry-run test — no baseline write even when all admitted
// ---------------------------------------------------------------------------

test('check --dry-run: no baseline write even when all packages are admitted', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir, {
      deps: [{ name: 'safe-pkg', version: '1.0.0' }],
    });

    // Add a new safe package.
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',    version: '1.0.0' },
      { name: 'dry-run-pkg', version: '4.0.0' },
    ]);
    await populateCache(join(tmpDir, '.trustlock', '.cache'), 'dry-run-pkg', '4.0.0');

    const baselineBefore = await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8');

    const result = spawnCli(['check', '--dry-run'], tmpDir);

    assert.equal(result.exitCode, 0,
      `--dry-run must exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    // Baseline file must be byte-for-byte identical.
    const baselineAfter = await readFile(join(tmpDir, '.trustlock', 'baseline.json'), 'utf8');
    assert.equal(baselineAfter, baselineBefore, '--dry-run must not write baseline');

    // dry-run-pkg must NOT appear in baseline.
    const baseline = JSON.parse(baselineAfter);
    assert.ok(
      !('dry-run-pkg' in baseline.packages),
      '--dry-run must not add dry-run-pkg to baseline'
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: clean-approvals test — removes expired entries, prints count
// ---------------------------------------------------------------------------

test('clean-approvals: removes expired entries and prints count', async () => {
  const tmpDir = await makeTmpDir();
  try {
    await setupInitializedProject(tmpDir);

    // Seed approvals.json with 1 expired + 1 active entry.
    const expiredAt = new Date(Date.now() - 1000).toISOString();          // 1 second ago
    const activeAt  = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +1 day
    const approvals = [
      {
        package:     'old-pkg',
        version:     '1.0.0',
        overrides:   ['scripts'],
        reason:      'this approval is expired',
        approver:    'Test User',
        approved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at:  expiredAt,
      },
      {
        package:     'active-pkg',
        version:     '2.0.0',
        overrides:   ['scripts'],
        reason:      'this approval is still active',
        approver:    'Test User',
        approved_at: new Date().toISOString(),
        expires_at:  activeAt,
      },
    ];
    await writeFile(
      join(tmpDir, '.trustlock', 'approvals.json'),
      JSON.stringify(approvals, null, 2),
      'utf8'
    );

    const result = spawnCli(['clean-approvals'], tmpDir);

    assert.equal(result.exitCode, 0,
      `clean-approvals should exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('Removed 1'),
      `stdout must include "Removed 1"; got: ${result.stdout}`
    );
    assert.ok(
      result.stdout.includes('1 active'),
      `stdout must include "1 active"; got: ${result.stdout}`
    );

    // approvals.json must have exactly the 1 active entry remaining.
    const remaining = JSON.parse(
      await readFile(join(tmpDir, '.trustlock', 'approvals.json'), 'utf8')
    );
    assert.equal(remaining.length, 1, 'exactly 1 approval must remain');
    assert.equal(remaining[0].package, 'active-pkg');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: install-hook test
// ---------------------------------------------------------------------------

test('install-hook: creates .git/hooks/pre-commit, makes it executable, adds trustlock check', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // install-hook only needs a git repository — no trustlock scaffold required.
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@trustlock.test"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });

    const result = spawnCli(['install-hook'], tmpDir);

    assert.equal(result.exitCode, 0,
      `install-hook should exit 0; got ${result.exitCode}\nstderr: ${result.stderr}`);

    const hookPath = join(tmpDir, '.git', 'hooks', 'pre-commit');

    // File must exist.
    let hookStat;
    try {
      hookStat = await stat(hookPath);
    } catch {
      assert.fail(`.git/hooks/pre-commit must exist after install-hook\nstdout: ${result.stdout}`);
    }
    assert.ok(hookStat.isFile(), '.git/hooks/pre-commit must be a regular file');

    // File must be executable (X_OK check via fs.access).
    try {
      await access(hookPath, constants.X_OK);
    } catch {
      assert.fail('.git/hooks/pre-commit must be executable');
    }

    // File must contain the trustlock check line.
    const hookContent = await readFile(hookPath, 'utf8');
    assert.ok(
      hookContent.includes('trustlock check'),
      `pre-commit hook must contain "trustlock check"; got:\n${hookContent}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC: full pipeline test
// init → check (no-changes) → modify lockfile → check (block) → approve → check (admitted)
// ---------------------------------------------------------------------------

test('full pipeline: init → check (no-changes) → modify lockfile → check (block) → approve → check (admitted with approval)', async () => {
  const tmpDir = await makeTmpDir();
  try {
    // ── Step 1: bootstrap git repo + project files ────────────────────────
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@trustlock.test"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config commit.gpgSign false', { cwd: tmpDir, stdio: 'ignore' });

    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: { 'safe-pkg': '^1.0.0' } }, null, 2),
      'utf8'
    );
    const initialLockfileContent = await writeLockfile(tmpDir, [{ name: 'safe-pkg', version: '1.0.0' }]);

    // ── Step 2: trustlock init --no-baseline (no registry calls) ──────────
    const initResult = spawnCli(['init', '--no-baseline'], tmpDir);
    assert.equal(initResult.exitCode, 0,
      `init --no-baseline should exit 0\nstderr: ${initResult.stderr}`);

    // Verify scaffold was created.
    const trustlockDir = join(tmpDir, '.trustlock');
    await stat(join(trustlockDir, 'approvals.json'));
    await stat(join(trustlockDir, '.cache'));
    await stat(join(trustlockDir, '.gitignore'));
    await stat(join(tmpDir, '.trustlockrc.json'));

    // ── Step 3: manually create baseline (--no-baseline skipped it) ───────
    const lockfileHash = sha256hex(initialLockfileContent);
    const now          = new Date().toISOString();
    const initialBaseline = {
      schema_version: 1,
      created_at:     now,
      lockfile_hash:  lockfileHash,
      packages: {
        'safe-pkg': {
          name: 'safe-pkg', version: '1.0.0', admittedAt: now,
          provenanceStatus: 'unknown', hasInstallScripts: false, sourceType: 'registry',
        },
      },
    };
    await writeFile(
      join(trustlockDir, 'baseline.json'),
      JSON.stringify(initialBaseline, null, 2) + '\n',
      'utf8'
    );

    // Pre-populate cache for safe-pkg.
    await populateCache(join(trustlockDir, '.cache'), 'safe-pkg', '1.0.0');

    // Commit the initialized state.
    execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git commit -m "trustlock init"', { cwd: tmpDir, stdio: 'ignore' });

    // ── Step 4: check on unchanged lockfile → "No dependency changes" ─────
    const noChangesResult = spawnCli(['check'], tmpDir);
    assert.equal(noChangesResult.exitCode, 0);
    assert.ok(
      noChangesResult.stdout.includes('No dependency changes'),
      `check on unchanged lockfile must print "No dependency changes"\nstdout: ${noChangesResult.stdout}`
    );

    // ── Step 5: modify lockfile — add scripted-pkg@1.0.0 (install scripts) ─
    await writeLockfile(tmpDir, [
      { name: 'safe-pkg',     version: '1.0.0' },
      { name: 'scripted-pkg', version: '1.0.0', hasInstallScripts: true },
    ]);
    await populateCache(join(trustlockDir, '.cache'), 'scripted-pkg', '1.0.0');

    // ── Step 6: check → blocked by scripts rule ───────────────────────────
    const blockResult = spawnCli(['check'], tmpDir);
    assert.equal(blockResult.exitCode, 0, 'advisory check with block must exit 0');
    assert.ok(blockResult.stdout.includes('blocked'),
      `check must output "blocked"\nstdout: ${blockResult.stdout}`);
    assert.ok(blockResult.stdout.includes('scripted-pkg'),
      `check output must name scripted-pkg\nstdout: ${blockResult.stdout}`);

    // D1: baseline not advanced — scripted-pkg absent.
    const baselineAfterBlock = JSON.parse(
      await readFile(join(trustlockDir, 'baseline.json'), 'utf8')
    );
    assert.ok(
      !('scripted-pkg' in baselineAfterBlock.packages),
      'D1: scripted-pkg must NOT be in baseline after block'
    );

    // ── Step 7: approve scripted-pkg ─────────────────────────────────────
    const approveResult = spawnCli([
      'approve', 'scripted-pkg@1.0.0',
      '--override', 'scripts',
      '--reason',   'full pipeline integration test',
      '--as',       'Test User',
    ], tmpDir);
    assert.equal(approveResult.exitCode, 0,
      `approve should exit 0\nstderr: ${approveResult.stderr}`);
    assert.ok(
      approveResult.stdout.includes('Approval recorded'),
      `approve must print "Approved"\nstdout: ${approveResult.stdout}`
    );

    // ── Step 8: re-check → admitted with approval, baseline advances ──────
    const admitResult = spawnCli(['check'], tmpDir);
    assert.equal(admitResult.exitCode, 0,
      `re-check must exit 0\nstderr: ${admitResult.stderr}`);
    assert.ok(
      admitResult.stdout.includes('admitted'),
      `re-check must output "admitted"\nstdout: ${admitResult.stdout}`
    );

    // Baseline must now include scripted-pkg (approval covered the block → D1 fully admitted).
    const baselineAfterAdmit = JSON.parse(
      await readFile(join(trustlockDir, 'baseline.json'), 'utf8')
    );
    assert.ok(
      'scripted-pkg' in baselineAfterAdmit.packages,
      'scripted-pkg must be in baseline after admitted_with_approval'
    );
    assert.equal(baselineAfterAdmit.packages['scripted-pkg'].version, '1.0.0');

    // ADR-002: baseline.json must be staged after successful admission.
    const staged = execSync('git diff --cached --name-only', { cwd: tmpDir, encoding: 'utf8' });
    assert.ok(
      staged.includes('.trustlock/baseline.json'),
      `baseline.json must be staged after full admission\ngit diff --cached: ${staged}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
