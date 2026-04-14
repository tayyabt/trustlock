import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta } from '../../src/baseline/diff.js';

// ---------------------------------------------------------------------------
// Helpers
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

function makeProfile(overrides = {}) {
  return {
    name: 'lodash',
    version: '4.17.21',
    admittedAt: '2026-04-08T00:00:00.000Z',
    provenanceStatus: 'unknown',
    hasInstallScripts: false,
    sourceType: 'registry',
    ...overrides,
  };
}

function makeBaseline(packages = {}, lockfileHash = 'hash-a') {
  return {
    schema_version: 1,
    created_at: '2026-04-08T00:00:00.000Z',
    lockfile_hash: lockfileHash,
    packages,
  };
}

// ---------------------------------------------------------------------------
// AC1: return shape — all five fields present
// ---------------------------------------------------------------------------

test('computeDelta returns a DependencyDelta with all five required fields', () => {
  const baseline = makeBaseline({});
  const result = computeDelta(baseline, [], 'hash-different');

  assert.ok('added' in result, 'must have added');
  assert.ok('removed' in result, 'must have removed');
  assert.ok('changed' in result, 'must have changed');
  assert.ok('unchanged' in result, 'must have unchanged');
  assert.ok('shortCircuited' in result, 'must have shortCircuited');
  assert.ok(Array.isArray(result.added), 'added must be an array');
  assert.ok(Array.isArray(result.removed), 'removed must be an array');
  assert.ok(Array.isArray(result.changed), 'changed must be an array');
  assert.ok(Array.isArray(result.unchanged), 'unchanged must be an array');
  assert.ok(typeof result.shortCircuited === 'boolean', 'shortCircuited must be boolean');
});

// ---------------------------------------------------------------------------
// AC2: lockfile_hash match → short-circuit
// ---------------------------------------------------------------------------

test('computeDelta short-circuits when hashes match — returns all packages as unchanged', () => {
  const HASH = 'abc123';
  const baseline = makeBaseline(
    {
      lodash: makeProfile({ name: 'lodash', version: '4.17.21' }),
      chalk: makeProfile({ name: 'chalk', version: '5.3.0' }),
    },
    HASH
  );
  // Pass different currentDeps to prove they are ignored on hash match.
  const result = computeDelta(baseline, [], HASH);

  assert.equal(result.shortCircuited, true);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.changed, []);
  // unchanged must include all baseline package names.
  const unchangedSet = new Set(result.unchanged);
  assert.ok(unchangedSet.has('lodash'), 'lodash must be in unchanged');
  assert.ok(unchangedSet.has('chalk'), 'chalk must be in unchanged');
  assert.equal(result.unchanged.length, 2);
});

test('computeDelta short-circuit returns shortCircuited: false when hashes differ', () => {
  const baseline = makeBaseline({}, 'hash-a');
  const result = computeDelta(baseline, [], 'hash-b');
  assert.equal(result.shortCircuited, false);
});

// ---------------------------------------------------------------------------
// AC3: added — new packages (in lockfile, not in baseline)
// ---------------------------------------------------------------------------

test('computeDelta classifies all deps as added when baseline.packages is empty', () => {
  const baseline = makeBaseline({}, 'hash-old');
  const currentDeps = [
    makeDep({ name: 'lodash', version: '4.17.21' }),
    makeDep({ name: 'chalk', version: '5.3.0' }),
  ];

  const result = computeDelta(baseline, currentDeps, 'hash-new');

  assert.equal(result.added.length, 2);
  assert.equal(result.removed.length, 0);
  assert.equal(result.changed.length, 0);
  assert.equal(result.unchanged.length, 0);
  assert.equal(result.shortCircuited, false);

  const addedNames = result.added.map((d) => d.name);
  assert.ok(addedNames.includes('lodash'), 'lodash must be in added');
  assert.ok(addedNames.includes('chalk'), 'chalk must be in added');
});

test('computeDelta added entry contains full ResolvedDependency data', () => {
  const baseline = makeBaseline({}, 'hash-old');
  const dep = makeDep({ name: 'express', version: '4.18.2', isDev: false, sourceType: 'registry' });

  const result = computeDelta(baseline, [dep], 'hash-new');

  assert.equal(result.added.length, 1);
  const added = result.added[0];
  assert.equal(added.name, 'express');
  assert.equal(added.version, '4.18.2');
  assert.equal(added.sourceType, 'registry');
});

// ---------------------------------------------------------------------------
// AC4: removed — packages in baseline but not in current lockfile
// ---------------------------------------------------------------------------

test('computeDelta classifies all baseline packages as removed when currentDeps is empty', () => {
  const baseline = makeBaseline(
    {
      lodash: makeProfile({ name: 'lodash' }),
      chalk: makeProfile({ name: 'chalk' }),
    },
    'hash-old'
  );

  const result = computeDelta(baseline, [], 'hash-new');

  assert.equal(result.removed.length, 2);
  assert.equal(result.added.length, 0);
  assert.equal(result.changed.length, 0);
  assert.equal(result.unchanged.length, 0);

  const removedSet = new Set(result.removed);
  assert.ok(removedSet.has('lodash'), 'lodash must be in removed');
  assert.ok(removedSet.has('chalk'), 'chalk must be in removed');
});

test('computeDelta removed entries are package names (strings), not objects', () => {
  const baseline = makeBaseline(
    { lodash: makeProfile({ name: 'lodash' }) },
    'hash-old'
  );

  const result = computeDelta(baseline, [], 'hash-new');

  assert.equal(typeof result.removed[0], 'string');
  assert.equal(result.removed[0], 'lodash');
});

// ---------------------------------------------------------------------------
// AC5: changed — version-changed packages, not treated as removed+added
// ---------------------------------------------------------------------------

test('computeDelta classifies version-changed package as changed, not removed+added', () => {
  const oldProfile = makeProfile({ name: 'lodash', version: '4.17.20' });
  const baseline = makeBaseline({ lodash: oldProfile }, 'hash-old');
  const currentDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];

  const result = computeDelta(baseline, currentDeps, 'hash-new');

  assert.equal(result.added.length, 0, 'should not be in added');
  assert.equal(result.removed.length, 0, 'should not be in removed');
  assert.equal(result.changed.length, 1);
  assert.equal(result.unchanged.length, 0);

  const entry = result.changed[0];
  assert.equal(entry.dep.name, 'lodash');
  assert.equal(entry.dep.version, '4.17.21', 'dep must have new version');
  assert.equal(entry.previousProfile.version, '4.17.20', 'previousProfile must have old version');
});

test('computeDelta changed entry contains full ResolvedDependency and previousProfile', () => {
  const oldProfile = makeProfile({ name: 'express', version: '4.17.0', provenanceStatus: 'verified' });
  const baseline = makeBaseline({ express: oldProfile }, 'hash-old');
  const newDep = makeDep({ name: 'express', version: '4.18.2', sourceType: 'registry' });

  const result = computeDelta(baseline, [newDep], 'hash-new');

  const entry = result.changed[0];
  assert.equal(entry.dep.version, '4.18.2');
  assert.equal(entry.dep.sourceType, 'registry');
  assert.equal(entry.previousProfile.version, '4.17.0');
  assert.equal(entry.previousProfile.provenanceStatus, 'verified');
});

// ---------------------------------------------------------------------------
// AC6: unchanged — same name + same version → package name in unchanged
// ---------------------------------------------------------------------------

test('computeDelta classifies same-version packages as unchanged (returns names)', () => {
  const profile = makeProfile({ name: 'lodash', version: '4.17.21' });
  const baseline = makeBaseline({ lodash: profile }, 'hash-old');
  const currentDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];

  const result = computeDelta(baseline, currentDeps, 'hash-new');

  assert.equal(result.unchanged.length, 1);
  assert.equal(result.unchanged[0], 'lodash');
  assert.equal(result.added.length, 0);
  assert.equal(result.removed.length, 0);
  assert.equal(result.changed.length, 0);
  assert.equal(result.shortCircuited, false);
});

// ---------------------------------------------------------------------------
// AC7: mixed changes — combination of all categories
// ---------------------------------------------------------------------------

test('computeDelta correctly classifies a mixed set of added, removed, changed, and unchanged', () => {
  const baseline = makeBaseline(
    {
      lodash: makeProfile({ name: 'lodash', version: '4.17.20' }),   // will be changed
      chalk: makeProfile({ name: 'chalk', version: '5.3.0' }),        // will be unchanged
      rimraf: makeProfile({ name: 'rimraf', version: '3.0.2' }),      // will be removed
    },
    'hash-old'
  );

  const currentDeps = [
    makeDep({ name: 'lodash', version: '4.17.21' }),    // changed (version bump)
    makeDep({ name: 'chalk', version: '5.3.0' }),        // unchanged
    makeDep({ name: 'express', version: '4.18.2' }),     // added (new)
  ];

  const result = computeDelta(baseline, currentDeps, 'hash-new');

  assert.equal(result.shortCircuited, false);

  // added
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].name, 'express');

  // removed
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0], 'rimraf');

  // changed
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].dep.name, 'lodash');
  assert.equal(result.changed[0].dep.version, '4.17.21');
  assert.equal(result.changed[0].previousProfile.version, '4.17.20');

  // unchanged
  assert.equal(result.unchanged.length, 1);
  assert.equal(result.unchanged[0], 'chalk');
});

// ---------------------------------------------------------------------------
// Edge case: first run after init — hash match, all unchanged
// ---------------------------------------------------------------------------

test('computeDelta on first check after init returns hash short-circuit with all packages unchanged', () => {
  const HASH = 'init-hash-xyz';
  const baseline = makeBaseline(
    {
      lodash: makeProfile({ name: 'lodash', version: '4.17.21' }),
    },
    HASH
  );
  const currentDeps = [makeDep({ name: 'lodash', version: '4.17.21' })];

  const result = computeDelta(baseline, currentDeps, HASH);

  assert.equal(result.shortCircuited, true);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.unchanged, ['lodash']);
});
