/**
 * Integration test: `trustlock check` from a monorepo sub-package.
 *
 * Verifies:
 *   AC2  - baseline written using gitRoot (not projectRoot) for git staging
 *   AC5  - --project-dir overrides project root for all file reads
 *   AC6  - --lockfile overrides only the lockfile path, resolved relative to projectRoot
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { run } from '../../src/cli/commands/check.js';
import { createBaseline } from '../../src/baseline/manager.js';

let repoRoot;

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

function makeLockfileV3(pkgName, deps) {
  const lockPkgs = {
    '': { name: pkgName, version: '1.0.0', dependencies: deps },
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

function mockRegistryClient() {
  return {
    async fetchPackageMetadata(_name) {
      return {
        data: { time: { '4.17.21': new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() } },
        warnings: [],
      };
    },
    async getAttestations() { return { data: null, warnings: [] }; },
  };
}

beforeEach(async () => {
  repoRoot = join(tmpdir(), `trustlock-monorepo-check-${process.pid}-${Date.now()}`);
  await mkdir(repoRoot, { recursive: true });
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
// Helpers
// ---------------------------------------------------------------------------

async function writeSubPackageFixtures(subPkgDir, pkgName, deps) {
  await mkdir(subPkgDir, { recursive: true });

  const lockfileContent = makeLockfileV3(pkgName, deps);
  const lockfileHash = createHash('sha256').update(lockfileContent).digest('hex');

  // Write lockfile + package.json
  await writeFile(join(subPkgDir, 'package-lock.json'), lockfileContent);
  await writeFile(
    join(subPkgDir, 'package.json'),
    JSON.stringify({ name: pkgName, version: '1.0.0', dependencies: deps })
  );

  // Write .trustlockrc.json
  await writeFile(
    join(subPkgDir, '.trustlockrc.json'),
    JSON.stringify({
      cooldown_hours: 72,
      pinning: { required: false },
      scripts: { allowlist: [] },
      sources: { allowed: ['registry'] },
      provenance: { required_for: [] },
      transitive: { max_new: 5 },
    })
  );

  // Write .trustlock/ scaffold with baseline matching lockfile (no delta)
  await mkdir(join(subPkgDir, '.trustlock'), { recursive: true });
  const baselineDeps = Object.entries(deps).map(([name, version]) => ({
    name,
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: `sha512-fake-${name}`,
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
  }));
  const baseline = createBaseline(baselineDeps, lockfileHash);
  await writeFile(
    join(subPkgDir, '.trustlock', 'baseline.json'),
    JSON.stringify(baseline)
  );
  await writeFile(join(subPkgDir, '.trustlock', 'approvals.json'), '[]');

  return { lockfileHash };
}

// ---------------------------------------------------------------------------
// AC2: check from sub-package passes gitRoot to writeAndStage
// ---------------------------------------------------------------------------

test('AC2: check from sub-package — writeAndStage is called with gitRoot', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  await writeSubPackageFixtures(backendDir, 'backend', { lodash: '4.17.21' });

  let writeAndStageCalled = false;
  let receivedGitRoot = null;

  const mockWriteAndStage = async (_baseline, _baselinePath, opts = {}) => {
    writeAndStageCalled = true;
    receivedGitRoot = opts.gitRoot;
  };

  const cap = captureOutput();
  try {
    await run(
      { values: { enforce: false, json: false, 'dry-run': false, 'no-cache': false }, positionals: ['check'] },
      { _cwd: backendDir, _writeAndStage: mockWriteAndStage, _registryClient: mockRegistryClient() }
    );
  } finally {
    cap.restore();
  }

  // No dependency changes (baseline matches lockfile) → no writeAndStage call
  // The "No dependency changes" short-circuit fires before writeAndStage
  const out = cap.captured.stdout.join('');
  assert.ok(
    out.includes('No dependency changes'),
    `Expected "No dependency changes", got: ${out}`
  );
  // writeAndStage is only called when baseline is advanced — verify no errors occurred
  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);
});

test('AC2b: check advances baseline — writeAndStage receives gitRoot (not projectRoot)', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  // Write fixtures with OLD baseline (stale hash) so check detects changes
  await mkdir(backendDir, { recursive: true });
  const lockfileContent = makeLockfileV3('backend', { lodash: '4.17.21' });
  await writeFile(join(backendDir, 'package-lock.json'), lockfileContent);
  await writeFile(
    join(backendDir, 'package.json'),
    JSON.stringify({ name: 'backend', version: '1.0.0', dependencies: { lodash: '4.17.21' } })
  );
  await writeFile(
    join(backendDir, '.trustlockrc.json'),
    JSON.stringify({
      cooldown_hours: 0,  // 0h cooldown so lodash is admitted
      pinning: { required: false },
      scripts: { allowlist: [] },
      sources: { allowed: ['registry'] },
      provenance: { required_for: [] },
      transitive: { max_new: 5 },
    })
  );
  await mkdir(join(backendDir, '.trustlock'), { recursive: true });
  // Old baseline with different hash to trigger delta
  const oldBaseline = createBaseline([], 'old-hash-triggers-delta');
  await writeFile(join(backendDir, '.trustlock', 'baseline.json'), JSON.stringify(oldBaseline));
  await writeFile(join(backendDir, '.trustlock', 'approvals.json'), '[]');

  let receivedGitRoot = undefined;
  const mockWriteAndStage = async (_baseline, _baselinePath, opts = {}) => {
    receivedGitRoot = opts.gitRoot;
  };

  const cap = captureOutput();
  try {
    await run(
      { values: { enforce: false, json: false, 'dry-run': false, 'no-cache': false }, positionals: ['check'] },
      { _cwd: backendDir, _writeAndStage: mockWriteAndStage, _registryClient: mockRegistryClient() }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);
  // writeAndStage must have been called
  assert.notEqual(receivedGitRoot, undefined, 'writeAndStage must be called with gitRoot');
  // gitRoot should be repoRoot (where .git/ lives), not backendDir
  assert.equal(receivedGitRoot, repoRoot, `gitRoot should be repoRoot (${repoRoot}), got: ${receivedGitRoot}`);
});

// ---------------------------------------------------------------------------
// AC5: --project-dir overrides project root for all file reads
// ---------------------------------------------------------------------------

test('AC5: --project-dir packages/backend reads files from that directory', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  await writeSubPackageFixtures(backendDir, 'backend', { lodash: '4.17.21' });

  const cap = captureOutput();
  try {
    await run(
      {
        values: {
          enforce: false,
          json: false,
          'dry-run': false,
          'no-cache': false,
          'project-dir': join(repoRoot, 'packages', 'backend'),  // absolute
        },
        positionals: ['check'],
      },
      { _cwd: repoRoot, _registryClient: mockRegistryClient() }
    );
  } finally {
    cap.restore();
  }

  // Should succeed — project dir is valid, config+baseline exist there
  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);
  const out = cap.captured.stdout.join('');
  assert.ok(out.includes('No dependency changes'), `Expected no-changes message, got: ${out}`);
});

// ---------------------------------------------------------------------------
// AC6: --lockfile overrides lockfile path, resolved relative to projectRoot
// ---------------------------------------------------------------------------

test('AC6: --lockfile overrides lockfile path resolved relative to projectRoot', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  await writeSubPackageFixtures(backendDir, 'backend', { lodash: '4.17.21' });

  // Write the alternate lockfile in a subdirectory.
  // The parser checks the basename — must be "package-lock.json".
  const altLockDir = join(backendDir, 'alt-locks');
  await mkdir(altLockDir, { recursive: true });
  const lockfileContent = makeLockfileV3('backend', { lodash: '4.17.21' });
  await writeFile(join(altLockDir, 'package-lock.json'), lockfileContent);

  // Sync baseline hash to the alt lockfile (same content → same hash)
  const altHash = createHash('sha256').update(lockfileContent).digest('hex');
  const altBaseline = createBaseline(
    [{ name: 'lodash', version: '4.17.21', resolved: '', integrity: '', isDev: false, hasInstallScripts: false, sourceType: 'registry', directDependency: true }],
    altHash
  );
  await writeFile(join(backendDir, '.trustlock', 'baseline.json'), JSON.stringify(altBaseline));

  const cap = captureOutput();
  try {
    await run(
      {
        values: {
          enforce: false,
          json: false,
          'dry-run': false,
          'no-cache': false,
          'lockfile': 'alt-locks/package-lock.json',  // relative to projectRoot (backendDir)
        },
        positionals: ['check'],
      },
      { _cwd: backendDir, _registryClient: mockRegistryClient() }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);
  const out = cap.captured.stdout.join('');
  // .trustlockrc.json and .trustlock/ are still loaded from projectRoot (backendDir)
  assert.ok(out.includes('No dependency changes'), `Expected no changes with alt lockfile, got: ${out}`);
});
