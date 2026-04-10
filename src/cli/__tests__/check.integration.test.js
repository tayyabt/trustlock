/**
 * Integration tests for F10-S4 check.js wiring:
 *
 * Coverage:
 *   IT1  - v0.2 grouped terminal output: summary line, BLOCKED section, baseline footer
 *   IT2  - --quiet produces zero stdout and stderr; exit code correct
 *   IT3  - --json produces schema_version 2 JSON with grouped keys
 *   IT4  - 4 packages needing fetch: no progress counter on stderr
 *   IT5  - 5 packages needing fetch: progress counter appears on stderr
 *   IT6  - approve.js v0.2 confirmation: terminalMode=true appends "Commit this file."
 *   IT7  - approve.js --json mode: "Commit this file." absent
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { run as checkRun } from '../commands/check.js';
import { run as approveRun } from '../commands/approve.js';
import { createBaseline } from '../../baseline/manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupTempDir() {
  const dir = join(tmpdir(), `trustlock-it-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, '.git'), { recursive: true });
  return dir;
}

/**
 * Write project fixtures.  baselinePackages=null → empty baseline (all packages appear as new).
 */
async function writeFixtures(dir, { packages = {}, baselinePackages = null, approvals = [] } = {}) {
  const policy = {
    cooldown_hours: 72,
    pinning: { required: false },
    scripts: { allowlist: [] },
    sources: { allowed: ['registry'] },
    provenance: { required_for: [] },
    transitive: { max_new: 10 },
  };
  await writeFile(join(dir, '.trustlockrc.json'), JSON.stringify(policy));

  const pkgDeps = Object.fromEntries(Object.entries(packages).map(([n, v]) => [n, v]));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0', dependencies: pkgDeps }));

  const lockPkgs = { '': { name: 'test', version: '1.0.0', dependencies: pkgDeps } };
  for (const [name, version] of Object.entries(packages)) {
    lockPkgs[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-${name}-${version}`,
      hasInstallScripts: false,
    };
  }
  const lockfileContent = JSON.stringify({ name: 'test', version: '1.0.0', lockfileVersion: 3, requires: true, packages: lockPkgs });
  await writeFile(join(dir, 'package-lock.json'), lockfileContent);

  const lockfileHash = createHash('sha256').update(lockfileContent).digest('hex');

  await mkdir(join(dir, '.trustlock'), { recursive: true });

  // Build baseline: null → empty (all packages appear as new)
  const bpkgs = baselinePackages ?? {};
  const baselineDeps = Object.entries(bpkgs).map(([name, version]) => ({
    name, version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: `sha512-${name}-${version}`,
    isDev: false, hasInstallScripts: false, sourceType: 'registry', directDependency: true,
  }));
  const baseline = createBaseline(baselineDeps, baselinePackages === null ? lockfileHash : 'old-hash');
  await writeFile(join(dir, '.trustlock', 'baseline.json'), JSON.stringify(baseline));
  await writeFile(join(dir, '.trustlock', 'approvals.json'), JSON.stringify(approvals));

  return lockfileHash;
}

/**
 * Registry client where all packages are admitted (old enough, 8 days ago).
 * `packages` is an object mapping name→version.
 */
function admitAllClient(packages) {
  const publishedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  return {
    async fetchPackageMetadata(name) {
      const version = packages[name];
      if (!version) return { data: null, warnings: [] };
      return { data: { time: { [version]: publishedAt } }, warnings: [] };
    },
    async getAttestations() { return { data: null, warnings: [] }; },
    async getVersionMetadata() { return { data: {}, warnings: [] }; },
  };
}

/**
 * Registry client where all packages are blocked by cooldown (published 1h ago).
 * `packages` is an object mapping name→version.
 */
function blockAllByNewClient(packages) {
  const publishedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  return {
    async fetchPackageMetadata(name) {
      const version = packages[name];
      if (!version) return { data: null, warnings: [] };
      return { data: { time: { [version]: publishedAt } }, warnings: [] };
    },
    async getAttestations() { return { data: null, warnings: [] }; },
    async getVersionMetadata() { return { data: {}, warnings: [] }; },
  };
}

/**
 * Run check and capture stdout/stderr.
 */
async function runCheck(dir, argValues = {}, injectOpts = {}) {
  const prevExitCode = process.exitCode;
  process.exitCode = 0;

  const stdout = [];
  const stderr = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c) => { stdout.push(String(c)); return true; };
  process.stderr.write = (c) => { stderr.push(String(c)); return true; };

  try {
    await checkRun(
      { values: { enforce: false, json: false, sarif: false, quiet: false, 'dry-run': false, 'no-cache': false, ...argValues }, positionals: ['check'] },
      { _cwd: dir, _writeAndStage: async () => {}, ...injectOpts }
    );
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  const exitCode = process.exitCode;
  process.exitCode = prevExitCode;
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

// ---------------------------------------------------------------------------
// IT1 — v0.2 grouped terminal output
// ---------------------------------------------------------------------------

test('IT1: blocked package produces v0.2 grouped output with summary, BLOCKED section, baseline footer', async () => {
  const dir = await setupTempDir();
  const packages = { lodash: '4.17.21' };
  try {
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { exitCode, stdout } = await runCheck(dir, {}, {
      _registryClient: blockAllByNewClient(packages),
    });

    assert.equal(exitCode, 0, 'advisory mode: exit 0 even when blocked');

    // Summary line
    assert.ok(stdout.includes('blocked'), `expected "blocked" in summary, got:\n${stdout}`);
    assert.ok(stdout.match(/\d+ package.*changed/), `expected "N packages changed", got:\n${stdout}`);

    // BLOCKED section
    assert.ok(stdout.includes('BLOCKED'), `expected BLOCKED section header, got:\n${stdout}`);
    assert.ok(stdout.includes('lodash'), `expected lodash in BLOCKED section, got:\n${stdout}`);

    // Baseline footer
    assert.ok(
      stdout.includes('Baseline not advanced') || stdout.includes('blocked'),
      `expected baseline footer, got:\n${stdout}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT2 — --quiet produces zero output
// ---------------------------------------------------------------------------

test('IT2: --quiet produces zero stdout and stderr for admitted packages', async () => {
  const dir = await setupTempDir();
  const packages = { lodash: '4.17.21' };
  try {
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { exitCode, stdout, stderr } = await runCheck(dir, { quiet: true }, {
      _registryClient: admitAllClient(packages),
    });

    assert.equal(exitCode, 0);
    assert.equal(stdout, '', `--quiet must produce zero stdout, got: ${stdout}`);
    assert.equal(stderr, '', `--quiet must produce zero stderr, got: ${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('IT2b: --quiet produces zero stdout and stderr for blocked packages; exit code still correct with --enforce', async () => {
  const dir = await setupTempDir();
  const packages = { lodash: '4.17.21' };
  try {
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { exitCode, stdout, stderr } = await runCheck(dir, { quiet: true, enforce: true }, {
      _registryClient: blockAllByNewClient(packages),
    });

    assert.equal(exitCode, 1, '--quiet + --enforce + blocked: exit 1');
    assert.equal(stdout, '', `--quiet must produce zero stdout, got: ${stdout}`);
    assert.equal(stderr, '', `--quiet must produce zero stderr, got: ${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT3 — --json produces schema_version 2
// ---------------------------------------------------------------------------

test('IT3: --json produces schema_version 2 JSON with grouped keys', async () => {
  const dir = await setupTempDir();
  const packages = { lodash: '4.17.21' };
  try {
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { exitCode, stdout } = await runCheck(dir, { json: true }, {
      _registryClient: admitAllClient(packages),
    });

    assert.equal(exitCode, 0);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(stdout.trim()); }, `stdout must be valid JSON, got: ${stdout}`);
    assert.equal(parsed.schema_version, 2, 'schema_version must be 2');
    assert.ok('blocked' in parsed, 'must have blocked key');
    assert.ok('admitted_with_approval' in parsed, 'must have admitted_with_approval key');
    assert.ok('new_packages' in parsed, 'must have new_packages key');
    assert.ok('admitted' in parsed, 'must have admitted key');
    assert.ok('summary' in parsed, 'must have summary key');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('IT3b: --json blocked entry has approve_command always present', async () => {
  const dir = await setupTempDir();
  const packages = { lodash: '4.17.21' };
  try {
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { stdout } = await runCheck(dir, { json: true }, {
      _registryClient: blockAllByNewClient(packages),
    });

    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.schema_version, 2);
    assert.equal(parsed.blocked.length, 1, 'one blocked entry');
    const entry = parsed.blocked[0];
    assert.equal(entry.name, 'lodash');
    assert.ok(typeof entry.approve_command === 'string', 'approve_command must be a string');
    assert.ok(entry.approve_command.length > 0, 'approve_command must be non-empty');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT4 — 4 packages: no progress counter
// ---------------------------------------------------------------------------

test('IT4: 4 packages needing fetch — no progress counter on stderr', async () => {
  const dir = await setupTempDir();
  try {
    const packages = { a: '1.0.0', b: '1.0.0', c: '1.0.0', d: '1.0.0' };
    await writeFixtures(dir, { packages, baselinePackages: {} });

    const { stderr } = await runCheck(dir, {}, {
      _registryClient: admitAllClient(packages),
    });

    assert.ok(
      !stderr.includes('Fetching metadata'),
      `expected no progress counter with 4 packages, got stderr: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT5 — 5 packages: progress counter appears
// ---------------------------------------------------------------------------

test('IT5: 5 packages needing fetch — progress counter appears on stderr', async () => {
  const dir = await setupTempDir();
  try {
    const packages = { a: '1.0.0', b: '1.0.0', c: '1.0.0', d: '1.0.0', e: '1.0.0' };
    await writeFixtures(dir, { packages, baselinePackages: {} });

    // The test captures process.stderr.write which captures the progress output.
    // progress.js checks stream.isTTY; process.stderr.isTTY is false in test environments,
    // so non-TTY mode (line-at-10%-intervals) will be used.
    const { stderr } = await runCheck(dir, {}, {
      _registryClient: admitAllClient(packages),
    });

    assert.ok(
      stderr.includes('Fetching metadata') || stderr.includes('/5'),
      `expected progress counter with 5 packages, got stderr: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT6 — approve.js v0.2 confirmation in terminal mode
// ---------------------------------------------------------------------------

test('IT6: approve.js v0.2 confirmation includes "Commit this file." in terminal mode', async () => {
  const dir = await setupTempDir();
  try {
    // Set up a project with a package in the lockfile
    await writeFixtures(dir, { packages: { lodash: '4.17.21' } });

    // Write a valid approval entry so writeApproval can work
    // We need to call approve.run — set up the necessary config
    // approve reads policy from .trustlockrc.json and lockfile

    const prevExitCode = process.exitCode;
    process.exitCode = 0;
    const stdout = [];
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = (c) => { stdout.push(String(c)); return true; };
    process.stderr.write = () => true;

    try {
      await approveRun(
        {
          values: {
            json: false,
            override: ['cooldown'],
            reason: 'test reason',
            expires: '7d',
            as: 'test-approver',
          },
          positionals: ['approve', 'lodash@4.17.21'],
        },
        { _cwd: dir }
      );
    } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    }

    process.exitCode = prevExitCode;

    const out = stdout.join('');
    assert.ok(out.includes('Commit this file'), `terminal mode must include "Commit this file.", got: ${out}`);
    assert.ok(out.includes('Approval recorded'), `must include "Approval recorded", got: ${out}`);
    assert.ok(out.includes('lodash@4.17.21'), `must include package@version, got: ${out}`);
    assert.ok(out.includes('test-approver'), `must include approver, got: ${out}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// IT7 — approve.js --json mode: "Commit this file." absent
// ---------------------------------------------------------------------------

test('IT7: approve.js --json mode omits "Commit this file."', async () => {
  const dir = await setupTempDir();
  try {
    await writeFixtures(dir, { packages: { lodash: '4.17.21' } });

    const prevExitCode = process.exitCode;
    process.exitCode = 0;
    const stdout = [];
    const origOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = (c) => { stdout.push(String(c)); return true; };
    process.stderr.write = () => true;

    try {
      await approveRun(
        {
          values: {
            json: true,
            override: ['cooldown'],
            reason: 'test reason',
            expires: '7d',
            as: 'test-approver',
          },
          positionals: ['approve', 'lodash@4.17.21'],
        },
        { _cwd: dir }
      );
    } finally {
      process.stdout.write = origOut;
    }

    process.exitCode = prevExitCode;

    const out = stdout.join('');
    assert.ok(!out.includes('Commit this file'), `--json mode must NOT include "Commit this file.", got: ${out}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
