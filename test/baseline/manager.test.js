import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseline, readBaseline, advanceBaseline, writeAndStage } from '../../src/baseline/manager.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDep(overrides = {}) {
  return {
    name: 'lodash',
    version: '4.17.21',
    resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
    integrity: 'sha512-abc==',
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
    ...overrides,
  };
}

const FAKE_HASH = 'a'.repeat(64);

// ---------------------------------------------------------------------------
// createBaseline — AC1: returns Baseline with schema_version, created_at, lockfile_hash, packages
// ---------------------------------------------------------------------------

test('createBaseline returns a Baseline with required top-level fields', () => {
  const deps = [makeDep()];
  const baseline = createBaseline(deps, FAKE_HASH);

  assert.equal(baseline.schema_version, 1);
  assert.ok(typeof baseline.created_at === 'string', 'created_at must be a string');
  assert.ok(baseline.created_at.endsWith('Z'), 'created_at must be UTC ISO 8601');
  assert.equal(baseline.lockfile_hash, FAKE_HASH);
  assert.ok(baseline.packages != null && typeof baseline.packages === 'object', 'packages must be an object');
});

// AC2: each package entry is a TrustProfile with all 6 fields
test('createBaseline produces TrustProfile entries with all required fields', () => {
  const dep = makeDep({ name: 'express', version: '4.18.2', hasInstallScripts: true, sourceType: 'registry' });
  const baseline = createBaseline([dep], FAKE_HASH);
  const profile = baseline.packages['express'];

  assert.ok(profile != null, 'package entry must exist');
  assert.equal(profile.name, 'express');
  assert.equal(profile.version, '4.18.2');
  assert.ok(typeof profile.admittedAt === 'string', 'admittedAt must be a string');
  assert.ok(profile.admittedAt.endsWith('Z'), 'admittedAt must be UTC ISO 8601');
  assert.equal(profile.provenanceStatus, 'unknown');
  assert.equal(profile.hasInstallScripts, true);
  assert.equal(profile.sourceType, 'registry');
});

test('createBaseline keys packages map by package name for O(1) lookup', () => {
  const deps = [
    makeDep({ name: 'lodash', version: '4.17.21' }),
    makeDep({ name: 'chalk', version: '5.3.0' }),
  ];
  const baseline = createBaseline(deps, FAKE_HASH);

  assert.ok('lodash' in baseline.packages, 'lodash must be in packages');
  assert.ok('chalk' in baseline.packages, 'chalk must be in packages');
  assert.equal(Object.keys(baseline.packages).length, 2);
});

test('createBaseline handles null hasInstallScripts (v1/v2 lockfile)', () => {
  const dep = makeDep({ hasInstallScripts: null });
  const baseline = createBaseline([dep], FAKE_HASH);
  assert.equal(baseline.packages['lodash'].hasInstallScripts, null);
});

// Edge case: empty dependency list
test('createBaseline with empty dependency list returns valid Baseline with empty packages map', () => {
  const baseline = createBaseline([], FAKE_HASH);
  assert.equal(baseline.schema_version, 1);
  assert.deepEqual(baseline.packages, {});
});

// ---------------------------------------------------------------------------
// readBaseline — AC3: valid round-trip
// ---------------------------------------------------------------------------

test('readBaseline returns the Baseline object for a valid file (round-trip)', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const deps = [makeDep()];
  const baseline = createBaseline(deps, FAKE_HASH);
  const filePath = join(dir, 'baseline.json');
  await writeFile(filePath, JSON.stringify(baseline), 'utf8');

  const result = await readBaseline(filePath);
  assert.ok(!result.error, 'should not return an error');
  assert.equal(result.schema_version, 1);
  assert.equal(result.lockfile_hash, FAKE_HASH);
  assert.ok('lodash' in result.packages, 'packages must contain lodash');
  assert.equal(result.packages.lodash.version, '4.17.21');
});

// AC4: missing file → { error: "not_initialized" }
test('readBaseline returns { error: "not_initialized" } when file does not exist', async () => {
  const result = await readBaseline('/tmp/__trustlock-nonexistent-baseline.json');
  assert.deepEqual(result, { error: 'not_initialized' });
});

// AC5: corrupted JSON → { error: "corrupted" }
test('readBaseline returns { error: "corrupted" } for a file with invalid JSON', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const filePath = join(dir, 'baseline.json');
  await writeFile(filePath, '{ this is not valid json !!!', 'utf8');

  const result = await readBaseline(filePath);
  assert.deepEqual(result, { error: 'corrupted' });
});

// AC6: wrong schema_version → { error: "unsupported_schema", version: N }
test('readBaseline returns { error: "unsupported_schema", version } for unknown schema_version', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const filePath = join(dir, 'baseline.json');
  const futureBaseline = { schema_version: 2, created_at: new Date().toISOString(), lockfile_hash: FAKE_HASH, packages: {} };
  await writeFile(filePath, JSON.stringify(futureBaseline), 'utf8');

  const result = await readBaseline(filePath);
  assert.deepEqual(result, { error: 'unsupported_schema', version: 2 });
});

// ---------------------------------------------------------------------------
// advanceBaseline — AC1–AC4
// ---------------------------------------------------------------------------

// AC1: returns Baseline with merged packages, updated lockfile_hash, updated_at
test('advanceBaseline returns updated baseline with new lockfile_hash and updated_at', () => {
  const baseline = createBaseline([makeDep({ name: 'lodash', version: '4.17.21' })], FAKE_HASH);
  const newHash = 'b'.repeat(64);
  const newDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];

  const advanced = advanceBaseline(baseline, newDeps, newHash);

  assert.equal(advanced.schema_version, 1);
  assert.equal(advanced.created_at, baseline.created_at);
  assert.ok(typeof advanced.updated_at === 'string', 'updated_at must be a string');
  assert.ok(advanced.updated_at.endsWith('Z'), 'updated_at must be UTC ISO 8601');
  assert.equal(advanced.lockfile_hash, newHash);
  assert.ok(advanced.packages != null && typeof advanced.packages === 'object');
});

// AC2: newly admitted packages get fresh TrustProfile with current admittedAt
test('advanceBaseline gives newly admitted packages a fresh TrustProfile', () => {
  const baseline = createBaseline([], FAKE_HASH);
  const newDeps = [makeDep({ name: 'express', version: '4.18.2', sourceType: 'registry', hasInstallScripts: true })];

  const advanced = advanceBaseline(baseline, newDeps, FAKE_HASH);
  const profile = advanced.packages['express'];

  assert.ok(profile != null, 'express must be in advanced packages');
  assert.equal(profile.name, 'express');
  assert.equal(profile.version, '4.18.2');
  assert.ok(typeof profile.admittedAt === 'string');
  assert.ok(profile.admittedAt.endsWith('Z'));
  assert.equal(profile.provenanceStatus, 'unknown');
  assert.equal(profile.hasInstallScripts, true);
  assert.equal(profile.sourceType, 'registry');
});

// AC3: packages in old baseline not in admittedDeps are silently dropped (D3)
test('advanceBaseline drops packages absent from admittedDeps', () => {
  const baseline = createBaseline([
    makeDep({ name: 'lodash', version: '4.17.21' }),
    makeDep({ name: 'chalk', version: '5.3.0' }),
  ], FAKE_HASH);

  // Only lodash in new dep set — chalk was removed from lockfile
  const newDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];
  const advanced = advanceBaseline(baseline, newDeps, FAKE_HASH);

  assert.ok('lodash' in advanced.packages, 'lodash must be retained');
  assert.ok(!('chalk' in advanced.packages), 'chalk must be dropped');
  assert.equal(Object.keys(advanced.packages).length, 1);
});

// Edge case of AC3: all packages removed → empty packages map
test('advanceBaseline with empty admittedDeps produces empty packages map', () => {
  const baseline = createBaseline([makeDep()], FAKE_HASH);
  const advanced = advanceBaseline(baseline, [], FAKE_HASH);
  assert.deepEqual(advanced.packages, {});
});

// AC4: unchanged packages (same name+version) retain original TrustProfile
test('advanceBaseline retains original TrustProfile for unchanged packages', () => {
  const deps = [makeDep({ name: 'lodash', version: '4.17.21' })];
  const baseline = createBaseline(deps, FAKE_HASH);
  const originalProfile = baseline.packages['lodash'];

  // Advance with same dep — same name + same version
  const advanced = advanceBaseline(baseline, deps, 'c'.repeat(64));

  assert.deepEqual(advanced.packages['lodash'], originalProfile,
    'unchanged package must retain its original TrustProfile');
});

// Version changed → fresh TrustProfile (admittedAt overwritten, old one discarded)
test('advanceBaseline replaces TrustProfile when version changes', () => {
  const baseline = createBaseline([makeDep({ name: 'lodash', version: '4.17.20' })], FAKE_HASH);
  const oldProfile = baseline.packages['lodash'];

  const newDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];
  const advanced = advanceBaseline(baseline, newDeps, FAKE_HASH);
  const newProfile = advanced.packages['lodash'];

  assert.equal(newProfile.version, '4.17.21');
  // admittedAt must be a fresh timestamp (not the same object as old)
  assert.notDeepEqual(newProfile, oldProfile, 'changed-version package must get fresh TrustProfile');
});

// AC1 extended: schema_version and created_at are preserved from old baseline
test('advanceBaseline preserves schema_version and created_at from old baseline', () => {
  const baseline = createBaseline([makeDep()], FAKE_HASH);
  const advanced = advanceBaseline(baseline, [makeDep()], FAKE_HASH);

  assert.equal(advanced.schema_version, baseline.schema_version);
  assert.equal(advanced.created_at, baseline.created_at);
});

// ---------------------------------------------------------------------------
// writeAndStage — AC5, AC6
// ---------------------------------------------------------------------------

// AC5: writes JSON to disk and calls gitAdd with '.trustlock/baseline.json'
test('writeAndStage writes JSON to disk and calls gitAdd', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const baseline = createBaseline([makeDep()], FAKE_HASH);
  const baselinePath = join(dir, 'baseline.json');

  let gitAddCalledWith = null;
  const mockGitAdd = (path) => { gitAddCalledWith = path; };

  await writeAndStage(baseline, baselinePath, { _gitAdd: mockGitAdd });

  // File must exist and contain valid JSON matching the baseline
  const content = await readFile(baselinePath, 'utf8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.schema_version, 1);
  assert.equal(parsed.lockfile_hash, FAKE_HASH);
  assert.ok('lodash' in parsed.packages);

  // JSON must be 2-space indented
  assert.ok(content.includes('  "schema_version"'), 'JSON must use 2-space indentation');

  // gitAdd must be called with the hardcoded baseline path
  assert.equal(gitAddCalledWith, '.trustlock/baseline.json');
});

// AC6: if gitAdd fails, logs warning to stderr and does not throw
test('writeAndStage logs warning when gitAdd fails and does not throw', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const baseline = createBaseline([makeDep()], FAKE_HASH);
  const baselinePath = join(dir, 'baseline.json');

  const mockGitAdd = () => { throw new Error('not a git repository'); };

  // Capture stderr
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return origWrite(chunk, ...rest);
  };

  try {
    await writeAndStage(baseline, baselinePath, { _gitAdd: mockGitAdd });
  } finally {
    process.stderr.write = origWrite;
  }

  // Must not throw — reaching here proves no exception escaped
  const content = await readFile(baselinePath, 'utf8');
  assert.ok(content.length > 0, 'baseline file must still be written even when gitAdd fails');

  const warning = stderrChunks.join('');
  assert.ok(warning.includes('Warning'), `stderr must include "Warning", got: ${warning}`);
});
