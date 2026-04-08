import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBaseline, readBaseline } from '../../src/baseline/manager.js';

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
  const dir = join(tmpdir(), `dep-fence-test-${process.pid}-${Date.now()}`);
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
  const result = await readBaseline('/tmp/__dep-fence-nonexistent-baseline.json');
  assert.deepEqual(result, { error: 'not_initialized' });
});

// AC5: corrupted JSON → { error: "corrupted" }
test('readBaseline returns { error: "corrupted" } for a file with invalid JSON', async (t) => {
  const dir = join(tmpdir(), `dep-fence-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const filePath = join(dir, 'baseline.json');
  await writeFile(filePath, '{ this is not valid json !!!', 'utf8');

  const result = await readBaseline(filePath);
  assert.deepEqual(result, { error: 'corrupted' });
});

// AC6: wrong schema_version → { error: "unsupported_schema", version: N }
test('readBaseline returns { error: "unsupported_schema", version } for unknown schema_version', async (t) => {
  const dir = join(tmpdir(), `dep-fence-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const filePath = join(dir, 'baseline.json');
  const futureBaseline = { schema_version: 2, created_at: new Date().toISOString(), lockfile_hash: FAKE_HASH, packages: {} };
  await writeFile(filePath, JSON.stringify(futureBaseline), 'utf8');

  const result = await readBaseline(filePath);
  assert.deepEqual(result, { error: 'unsupported_schema', version: 2 });
});
