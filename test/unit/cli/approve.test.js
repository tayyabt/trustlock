/**
 * Unit tests for `dep-fence approve` command.
 *
 * Each test creates a temporary directory with real fixture files and passes
 * `_cwd` to isolate from the real project state.
 *
 * Coverage:
 *   AC1  - happy path: writes valid approval entry to approvals.json
 *   AC2  - approval entry has all required fields with correct shape
 *   AC3  - --as <name> overrides approvedBy
 *   AC4  - package not in lockfile → exit 2 + specific error message
 *   AC5  - invalid --override value → exit 2 + error listing valid rule names
 *   AC6  - --expires exceeding max_expiry_days → exit 2 + error with configured max
 *   AC7  - missing --reason when require_reason:true → exit 2
 *   AC8  - append to existing approvals (not overwrite)
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../../src/cli/commands/approve.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir;
let stdoutLines;
let stderrLines;
let origStdoutWrite;
let origStderrWrite;

/**
 * Create a fresh temp directory for each test.
 */
async function setupTempDir() {
  const dir = join(tmpdir(), `dep-fence-approve-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Build a minimal package-lock.json (v3) with the given packages.
 * @param {{ [name: string]: string }} packages  name → version map
 * @returns {string} JSON string
 */
function makeLockfile(packages) {
  const lockPkgs = {
    '': {
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(Object.entries(packages).map(([n, v]) => [n, v])),
    },
  };
  for (const [name, version] of Object.entries(packages)) {
    lockPkgs[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-${name}-${version}`,
      hasInstallScripts: false,
    };
  }
  return JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: lockPkgs,
  });
}

/**
 * Write a minimal project setup into `dir`.
 *
 * @param {string} dir
 * @param {object} [opts]
 * @param {{ [name: string]: string }} [opts.packages]  Packages in lockfile
 * @param {object}  [opts.config]    Content of .depfencerc.json
 * @param {object[]} [opts.approvals] Initial approvals.json content
 */
async function writeProjectFixtures(dir, {
  packages = { axios: '1.14.1' },
  config = {},
  approvals = [],
} = {}) {
  // .depfencerc.json — minimal valid config with approval fields
  const fullConfig = {
    cooldown_hours: 72,
    require_reason: true,
    max_expiry_days: 30,
    ...config,
  };
  await writeFile(join(dir, '.depfencerc.json'), JSON.stringify(fullConfig));

  // package.json
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(Object.entries(packages).map(([n, v]) => [n, v])),
    })
  );

  // package-lock.json
  await writeFile(join(dir, 'package-lock.json'), makeLockfile(packages));

  // .dep-fence/approvals.json
  await mkdir(join(dir, '.dep-fence'), { recursive: true });
  await writeFile(join(dir, '.dep-fence', 'approvals.json'), JSON.stringify(approvals));
}

/**
 * Build a minimal parsed-args object matching what args.js produces.
 *
 * @param {object} [opts]
 * @param {string}   [opts.pkg]       "<name>@<ver>" positional (after "approve")
 * @param {string[]} [opts.override]  Override rule names (array)
 * @param {string}   [opts.reason]    --reason value
 * @param {string}   [opts.expires]   --expires value
 * @param {string}   [opts.as]        --as value
 * @returns {{ values: object, positionals: string[] }}
 */
function makeArgs({ pkg = 'axios@1.14.1', override = ['cooldown'], reason, expires, as: asName } = {}) {
  const values = {
    enforce: false,
    json: false,
    'dry-run': false,
    'no-cache': false,
    'no-baseline': false,
    strict: false,
    force: false,
    override: override ?? [],
  };
  if (reason !== undefined) values.reason = reason;
  if (expires !== undefined) values.expires = expires;
  if (asName !== undefined) values.as = asName;

  return {
    values,
    positionals: ['approve', ...(pkg ? [pkg] : [])],
  };
}

/**
 * Intercept process.stdout.write and process.stderr.write for a single test.
 * Must be called once per test; cleanup is handled in afterEach.
 */
function captureOutput() {
  stdoutLines = [];
  stderrLines = [];
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...rest) => {
    stdoutLines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  process.stderr.write = (chunk, ...rest) => {
    stderrLines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
}

function restoreOutput() {
  if (origStdoutWrite) process.stdout.write = origStdoutWrite;
  if (origStderrWrite) process.stderr.write = origStderrWrite;
  origStdoutWrite = null;
  origStderrWrite = null;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = await setupTempDir();
  captureOutput();
  process.exitCode = 0;
});

afterEach(async () => {
  restoreOutput();
  process.exitCode = 0;
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
    testDir = null;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('AC1: happy path writes valid approval entry to approvals.json', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ reason: 'ok', as: 'Test User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  assert.equal(stderrLines.length, 0);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 1);
  assert.equal(written[0].package, 'axios');
  assert.equal(written[0].version, '1.14.1');
});

test('AC2: approval entry has all required fields with correct shape', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ reason: 'shape test', as: 'Shape Tester', expires: '7d' });

  const before = new Date();
  await run(args, { _cwd: testDir });
  const after = new Date();

  assert.equal(process.exitCode, 0);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  const entry = written[0];

  // Required fields
  assert.equal(entry.package, 'axios');
  assert.equal(entry.version, '1.14.1');
  assert.deepEqual(entry.overrides, ['cooldown']);
  assert.equal(entry.reason, 'shape test');
  assert.equal(entry.approver, 'Shape Tester');

  // approved_at must be a valid ISO timestamp within test bounds
  const approvedAt = new Date(entry.approved_at);
  assert.ok(approvedAt >= before, 'approved_at should be at or after test start');
  assert.ok(approvedAt <= after, 'approved_at should be at or before test end');

  // expires_at must be roughly 7 days after approved_at
  const expiresAt = new Date(entry.expires_at);
  const diffDays = (expiresAt - approvedAt) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 6.9 && diffDays <= 7.1, `expires_at should be ~7d later, got ${diffDays}d`);
});

test('AC3: --as <name> overrides approvedBy', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ reason: 'as flag test', as: 'Override User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.equal(written[0].approver, 'Override User');
});

test('AC4: package not in lockfile exits with exit 2 and specific error message', async () => {
  await writeProjectFixtures(testDir, { packages: { lodash: '4.17.21' } });
  const args = makeArgs({ pkg: 'notreal@0.0.1', reason: 'test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('notreal@0.0.1 not found in lockfile'), `Expected lockfile error, got: ${errOut}`);
});

test('AC5: invalid --override value exits with exit 2 and lists valid rule names', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ override: ['notarule'], reason: 'test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('notarule'), `Expected invalid rule name in error, got: ${errOut}`);
  assert.ok(errOut.includes('is not a valid rule name'), `Expected rule name error message, got: ${errOut}`);
  assert.ok(errOut.includes('Valid rules:'), `Expected valid rules list in error, got: ${errOut}`);
  // Valid rules should include actual rule names from models.js
  assert.ok(errOut.includes('cooldown'), `Expected 'cooldown' in valid rules list, got: ${errOut}`);
});

test('AC6: --expires exceeding max_expiry_days exits with exit 2 and shows configured max', async () => {
  await writeProjectFixtures(testDir, { config: { max_expiry_days: 30 } });
  const args = makeArgs({ expires: '365d', reason: 'test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('Maximum expiry is 30 days'), `Expected max expiry error, got: ${errOut}`);
  assert.ok(errOut.includes('.depfencerc.json'), `Expected config file reference, got: ${errOut}`);
});

test('AC7: missing --reason when require_reason:true exits with exit 2', async () => {
  await writeProjectFixtures(testDir, { config: { require_reason: true } });
  // No reason provided
  const args = makeArgs({ reason: undefined, as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('--reason is required'), `Expected reason required error, got: ${errOut}`);
  assert.ok(errOut.includes('require_reason: false'), `Expected hint about disabling, got: ${errOut}`);
});

test('AC7b: --reason is optional when require_reason:false', async () => {
  await writeProjectFixtures(testDir, { config: { require_reason: false } });
  const args = makeArgs({ reason: undefined, as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 1);
});

test('AC8: appends to existing approvals (does not overwrite)', async () => {
  const existingApproval = {
    package: 'lodash',
    version: '4.17.21',
    overrides: ['cooldown'],
    reason: 'pre-existing',
    approver: 'Existing User',
    approved_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  await writeProjectFixtures(testDir, {
    packages: { axios: '1.14.1', lodash: '4.17.21' },
    approvals: [existingApproval],
  });

  const args = makeArgs({ reason: 'new approval', as: 'New User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 2, 'Should have 2 entries (pre-existing + new)');
  assert.equal(written[0].package, 'lodash', 'First entry should be the pre-existing one');
  assert.equal(written[1].package, 'axios', 'Second entry should be the new approval');
});

test('confirmation output format is correct', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ reason: 'output test', as: 'Test User', expires: '7d' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  // Format: "Approved <pkg>@<ver> (overrides: <rules>). Expires: <ISO>Z"
  assert.ok(out.startsWith('Approved axios@1.14.1 (overrides: cooldown). Expires:'), `Unexpected output: ${out}`);
  // expires_at ends with Z (ISO UTC)
  assert.ok(out.trim().endsWith('Z'), `Expected output to end with Z, got: ${out}`);
});

test('--override supports comma-separated values', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ override: ['cooldown,provenance'], reason: 'multi override', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.deepEqual(written[0].overrides, ['cooldown', 'provenance']);
});

test('missing --override flag exits with exit 2', async () => {
  await writeProjectFixtures(testDir);
  const args = makeArgs({ override: [], reason: 'test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('--override is required'), `Expected override required error, got: ${errOut}`);
});

test('missing config file exits with exit 2', async () => {
  // Write project without .depfencerc.json
  await mkdir(testDir, { recursive: true });
  await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  await writeFile(join(testDir, 'package-lock.json'), makeLockfile({ axios: '1.14.1' }));
  await mkdir(join(testDir, '.dep-fence'), { recursive: true });
  await writeFile(join(testDir, '.dep-fence', 'approvals.json'), JSON.stringify([]));
  // No .depfencerc.json

  const args = makeArgs({ reason: 'test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(errOut.includes('.depfencerc.json'), `Expected config missing error, got: ${errOut}`);
});

test('scoped package spec is parsed correctly', async () => {
  await writeProjectFixtures(testDir, { packages: { '@scope/mypkg': '2.0.0' } });
  const args = makeArgs({ pkg: '@scope/mypkg@2.0.0', reason: 'scoped test', as: 'User' });

  await run(args, { _cwd: testDir });

  assert.equal(process.exitCode, 0, `Unexpected error: ${stderrLines.join('')}`);

  const written = JSON.parse(await readFile(join(testDir, '.dep-fence', 'approvals.json'), 'utf8'));
  assert.equal(written[0].package, '@scope/mypkg');
  assert.equal(written[0].version, '2.0.0');
});
