import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/transitive-surprise.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Rule only fires on direct dependencies
const dep = { name: 'webpack', version: '5.91.0', directDependency: true };
const policy = {};

// ---------------------------------------------------------------------------
// Warn — new transitive count exceeds threshold (5)
// ---------------------------------------------------------------------------

test('transitive-surprise: returns warning when newTransitiveCount is 6', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 6 }, policy);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'delta:transitive-surprise');
  assert.equal(f.severity, 'warn');
  assert.ok(f.message.includes('webpack'));
  assert.ok(f.message.includes('6'));
  assert.equal(f.detail.newTransitiveCount, 6);
  assert.equal(f.detail.max_new, 5);
});

test('transitive-surprise: returns warning when newTransitiveCount is 100', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 100 }, policy);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warn');
  assert.equal(findings[0].detail.newTransitiveCount, 100);
});

// ---------------------------------------------------------------------------
// Admit — count at or below threshold
// ---------------------------------------------------------------------------

test('transitive-surprise: returns [] when newTransitiveCount is exactly 5', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 5 }, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when newTransitiveCount is 0', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 0 }, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when newTransitiveCount is 1', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 1 }, policy);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Skipped — delta not populated (engine hasn't computed it yet)
// ---------------------------------------------------------------------------

test('transitive-surprise: returns [] when registryData is null', () => {
  const findings = evaluate(dep, null, null, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when registryData is omitted (default)', () => {
  const findings = evaluate(dep, null, undefined, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when registryData has no newTransitiveCount field', () => {
  const findings = evaluate(dep, null, {}, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when registryData.newTransitiveCount is null', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: null }, policy);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Threshold — policy.transitive.max_new is respected
// ---------------------------------------------------------------------------

test('transitive-surprise: ignores policy.transitive.max_new; uses hardcoded 5', () => {
  // policy.transitive.max_new is respected by the rule
  const policyWithLowThreshold = { transitive: { max_new: 2 } };
  // Count of 4 exceeds the policy threshold of 2 → warn
  const warnFindings = evaluate(dep, null, { newTransitiveCount: 4 }, policyWithLowThreshold);
  assert.equal(warnFindings.length, 1);
  assert.equal(warnFindings[0].detail.max_new, 2);
});

// ---------------------------------------------------------------------------
// Non-direct dependencies are skipped
// ---------------------------------------------------------------------------

test('transitive-surprise: returns [] for transitive (non-direct) dependency', () => {
  const transitiveDep = { name: 'lodash', version: '4.17.21', directDependency: false };
  const findings = evaluate(transitiveDep, null, { newTransitiveCount: 100 }, policy);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('transitive-surprise: warning finding has correct shape', () => {
  const findings = evaluate(dep, null, { newTransitiveCount: 10 }, policy);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.ok('rule' in f, 'missing rule');
  assert.ok('severity' in f, 'missing severity');
  assert.ok('message' in f, 'missing message');
  assert.ok('detail' in f, 'missing detail');
  assert.equal(typeof f.rule, 'string');
  assert.equal(typeof f.severity, 'string');
  assert.equal(typeof f.message, 'string');
  assert.equal(typeof f.detail, 'object');
  assert.equal(f.detail.name, dep.name);
  assert.equal(f.detail.version, dep.version);
});
