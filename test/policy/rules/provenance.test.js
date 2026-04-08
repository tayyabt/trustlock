import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/provenance.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dep = { name: 'express', version: '4.18.2' };

const policyWithRequired = { provenance: { required_for: ['express'] } };
const policyWithoutRequired = { provenance: { required_for: [] } };

const baselineVerified = { provenanceStatus: 'verified' };
const baselineUnverified = { provenanceStatus: 'unverified' };
const baselineUnknown = { provenanceStatus: 'unknown' };

const registryWithProvenance = { hasProvenance: true };
const registryWithoutProvenance = { hasProvenance: false };

// ---------------------------------------------------------------------------
// Skipped — registry unavailable
// ---------------------------------------------------------------------------

test('provenance: skipped finding when registryData is null', () => {
  const findings = evaluate(dep, null, null, policyWithRequired);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'trust-continuity:provenance');
  assert.equal(f.severity, 'skipped');
  assert.equal(f.message, 'skipped: registry unreachable');
  assert.ok('detail' in f);
});

test('provenance: skipped finding when registryData is null (no baseline, not required)', () => {
  const findings = evaluate(dep, null, null, policyWithoutRequired);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'skipped');
});

// ---------------------------------------------------------------------------
// Block — required_for with no attestation (edge case #5)
// ---------------------------------------------------------------------------

test('provenance: blocks when package is in required_for and has no attestation (no baseline)', () => {
  const findings = evaluate(dep, null, registryWithoutProvenance, policyWithRequired);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'trust-continuity:provenance');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('required_for'));
  assert.equal(f.detail.required, true);
});

test('provenance: blocks when package is in required_for and has no attestation (unverified baseline)', () => {
  const findings = evaluate(dep, baselineUnverified, registryWithoutProvenance, policyWithRequired);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'error');
  assert.equal(findings[0].detail.required, true);
});

test('provenance: blocks when package is in required_for and has no attestation (unknown baseline)', () => {
  const findings = evaluate(dep, baselineUnknown, registryWithoutProvenance, policyWithRequired);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'error');
});

// ---------------------------------------------------------------------------
// Block — provenance regression (had attestation in baseline, now missing)
// ---------------------------------------------------------------------------

test('provenance: blocks on provenance regression (was verified, now no attestation)', () => {
  const findings = evaluate(dep, baselineVerified, registryWithoutProvenance, policyWithoutRequired);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'trust-continuity:provenance');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('no longer has it'));
  assert.equal(f.detail.regression, true);
});

// ---------------------------------------------------------------------------
// Admit — attestation present
// ---------------------------------------------------------------------------

test('provenance: admits when attestation is present (in required_for)', () => {
  const findings = evaluate(dep, baselineVerified, registryWithProvenance, policyWithRequired);
  assert.equal(findings.length, 0);
});

test('provenance: admits when attestation is present (not in required_for)', () => {
  const findings = evaluate(dep, null, registryWithProvenance, policyWithoutRequired);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Admit — never had attestation and not required
// ---------------------------------------------------------------------------

test('provenance: admits when package never had provenance and is not required', () => {
  const findings = evaluate(dep, baselineUnverified, registryWithoutProvenance, policyWithoutRequired);
  assert.equal(findings.length, 0);
});

test('provenance: admits when baseline is null and not required', () => {
  const findings = evaluate(dep, null, registryWithoutProvenance, policyWithoutRequired);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('provenance: all Finding fields present on block finding', () => {
  const findings = evaluate(dep, null, registryWithoutProvenance, policyWithRequired);
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
});

test('provenance: all Finding fields present on skipped finding', () => {
  const findings = evaluate(dep, null, null, policyWithoutRequired);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.ok('rule' in f);
  assert.ok('severity' in f);
  assert.ok('message' in f);
  assert.ok('detail' in f);
});
