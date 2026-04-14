/**
 * Unit tests for `trustlock init` command.
 *
 * Each test creates a temporary directory, writes minimal fixtures, and passes
 * `_cwd` + `_registryClient` injection to isolate from real project state and network.
 *
 * Coverage:
 *   AC1  - creates .trustlockrc.json with valid default policy
 *   AC2  - creates .trustlock/ scaffold: approvals.json ([]), .cache/, .gitignore
 *   AC3  - creates baseline.json with all packages trusted
 *   AC4  - prints "Baselined N packages. Detected npm lockfile vX."
 *   AC5  - already initialized (.trustlock/ exists) → exit 2, D6 message
 *   AC6  - no lockfile → exit 2 + message
 *   AC7  - unknown lockfile version → exit 2 (Q1)
 *   AC8  - --strict creates stricter .trustlockrc.json
 *   AC9  - --no-baseline creates scaffold but not baseline.json
 *   AC10 - registry unreachable → baseline with null provenance + warning
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../../src/cli/commands/init.js';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let testDir;
let stdoutChunks;
let stderrChunks;
let origStdoutWrite;
let origStderrWrite;

beforeEach(async () => {
  testDir = join(tmpdir(), `trustlock-init-test-${process.pid}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  // Create fake .git/ so resolvePaths() succeeds (testDir acts as both projectRoot and gitRoot)
  await mkdir(join(testDir, '.git'), { recursive: true });

  stdoutChunks = [];
  stderrChunks = [];

  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk, ...rest) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origStdoutWrite(chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origStderrWrite(chunk, ...rest);
  };

  // Reset exit code before each test
  process.exitCode = undefined;
});

afterEach(async () => {
  process.stdout.write = origStdoutWrite;
  process.stderr.write = origStderrWrite;
  process.exitCode = undefined;
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal v3 package-lock.json with the given packages.
 *
 * @param {{ [name: string]: string }} pkgs  name → version
 * @returns {string} JSON string
 */
function makeLockfileV3(pkgs = {}) {
  const lockPkgs = {
    '': {
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(Object.entries(pkgs).map(([n, v]) => [n, v])),
    },
  };
  for (const [name, version] of Object.entries(pkgs)) {
    lockPkgs[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-fake-${name}`,
      hasInstallScripts: false,
    };
  }
  return JSON.stringify(
    { name: 'test-project', version: '1.0.0', lockfileVersion: 3, requires: true, packages: lockPkgs },
    null,
    2
  );
}

/**
 * Write a minimal project directory (lockfile + package.json) to `dir`.
 *
 * @param {string} dir
 * @param {{ [name: string]: string }} [pkgs]  Packages to include in lockfile
 * @param {number} [lockfileVersion]  Override lockfileVersion field
 */
async function writeProjectFiles(dir, pkgs = { lodash: '4.17.21' }, lockfileVersion) {
  const lockContent =
    lockfileVersion !== undefined
      ? JSON.stringify({ name: 'test-project', version: '1.0.0', lockfileVersion })
      : makeLockfileV3(pkgs);

  await writeFile(join(dir, 'package-lock.json'), lockContent, 'utf8');
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(Object.entries(pkgs).map(([n, v]) => [n, `^${v}`])),
    }),
    'utf8'
  );
}

/**
 * Build a minimal args object for the init command.
 *
 * @param {{ strict?: boolean, noBaseline?: boolean }} [opts]
 */
function makeArgs({ strict = false, noBaseline = false } = {}) {
  return {
    values: {
      enforce: false,
      json: false,
      'dry-run': false,
      'no-cache': false,
      'no-baseline': noBaseline,
      strict,
      force: false,
      override: [],
    },
    positionals: ['init'],
  };
}

/**
 * Create a mock registry client where getAttestations resolves to a fixed result.
 *
 * @param {{ data?: object|null, warnings?: string[] }} result
 */
function mockRegistry({ data = null, warnings = [] } = {}) {
  return {
    getAttestations: async () => ({ data, warnings }),
    fetchPackageMetadata: async () => ({ data: null, warnings: [] }),
    getVersionMetadata: async () => ({ data: null, warnings: [] }),
  };
}

// ---------------------------------------------------------------------------
// AC1: creates .trustlockrc.json with valid default policy
// ---------------------------------------------------------------------------

test('creates .trustlockrc.json with default policy', async () => {
  await writeProjectFiles(testDir);

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, undefined, 'should not set exit code on success');

  const raw = await readFile(join(testDir, '.trustlockrc.json'), 'utf8');
  const policy = JSON.parse(raw);

  assert.equal(policy.cooldown_hours, 72);
  assert.deepEqual(policy.pinning, { required: false });
  assert.deepEqual(policy.scripts, { allowlist: [] });
  assert.deepEqual(policy.sources, { allowed: ['registry'] });
  assert.deepEqual(policy.provenance, { required_for: [] });
  assert.deepEqual(policy.transitive, { max_new: 5 });
});

// ---------------------------------------------------------------------------
// AC2: creates .trustlock/ scaffold
// ---------------------------------------------------------------------------

test('creates .trustlock/ scaffold with approvals.json, .cache/, and .gitignore', async () => {
  await writeProjectFiles(testDir);

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  const trustlockDir = join(testDir, '.trustlock');

  // approvals.json must exist and equal []
  const approvalsRaw = await readFile(join(trustlockDir, 'approvals.json'), 'utf8');
  assert.deepEqual(JSON.parse(approvalsRaw), []);

  // .cache/ directory must exist
  const cacheStats = await stat(join(trustlockDir, '.cache'));
  assert.ok(cacheStats.isDirectory(), '.cache must be a directory');

  // .gitignore must exist and gitignore .cache/ (D8)
  const gitignoreContent = await readFile(join(trustlockDir, '.gitignore'), 'utf8');
  assert.ok(gitignoreContent.includes('.cache/'), '.gitignore must include .cache/');
});

// ---------------------------------------------------------------------------
// AC3: creates baseline.json with all packages trusted
// ---------------------------------------------------------------------------

test('creates baseline.json with all current packages', async () => {
  const pkgs = { lodash: '4.17.21', express: '4.18.2' };
  await writeProjectFiles(testDir, pkgs);

  await run(makeArgs(), { _registryClient: mockRegistry({ data: null, warnings: [] }), _cwd: testDir });

  const raw = await readFile(join(testDir, '.trustlock', 'baseline.json'), 'utf8');
  const baseline = JSON.parse(raw);

  assert.equal(baseline.schema_version, 1);
  assert.ok(typeof baseline.created_at === 'string');
  assert.ok(typeof baseline.lockfile_hash === 'string' && baseline.lockfile_hash.length === 64);
  assert.ok('lodash' in baseline.packages, 'baseline must include lodash');
  assert.ok('express' in baseline.packages, 'baseline must include express');
  assert.equal(baseline.packages['lodash'].version, '4.17.21');
  assert.equal(baseline.packages['express'].version, '4.18.2');
});

// ---------------------------------------------------------------------------
// AC4: prints summary with correct package count and lockfile version
// ---------------------------------------------------------------------------

test('prints summary with correct package count and lockfile version', async () => {
  const pkgs = { lodash: '4.17.21', chalk: '5.3.0' };
  await writeProjectFiles(testDir, pkgs);

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  const stdout = stdoutChunks.join('');
  assert.ok(stdout.includes('Baselined 2 packages'), `stdout must include "Baselined 2 packages", got: ${stdout}`);
  assert.ok(stdout.includes('npm lockfile v3'), `stdout must include "npm lockfile v3", got: ${stdout}`);
  assert.ok(stdout.includes("install-hook"), `stdout must include install-hook hint, got: ${stdout}`);
});

// ---------------------------------------------------------------------------
// AC5: already initialized → exit 2 + D6 message
// ---------------------------------------------------------------------------

test('exits 2 with "already initialized" message when .trustlock/ exists (D6)', async () => {
  await writeProjectFiles(testDir);
  // Pre-create .trustlock/
  await mkdir(join(testDir, '.trustlock'), { recursive: true });

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const stderr = stderrChunks.join('');
  assert.ok(
    stderr.includes('already initialized'),
    `stderr must include "already initialized", got: ${stderr}`
  );
});

// AC5: no files should be written when .trustlock/ exists
test('does not write .trustlockrc.json when .trustlock/ already exists', async () => {
  await writeProjectFiles(testDir);
  await mkdir(join(testDir, '.trustlock'), { recursive: true });

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, 2);
  // .trustlockrc.json should not have been created
  try {
    await stat(join(testDir, '.trustlockrc.json'));
    assert.fail('.trustlockrc.json should not exist');
  } catch (err) {
    assert.equal(err.code, 'ENOENT', 'expected ENOENT for .trustlockrc.json');
  }
});

// ---------------------------------------------------------------------------
// AC6: no lockfile → exit 2
// ---------------------------------------------------------------------------

test('exits 2 with "No lockfile found" when package-lock.json is absent', async () => {
  // Only package.json, no lockfile
  await writeFile(
    join(testDir, 'package.json'),
    JSON.stringify({ name: 'test', version: '1.0.0' }),
    'utf8'
  );

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const stderr = stderrChunks.join('');
  assert.ok(
    stderr.includes('No lockfile found'),
    `stderr must include "No lockfile found", got: ${stderr}`
  );
});

// ---------------------------------------------------------------------------
// AC7: unknown lockfile version → exit 2 (Q1)
// ---------------------------------------------------------------------------

test('exits 2 on unknown lockfile version (Q1)', async () => {
  // Write a lockfile with version 4 (unsupported)
  await writeProjectFiles(testDir, {}, 4);

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const stderr = stderrChunks.join('');
  assert.ok(
    stderr.includes('Unsupported npm lockfile version'),
    `stderr must include "Unsupported npm lockfile version", got: ${stderr}`
  );
});

test('exits 2 when lockfileVersion field is missing', async () => {
  await writeFile(
    join(testDir, 'package-lock.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0', packages: {} }),
    'utf8'
  );
  await writeFile(
    join(testDir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }),
    'utf8'
  );

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const stderr = stderrChunks.join('');
  assert.ok(
    stderr.includes('Unsupported npm lockfile version'),
    `stderr must include "Unsupported npm lockfile version", got: ${stderr}`
  );
});

// ---------------------------------------------------------------------------
// AC8: --strict creates stricter .trustlockrc.json
// ---------------------------------------------------------------------------

test('--strict creates .trustlockrc.json with stricter policy thresholds', async () => {
  await writeProjectFiles(testDir);

  await run(makeArgs({ strict: true }), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, undefined, 'should not set exit code on success');

  const raw = await readFile(join(testDir, '.trustlockrc.json'), 'utf8');
  const policy = JSON.parse(raw);

  // Stricter cooldown
  assert.ok(policy.cooldown_hours < 72, `strict cooldown_hours (${policy.cooldown_hours}) must be less than default 72`);
  // Pinning required
  assert.equal(policy.pinning.required, true);
  // Provenance required for all (or more than default empty)
  assert.ok(
    policy.provenance.required_for.length > 0,
    'strict provenance.required_for must be non-empty'
  );
  // Stricter transitive max
  assert.ok(policy.transitive.max_new < 5, `strict transitive.max_new (${policy.transitive.max_new}) must be less than default 5`);
});

// ---------------------------------------------------------------------------
// AC9: --no-baseline creates scaffold but not baseline.json
// ---------------------------------------------------------------------------

test('--no-baseline creates scaffold and config but not baseline.json', async () => {
  await writeProjectFiles(testDir);

  await run(makeArgs({ noBaseline: true }), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, undefined, 'should not set exit code');

  // .trustlockrc.json must exist
  const policy = JSON.parse(await readFile(join(testDir, '.trustlockrc.json'), 'utf8'));
  assert.equal(policy.cooldown_hours, 72);

  // scaffold must exist
  const approvalsRaw = await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8');
  assert.deepEqual(JSON.parse(approvalsRaw), []);

  // baseline.json must NOT exist
  try {
    await stat(join(testDir, '.trustlock', 'baseline.json'));
    assert.fail('baseline.json should not exist with --no-baseline');
  } catch (err) {
    assert.equal(err.code, 'ENOENT', 'expected ENOENT for baseline.json');
  }

  // Message must mention skipped baseline
  const stdout = stdoutChunks.join('');
  assert.ok(
    stdout.includes('Skipped baseline creation'),
    `stdout must include "Skipped baseline creation", got: ${stdout}`
  );
});

// --no-baseline with unknown lockfile version should still succeed (no parsing)
test('--no-baseline does not validate lockfile version', async () => {
  await writeProjectFiles(testDir, {}, 4); // version 4 = unknown

  await run(makeArgs({ noBaseline: true }), { _registryClient: mockRegistry(), _cwd: testDir });

  // Should NOT exit 2 (no version check when --no-baseline)
  assert.equal(process.exitCode, undefined);

  // Scaffold must exist
  const approvalsRaw = await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8');
  assert.deepEqual(JSON.parse(approvalsRaw), []);
});

// ---------------------------------------------------------------------------
// AC10: registry unreachable → null provenance + warning per package
// ---------------------------------------------------------------------------

test('registry unreachable sets provenanceStatus to null and prints warning per package', async () => {
  const pkgs = { lodash: '4.17.21', chalk: '5.3.0' };
  await writeProjectFiles(testDir, pkgs);

  const unreachableRegistry = mockRegistry({
    data: null,
    warnings: ['skipped: registry unreachable'],
  });

  await run(makeArgs(), { _registryClient: unreachableRegistry, _cwd: testDir });

  assert.equal(process.exitCode, undefined, 'should not exit 2 on registry unreachable');

  // baseline.json must exist
  const raw = await readFile(join(testDir, '.trustlock', 'baseline.json'), 'utf8');
  const baseline = JSON.parse(raw);

  assert.ok('lodash' in baseline.packages);
  assert.ok('chalk' in baseline.packages);
  assert.equal(baseline.packages['lodash'].provenanceStatus, null);
  assert.equal(baseline.packages['chalk'].provenanceStatus, null);

  // stderr must include warnings for each package
  const stderr = stderrChunks.join('');
  assert.ok(
    stderr.includes('registry unreachable'),
    `stderr must include "registry unreachable", got: ${stderr}`
  );
});

// ---------------------------------------------------------------------------
// Provenance: verified and unverified paths
// ---------------------------------------------------------------------------

test('package with SLSA attestations gets provenanceStatus verified', async () => {
  await writeProjectFiles(testDir, { lodash: '4.17.21' });

  const verifiedRegistry = mockRegistry({ data: { attestations: [] }, warnings: [] });

  await run(makeArgs(), { _registryClient: verifiedRegistry, _cwd: testDir });

  const raw = await readFile(join(testDir, '.trustlock', 'baseline.json'), 'utf8');
  const baseline = JSON.parse(raw);
  assert.equal(baseline.packages['lodash'].provenanceStatus, 'verified');
});

test('package with no attestations (404) gets provenanceStatus unverified', async () => {
  await writeProjectFiles(testDir, { lodash: '4.17.21' });

  const noAttestationRegistry = mockRegistry({ data: null, warnings: [] });

  await run(makeArgs(), { _registryClient: noAttestationRegistry, _cwd: testDir });

  const raw = await readFile(join(testDir, '.trustlock', 'baseline.json'), 'utf8');
  const baseline = JSON.parse(raw);
  assert.equal(baseline.packages['lodash'].provenanceStatus, 'unverified');
});

// ---------------------------------------------------------------------------
// Edge case: empty lockfile (0 dependencies)
// ---------------------------------------------------------------------------

test('empty lockfile (0 dependencies) baselines 0 packages', async () => {
  await writeProjectFiles(testDir, {}); // no packages

  await run(makeArgs(), { _registryClient: mockRegistry(), _cwd: testDir });

  assert.equal(process.exitCode, undefined);

  const raw = await readFile(join(testDir, '.trustlock', 'baseline.json'), 'utf8');
  const baseline = JSON.parse(raw);
  assert.deepEqual(baseline.packages, {});

  const stdout = stdoutChunks.join('');
  assert.ok(stdout.includes('Baselined 0 packages'), `stdout must include "Baselined 0 packages", got: ${stdout}`);
});
