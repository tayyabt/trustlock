/**
 * Unit tests for `trustlock audit` command.
 *
 * Coverage:
 *   AC1  - prints audit stats: total packages, provenance %, install scripts, source types, age
 *   AC2  - exits 0 always (even with cooldown violations)
 *   AC3  - registry-degraded path: warns per package to stderr, still exits 0
 *   AC4  - blocked packages with approval commands are listed in output
 *   AC5  - missing .trustlockrc.json → exit 2
 *   AC6  - missing lockfile → exit 2
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../../src/cli/commands/audit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir;
let stdoutLines;
let stderrLines;
let origStdoutWrite;
let origStderrWrite;

function captureOutput() {
  stdoutLines = [];
  stderrLines = [];
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    stdoutLines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  process.stderr.write = (chunk) => {
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

/**
 * Build a minimal lockfile (v3) with the given packages.
 * @param {Array<{ name: string, version: string, hasInstallScripts?: boolean, sourceType?: string, isDev?: boolean }>} packages
 */
function makeLockfile(packages) {
  const lockPkgs = {
    '': {
      name: 'test-project',
      version: '1.0.0',
      dependencies: Object.fromEntries(packages.map((p) => [p.name, p.version])),
    },
  };

  for (const p of packages) {
    const resolved = p.sourceType === 'git'
      ? `git+https://github.com/owner/${p.name}.git#abc123`
      : p.sourceType === 'file'
        ? `file:../${p.name}`
        : `https://registry.npmjs.org/${p.name}/-/${p.name}-${p.version}.tgz`;

    lockPkgs[`node_modules/${p.name}`] = {
      version: p.version,
      resolved,
      integrity: p.sourceType === 'git' ? undefined : `sha512-${p.name}`,
      hasInstallScripts: p.hasInstallScripts ?? false,
      dev: p.isDev ?? false,
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

/** Default policy config. */
const DEFAULT_CONFIG = {
  cooldown_hours: 72,
  pinning: { required: false },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: [] },
  transitive: { max_new: 5 },
};

/**
 * Set up a minimal project in testDir.
 * @param {object} opts
 * @param {Array}    opts.packages    Packages for the lockfile
 * @param {object}   [opts.config]   .trustlockrc.json content
 * @param {object[]} [opts.approvals] approvals.json content
 */
async function setupProject({ packages, config = DEFAULT_CONFIG, approvals = [] } = {}) {
  await writeFile(join(testDir, '.trustlockrc.json'), JSON.stringify(config));
  await writeFile(join(testDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    dependencies: Object.fromEntries(packages.map((p) => [p.name, p.version])),
  }));
  await writeFile(join(testDir, 'package-lock.json'), makeLockfile(packages));
  await mkdir(join(testDir, '.trustlock', '.cache'), { recursive: true });
  await writeFile(join(testDir, '.trustlock', 'approvals.json'), JSON.stringify(approvals));
}

/**
 * Build a mock registry client.
 * @param {object} metaOverrides  name → partial metadata to merge
 * @param {boolean} [unreachable]  When true, all fetches return no data + warn
 */
function makeMockClient(metaOverrides = {}, unreachable = false) {
  return {
    async fetchPackageMetadata(name) {
      if (unreachable) {
        return { data: null, warnings: ['skipped: registry unreachable'] };
      }
      const override = metaOverrides[name] ?? {};
      const publishedAt = override.publishedAt ?? new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      return { data: { time: { [override.version ?? '1.0.0']: publishedAt } }, warnings: [] };
    },
    async getAttestations(name, _version) {
      if (unreachable) {
        return { data: null, warnings: ['skipped: registry unreachable'] };
      }
      const override = metaOverrides[name] ?? {};
      return { data: override.hasProvenance ? {} : null, warnings: [] };
    },
  };
}

function makeArgs() {
  return { values: {}, positionals: ['audit'] };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = join(tmpdir(), `trustlock-audit-test-${process.pid}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
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

test('AC1: prints audit stats with total packages in output', async () => {
  const packages = [
    { name: 'lodash',  version: '4.17.21' },
    { name: 'axios',   version: '1.14.1' },
    { name: 'express', version: '4.18.2' },
  ];

  await setupProject({ packages });

  await run(makeArgs(), {
    _cwd: testDir,
    _registryClient: makeMockClient(),
  });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);

  const out = stdoutLines.join('');
  assert.ok(out.includes('Audit Summary'), `Expected audit summary header, got: ${out}`);
  assert.ok(out.includes('Total packages:'), `Expected total packages line, got: ${out}`);
  assert.ok(out.includes('3'), `Expected count of 3, got: ${out}`);
});

test('AC1b: provenance percentage shown in output', async () => {
  const packages = [
    { name: 'pkg-with-prov',    version: '1.0.0' },
    { name: 'pkg-without-prov', version: '2.0.0' },
  ];

  await setupProject({ packages });

  const mockClient = makeMockClient({
    'pkg-with-prov': { hasProvenance: true, version: '1.0.0', publishedAt: new Date(Date.now() - 200 * 86400000).toISOString() },
    'pkg-without-prov': { hasProvenance: false, version: '2.0.0', publishedAt: new Date(Date.now() - 200 * 86400000).toISOString() },
  });

  await run(makeArgs(), { _cwd: testDir, _registryClient: mockClient });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(out.includes('Provenance:'), `Expected provenance line, got: ${out}`);
  assert.ok(out.includes('50%'), `Expected 50% provenance, got: ${out}`);
});

test('AC1c: install scripts packages listed when hasInstallScripts is true', async () => {
  const packages = [
    { name: 'safe-pkg',    version: '1.0.0', hasInstallScripts: false },
    { name: 'scripts-pkg', version: '2.0.0', hasInstallScripts: true  },
  ];

  await setupProject({ packages });

  await run(makeArgs(), { _cwd: testDir, _registryClient: makeMockClient() });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(out.includes('scripts-pkg'), `Expected install-scripts package in output, got: ${out}`);
});

test('AC2: exits 0 always, even with policy violations (cooldown)', async () => {
  const packages = [{ name: 'fresh-pkg', version: '1.0.0' }];

  await setupProject({ packages });

  // freshly published package → within cooldown (72h by default)
  const mockClient = makeMockClient({
    'fresh-pkg': {
      version: '1.0.0',
      hasProvenance: false,
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    },
  });

  await run(makeArgs(), { _cwd: testDir, _registryClient: mockClient });

  // Must be 0 — audit is informational only
  assert.equal(process.exitCode, 0, 'audit must exit 0 even with violations');
});

test('AC3: registry unreachable → warns per package to stderr, exits 0', async () => {
  const packages = [
    { name: 'pkg-a', version: '1.0.0' },
    { name: 'pkg-b', version: '2.0.0' },
  ];

  await setupProject({ packages });

  await run(makeArgs(), {
    _cwd: testDir,
    _registryClient: makeMockClient({}, true), // unreachable
  });

  assert.equal(process.exitCode, 0, 'registry unreachable must not cause exit 2');

  const errOut = stderrLines.join('');
  // Should warn per package
  assert.ok(
    errOut.includes('pkg-a') && errOut.includes('registry unavailable'),
    `Expected per-package warning for pkg-a, got: ${errOut}`
  );
  assert.ok(
    errOut.includes('pkg-b'),
    `Expected per-package warning for pkg-b, got: ${errOut}`
  );

  // Should still produce output
  const out = stdoutLines.join('');
  assert.ok(out.includes('Audit Summary'), `Expected audit summary despite registry failure, got: ${out}`);
});

test('AC4: blocked packages listed with approval commands', async () => {
  const packages = [{ name: 'blocked-pkg', version: '1.0.0' }];

  // Use a config that requires provenance for blocked-pkg
  const config = {
    ...DEFAULT_CONFIG,
    provenance: { required_for: ['blocked-pkg'] },
  };

  await setupProject({ packages, config });

  // No provenance → will be blocked by provenance rule
  const mockClient = makeMockClient({
    'blocked-pkg': {
      version: '1.0.0',
      hasProvenance: false,
      publishedAt: new Date(Date.now() - 200 * 86400000).toISOString(),
    },
  });

  await run(makeArgs(), { _cwd: testDir, _registryClient: mockClient });

  assert.equal(process.exitCode, 0, 'blocked packages in audit must still exit 0');

  const out = stdoutLines.join('');
  // Should mention blocked packages section
  assert.ok(
    out.includes('blocked') || out.includes('approve'),
    `Expected blocked section or approval commands, got: ${out}`
  );
});

test('AC5: missing .trustlockrc.json → exit 2', async () => {
  // Write lockfile and package.json but no config
  await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  await writeFile(join(testDir, 'package-lock.json'), makeLockfile([{ name: 'pkg', version: '1.0.0' }]));
  await mkdir(join(testDir, '.trustlock', '.cache'), { recursive: true });
  await writeFile(join(testDir, '.trustlock', 'approvals.json'), '[]');

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(
    errOut.includes('.trustlockrc.json'),
    `Expected config missing error, got: ${errOut}`
  );
});

test('AC6: missing lockfile → exit 2', async () => {
  // Write config but no lockfile
  await writeFile(join(testDir, '.trustlockrc.json'), JSON.stringify(DEFAULT_CONFIG));
  await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  await mkdir(join(testDir, '.trustlock', '.cache'), { recursive: true });
  await writeFile(join(testDir, '.trustlock', 'approvals.json'), '[]');

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(
    errOut.toLowerCase().includes('lockfile') || errOut.includes('lock'),
    `Expected lockfile error, got: ${errOut}`
  );
});

test('age distribution shown in output', async () => {
  const packages = [{ name: 'old-pkg', version: '1.0.0' }];
  await setupProject({ packages });

  // Package published 100 days ago → should be in >72h bucket
  const mockClient = makeMockClient({
    'old-pkg': {
      version: '1.0.0',
      hasProvenance: false,
      publishedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  await run(makeArgs(), { _cwd: testDir, _registryClient: mockClient });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  // Age distribution line should appear
  assert.ok(out.includes('Age:'), `Expected age distribution line, got: ${out}`);
  assert.ok(out.includes('>72h') || out.includes('over72h') || out.includes('72h:1'), `Expected >72h bucket, got: ${out}`);
});

test('source type breakdown shown in output', async () => {
  const packages = [
    { name: 'from-registry', version: '1.0.0', sourceType: 'registry' },
    { name: 'from-git',      version: '1.0.0', sourceType: 'git' },
  ];

  await setupProject({ packages });

  await run(makeArgs(), { _cwd: testDir, _registryClient: makeMockClient() });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(out.includes('Source types:'), `Expected source types line, got: ${out}`);
});
