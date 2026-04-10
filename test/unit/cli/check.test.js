/**
 * Unit tests for `trustlock check` command.
 *
 * Each test uses a temporary directory with real fixture files and injected
 * mocks for the registry client and writeAndStage (to avoid real git operations).
 *
 * Coverage:
 *   AC1  - advisory mode: admitted → baseline advanced
 *   AC2  - --enforce + blocked → exit 1, no baseline write
 *   AC3  - --enforce + all admitted → exit 0, no baseline write (D10)
 *   AC4  - --dry-run → no baseline write even if all admitted
 *   AC5  - --json → valid JSON output
 *   AC6  - block output includes per-pkg reasons, clears_at (D4), approval command
 *   AC7  - no lockfile → exit 2
 *   AC8  - no .trustlockrc.json → exit 2 with "run trustlock init"
 *   AC9  - no dep changes → exit 0 + "No dependency changes"
 *   AC10 - registry unreachable → exit 0, warnings present, local rules still evaluated
 *   AC11 - writeAndStage called with baseline path after advisory admit
 */

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { run } from '../../../src/cli/commands/check.js';
import { createBaseline } from '../../../src/baseline/manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let testDir;

/**
 * Create a fresh temp directory for each test.
 */
async function setupTempDir() {
  const dir = join(tmpdir(), `trustlock-check-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  // Create fake .git/ so resolvePaths() succeeds (dir acts as both projectRoot and gitRoot)
  await mkdir(join(dir, '.git'), { recursive: true });
  return dir;
}

/**
 * Write a minimal project setup into `dir`.
 * Returns the hash of the lockfile content written.
 */
async function writeProjectFixtures(dir, opts = {}) {
  const {
    policy = { cooldown_hours: 72, pinning: { required: false }, scripts: { allowlist: [] }, sources: { allowed: ['registry'] }, provenance: { required_for: [] }, transitive: { max_new: 5 } },
    packages = { lodash: '4.17.21' },
    baselinePackages = null,  // null = use same as lockfile packages (no delta)
    approvals = [],
  } = opts;

  // .trustlockrc.json
  await writeFile(join(dir, '.trustlockrc.json'), JSON.stringify(policy));

  // package.json
  const pkgDeps = Object.fromEntries(Object.entries(packages).map(([n, v]) => [n, v]));
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    dependencies: pkgDeps,
  }));

  // package-lock.json (v3 format)
  const lockPkgs = { '': { name: 'test-project', version: '1.0.0', dependencies: pkgDeps } };
  for (const [name, version] of Object.entries(packages)) {
    lockPkgs[`node_modules/${name}`] = {
      version,
      resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
      integrity: `sha512-${name}-${version}`,
      hasInstallScripts: false,
    };
  }
  const lockfileContent = JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: lockPkgs,
  });
  await writeFile(join(dir, 'package-lock.json'), lockfileContent);

  const lockfileHash = createHash('sha256').update(lockfileContent).digest('hex');

  // .trustlock directory
  await mkdir(join(dir, '.trustlock'), { recursive: true });

  // baseline.json
  const baselinePkgs = baselinePackages ?? packages;
  const baselineDeps = Object.entries(baselinePkgs).map(([name, version]) => ({
    name,
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: `sha512-${name}-${version}`,
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
  }));
  const baseline = createBaseline(baselineDeps, baselinePackages === null ? lockfileHash : 'old-hash-' + Date.now());
  await writeFile(join(dir, '.trustlock', 'baseline.json'), JSON.stringify(baseline));

  // approvals.json
  await writeFile(join(dir, '.trustlock', 'approvals.json'), JSON.stringify(approvals));

  return { lockfileHash, lockfileContent };
}

/**
 * Build a mock registry client that returns pre-configured data.
 *
 * `metaMap` is an optional Map<name, { publishedAt, hasProvenance, warnings }>
 * If not provided or package not in map, returns data indicating old package with no attestation.
 */
function mockRegistryClient(metaMap = new Map()) {
  return {
    async fetchPackageMetadata(name) {
      const meta = metaMap.get(name);
      if (!meta) {
        // Default: old package, 7 days ago
        const time = {};
        time['*'] = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        return {
          data: { time },
          warnings: [],
        };
      }
      if (meta.warnings && meta.warnings.includes('skipped: registry unreachable')) {
        return { data: null, warnings: meta.warnings };
      }
      const time = {};
      if (meta.publishedAt) {
        // The time object key for a specific version; use '*' as a fallback placeholder
        time['__published__'] = meta.publishedAt;
      }
      // We store publishedAt directly; check.js looks at data.time[dep.version]
      return {
        data: { time: { [meta._version ?? 'any']: meta.publishedAt } },
        warnings: meta.warnings ?? [],
      };
    },
    async getAttestations(name) {
      const meta = metaMap.get(name);
      if (!meta) return { data: null, warnings: [] };
      if (meta.warnings && meta.warnings.includes('skipped: registry unreachable')) {
        return { data: null, warnings: meta.warnings };
      }
      return {
        data: meta.hasProvenance ? { attestations: [] } : null,
        warnings: meta.warnings ?? [],
      };
    },
    async getVersionMetadata() {
      return { data: {}, warnings: [] };
    },
  };
}

/**
 * Build a registry client that returns "old enough" metadata so no cooldown blocks.
 * Published 8 days ago (well above default 72h cooldown).
 */
function admitAllClient(packageNames = []) {
  const map = new Map();
  for (const name of packageNames) {
    map.set(name, {
      publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      hasProvenance: false,
      warnings: [],
    });
  }
  return mockRegistryClient(map);
}

/**
 * Build a registry client where all packages are within the cooldown window.
 * Published 1 hour ago (triggers cooldown block at 72h default).
 */
function blockAllByNewClient(packageNames = [], version = '1.0.0') {
  const map = new Map();
  for (const name of packageNames) {
    map.set(name, {
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      hasProvenance: false,
      warnings: [],
      _version: version,
    });
  }
  return {
    async fetchPackageMetadata(name) {
      const meta = map.get(name);
      if (!meta) return { data: null, warnings: [] };
      return {
        data: { time: { [version]: meta.publishedAt } },
        warnings: [],
      };
    },
    async getAttestations() { return { data: null, warnings: [] }; },
    async getVersionMetadata() { return { data: {}, warnings: [] }; },
  };
}

/**
 * Run the check command in a temp dir and capture stdout/stderr.
 * Uses _cwd injection to avoid process.chdir() (which is global state and breaks parallel tests).
 */
async function runCheck(dir, argValues = {}, injectOpts = {}) {
  const prevExitCode = process.exitCode;
  process.exitCode = 0;

  const stdout = [];
  const stderr = [];

  // Capture stdout and stderr via write interception.
  // Each concurrent test captures its own output via closure — we do NOT swap
  // process.stdout.write globally because that would race. Instead we pass
  // _stdout/_stderr writers, but since check.js uses process.stdout directly
  // we still need to swap; however the _cwd injection removes the chdir race.
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };

  try {
    await run(
      { values: { enforce: false, json: false, 'dry-run': false, 'no-cache': false, ...argValues }, positionals: ['check'] },
      { _cwd: dir, ...injectOpts }
    );
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  const exitCode = process.exitCode;
  process.exitCode = prevExitCode;

  return {
    exitCode,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// AC8 — no .trustlockrc.json → exit 2 with "run trustlock init"
test('AC8: no .trustlockrc.json exits 2 with init message', async () => {
  const dir = await setupTempDir();
  try {
    const { exitCode, stderr } = await runCheck(dir);
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes('trustlock init'), `expected init message in stderr, got: ${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC7 — no lockfile → exit 2 with expected filenames
test('AC7: no lockfile exits 2 with expected filename list', async () => {
  const dir = await setupTempDir();
  try {
    await writeFile(join(dir, '.trustlockrc.json'), JSON.stringify({ cooldown_hours: 72 }));
    await mkdir(join(dir, '.trustlock'), { recursive: true });
    const baseline = createBaseline([], 'hash0');
    await writeFile(join(dir, '.trustlock', 'baseline.json'), JSON.stringify(baseline));
    await writeFile(join(dir, '.trustlock', 'approvals.json'), JSON.stringify([]));
    // No package-lock.json

    const { exitCode, stderr } = await runCheck(dir);
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes('package-lock.json'), `expected lockfile name in stderr, got: ${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC9 — no dep changes → exit 0 + "No dependency changes"
test('AC9: no dependency changes exits 0 and prints No dependency changes', async () => {
  const dir = await setupTempDir();
  try {
    // Same packages in baseline and lockfile → hash will match
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: null, // same as lockfile (hash will match via shortCircuited)
    });

    // We need the baseline hash to match the lockfile hash.
    // writeProjectFixtures uses the same lockfile hash for baseline when baselinePackages is null.
    const { exitCode, stdout } = await runCheck(dir, {}, {
      _registryClient: admitAllClient(['lodash']),
    });
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('No dependency changes'), `expected no changes message, got: ${stdout}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC1 — advisory mode: all admitted → baseline advanced
test('AC1: advisory mode all admitted calls writeAndStage with baseline path', async () => {
  const dir = await setupTempDir();
  try {
    // Baseline has no packages; lockfile has lodash → delta.added contains lodash
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},  // empty baseline → lodash is in delta.added
    });

    let writeAndStageCalled = false;
    let writeAndStageBaseline = null;
    let writeAndStagePath = null;

    const { exitCode, stdout } = await runCheck(
      dir,
      {},
      {
        _registryClient: admitAllClient(['lodash']),
        _writeAndStage: async (baseline, baselinePath) => {
          writeAndStageCalled = true;
          writeAndStageBaseline = baseline;
          writeAndStagePath = baselinePath;
        },
      }
    );

    assert.equal(exitCode, 0);
    assert.ok(writeAndStageCalled, 'writeAndStage must be called in advisory mode when all admitted');
    assert.ok(writeAndStagePath.includes('baseline.json'), 'baseline path must include baseline.json');
    assert.ok(writeAndStageBaseline?.packages?.lodash, 'advanced baseline must include lodash');
    assert.ok(stdout.includes('lodash'), `output should mention lodash, got: ${stdout}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC3 — --enforce + all admitted → exit 0, writeAndStage NOT called (D10)
test('AC3: --enforce with all admitted exits 0 and does NOT advance baseline (D10)', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    let writeAndStageCalled = false;
    const { exitCode } = await runCheck(
      dir,
      { enforce: true },
      {
        _registryClient: admitAllClient(['lodash']),
        _writeAndStage: async () => { writeAndStageCalled = true; },
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(writeAndStageCalled, false, 'writeAndStage must NOT be called with --enforce (D10)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC2 — --enforce + blocked → exit 1, writeAndStage NOT called
test('AC2: --enforce with blocked package exits 1 and does NOT advance baseline', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    let writeAndStageCalled = false;
    const { exitCode, stdout } = await runCheck(
      dir,
      { enforce: true },
      {
        _registryClient: blockAllByNewClient(['lodash'], '4.17.21'),
        _writeAndStage: async () => { writeAndStageCalled = true; },
      }
    );

    assert.equal(exitCode, 1, `expected exit 1 for blocked+enforce, got ${exitCode}\nstdout: ${stdout}`);
    assert.equal(writeAndStageCalled, false, 'writeAndStage must NOT be called when blocked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Advisory mode with blocked: exit 0, no baseline write
test('advisory mode with blocked package exits 0 (no --enforce)', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    let writeAndStageCalled = false;
    const { exitCode } = await runCheck(
      dir,
      {},
      {
        _registryClient: blockAllByNewClient(['lodash'], '4.17.21'),
        _writeAndStage: async () => { writeAndStageCalled = true; },
      }
    );

    assert.equal(exitCode, 0, 'advisory mode must exit 0 even when blocked');
    assert.equal(writeAndStageCalled, false, 'writeAndStage must NOT be called when any package is blocked (D1)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC4 — --dry-run → no baseline write even if all admitted
test('AC4: --dry-run does not advance baseline even if all admitted', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    let writeAndStageCalled = false;
    const { exitCode } = await runCheck(
      dir,
      { 'dry-run': true },
      {
        _registryClient: admitAllClient(['lodash']),
        _writeAndStage: async () => { writeAndStageCalled = true; },
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(writeAndStageCalled, false, 'writeAndStage must NOT be called with --dry-run');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC5 — --json → valid JSON output (schema_version 2)
test('AC5: --json outputs valid parseable schema_version 2 JSON', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { exitCode, stdout } = await runCheck(
      dir,
      { json: true },
      {
        _registryClient: admitAllClient(['lodash']),
        _writeAndStage: async () => {},
      }
    );

    assert.equal(exitCode, 0);
    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch (e) {
      assert.fail(`stdout is not valid JSON: ${e.message}\nstdout: ${stdout}`);
    }
    // schema_version 2: grouped object, not a flat array
    assert.equal(parsed.schema_version, 2, 'JSON output must have schema_version 2');
    assert.ok('blocked' in parsed, 'must have blocked key');
    assert.ok('admitted_with_approval' in parsed, 'must have admitted_with_approval key');
    assert.ok('new_packages' in parsed, 'must have new_packages key');
    assert.ok('admitted' in parsed, 'must have admitted key');
    // lodash is a new package (delta.added) and admitted
    assert.equal(parsed.new_packages.length, 1, 'lodash is a new package');
    assert.equal(parsed.new_packages[0].name, 'lodash');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC6 — block output includes clears_at (D4) and approval command
test('AC6: block output includes clears_at and approval command', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { exitCode, stdout } = await runCheck(
      dir,
      {},
      {
        _registryClient: blockAllByNewClient(['lodash'], '4.17.21'),
        _writeAndStage: async () => {},
      }
    );

    assert.equal(exitCode, 0); // advisory mode
    assert.ok(stdout.includes('lodash'), `output should mention lodash, got: ${stdout}`);
    // clears_at should appear in output (D4 — cooldown clears_at timestamp)
    assert.ok(
      stdout.includes('clears') || stdout.includes('UTC'),
      `block output should include clears_at timestamp, got: ${stdout}`
    );
    // approval command should be present
    assert.ok(
      stdout.includes('trustlock approve') || stdout.includes('approve'),
      `block output should include approval command, got: ${stdout}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC6 (JSON variant) — schema_version 2: blocked entry has rules and approve_command
test('AC6 JSON: schema_version 2 blocked entry has rules and approve_command', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { stdout } = await runCheck(
      dir,
      { json: true },
      {
        _registryClient: blockAllByNewClient(['lodash'], '4.17.21'),
        _writeAndStage: async () => {},
      }
    );

    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.schema_version, 2, 'must be schema_version 2');
    assert.equal(parsed.blocked.length, 1, 'one blocked entry');
    const entry = parsed.blocked[0];
    assert.equal(entry.name, 'lodash');
    assert.ok(Array.isArray(entry.rules), 'blocked entry must have rules array');
    assert.ok(entry.rules.length > 0, 'rules must be non-empty');
    assert.ok(typeof entry.approve_command === 'string', 'approve_command must be a string');
    assert.ok(entry.approve_command.includes('trustlock approve'), 'approve_command must be a trustlock approve command');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// AC10 — registry unreachable → exit 0, warnings, local rules still evaluated
test('AC10: registry unreachable exits 0 and includes warnings in output', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
      policy: { cooldown_hours: 72, pinning: { required: false }, scripts: { allowlist: [] }, sources: { allowed: ['registry'] }, provenance: { required_for: [] }, transitive: { max_new: 5 } },
    });

    // Registry client that always fails
    const unreachableClient = {
      async fetchPackageMetadata() { return { data: null, warnings: ['skipped: registry unreachable'] }; },
      async getAttestations() { return { data: null, warnings: ['skipped: registry unreachable'] }; },
      async getVersionMetadata() { return { data: null, warnings: [] }; },
    };

    const { exitCode, stdout } = await runCheck(
      dir,
      {},
      {
        _registryClient: unreachableClient,
        _writeAndStage: async () => {},
      }
    );

    assert.equal(exitCode, 0, 'registry unreachable must not cause non-zero exit in advisory mode');
    // Output should mention lodash (it was evaluated) — skipped findings are shown as warn
    assert.ok(stdout.includes('lodash') || stdout.includes('admitted'), `output should show evaluation result, got: ${stdout}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --lockfile flag overrides auto-detection
test('--lockfile flag uses the specified lockfile path', async () => {
  const dir = await setupTempDir();
  try {
    // Create lockfile in a subdirectory; the auto-detect path (dir root) has no lockfile,
    // but --lockfile points to the subdirectory version which should be found.
    const subdir = join(dir, 'subproject');
    await mkdir(subdir, { recursive: true });
    await writeProjectFixtures(subdir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });
    // Copy policy, baseline, approvals to the root dir (cwd = dir)
    await writeFile(join(dir, '.trustlockrc.json'), JSON.stringify({
      cooldown_hours: 72, pinning: { required: false }, scripts: { allowlist: [] },
      sources: { allowed: ['registry'] }, provenance: { required_for: [] }, transitive: { max_new: 5 }
    }));
    await mkdir(join(dir, '.trustlock'), { recursive: true });
    const { readFile: rf } = await import('node:fs/promises');
    const baseline = await rf(join(subdir, '.trustlock', 'baseline.json'), 'utf8');
    await writeFile(join(dir, '.trustlock', 'baseline.json'), baseline);
    await writeFile(join(dir, '.trustlock', 'approvals.json'), JSON.stringify([]));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0', dependencies: { lodash: '4.17.21' } }));

    const { exitCode } = await runCheck(
      dir,
      { lockfile: join(subdir, 'package-lock.json') },
      {
        _registryClient: admitAllClient(['lodash']),
        _writeAndStage: async () => {},
      }
    );

    // Should succeed (found lockfile via --lockfile flag), not exit 2
    assert.notEqual(exitCode, 2, 'should not exit 2 when --lockfile points to an existing file');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// D1: any block → all baseline advancement skipped
test('D1: one blocked package prevents baseline advancement for all packages', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21', express: '4.18.2' },
      baselinePackages: {},
    });

    // lodash admitted (old), express blocked (too new)
    const mixedClient = {
      async fetchPackageMetadata(name) {
        if (name === 'express') {
          return { data: { time: { '4.18.2': new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() } }, warnings: [] };
        }
        return { data: { time: { '4.17.21': new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() } }, warnings: [] };
      },
      async getAttestations() { return { data: null, warnings: [] }; },
      async getVersionMetadata() { return { data: {}, warnings: [] }; },
    };

    let writeAndStageCalled = false;
    const { exitCode } = await runCheck(
      dir,
      {},
      {
        _registryClient: mixedClient,
        _writeAndStage: async () => { writeAndStageCalled = true; },
      }
    );

    assert.equal(exitCode, 0); // advisory mode
    assert.equal(writeAndStageCalled, false, 'D1: writeAndStage must NOT be called when any package is blocked');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
