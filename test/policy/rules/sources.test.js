import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/sources.js';
import { decide } from '../../../src/policy/decision.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const depRegistry = { name: 'lodash', version: '4.17.21', sourceType: 'registry' };
const depGit = { name: 'my-fork', version: '1.0.0', sourceType: 'git' };
const depFile = { name: 'local-pkg', version: '0.0.1', sourceType: 'file' };
const depHttp = { name: 'remote-pkg', version: '2.0.0', sourceType: 'http' };

const policyRegistryOnly = { sources: { allowed: ['registry'] } };
const policyAllowGit = { sources: { allowed: ['registry', 'git'] } };

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
// Should-admit — source type is in allowed list
// ---------------------------------------------------------------------------

test('sources: admits when sourceType is "registry" and registry is allowed', () => {
  const findings = evaluate(depRegistry, null, null, policyRegistryOnly);
  assert.equal(findings.length, 0);
});

test('sources: admits when sourceType is "git" and git is explicitly allowed', () => {
  const findings = evaluate(depGit, null, null, policyAllowGit);
  assert.equal(findings.length, 0);
});

test('sources: admits when policy has no sources key (defaults to ["registry"])', () => {
  const depReg = { name: 'pkg', version: '1.0.0', sourceType: 'registry' };
  const findings = evaluate(depReg, null, null, {});
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Should-block — source type is not in allowed list
// ---------------------------------------------------------------------------

test('sources: blocks when sourceType is "git" and only "registry" is allowed', () => {
  const findings = evaluate(depGit, null, null, policyRegistryOnly);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'execution:sources');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('my-fork@1.0.0'));
  assert.ok(f.message.includes('"git"'));
  assert.ok(f.message.includes('sources.allowed'));
});

test('sources: blocks when sourceType is "file"', () => {
  const findings = evaluate(depFile, null, null, policyRegistryOnly);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'execution:sources');
  assert.equal(findings[0].detail.sourceType, 'file');
});

test('sources: blocks when sourceType is "http"', () => {
  const findings = evaluate(depHttp, null, null, policyRegistryOnly);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'execution:sources');
  assert.equal(findings[0].detail.sourceType, 'http');
});

test('sources: block finding includes name, version, sourceType, and allowed list in detail', () => {
  const findings = evaluate(depGit, null, null, policyRegistryOnly);
  const { detail } = findings[0];
  assert.equal(detail.name, 'my-fork');
  assert.equal(detail.version, '1.0.0');
  assert.equal(detail.sourceType, 'git');
  assert.deepEqual(detail.allowed, ['registry']);
});

// ---------------------------------------------------------------------------
// Should-admit-with-approval — valid approval flips blocked → admitted_with_approval
// ---------------------------------------------------------------------------

test('sources: admitted_with_approval when valid approval covers "sources"', () => {
  const findings = normalize(evaluate(depGit, null, null, policyRegistryOnly));
  const approvals = [makeApproval('my-fork', '1.0.0', ['sources'])];
  const decision = decide(findings, approvals, 'my-fork', '1.0.0');
  assert.equal(decision, 'admitted_with_approval');
});

test('sources: still blocked when approval covers a different rule', () => {
  const findings = normalize(evaluate(depGit, null, null, policyRegistryOnly));
  const approvals = [makeApproval('my-fork', '1.0.0', ['cooldown'])];
  const decision = decide(findings, approvals, 'my-fork', '1.0.0');
  assert.equal(decision, 'blocked');
});

test('sources: still blocked when approval is for a different package', () => {
  const findings = normalize(evaluate(depGit, null, null, policyRegistryOnly));
  const approvals = [makeApproval('other-pkg', '1.0.0', ['sources'])];
  const decision = decide(findings, approvals, 'my-fork', '1.0.0');
  assert.equal(decision, 'blocked');
});

// ---------------------------------------------------------------------------
// Expired-approval — expired approval does NOT flip the decision
// ---------------------------------------------------------------------------

test('sources: blocked when approval is expired', () => {
  const findings = normalize(evaluate(depGit, null, null, policyRegistryOnly));
  const approvals = [makeExpiredApproval('my-fork', '1.0.0', ['sources'])];
  const decision = decide(findings, approvals, 'my-fork', '1.0.0');
  assert.equal(decision, 'blocked');
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('sources: all Finding fields present on block finding', () => {
  const findings = evaluate(depGit, null, null, policyRegistryOnly);
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
