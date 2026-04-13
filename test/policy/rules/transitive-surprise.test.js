import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/transitive-surprise.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dep = { name: 'webpack', version: '5.91.0' };
const policy = {};

// ---------------------------------------------------------------------------
// Warn — new transitive count exceeds threshold (5)
// ---------------------------------------------------------------------------

test('transitive-surprise: returns warning when newTransitiveCount is 6', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 6 });
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'delta:transitive-surprise');
  assert.equal(f.severity, 'warning');
  assert.ok(f.message.includes('webpack'));
  assert.ok(f.message.includes('6'));
  assert.equal(f.detail.newTransitiveCount, 6);
  assert.equal(f.detail.threshold, 5);
});

test('transitive-surprise: returns warning when newTransitiveCount is 100', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 100 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].detail.newTransitiveCount, 100);
});

// ---------------------------------------------------------------------------
// Admit — count at or below threshold
// ---------------------------------------------------------------------------

test('transitive-surprise: returns [] when newTransitiveCount is exactly 5', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 5 });
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when newTransitiveCount is 0', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 0 });
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when newTransitiveCount is 1', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 1 });
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Skipped — delta not populated (engine hasn't computed it yet)
// ---------------------------------------------------------------------------

test('transitive-surprise: returns [] when delta is null', () => {
  const findings = evaluate(dep, null, null, policy, null);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when delta is omitted (default)', () => {
  const findings = evaluate(dep, null, null, policy);
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when delta has no newTransitiveCount field', () => {
  const findings = evaluate(dep, null, null, policy, {});
  assert.equal(findings.length, 0);
});

test('transitive-surprise: returns [] when delta.newTransitiveCount is null', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: null });
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Threshold is hardcoded — policy.transitive.max_new is ignored
// ---------------------------------------------------------------------------

test('transitive-surprise: ignores policy.transitive.max_new; uses hardcoded 5', () => {
  // Even if policy declares a lower threshold, the rule uses 5.
  const policyWithLowThreshold = { transitive: { max_new: 2 } };
  // Count of 4 is within hardcoded threshold → admit
  const admitFindings = evaluate(dep, null, null, policyWithLowThreshold, { newTransitiveCount: 4 });
  assert.equal(admitFindings.length, 0);
  // Count of 6 exceeds hardcoded threshold → warn
  const warnFindings = evaluate(dep, null, null, policyWithLowThreshold, { newTransitiveCount: 6 });
  assert.equal(warnFindings.length, 1);
  assert.equal(warnFindings[0].detail.threshold, 5);
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('transitive-surprise: warning finding has correct shape', () => {
  const findings = evaluate(dep, null, null, policy, { newTransitiveCount: 10 });
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
