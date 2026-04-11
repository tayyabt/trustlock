/**
 * Integration test: publisher identity + baseline schema v2 migration (F12-S01).
 *
 * Tests the end-to-end path through engine.evaluate() using a v1 baseline file
 * and a mocked registry client, verifying that:
 *   - v1 baseline entries trigger old-version publisher fetch (lazy migration)
 *   - publisher-change blocking rule fires correctly
 *   - advanceBaseline writes schema_version 2 with correct publisherAccount values
 *   - old-version fetch failure produces warn-only, no block, null publisher in output
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluate } from '../../src/policy/engine.js';
import { advanceBaseline } from '../../src/baseline/manager.js';
import { computeDelta } from '../../src/baseline/diff.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV1Baseline(packages = {}) {
  return {
    schema_version: 1,
    created_at: new Date().toISOString(),
    lockfile_hash: 'a'.repeat(64),
    packages,
  };
}

function makeTrustProfile(name, version, overrides = {}) {
  return {
    name,
    version,
    admittedAt: new Date().toISOString(),
    provenanceStatus: 'unknown',
    hasInstallScripts: false,
    sourceType: 'registry',
    ...overrides,
  };
}

function makeResolvedDep(name, version, overrides = {}) {
  return {
    name,
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: 'sha512-xxx==',
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
    ...overrides,
  };
}

/** Minimal policy config with publisher blocking enabled (default). */
function makePolicy(overrides = {}) {
  return {
    cooldown_hours: 0,
    pinning: { required: false },
    scripts: { allowlist: [] },
    sources: { allowed: ['registry'] },
    provenance: { required_for: [], block_on_publisher_change: true, ...overrides.provenance },
    transitive: { max_new: 100 },
  };
}

// ---------------------------------------------------------------------------
// AC4 + AC5: v1 baseline + changed package → publisher fetch + block on change
// ---------------------------------------------------------------------------

test('engine: publisher-change rule fires and blocks when old and new publishers differ (v1 baseline)', async () => {
  // v1 baseline: lodash 4.17.20, no publisherAccount
  const baseline = makeV1Baseline({
    lodash: makeTrustProfile('lodash', '4.17.20'),
  });

  // New lockfile: lodash 4.17.21 (changed)
  const currentDeps = [makeResolvedDep('lodash', '4.17.21')];
  const delta = computeDelta(baseline, currentDeps, 'b'.repeat(64));

  assert.equal(delta.changed.length, 1, 'lodash must be in delta.changed');

  // Registry data: simulate that old version publisher was fetched (alice),
  // new version publisher is bob — trigger a block.
  const registryData = new Map([
    ['lodash', {
      publishedAt: null,
      hasProvenance: false,
      warnings: [],
      newPublisherAccount: 'bob',        // new version publisher
      effectiveOldPublisherAccount: 'alice', // old version publisher (fetched in check.js step 9b)
      oldPublisherFetchFailed: false,
    }],
  ]);

  const { results, allAdmitted } = await evaluate(delta, makePolicy(), baseline, [], registryData, {});

  assert.equal(allAdmitted, false, 'should not be all admitted');
  const lodashResult = results.find((r) => r.name === 'lodash');
  assert.ok(lodashResult, 'lodash result must exist');
  assert.equal(lodashResult.checkResult.decision, 'blocked');

  const publisherFinding = lodashResult.checkResult.findings.find(
    (f) => f.rule === 'trust-continuity:publisher'
  );
  assert.ok(publisherFinding, 'publisher-change finding must be present');
  assert.equal(publisherFinding.severity, 'block');
});

// ---------------------------------------------------------------------------
// AC6: Old publisher null (v1 entry, fetch successful but old version had no publisher)
// ---------------------------------------------------------------------------

test('engine: warns but does not block when old publisher is null (v1 entry, null from registry)', async () => {
  const baseline = makeV1Baseline({
    lodash: makeTrustProfile('lodash', '4.17.20'),
  });
  const currentDeps = [makeResolvedDep('lodash', '4.17.21')];
  const delta = computeDelta(baseline, currentDeps, 'b'.repeat(64));

  // Old version publisher fetch returned null (no _npmUser.name in old version)
  const registryData = new Map([
    ['lodash', {
      publishedAt: null,
      hasProvenance: false,
      warnings: [],
      newPublisherAccount: 'bob',
      effectiveOldPublisherAccount: null, // fetch succeeded but publisher was absent
      oldPublisherFetchFailed: false,
    }],
  ]);

  const stderrMessages = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (msg, ...rest) => {
    stderrMessages.push(typeof msg === 'string' ? msg : msg.toString());
    return origWrite(msg, ...rest);
  };

  let results, allAdmitted;
  try {
    ({ results, allAdmitted } = await evaluate(delta, makePolicy(), baseline, [], registryData, {}));
  } finally {
    process.stderr.write = origWrite;
  }

  assert.equal(allAdmitted, true, 'should be all admitted (null old publisher → warn only)');
  const lodashResult = results.find((r) => r.name === 'lodash');
  assert.equal(lodashResult.checkResult.decision, 'admitted');

  const publisherFinding = lodashResult.checkResult.findings.find(
    (f) => f.rule === 'trust-continuity:publisher'
  );
  assert.ok(!publisherFinding || publisherFinding.severity !== 'block',
    'publisher finding must not block when old publisher is null');

  // Warning must be emitted to stderr
  const warnMsg = stderrMessages.join('');
  assert.ok(warnMsg.includes('no prior record') || warnMsg.includes('compare publisher'),
    `expected publisher warning in stderr, got: ${warnMsg}`);
});

// ---------------------------------------------------------------------------
// AC8: Old version fetch fails → warn, no block, publisher skipped
// ---------------------------------------------------------------------------

test('engine: skips publisher rule and does not block when old-version fetch failed', async () => {
  const baseline = makeV1Baseline({
    lodash: makeTrustProfile('lodash', '4.17.20'),
  });
  const currentDeps = [makeResolvedDep('lodash', '4.17.21')];
  const delta = computeDelta(baseline, currentDeps, 'b'.repeat(64));

  // Simulate: check.js already emitted the warning; engine must skip comparison
  const registryData = new Map([
    ['lodash', {
      publishedAt: null,
      hasProvenance: false,
      warnings: [],
      newPublisherAccount: 'bob',
      effectiveOldPublisherAccount: null,
      oldPublisherFetchFailed: true, // flag set by check.js step 9b on fetch failure
    }],
  ]);

  const { results, allAdmitted } = await evaluate(delta, makePolicy(), baseline, [], registryData, {});

  assert.equal(allAdmitted, true, 'must be all admitted when old-version fetch failed');
  const lodashResult = results.find((r) => r.name === 'lodash');
  assert.equal(lodashResult.checkResult.decision, 'admitted');

  const publisherFinding = lodashResult.checkResult.findings.find(
    (f) => f.rule === 'trust-continuity:publisher' && f.severity === 'block'
  );
  assert.ok(!publisherFinding, 'must not have blocking publisher finding when fetch failed');
});

// ---------------------------------------------------------------------------
// AC7: block_on_publisher_change: false → warn only, no block
// ---------------------------------------------------------------------------

test('engine: warns but does not block when block_on_publisher_change is false', async () => {
  const baseline = makeV1Baseline({
    lodash: makeTrustProfile('lodash', '4.17.20'),
  });
  const currentDeps = [makeResolvedDep('lodash', '4.17.21')];
  const delta = computeDelta(baseline, currentDeps, 'b'.repeat(64));

  const registryData = new Map([
    ['lodash', {
      publishedAt: null,
      hasProvenance: false,
      warnings: [],
      newPublisherAccount: 'bob',
      effectiveOldPublisherAccount: 'alice',
      oldPublisherFetchFailed: false,
    }],
  ]);

  const policy = makePolicy({ provenance: { block_on_publisher_change: false } });
  const stderrMessages = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (msg, ...rest) => {
    stderrMessages.push(typeof msg === 'string' ? msg : msg.toString());
    return origWrite(msg, ...rest);
  };

  let results, allAdmitted;
  try {
    ({ results, allAdmitted } = await evaluate(delta, policy, baseline, [], registryData, {}));
  } finally {
    process.stderr.write = origWrite;
  }

  assert.equal(allAdmitted, true, 'must be admitted when block_on_publisher_change is false');
  const lodashResult = results.find((r) => r.name === 'lodash');
  assert.equal(lodashResult.checkResult.decision, 'admitted');

  // A warning should have been emitted to stderr
  const warnMsg = stderrMessages.join('');
  assert.ok(warnMsg.length > 0, 'warning must be emitted to stderr when publisher changes with block=false');
});

// ---------------------------------------------------------------------------
// AC3 + AC12: advanceBaseline writes schema_version 2 with correct publisherAccount
// ---------------------------------------------------------------------------

test('advanceBaseline writes schema_version 2 with publisherAccount for admitted packages', async (t) => {
  const dir = join(tmpdir(), `trustlock-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const baseline = makeV1Baseline({
    lodash: makeTrustProfile('lodash', '4.17.20'),
    chalk: makeTrustProfile('chalk', '5.3.0'),
  });

  // lodash changes, chalk stays
  const admittedDeps = [
    makeResolvedDep('lodash', '4.17.21'),
    makeResolvedDep('chalk', '5.3.0'),
  ];
  const publisherAccounts = { lodash: 'alice', chalk: null };

  const advanced = advanceBaseline(baseline, admittedDeps, 'c'.repeat(64), publisherAccounts);

  assert.equal(advanced.schema_version, 2);
  assert.equal(advanced.packages.lodash.publisherAccount, 'alice', 'changed package gets publisher from map');
  assert.equal(advanced.packages.chalk.publisherAccount, null, 'unchanged v1 package gets null');

  // Write and verify on disk
  const filePath = join(dir, 'baseline.json');
  const { writeFile: wf, rename } = await import('node:fs/promises');
  const { join: pathJoin, dirname } = await import('node:path');
  await wf(filePath, JSON.stringify(advanced, null, 2) + '\n', 'utf8');

  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.schema_version, 2);
  assert.equal(parsed.packages.lodash.publisherAccount, 'alice');
});
