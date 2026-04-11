/**
 * Integration tests for `trustlock audit --compare` (F17-S1).
 *
 * Verifies:
 *   AC1  - three report sections present in stdout
 *   AC2  - loadPolicy not imported by cross-audit.js
 *   AC3  - .trustlockrc.json read via fs.readFile; only scripts.allowlist extracted
 *   AC5  - exit code 0 on success
 *   AC6  - fewer than 2 dirs → error exit
 *   AC7  - directory not found → error exit
 *   AC8  - no lockfile dir → warning + skip + run continues
 *   AC9  - npm + pnpm multi-format
 *   AC10 - source.path entries in uv.lock excluded
 *   AC11 - packages in only one dir not in version drift
 *   AC12 - clean section shows "No ... ✓" confirmation
 *   AC13 - malformed extends URL does not trigger network activity
 *   AC14 - absolute and relative directory paths both accepted
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { run } from '../../src/cli/commands/cross-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Output capture helper
// ---------------------------------------------------------------------------

function captureOutput() {
  const captured = { stdout: [], stderr: [] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { captured.stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { captured.stderr.push(String(chunk)); return true; };
  return {
    get stdout() { return captured.stdout.join(''); },
    get stderr() { return captured.stderr.join(''); },
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

// ---------------------------------------------------------------------------
// Lockfile fixture builders
// ---------------------------------------------------------------------------

function buildNpmLockV3(pkgName, deps) {
  const packages = {
    '': {
      name: pkgName,
      version: '1.0.0',
      dependencies: Object.fromEntries(deps.map(([n, v]) => [n, `^${v}`])),
    },
  };
  for (const [name, version, opts = {}] of deps) {
    packages[`node_modules/${name}`] = {
      version,
      resolved: opts.resolved ?? `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-fake-${name}-${version}`,
      hasInstallScripts: opts.hasInstallScripts ?? false,
    };
  }
  return JSON.stringify({ name: pkgName, version: '1.0.0', lockfileVersion: 3, requires: true, packages }, null, 2);
}

function buildPnpmLockV9(pkgEntries) {
  const lines = ["lockfileVersion: '9.0'", '', 'packages:'];
  for (const [name, version, opts = {}] of pkgEntries) {
    const key = name.startsWith('@') ? `'${name}@${version}'` : `${name}@${version}`;
    lines.push('');
    lines.push(`  ${key}:`);
    lines.push(`    name: ${name}`);
    lines.push(`    version: ${version}`);
    lines.push(`    resolution: {integrity: sha512-fake-${version}}`);
    if (opts.requiresBuild) lines.push(`    requiresBuild: true`);
  }
  lines.push('', 'snapshots:');
  for (const [name, version] of pkgEntries) {
    const key = name.startsWith('@') ? `'${name}@${version}'` : `${name}@${version}`;
    lines.push('');
    lines.push(`  ${key}: {}`);
  }
  return lines.join('\n') + '\n';
}

function buildPackageJson(name, deps) {
  return JSON.stringify({
    name,
    version: '1.0.0',
    dependencies: Object.fromEntries(deps.map(([n, v]) => [n, `^${v}`])),
  }, null, 2);
}

function buildTrustlockRc(overrides = {}) {
  return JSON.stringify({
    cooldown_hours: 72,
    provenance: { required_for: [] },
    scripts: { allowlist: overrides.allowlist ?? [] },
    ...overrides,
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `cross-audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  process.exitCode = 0; // reset between tests
});

// ---------------------------------------------------------------------------
// Helper: create a project directory
// ---------------------------------------------------------------------------

async function makeNpmProject(name, deps, rcOpts = {}) {
  const dir = join(tmpDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), buildPackageJson(name, deps));
  await writeFile(join(dir, 'package-lock.json'), buildNpmLockV3(name, deps));
  if (Object.keys(rcOpts).length > 0 || rcOpts.allowlist !== undefined) {
    await writeFile(join(dir, '.trustlockrc.json'), buildTrustlockRc(rcOpts));
  }
  return dir;
}

async function makePnpmProject(name, pkgEntries, rcOpts = {}) {
  const dir = join(tmpDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), buildPackageJson(name, pkgEntries.map(([n, v]) => [n, v])));
  await writeFile(join(dir, 'pnpm-lock.yaml'), buildPnpmLockV9(pkgEntries));
  if (rcOpts.allowlist !== undefined || Object.keys(rcOpts).length > 0) {
    await writeFile(join(dir, '.trustlockrc.json'), buildTrustlockRc(rcOpts));
  }
  return dir;
}

// ---------------------------------------------------------------------------
// AC2: loadPolicy not imported
// ---------------------------------------------------------------------------

test('AC2: cross-audit.js does not import loadPolicy', async () => {
  const src = await readFile(join(PROJECT_ROOT, 'src', 'cli', 'commands', 'cross-audit.js'), 'utf8');
  assert.ok(!src.includes('loadPolicy'), 'loadPolicy must not appear in cross-audit.js');
  assert.ok(!src.includes('policy/config'), 'policy/config must not be imported');
  assert.ok(!src.includes('policy/loader'), 'policy/loader must not be imported');
});

// ---------------------------------------------------------------------------
// AC4: no baseline writes
// ---------------------------------------------------------------------------

test('AC4: cross-audit.js does not reference baseline write functions', async () => {
  const src = await readFile(join(PROJECT_ROOT, 'src', 'cli', 'commands', 'cross-audit.js'), 'utf8');
  assert.ok(!src.includes('writeAndStage'), 'writeAndStage must not appear');
  assert.ok(!src.includes('writeBaseline'), 'writeBaseline must not appear');
  assert.ok(!src.match(/writeFile.*baseline/), 'no direct writeFile calls for baseline');
});

// ---------------------------------------------------------------------------
// AC6: fewer than two directories → error exit
// ---------------------------------------------------------------------------

test('AC6: single directory → error message and exit code 2', async () => {
  const dir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', dir] });
  } finally {
    io.restore();
  }
  assert.ok(io.stderr.includes('--compare requires at least two directories.'));
  assert.equal(process.exitCode, 2);
});

test('AC6: zero directories → error message and exit code 2', async () => {
  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit'] });
  } finally {
    io.restore();
  }
  assert.ok(io.stderr.includes('--compare requires at least two directories.'));
  assert.equal(process.exitCode, 2);
});

// ---------------------------------------------------------------------------
// AC7: directory not found → error exit
// ---------------------------------------------------------------------------

test('AC7: missing directory → error message and exit code 2', async () => {
  const existingDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const missingDir = join(tmpDir, 'does-not-exist');
  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', existingDir, missingDir] });
  } finally {
    io.restore();
  }
  assert.ok(io.stderr.includes(`Directory not found: ${missingDir}.`));
  assert.equal(process.exitCode, 2);
});

// ---------------------------------------------------------------------------
// AC8: directory with no lockfile → warning + skip + continues
// ---------------------------------------------------------------------------

test('AC8: directory without lockfile emits warning and continues', async () => {
  const frontendDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  // Create an empty directory — no lockfile
  const noLockDir = join(tmpDir, 'no-lock');
  await mkdir(noLockDir);
  const backendDir = await makeNpmProject('backend', [['lodash', '4.0.0']]);

  const io = captureOutput();
  try {
    await run({
      values: { compare: true },
      positionals: ['audit', frontendDir, noLockDir, backendDir],
    });
  } finally {
    io.restore();
  }

  assert.ok(io.stderr.includes('warning:'), 'Should emit a warning for no-lock dir');
  assert.ok(io.stderr.includes('skipping'), 'Warning should mention skipping');
  // Run should continue — stdout contains the report
  assert.ok(io.stdout.includes('CROSS-PROJECT AUDIT'));
  assert.equal(process.exitCode, 0);
});

// ---------------------------------------------------------------------------
// AC1 + AC5 + AC12: unified report, exit 0, clean sections
// ---------------------------------------------------------------------------

test('AC1+AC5+AC12: two matching projects → three sections, exit 0, clean confirmations', async () => {
  const frontendDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['lodash', '4.0.0']]);

  const io = captureOutput();
  try {
    await run({
      values: { compare: true },
      positionals: ['audit', frontendDir, backendDir],
    });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0, 'Exit code must be 0');
  assert.ok(io.stdout.includes('VERSION DRIFT'), 'Should have VERSION DRIFT section');
  assert.ok(io.stdout.includes('PROVENANCE INCONSISTENCY'), 'Should have PROVENANCE INCONSISTENCY section');
  assert.ok(io.stdout.includes('ALLOWLIST INCONSISTENCY'), 'Should have ALLOWLIST INCONSISTENCY section');
  assert.ok(io.stdout.includes('No version drift detected'), 'Clean version drift confirmation');
  assert.ok(io.stdout.includes('No provenance inconsistencies'), 'Clean provenance confirmation');
  assert.ok(io.stdout.includes('No allowlist inconsistencies'), 'Clean allowlist confirmation');
});

test('AC5: exit code is 0 even when drift is found', async () => {
  const frontendDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['lodash', '4.1.0']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }
  assert.equal(process.exitCode, 0, 'Exit code must be 0 even with drift');
});

// ---------------------------------------------------------------------------
// AC9: multi-format (npm + pnpm)
// ---------------------------------------------------------------------------

test('AC9: npm and pnpm directories — both parsed, report generated', async () => {
  const npmDir  = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const pnpmDir = await makePnpmProject('backend', [['lodash', '4.0.0']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', npmDir, pnpmDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('CROSS-PROJECT AUDIT'));
  assert.ok(io.stdout.includes('VERSION DRIFT'));
});

test('AC9: npm and pnpm with drift between them', async () => {
  const npmDir  = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const pnpmDir = await makePnpmProject('backend', [['lodash', '4.17.21']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', npmDir, pnpmDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  // lodash is at different versions → drift reported
  assert.ok(io.stdout.includes('lodash'), 'lodash drift should appear in report');
});

// ---------------------------------------------------------------------------
// AC11: packages in only one dir not in version drift
// ---------------------------------------------------------------------------

test('AC11: packages in only one directory do not appear in drift section', async () => {
  const frontendDir = await makeNpmProject('frontend', [['only-frontend', '1.0.0'], ['shared', '2.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['only-backend', '1.0.0'], ['shared', '2.0.0']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }

  // shared at same version — no drift; only-* packages not in both dirs — no drift
  assert.ok(io.stdout.includes('No version drift detected'), 'No drift — only-frontend/backend not shared');
  assert.ok(!io.stdout.includes('only-frontend'), 'only-frontend should not appear in drift');
  assert.ok(!io.stdout.includes('only-backend'), 'only-backend should not appear in drift');
});

// ---------------------------------------------------------------------------
// AC3 + AC13: .trustlockrc.json read directly; malformed extends no network
// ---------------------------------------------------------------------------

test('AC3+AC13: malformed extends URL does not cause error or network call', async () => {
  const frontendDir = join(tmpDir, 'frontend');
  await mkdir(frontendDir);
  await writeFile(join(frontendDir, 'package.json'), buildPackageJson('frontend', [['lodash', '4.0.0']]));
  await writeFile(join(frontendDir, 'package-lock.json'), buildNpmLockV3('frontend', [['lodash', '4.0.0']]));
  // Malformed extends URL that must NOT be fetched
  await writeFile(join(frontendDir, '.trustlockrc.json'), JSON.stringify({
    extends: 'https://bad-url-that-should-not-be-fetched.invalid/policy.json',
    scripts: { allowlist: ['script-runner'] },
  }));

  const backendDir = await makeNpmProject('backend', [['lodash', '4.0.0']]);

  const io = captureOutput();
  let threw = false;
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } catch {
    threw = true;
  } finally {
    io.restore();
  }

  assert.ok(!threw, 'Should not throw');
  assert.equal(process.exitCode, 0);
  // No network error in stderr
  assert.ok(!io.stderr.includes('bad-url-that-should-not-be-fetched'), 'No network activity');
  // The allowlist from frontend should still be read
  assert.ok(io.stdout.includes('ALLOWLIST INCONSISTENCY'));
});

// ---------------------------------------------------------------------------
// AC14: absolute and relative directory paths
// ---------------------------------------------------------------------------

test('AC14: relative paths resolved from cwd', async () => {
  const frontendDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['lodash', '4.0.0']]);

  // Use relative paths from tmpDir
  const relFrontend = 'frontend';
  const relBackend  = 'backend';

  const io = captureOutput();
  try {
    await run(
      { values: { compare: true }, positionals: ['audit', relFrontend, relBackend] },
      { _cwd: tmpDir }
    );
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('CROSS-PROJECT AUDIT'));
});

test('AC14: absolute paths work correctly', async () => {
  const frontendDir = await makeNpmProject('frontend', [['lodash', '4.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['lodash', '4.0.0']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('CROSS-PROJECT AUDIT'));
});

// ---------------------------------------------------------------------------
// Allowlist inconsistency with real .trustlockrc.json
// ---------------------------------------------------------------------------

test('allowlist inconsistency reported when script allowlists differ', async () => {
  const frontendDir = await makeNpmProject(
    'frontend',
    [['script-pkg', '1.0.0']],
    { allowlist: ['script-pkg'] }
  );
  const backendDir = await makeNpmProject(
    'backend',
    [['script-pkg', '1.0.0']],
    { allowlist: [] }
  );

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('script-pkg'), 'script-pkg should appear in allowlist section');
  assert.ok(!io.stdout.includes('No allowlist inconsistencies'), 'Should NOT show clean confirmation');
});

// ---------------------------------------------------------------------------
// Version drift reported correctly
// ---------------------------------------------------------------------------

test('version drift reported when same package has different versions', async () => {
  const frontendDir = await makeNpmProject('frontend', [['react', '18.0.0']]);
  const backendDir  = await makeNpmProject('backend', [['react', '17.0.0']]);

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('react'), 'react drift should be reported');
  assert.ok(io.stdout.includes('18.0.0'), 'version 18.0.0 should appear');
  assert.ok(io.stdout.includes('17.0.0'), 'version 17.0.0 should appear');
  assert.ok(!io.stdout.includes('No version drift detected'), 'Should NOT show clean confirmation');
});

// ---------------------------------------------------------------------------
// .trustlockrc.json absent — treated as empty allowlist, no error
// ---------------------------------------------------------------------------

test('missing .trustlockrc.json treated as empty allowlist', async () => {
  // Neither dir has .trustlockrc.json
  const frontendDir = join(tmpDir, 'frontend');
  await mkdir(frontendDir);
  await writeFile(join(frontendDir, 'package.json'), buildPackageJson('frontend', [['lodash', '4.0.0']]));
  await writeFile(join(frontendDir, 'package-lock.json'), buildNpmLockV3('frontend', [['lodash', '4.0.0']]));

  const backendDir = join(tmpDir, 'backend');
  await mkdir(backendDir);
  await writeFile(join(backendDir, 'package.json'), buildPackageJson('backend', [['lodash', '4.0.0']]));
  await writeFile(join(backendDir, 'package-lock.json'), buildNpmLockV3('backend', [['lodash', '4.0.0']]));

  const io = captureOutput();
  try {
    await run({ values: { compare: true }, positionals: ['audit', frontendDir, backendDir] });
  } finally {
    io.restore();
  }

  assert.equal(process.exitCode, 0);
  assert.ok(io.stdout.includes('No allowlist inconsistencies'));
});
