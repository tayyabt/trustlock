import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/scripts.js';
import { decide } from '../../../src/policy/decision.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dep = { name: 'sharp', version: '0.33.0', hasInstallScripts: true };
const depClean = { name: 'lodash', version: '4.17.21', hasInstallScripts: false };
const depUnknown = { name: 'axios', version: '1.6.0', hasInstallScripts: null };

const policyNoAllowlist = { scripts: { allowlist: [] } };
const policyWithAllowlist = { scripts: { allowlist: ['sharp'] } };

/** Normalize rule severity to the model convention used by decide(). */
function normalize(findings) {
  return findings.map((f) => ({
    ...f,
    severity: f.severity === 'error' ? 'block' : f.severity === 'skipped' ? 'warn' : f.severity,
  }));
}

function makeApproval(packageName, version, overrides, expiresInMs = 3_600_000) {
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
  return makeApproval(packageName, version, overrides, -3_600_000);
}

// ---------------------------------------------------------------------------
// Should-admit — no install scripts
// ---------------------------------------------------------------------------

test('scripts: admits when dep has no install scripts', () => {
  const findings = evaluate(depClean, null, null, policyNoAllowlist);
  assert.equal(findings.length, 0);
});

test('scripts: admits when dep is in scripts.allowlist', () => {
  const findings = evaluate(dep, null, null, policyWithAllowlist);
  assert.equal(findings.length, 0);
});

test('scripts: admits (skips) when hasInstallScripts is null — lockfile does not expose it', () => {
  const findings = evaluate(depUnknown, null, null, policyNoAllowlist);
  // Unknown status: no findings — do not block on missing data.
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Should-block — has install scripts, not in allowlist
// ---------------------------------------------------------------------------

test('scripts: blocks when dep has install scripts and is not in allowlist', () => {
  const findings = evaluate(dep, null, null, policyNoAllowlist);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'execution:scripts');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('sharp@0.33.0'), 'message must include package@version');
  assert.ok(f.message.includes('scripts.allowlist'));
});

test('scripts: block finding includes name, version, and allowlist in detail', () => {
  const findings = evaluate(dep, null, null, policyNoAllowlist);
  const { detail } = findings[0];
  assert.equal(detail.name, 'sharp');
  assert.equal(detail.version, '0.33.0');
  assert.ok(Array.isArray(detail.allowlist));
});

test('scripts: blocks when policy has no scripts key (defaults to empty allowlist)', () => {
  const findings = evaluate(dep, null, null, {});
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'execution:scripts');
});

// ---------------------------------------------------------------------------
// Should-admit-with-approval — valid approval flips blocked → admitted_with_approval
// ---------------------------------------------------------------------------

test('scripts: admitted_with_approval when valid approval covers "scripts"', () => {
  const findings = normalize(evaluate(dep, null, null, policyNoAllowlist));
  const approvals = [makeApproval('sharp', '0.33.0', ['scripts'])];
  const decision = decide(findings, approvals, 'sharp', '0.33.0');
  assert.equal(decision, 'admitted_with_approval');
});

test('scripts: still blocked when approval covers a different rule', () => {
  const findings = normalize(evaluate(dep, null, null, policyNoAllowlist));
  const approvals = [makeApproval('sharp', '0.33.0', ['cooldown'])];
  const decision = decide(findings, approvals, 'sharp', '0.33.0');
  assert.equal(decision, 'blocked');
});

test('scripts: still blocked when approval is for a different version', () => {
  const findings = normalize(evaluate(dep, null, null, policyNoAllowlist));
  const approvals = [makeApproval('sharp', '0.32.0', ['scripts'])];
  const decision = decide(findings, approvals, 'sharp', '0.33.0');
  assert.equal(decision, 'blocked');
});

// ---------------------------------------------------------------------------
// Expired-approval — expired approval does NOT flip the decision
// ---------------------------------------------------------------------------

test('scripts: blocked when approval is expired', () => {
  const findings = normalize(evaluate(dep, null, null, policyNoAllowlist));
  const approvals = [makeExpiredApproval('sharp', '0.33.0', ['scripts'])];
  const decision = decide(findings, approvals, 'sharp', '0.33.0');
  assert.equal(decision, 'blocked');
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('scripts: all Finding fields present on block finding', () => {
  const findings = evaluate(dep, null, null, policyNoAllowlist);
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

// ---------------------------------------------------------------------------
// C-NEW-1: hasInstallScripts === null defers to registryData.hasScripts
// ---------------------------------------------------------------------------

test('scripts: admits (skips) when hasInstallScripts null and registryData is null', () => {
  // Pre-existing behavior must be preserved: registry unavailable → do not block
  const findings = evaluate(depUnknown, null, null, policyNoAllowlist);
  assert.equal(findings.length, 0);
});

test('scripts: blocks when hasInstallScripts null and registryData.hasScripts is true', () => {
  const findings = evaluate(depUnknown, null, { hasScripts: true }, policyNoAllowlist);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'execution:scripts');
  assert.equal(findings[0].severity, 'error');
  assert.ok(findings[0].message.includes('axios@1.6.0'), 'message must include pkg@version');
});

test('scripts: admits when hasInstallScripts null and registryData.hasScripts is false', () => {
  const findings = evaluate(depUnknown, null, { hasScripts: false }, policyNoAllowlist);
  assert.equal(findings.length, 0);
});

test('scripts: admits when hasInstallScripts null, registry hasScripts true, but pkg in allowlist', () => {
  const findings = evaluate(
    { name: 'axios', version: '1.6.0', hasInstallScripts: null },
    null,
    { hasScripts: true },
    { scripts: { allowlist: ['axios'] } }
  );
  assert.equal(findings.length, 0);
});
