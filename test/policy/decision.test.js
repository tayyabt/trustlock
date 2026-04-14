import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../src/policy/decision.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(severity = 'block', rule = 'exposure:cooldown') {
  return { rule, severity, message: 'test finding', detail: {} };
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

function makeExpiredApproval(packageName, version, overrides) {
  return makeApproval(packageName, version, overrides, -3600_000); // expired 1h ago
}

// ---------------------------------------------------------------------------
// AC: admitted when no blocking findings
// ---------------------------------------------------------------------------

test('decide: returns "admitted" when findings is empty', () => {
  assert.equal(decide([], [], 'lodash', '4.17.21'), 'admitted');
});

test('decide: returns "admitted" when only warn-severity findings exist', () => {
  const findings = [
    makeFinding('warn', 'delta:new-dependency'),
    makeFinding('warn', 'delta:transitive-surprise'),
  ];
  assert.equal(decide(findings, [], 'lodash', '4.17.21'), 'admitted');
});

// ---------------------------------------------------------------------------
// AC: blocked when any blocking finding is uncovered
// ---------------------------------------------------------------------------

test('decide: returns "blocked" when a blocking finding has no approval', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  assert.equal(decide(findings, [], 'lodash', '4.17.21'), 'blocked');
});

test('decide: returns "blocked" when approval exists for a different package', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  const approvals = [makeApproval('other-pkg', '4.17.21', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'blocked');
});

test('decide: returns "blocked" when approval exists for a different version', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  const approvals = [makeApproval('lodash', '4.17.20', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'blocked');
});

test('decide: returns "blocked" when approval is expired', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  const approvals = [makeExpiredApproval('lodash', '4.17.21', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'blocked');
});

test('decide: returns "blocked" when approval covers a different rule', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  const approvals = [makeApproval('lodash', '4.17.21', ['scripts'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'blocked');
});

// ---------------------------------------------------------------------------
// AC: admitted_with_approval when all blocking findings are covered
// ---------------------------------------------------------------------------

test('decide: returns "admitted_with_approval" when blocking finding is covered by valid approval', () => {
  const findings = [makeFinding('block', 'exposure:cooldown')];
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'admitted_with_approval');
});

test('decide: returns "admitted_with_approval" when multiple blocking findings are all covered', () => {
  const findings = [
    makeFinding('block', 'exposure:cooldown'),
    makeFinding('block', 'execution:scripts'),
  ];
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown', 'scripts'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'admitted_with_approval');
});

test('decide: returns "admitted_with_approval" with two separate approvals covering each rule', () => {
  const findings = [
    makeFinding('block', 'exposure:cooldown'),
    makeFinding('block', 'trust-continuity:provenance'),
  ];
  const approvals = [
    makeApproval('lodash', '4.17.21', ['cooldown']),
    makeApproval('lodash', '4.17.21', ['provenance']),
  ];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'admitted_with_approval');
});

// ---------------------------------------------------------------------------
// AC: partial coverage → still blocked
// ---------------------------------------------------------------------------

test('decide: returns "blocked" when approval covers only one of two blocking rules', () => {
  const findings = [
    makeFinding('block', 'exposure:cooldown'),
    makeFinding('block', 'execution:scripts'),
  ];
  // Only cooldown is covered, scripts is not
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'blocked');
});

// ---------------------------------------------------------------------------
// AC: warning findings do not affect decision
// ---------------------------------------------------------------------------

test('decide: warns do not elevate "admitted" when no blocks present', () => {
  const findings = [
    makeFinding('warn', 'delta:new-dependency'),
    makeFinding('block', 'exposure:cooldown'),
  ];
  // Block is covered; warn is ignored
  const approvals = [makeApproval('lodash', '4.17.21', ['cooldown'])];
  assert.equal(decide(findings, approvals, 'lodash', '4.17.21'), 'admitted_with_approval');
});

test('decide: "admitted" when only warn findings exist even with no approvals', () => {
  const findings = [makeFinding('warn', 'delta:transitive-surprise')];
  assert.equal(decide(findings, [], 'express', '4.18.2'), 'admitted');
});

// ---------------------------------------------------------------------------
// AC: override name mapping for delta rules
// ---------------------------------------------------------------------------

test('decide: delta:new-dependency maps to "new-dep" override name', () => {
  // delta:new-dependency is warn-only so it won't block — but test the mapping
  // by using a block-severity finding with the same rule ID to simulate
  const findings = [{ rule: 'delta:new-dependency', severity: 'block', message: 'test', detail: {} }];
  const approvals = [makeApproval('pkg', '1.0.0', ['new-dep'])];
  assert.equal(decide(findings, approvals, 'pkg', '1.0.0'), 'admitted_with_approval');
});

test('decide: delta:transitive-surprise maps to "transitive" override name', () => {
  const findings = [{ rule: 'delta:transitive-surprise', severity: 'block', message: 'test', detail: {} }];
  const approvals = [makeApproval('pkg', '1.0.0', ['transitive'])];
  assert.equal(decide(findings, approvals, 'pkg', '1.0.0'), 'admitted_with_approval');
});
