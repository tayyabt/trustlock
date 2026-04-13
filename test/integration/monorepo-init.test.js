/**
 * Integration test: `trustlock init` from a monorepo sub-package.
 *
 * Verifies:
 *   AC1  - `.trustlock/` written to `packages/backend/`, not to the repo root
 *   AC10 - Multiple `trustlock init` from different sub-packages: each gets its own `.trustlock/`
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../src/cli/commands/init.js';

let repoRoot;

/**
 * Build a minimal v3 lockfile for a sub-package.
 */
function makeLockfile(pkgName = 'test-pkg', deps = {}) {
  const lockPkgs = {
    '': {
      name: pkgName,
      version: '1.0.0',
      dependencies: deps,
    },
  };
  for (const [name, version] of Object.entries(deps)) {
    lockPkgs[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-fake-${name}`,
      hasInstallScripts: false,
    };
  }
  return JSON.stringify({
    name: pkgName,
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: lockPkgs,
  });
}

/**
 * Write a sub-package with package.json and package-lock.json.
 */
async function writeSubPackage(pkgDir, pkgName = 'test-pkg', deps = { lodash: '4.17.21' }) {
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: pkgName, version: '1.0.0', dependencies: deps })
  );
  await writeFile(join(pkgDir, 'package-lock.json'), makeLockfile(pkgName, deps));
}

/** Minimal mock registry client (no real network calls). */
function mockRegistry() {
  return {
    getAttestations: async () => ({ data: null, warnings: [] }),
    fetchPackageMetadata: async () => ({ data: null, warnings: [] }),
    getVersionMetadata: async () => ({ data: null, warnings: [] }),
  };
}

function captureOutput() {
  const captured = { stdout: [], stderr: [] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { captured.stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { captured.stderr.push(String(chunk)); return true; };
  return {
    captured,
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

beforeEach(async () => {
  repoRoot = join(tmpdir(), `trustlock-monorepo-init-${process.pid}-${Date.now()}`);
  await mkdir(repoRoot, { recursive: true });
  // Create the repo's .git/ directory (this is the gitRoot)
  await mkdir(join(repoRoot, '.git'), { recursive: true });
  process.exitCode = 0;
});

afterEach(async () => {
  process.exitCode = 0;
  if (repoRoot) {
    await rm(repoRoot, { recursive: true, force: true });
    repoRoot = null;
  }
});

// ---------------------------------------------------------------------------
// AC1: .trustlock/ written to sub-package, not repo root
// ---------------------------------------------------------------------------

test('AC1: init from packages/backend/ — .trustlock/ written to sub-package, not repo root', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  await writeSubPackage(backendDir, 'backend');

  const cap = captureOutput();
  try {
    await run(
      { values: { strict: false, 'no-baseline': false }, positionals: ['init'] },
      { _registryClient: mockRegistry(), _cwd: backendDir }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  // .trustlock/ must exist in the sub-package
  const subTrustlock = join(backendDir, '.trustlock');
  let subStat;
  try {
    subStat = await stat(subTrustlock);
  } catch {
    assert.fail(`.trustlock/ should exist in packages/backend/, not found`);
  }
  assert.ok(subStat.isDirectory(), '.trustlock/ should be a directory in sub-package');

  // .trustlock/ must NOT be created in the repo root
  try {
    await stat(join(repoRoot, '.trustlock'));
    assert.fail('.trustlock/ should NOT be created in repo root for sub-package init');
  } catch (err) {
    assert.equal(err.code, 'ENOENT', 'Expected ENOENT for repo root .trustlock/');
  }

  // .trustlockrc.json must also be in the sub-package
  const config = JSON.parse(await readFile(join(backendDir, '.trustlockrc.json'), 'utf8'));
  assert.equal(config.cooldown_hours, 72);
});

// ---------------------------------------------------------------------------
// AC10: Multiple init from different sub-packages — no collision
// ---------------------------------------------------------------------------

test('AC10: init from two different sub-packages — each gets its own .trustlock/', async () => {
  const frontendDir = join(repoRoot, 'packages', 'frontend');
  const backendDir  = join(repoRoot, 'packages', 'backend');

  await writeSubPackage(frontendDir, 'frontend', { react: '18.2.0' });
  await writeSubPackage(backendDir,  'backend',  { express: '4.18.2' });

  const cap = captureOutput();
  try {
    // Init frontend
    await run(
      { values: { strict: false, 'no-baseline': false }, positionals: ['init'] },
      { _registryClient: mockRegistry(), _cwd: frontendDir }
    );
    // Init backend
    await run(
      { values: { strict: false, 'no-baseline': false }, positionals: ['init'] },
      { _registryClient: mockRegistry(), _cwd: backendDir }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  // Each sub-package gets its own .trustlock/
  const frontendStat = await stat(join(frontendDir, '.trustlock'));
  assert.ok(frontendStat.isDirectory());

  const backendStat = await stat(join(backendDir, '.trustlock'));
  assert.ok(backendStat.isDirectory());

  // Repo root does not get a .trustlock/
  try {
    await stat(join(repoRoot, '.trustlock'));
    assert.fail('.trustlock/ should not be created in repo root');
  } catch (err) {
    assert.equal(err.code, 'ENOENT');
  }

  // Each sub-package baseline reflects its own dependencies
  const frontendBaseline = JSON.parse(
    await readFile(join(frontendDir, '.trustlock', 'baseline.json'), 'utf8')
  );
  assert.ok('react' in frontendBaseline.packages, 'Frontend baseline should include react');
  assert.ok(!('express' in frontendBaseline.packages), 'Frontend baseline should not include express');

  const backendBaseline = JSON.parse(
    await readFile(join(backendDir, '.trustlock', 'baseline.json'), 'utf8')
  );
  assert.ok('express' in backendBaseline.packages, 'Backend baseline should include express');
  assert.ok(!('react' in backendBaseline.packages), 'Backend baseline should not include react');
});

// ---------------------------------------------------------------------------
// BUG-003: No-lockfile error must mention --project-dir
// ---------------------------------------------------------------------------

test('BUG-003: no-lockfile error at repo root includes --project-dir hint (no workspaces)', async () => {
  // Repo root has no package-lock.json and no workspaces field in package.json
  await writeFile(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'my-app', version: '1.0.0' })
  );

  const cap = captureOutput();
  try {
    await run(
      { values: { strict: false, 'no-baseline': false }, positionals: ['init'] },
      { _registryClient: mockRegistry(), _cwd: repoRoot }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 2, 'Expected exit code 2 when lockfile absent');
  const stderr = cap.captured.stderr.join('');
  assert.ok(
    stderr.includes('--project-dir'),
    `Expected stderr to mention --project-dir; got: ${stderr}`
  );
});

test('BUG-003: no-lockfile error names workspace packages when workspaces field present', async () => {
  // Repo root has no package-lock.json but has workspaces
  await writeFile(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'my-monorepo', version: '1.0.0', workspaces: ['apps/*'] })
  );

  // Create sub-packages under apps/
  const frontendDir = join(repoRoot, 'apps', 'frontend');
  const backendDir  = join(repoRoot, 'apps', 'backend');
  await mkdir(frontendDir, { recursive: true });
  await mkdir(backendDir,  { recursive: true });
  await writeFile(join(frontendDir, 'package.json'), JSON.stringify({ name: 'frontend' }));
  await writeFile(join(backendDir,  'package.json'), JSON.stringify({ name: 'backend' }));

  const cap = captureOutput();
  try {
    await run(
      { values: { strict: false, 'no-baseline': false }, positionals: ['init'] },
      { _registryClient: mockRegistry(), _cwd: repoRoot }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 2, 'Expected exit code 2 when lockfile absent');
  const stderr = cap.captured.stderr.join('');
  assert.ok(
    stderr.includes('--project-dir'),
    `Expected stderr to mention --project-dir; got: ${stderr}`
  );
  assert.ok(
    stderr.includes('apps/frontend'),
    `Expected stderr to name apps/frontend; got: ${stderr}`
  );
  assert.ok(
    stderr.includes('apps/backend'),
    `Expected stderr to name apps/backend; got: ${stderr}`
  );
});
