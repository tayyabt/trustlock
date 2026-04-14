/**
 * Integration tests for `trustlock check --profile` (F14-S2).
 *
 * Uses the `run()` function directly (unit-style injection) with a real temp
 * directory and mocked registry client. Tests cover the full CLI → policy
 * overlay path without spawning a subprocess.
 *
 * Coverage:
 *   AC-strict-cooldown    — --profile strict: cooldown=168h, packages under 168h blocked
 *   AC-strict-warning     — --profile strict: mandatory provenance-all warning in terminal
 *   AC-json-warning       — --profile strict: mandatory warning in JSON warnings[]
 *   AC-relaxed-builtin    — --profile relaxed (built-in): no floor error, cooldown=24h
 *   AC-user-defined       — --profile myprofile (user-defined in .trustlockrc.json): overlay applied
 *   AC-unknown            — --profile unknown: exits 2 with exact error message
 *   AC-floor-violation    — user-defined profile lowering cooldown exits 2 with exact message
 *   AC-user-defined-relaxed — user-defined "relaxed" profile: floor enforcement applies
 *   AC-no-profile         — no --profile flag: base config used, no warning
 *   AC-quiet-no-suppress  — --quiet does not suppress the mandatory terminal warning
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { run } from '../../src/cli/commands/check.js';
import { createBaseline } from '../../src/baseline/manager.js';

// ---------------------------------------------------------------------------
// Helpers (mirrors check.test.js structure for consistency)
// ---------------------------------------------------------------------------

const MANDATORY_WARNING =
  'Warning: ~85-90% of npm packages have no provenance. All packages are required to have provenance under the active profile.';

async function setupTempDir() {
  const dir = join(tmpdir(), `trustlock-profile-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, '.git'), { recursive: true });
  return dir;
}

async function writeProjectFixtures(dir, opts = {}) {
  const {
    policy = {
      cooldown_hours: 72,
      pinning: { required: false },
      scripts: { allowlist: [] },
      sources: { allowed: ['registry'] },
      provenance: { required_for: [] },
      transitive: { max_new: 5 },
    },
    packages = { lodash: '4.17.21' },
    baselinePackages = null,
    approvals = [],
  } = opts;

  await writeFile(join(dir, '.trustlockrc.json'), JSON.stringify(policy));

  const pkgDeps = Object.fromEntries(Object.entries(packages).map(([n, v]) => [n, v]));
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    dependencies: pkgDeps,
  }));

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

  await mkdir(join(dir, '.trustlock'), { recursive: true });

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
  const baseline = createBaseline(
    baselineDeps,
    baselinePackages === null ? lockfileHash : `old-hash-${Date.now()}`
  );
  await writeFile(join(dir, '.trustlock', 'baseline.json'), JSON.stringify(baseline));
  await writeFile(join(dir, '.trustlock', 'approvals.json'), JSON.stringify(approvals));

  return { lockfileHash };
}

/**
 * Registry client where all packages were published N milliseconds ago.
 */
function makeClientPublishedAt(packageNames, version, ageMs) {
  const publishedAt = new Date(Date.now() - ageMs).toISOString();
  return {
    async fetchPackageMetadata(name) {
      if (!packageNames.includes(name)) return { data: null, warnings: [] };
      return { data: { time: { [version]: publishedAt } }, warnings: [] };
    },
    async getAttestations() { return { data: null, warnings: [] }; },
    async getVersionMetadata() { return { data: {}, warnings: [] }; },
  };
}

async function runCheck(dir, argValues = {}, injectOpts = {}) {
  const prevExitCode = process.exitCode;
  process.exitCode = 0;

  const stdout = [];
  const stderr = [];

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { stderr.push(String(chunk)); return true; };

  try {
    await run(
      {
        values: {
          enforce: false,
          json: false,
          sarif: false,
          quiet: false,
          'dry-run': false,
          'no-cache': false,
          ...argValues,
        },
        positionals: ['check'],
      },
      { _cwd: dir, _writeAndStage: async () => {}, ...injectOpts }
    );
  } catch (err) {
    // Simulate index.js main().catch() — floor violations and other uncaught errors
    // are caught here and exit 2 (per F14-S2 story: CLI top-level handler owns this)
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  const exitCode = process.exitCode;
  process.exitCode = prevExitCode;

  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

// ---------------------------------------------------------------------------
// AC-strict-cooldown: packages under 168h cooldown are blocked with --profile strict
// ---------------------------------------------------------------------------

test('strict profile: packages under 168h but above 72h cooldown are blocked', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 100 hours ago — above base 72h, but below strict 168h
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 100 * 60 * 60 * 1000);

    const { exitCode, stdout, stderr } = await runCheck(
      dir,
      { profile: 'strict', enforce: true },
      { _registryClient: client }
    );

    // With enforce: should be blocked (under 168h cooldown)
    assert.equal(exitCode, 1, `expected exit 1 for blocked+enforce, got ${exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`);
    assert.ok(stdout.includes('lodash'), `output must mention lodash, got: ${stdout}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('strict profile: packages above 168h cooldown are admitted', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 200 hours ago — above strict 168h
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { exitCode } = await runCheck(
      dir,
      { profile: 'strict', enforce: true },
      { _registryClient: client }
    );

    assert.equal(exitCode, 0, `expected exit 0 for admitted package, got ${exitCode}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-strict-warning: mandatory provenance-all warning in terminal output
// ---------------------------------------------------------------------------

test('strict profile: mandatory provenance-all warning appears in terminal output', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { stdout } = await runCheck(
      dir,
      { profile: 'strict' },
      { _registryClient: client }
    );

    assert.ok(
      stdout.includes(MANDATORY_WARNING),
      `mandatory warning must appear in terminal output, got: ${stdout}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-json-warning: mandatory warning in JSON warnings[]
// ---------------------------------------------------------------------------

test('strict profile: mandatory warning appears in JSON warnings[]', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { exitCode, stdout } = await runCheck(
      dir,
      { profile: 'strict', json: true },
      { _registryClient: client }
    );

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(parsed.warnings), `JSON output must have warnings array, got: ${stdout}`);
    assert.ok(
      parsed.warnings.some((w) => w.includes('provenance')),
      `warnings[] must include provenance warning, got: ${JSON.stringify(parsed.warnings)}`
    );
    // schema_version must still be 2
    assert.equal(parsed.schema_version, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-relaxed-builtin: --profile relaxed (built-in) lowers cooldown, no floor error
// ---------------------------------------------------------------------------

test('relaxed built-in profile: no floor error and cooldown effective at 24h', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 30 hours ago — under base 72h but above relaxed 24h → should be admitted
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 30 * 60 * 60 * 1000);

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'relaxed', enforce: true },
      { _registryClient: client }
    );

    // No floor error (relaxed is built-in, C11 exception)
    assert.ok(
      !stderr.includes('floor') && !stderr.includes('minimum'),
      `must not have floor error, stderr: ${stderr}`
    );
    // Admitted (30h > 24h relaxed cooldown)
    assert.equal(exitCode, 0, `expected exit 0 for package above 24h relaxed cooldown, got ${exitCode}\nstderr: ${stderr}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('relaxed built-in profile: packages under 24h cooldown are blocked', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 1 hour ago — under relaxed 24h
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 1 * 60 * 60 * 1000);

    const { exitCode } = await runCheck(
      dir,
      { profile: 'relaxed', enforce: true },
      { _registryClient: client }
    );

    assert.equal(exitCode, 1, `expected exit 1 for package under 24h with relaxed+enforce, got ${exitCode}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-user-defined: user-defined profile in .trustlockrc.json applies overlay
// ---------------------------------------------------------------------------

test('user-defined profile: overlay applied (tighter cooldown)', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
        profiles: {
          myprofile: { cooldown_hours: 168 },
        },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 100 hours ago — passes 72h base but fails 168h user-defined
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 100 * 60 * 60 * 1000);

    const { exitCode } = await runCheck(
      dir,
      { profile: 'myprofile', enforce: true },
      { _registryClient: client }
    );

    assert.equal(exitCode, 1, `expected exit 1 for package blocked by user-defined profile cooldown`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-unknown: --profile unknown → exits 2 with exact message
// ---------------------------------------------------------------------------

test('unknown profile: exits 2 with exact error message', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'unknownprofile' },
      { _registryClient: makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000) }
    );

    assert.equal(exitCode, 2, `expected exit 2 for unknown profile, got ${exitCode}`);
    assert.ok(
      stderr.includes('Profile "unknownprofile" not found in .trustlockrc.json or built-in profiles.'),
      `must include exact error message, got: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-floor-violation: user-defined profile lowering cooldown → exits 2 (C11)
// ---------------------------------------------------------------------------

test('floor violation: user-defined profile lowering cooldown exits 2 with exact message', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
        profiles: {
          loose: { cooldown_hours: 24 },  // below base 72h → floor violation
        },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'loose' },
      { _registryClient: makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000) }
    );

    assert.equal(exitCode, 2, `expected exit 2 for floor violation, got ${exitCode}`);
    assert.ok(
      stderr.includes('Profile "loose" sets cooldown_hours=24, below base config minimum of 72'),
      `must include floor violation message, got: ${stderr}`
    );
    assert.ok(
      stderr.includes('Profiles can only tighten policy, not loosen it.'),
      `must include "tighten policy" message, got: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-user-defined-relaxed: user-defined "relaxed" profile → floor enforcement applies
// ---------------------------------------------------------------------------

test('user-defined profile named "relaxed": floor enforcement applies (not treated as built-in)', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
        profiles: {
          relaxed: { cooldown_hours: 24 },  // user-defined "relaxed" — floor enforcement applies
        },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'relaxed' },
      { _registryClient: makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000) }
    );

    // User-defined relaxed below base cooldown → floor error, not the built-in exception
    assert.equal(exitCode, 2, `expected exit 2 for user-defined relaxed floor violation, got ${exitCode}`);
    assert.ok(
      stderr.includes('Profiles can only tighten policy'),
      `must include floor violation message, got: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('user-defined profile named "relaxed" above base cooldown: no floor error', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
        profiles: {
          relaxed: { cooldown_hours: 168 },  // user-defined "relaxed" above base → no floor error
        },
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 200 hours ago — above user-defined relaxed 168h
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'relaxed', enforce: true },
      { _registryClient: client }
    );

    // No floor error; user-defined relaxed with higher cooldown is valid
    assert.ok(
      !stderr.includes('Profiles can only tighten policy'),
      `must not have floor error, got: ${stderr}`
    );
    assert.equal(exitCode, 0, `expected exit 0 for valid user-defined relaxed profile, got ${exitCode}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-no-profile: no --profile flag → base config used, no warning
// ---------------------------------------------------------------------------

test('no --profile flag: base config used, no mandatory warning in output', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 200 hours ago — admitted under base config
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { exitCode, stdout, stderr } = await runCheck(
      dir,
      {},  // no profile
      { _registryClient: client }
    );

    assert.equal(exitCode, 0);
    assert.ok(
      !stdout.includes('provenance') && !stdout.includes('Warning:'),
      `no profile-related warning must appear without --profile, got: ${stdout}`
    );
    assert.ok(
      !stderr.includes('Profile'),
      `no profile error must appear without --profile, got: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC-quiet-no-suppress: --quiet does NOT suppress the mandatory terminal warning
// ---------------------------------------------------------------------------

test('--quiet does not suppress the mandatory provenance-all warning', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { stdout } = await runCheck(
      dir,
      { profile: 'strict', quiet: true },
      { _registryClient: client }
    );

    // --quiet suppresses results but the mandatory warning must still appear
    assert.ok(
      stdout.includes(MANDATORY_WARNING),
      `mandatory warning must appear even with --quiet, got stdout: ${stdout}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Profiles map absent: built-in profiles still work
// ---------------------------------------------------------------------------

test('profiles key absent from .trustlockrc.json: built-in profiles still available', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
        // No "profiles" key
      },
      packages: { lodash: '4.17.21' },
      baselinePackages: {},
    });

    // Published 200 hours ago — above strict 168h
    const client = makeClientPublishedAt(['lodash'], '4.17.21', 200 * 60 * 60 * 1000);

    const { exitCode, stderr } = await runCheck(
      dir,
      { profile: 'strict' },
      { _registryClient: client }
    );

    // Built-in strict must be available even without profiles key in .trustlockrc.json
    assert.notEqual(exitCode, 2, `expected no exit 2 (profile found), stderr: ${stderr}`);
    assert.ok(
      !stderr.includes('not found in .trustlockrc.json or built-in profiles'),
      `must not be unknown, got: ${stderr}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// C-NEW-2: check.js calls applyProfileOverlay from builtin-profiles.js only
// (Structural check: verified by code inspection, tested here via correct behavior)
// ---------------------------------------------------------------------------

test('C-NEW-2: applyProfileOverlay from builtin-profiles.js drives the overlay (strict end-to-end)', async () => {
  const dir = await setupTempDir();
  try {
    await writeProjectFixtures(dir, {
      policy: {
        cooldown_hours: 72,
        pinning: { required: false },
        scripts: { allowlist: [] },
        sources: { allowed: ['registry'] },
        provenance: { required_for: [] },
        transitive: { max_new: 5 },
      },
      packages: { testpkg: '1.0.0' },
      baselinePackages: {},
    });

    // Published 100 hours ago — passes 72h, fails 168h (strict)
    const client = makeClientPublishedAt(['testpkg'], '1.0.0', 100 * 60 * 60 * 1000);

    // Without profile: admitted (100h > 72h base)
    const { exitCode: exitNoProfile } = await runCheck(
      dir,
      { enforce: true },
      { _registryClient: client }
    );
    assert.equal(exitNoProfile, 0, 'without profile, package should be admitted (100h > 72h)');

    // With strict profile: blocked (100h < 168h)
    const { exitCode: exitStrict, stdout } = await runCheck(
      dir,
      { profile: 'strict', enforce: true },
      { _registryClient: client }
    );
    assert.equal(exitStrict, 1, 'with strict profile, package should be blocked (100h < 168h)');
    // Mandatory warning must also be present
    assert.ok(stdout.includes(MANDATORY_WARNING), 'mandatory warning must appear with strict profile');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
