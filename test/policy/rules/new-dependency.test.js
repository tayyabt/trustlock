import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/new-dependency.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dep = { name: 'lodash', version: '4.17.21' };
const policy = {};

const baselineRecord = { provenanceStatus: 'verified', version: '4.17.21' };

// ---------------------------------------------------------------------------
// Warn — package not in baseline (null baseline = new package)
// ---------------------------------------------------------------------------

test('new-dependency: returns warning finding when baseline is null', () => {
  const findings = evaluate(dep, null, null, policy);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'delta:new-dependency');
  assert.equal(f.severity, 'warning');
  assert.ok(f.message.includes('lodash'));
  assert.ok(f.message.includes('new dependency'));
});

test('new-dependency: returns warning finding when baseline is undefined', () => {
  const findings = evaluate(dep, undefined, null, policy);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'warning');
});

// ---------------------------------------------------------------------------
// Admit — package exists in baseline
// ---------------------------------------------------------------------------

test('new-dependency: returns [] when baseline record exists', () => {
  const findings = evaluate(dep, baselineRecord, null, policy);
  assert.equal(findings.length, 0);
});

test('new-dependency: returns [] when baseline is an empty object (exists but has no fields)', () => {
  const findings = evaluate(dep, {}, null, policy);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Edge — first run (all packages are new)
// ---------------------------------------------------------------------------

test('new-dependency: all packages new on first run after init produce warnings', () => {
  const deps = [
    { name: 'express', version: '4.18.2' },
    { name: 'lodash', version: '4.17.21' },
    { name: 'axios', version: '1.6.0' },
  ];
  for (const d of deps) {
    const findings = evaluate(d, null, null, policy);
    assert.equal(findings.length, 1, `expected 1 warning for ${d.name}`);
    assert.equal(findings[0].severity, 'warning');
  }
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('new-dependency: warning finding has correct shape', () => {
  const findings = evaluate(dep, null, null, policy);
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
