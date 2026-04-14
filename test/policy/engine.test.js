import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/policy/engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDep(overrides = {}) {
  return {
    name: 'lodash',
    version: '4.17.21',
    resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
    integrity: 'sha512-test',
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
    ...overrides,
  };
}

function makePreviousProfile(overrides = {}) {
  return {
    name: 'lodash',
    version: '4.17.0',
    admittedAt: '2024-01-01T00:00:00.000Z',
    provenanceStatus: 'unverified',
    hasInstallScripts: false,
    sourceType: 'registry',
    ...overrides,
  };
}

function makeBaseline(packages = {}) {
  return {
    schema_version: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    lockfile_hash: 'abc123',
    packages,
  };
}

function makePolicy(overrides = {}) {
  return {
    cooldown_hours: 0, // 0 hours so existing packages pass cooldown in tests
    pinning: { required: false },
    scripts: { allowlist: [] },
    sources: { allowed: ['registry'] },
    provenance: { required_for: [] },
    transitive: { max_new: 5 },
    ...overrides,
  };
}

function makeMetadata(overrides = {}) {
  return {
    publishedAt: '2020-01-01T00:00:00.000Z', // old enough for default cooldown
    hasProvenance: false,
    warnings: [],
    ...overrides,
  };
}

function makeApproval(packageName, version, overrides, expiresInMs = 3600_000) {
  const now = new Date();
  return {
    package: packageName,
    version,
    overrides,
    reason: 'test',
    approver: 'tester',
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + expiresInMs).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AC: Empty delta short-circuit
// ---------------------------------------------------------------------------

test('evaluate: empty delta returns {results: [], allAdmitted: true} immediately', async () => {
  const delta = { added: [], changed: [], removed: [], unchanged: [], shortCircuited: false };
  const result = await evaluate(delta, makePolicy(), makeBaseline(), [], new Map());
  assert.deepEqual(result, { results: [], allAdmitted: true });
});

test('evaluate: short-circuited delta also returns empty results', async () => {
  const delta = { added: [], changed: [], removed: [], unchanged: ['lodash'], shortCircuited: true };
  const result = await evaluate(delta, makePolicy(), makeBaseline(), [], new Map());
  assert.deepEqual(result, { results: [], allAdmitted: true });
});

// ---------------------------------------------------------------------------
// AC: all-admitted scenario
// ---------------------------------------------------------------------------

test('evaluate: single changed dependency with no findings → admitted + allAdmitted: true', async () => {
  const dep = makeDep();
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const metadataMap = new Map([['lodash', makeMetadata()]]);
  const policy = makePolicy();

  const { results, allAdmitted } = await evaluate(delta, policy, makeBaseline(), [], metadataMap);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'lodash');
  assert.equal(results[0].checkResult.decision, 'admitted');
  assert.equal(allAdmitted, true);
});

// ---------------------------------------------------------------------------
// AC: blocked scenario + allAdmitted: false
// ---------------------------------------------------------------------------

test('evaluate: cooldown violation → blocked + allAdmitted: false', async () => {
  const dep = makeDep({ version: '4.17.21' });
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago

  const metadataMap = new Map([['lodash', makeMetadata({ publishedAt: recentPublish })]]);
  const policy = makePolicy({ cooldown_hours: 72 });

  const { results, allAdmitted } = await evaluate(delta, policy, makeBaseline(), [], metadataMap);

  assert.equal(results.length, 1);
  assert.equal(results[0].checkResult.decision, 'blocked');
  assert.equal(allAdmitted, false);
});

test('evaluate: one blocked + one admitted → allAdmitted: false', async () => {
  const dep1 = makeDep({ name: 'lodash', version: '4.17.21' });
  const dep2 = makeDep({ name: 'express', version: '4.18.2' });

  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  const delta = {
    added: [],
    changed: [
      { dep: dep1, previousProfile: makePreviousProfile({ name: 'lodash' }) },
      { dep: dep2, previousProfile: makePreviousProfile({ name: 'express' }) },
    ],
    removed: [],
    unchanged: [],
    shortCircuited: false,
  };

  const metadataMap = new Map([
    ['lodash', makeMetadata({ publishedAt: recentPublish })], // too new → blocked
    ['express', makeMetadata()],                              // old enough → admitted
  ]);

  const { results, allAdmitted } = await evaluate(delta, makePolicy({ cooldown_hours: 72 }), makeBaseline(), [], metadataMap);

  assert.equal(results.length, 2);
  const lodashResult = results.find((r) => r.name === 'lodash');
  const expressResult = results.find((r) => r.name === 'express');

  assert.equal(lodashResult.checkResult.decision, 'blocked');
  assert.equal(expressResult.checkResult.decision, 'admitted');
  assert.equal(allAdmitted, false);
});

// ---------------------------------------------------------------------------
// AC: approval intersection — blocked → admitted_with_approval
// ---------------------------------------------------------------------------

test('evaluate: valid approval flips blocked → admitted_with_approval', async () => {
  const dep = makeDep();
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const metadataMap = new Map([['lodash', makeMetadata({ publishedAt: recentPublish })]]);
  const policy = makePolicy({ cooldown_hours: 72 });
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown'])];

  const { results, allAdmitted } = await evaluate(delta, policy, makeBaseline(), approvals, metadataMap);

  assert.equal(results[0].checkResult.decision, 'admitted_with_approval');
  assert.equal(allAdmitted, true);
});

test('evaluate: partial approval coverage stays blocked', async () => {
  const dep = makeDep({ hasInstallScripts: true }); // will trigger scripts rule
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const metadataMap = new Map([['lodash', makeMetadata({ publishedAt: recentPublish })]]);
  const policy = makePolicy({ cooldown_hours: 72 }); // both cooldown and scripts block

  // Only covers cooldown, not scripts
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown'])];

  const { results, allAdmitted } = await evaluate(delta, policy, makeBaseline(), approvals, metadataMap);

  assert.equal(results[0].checkResult.decision, 'blocked');
  assert.equal(allAdmitted, false);
});

// ---------------------------------------------------------------------------
// AC: approvalCommand for blocked packages
// ---------------------------------------------------------------------------

test('evaluate: blocked result includes approvalCommand with correct package and rule', async () => {
  const dep = makeDep();
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const metadataMap = new Map([['lodash', makeMetadata({ publishedAt: recentPublish })]]);
  const policy = makePolicy({ cooldown_hours: 72 });

  const { results } = await evaluate(delta, policy, makeBaseline(), [], metadataMap);

  assert.equal(results[0].checkResult.decision, 'blocked');
  assert.ok(
    results[0].checkResult.approvalCommand != null,
    'approvalCommand should not be null for blocked package'
  );
  assert.ok(
    results[0].checkResult.approvalCommand.includes('trustlock approve'),
    `expected trustlock approve in: ${results[0].checkResult.approvalCommand}`
  );
  assert.ok(
    results[0].checkResult.approvalCommand.includes('lodash@4.17.21'),
    `expected lodash@4.17.21 in: ${results[0].checkResult.approvalCommand}`
  );
  assert.ok(
    results[0].checkResult.approvalCommand.includes('--override cooldown'),
    `expected --override cooldown in: ${results[0].checkResult.approvalCommand}`
  );
});

test('evaluate: admitted result has approvalCommand = null', async () => {
  const dep = makeDep();
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const metadataMap = new Map([['lodash', makeMetadata()]]);
  const { results } = await evaluate(delta, makePolicy(), makeBaseline(), [], metadataMap);

  assert.equal(results[0].checkResult.approvalCommand, null);
});

// ---------------------------------------------------------------------------
// AC: warning-only findings don't cause blocked
// ---------------------------------------------------------------------------

test('evaluate: new dependency (delta.added) produces warn finding but not blocked', async () => {
  const dep = makeDep({ name: 'newpkg', version: '1.0.0' });
  const delta = {
    added: [dep],
    changed: [],
    removed: [],
    unchanged: [],
    shortCircuited: false,
  };

  const metadataMap = new Map([['newpkg', makeMetadata()]]);
  const { results, allAdmitted } = await evaluate(delta, makePolicy(), makeBaseline(), [], metadataMap);

  assert.equal(results.length, 1);
  assert.equal(results[0].checkResult.decision, 'admitted');
  assert.equal(allAdmitted, true);

  const warnFindings = results[0].checkResult.findings.filter((f) => f.severity === 'warn');
  assert.ok(warnFindings.some((f) => f.rule === 'delta:new-dependency'), 'should have new-dependency warn finding');
});

test('evaluate: only warn findings → allAdmitted: true', async () => {
  const dep = makeDep({ name: 'newpkg', version: '1.0.0', directDependency: true });
  // Create lots of new transitive deps to trigger transitive-surprise
  const transitiveDeps = Array.from({ length: 6 }, (_, i) => makeDep({
    name: `transitive-${i}`,
    version: '1.0.0',
    directDependency: false,
  }));

  const delta = {
    added: [dep, ...transitiveDeps],
    changed: [],
    removed: [],
    unchanged: [],
    shortCircuited: false,
  };

  const metadataMap = new Map(
    [dep, ...transitiveDeps].map((d) => [d.name, makeMetadata()])
  );

  const { results, allAdmitted } = await evaluate(delta, makePolicy(), makeBaseline(), [], metadataMap);

  // Direct dep should be admitted despite warn findings
  const mainResult = results.find((r) => r.name === 'newpkg');
  assert.ok(mainResult, 'newpkg result should exist');
  assert.equal(mainResult.checkResult.decision, 'admitted');
  assert.equal(allAdmitted, true);
});

// ---------------------------------------------------------------------------
// AC: all 7 rules run — verify findings cover all rule IDs when they fire
// ---------------------------------------------------------------------------

test('evaluate: all 7 rules produce findings when conditions are met', async () => {
  const now = new Date();
  const recentPublish = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  // A new dep that violates all blocking rules
  const dep = makeDep({
    name: 'badpkg',
    version: '1.0.0',
    hasInstallScripts: true,   // triggers scripts
    sourceType: 'git',          // triggers sources
    directDependency: true,
  });

  // 6 new transitive deps to trigger transitive-surprise
  const transitiveDeps = Array.from({ length: 6 }, (_, i) => makeDep({
    name: `transitive-${i}`,
    version: '1.0.0',
    directDependency: false,
  }));

  const delta = {
    added: [dep, ...transitiveDeps], // previousProfile = null → triggers new-dependency
    changed: [],
    removed: [],
    unchanged: [],
    shortCircuited: false,
  };

  const metadataMap = new Map(
    [dep, ...transitiveDeps].map((d) => [d.name, makeMetadata({
      publishedAt: recentPublish,    // triggers cooldown
      hasProvenance: false,
    })])
  );

  const policy = makePolicy({
    cooldown_hours: 72,
    scripts: { allowlist: [] },
    sources: { allowed: ['registry'] },
    provenance: { required_for: ['badpkg'] }, // triggers provenance
    transitive: { max_new: 5 },
  });

  const { results } = await evaluate(delta, policy, makeBaseline(), [], metadataMap);

  const badpkgResult = results.find((r) => r.name === 'badpkg');
  assert.ok(badpkgResult, 'badpkg result should exist');

  const ruleIds = badpkgResult.checkResult.findings.map((f) => f.rule);

  assert.ok(ruleIds.some((r) => r === 'trust-continuity:provenance'), 'missing provenance rule');
  assert.ok(ruleIds.some((r) => r === 'exposure:cooldown'), 'missing cooldown rule');
  assert.ok(ruleIds.some((r) => r === 'execution:scripts'), 'missing scripts rule');
  assert.ok(ruleIds.some((r) => r === 'execution:sources'), 'missing sources rule');
  assert.ok(ruleIds.some((r) => r === 'delta:new-dependency'), 'missing new-dependency rule');
  assert.ok(ruleIds.some((r) => r === 'delta:transitive-surprise'), 'missing transitive-surprise rule');
});

// ---------------------------------------------------------------------------
// AC: registry unreachable — skipped findings don't block
// ---------------------------------------------------------------------------

test('evaluate: registry unreachable — skipped findings are warn, not block', async () => {
  const dep = makeDep();
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  // No metadata → registry unreachable path
  const { results, allAdmitted } = await evaluate(delta, makePolicy(), makeBaseline(), [], new Map());

  assert.equal(results[0].checkResult.decision, 'admitted');
  assert.equal(allAdmitted, true);

  const blockFindings = results[0].checkResult.findings.filter((f) => f.severity === 'block');
  assert.equal(blockFindings.length, 0, 'no block findings when registry unreachable');
});

// ---------------------------------------------------------------------------
// AC: sources rule blocks non-registry deps
// ---------------------------------------------------------------------------

test('evaluate: git source type → blocked when only registry is allowed', async () => {
  const dep = makeDep({ sourceType: 'git' });
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const metadataMap = new Map([['lodash', makeMetadata()]]);
  const { results, allAdmitted } = await evaluate(delta, makePolicy({ sources: { allowed: ['registry'] } }), makeBaseline(), [], metadataMap);

  assert.equal(results[0].checkResult.decision, 'blocked');
  assert.equal(allAdmitted, false);
  assert.ok(results[0].checkResult.findings.some((f) => f.rule === 'execution:sources'));
});

// ---------------------------------------------------------------------------
// AC: scripts rule blocks unlisted packages with install scripts
// ---------------------------------------------------------------------------

test('evaluate: hasInstallScripts = true and not in allowlist → blocked', async () => {
  const dep = makeDep({ hasInstallScripts: true });
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const metadataMap = new Map([['lodash', makeMetadata()]]);
  const { results, allAdmitted } = await evaluate(delta, makePolicy({ scripts: { allowlist: [] } }), makeBaseline(), [], metadataMap);

  assert.equal(results[0].checkResult.decision, 'blocked');
  assert.equal(allAdmitted, false);
});

test('evaluate: hasInstallScripts = true but in allowlist → admitted', async () => {
  const dep = makeDep({ hasInstallScripts: true });
  const previousProfile = makePreviousProfile();
  const delta = { added: [], changed: [{ dep, previousProfile }], removed: [], unchanged: [], shortCircuited: false };

  const metadataMap = new Map([['lodash', makeMetadata()]]);
  const { results, allAdmitted } = await evaluate(
    delta,
    makePolicy({ scripts: { allowlist: ['lodash'] } }),
    makeBaseline(),
    [],
    metadataMap
  );

  assert.equal(results[0].checkResult.decision, 'admitted');
  assert.equal(allAdmitted, true);
});
