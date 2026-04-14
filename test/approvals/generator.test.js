import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateApprovalCommand } from '../../src/approvals/generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheckResult(overrides = {}) {
  return {
    packageName: 'lodash',
    version: '4.17.21',
    blockingRules: ['cooldown'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC: returns a valid command string
// ---------------------------------------------------------------------------

test('returns a string starting with "trustlock approve"', () => {
  const result = generateApprovalCommand(
    makeCheckResult(),
    {}
  );
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.startsWith('trustlock approve '), 'starts with trustlock approve');
});

// ---------------------------------------------------------------------------
// AC: correct package@version formatting — unscoped package
// ---------------------------------------------------------------------------

test('includes correct package@version for unscoped package', () => {
  const result = generateApprovalCommand(
    makeCheckResult({ packageName: 'lodash', version: '4.17.21' }),
    {}
  );
  assert.ok(result.includes('lodash@4.17.21'), `expected lodash@4.17.21 in: ${result}`);
});

// ---------------------------------------------------------------------------
// AC: correct package@version formatting — scoped package
// ---------------------------------------------------------------------------

test('handles scoped package names correctly (@scope/pkg@1.0.0)', () => {
  const result = generateApprovalCommand(
    makeCheckResult({ packageName: '@scope/pkg', version: '1.0.0' }),
    {}
  );
  assert.ok(result.includes('@scope/pkg@1.0.0'), `expected @scope/pkg@1.0.0 in: ${result}`);
});

// ---------------------------------------------------------------------------
// AC: one --override flag per blocking rule — single rule
// ---------------------------------------------------------------------------

test('produces one --override flag for a single blocking rule', () => {
  const result = generateApprovalCommand(
    makeCheckResult({ blockingRules: ['cooldown'] }),
    {}
  );
  const overrideMatches = result.match(/--override \S+/g) || [];
  assert.equal(overrideMatches.length, 1);
  assert.ok(result.includes('--override cooldown'), `expected --override cooldown in: ${result}`);
});

// ---------------------------------------------------------------------------
// AC: multiple blocking rules produce multiple --override flags
// ---------------------------------------------------------------------------

test('produces multiple --override flags for multiple blocking rules', () => {
  const result = generateApprovalCommand(
    makeCheckResult({ blockingRules: ['cooldown', 'scripts'] }),
    {}
  );
  const overrideMatches = result.match(/--override \S+/g) || [];
  assert.equal(overrideMatches.length, 2);
  assert.ok(result.includes('--override cooldown'), `expected --override cooldown in: ${result}`);
  assert.ok(result.includes('--override scripts'), `expected --override scripts in: ${result}`);
});

test('produces three --override flags for three blocking rules', () => {
  const result = generateApprovalCommand(
    makeCheckResult({ blockingRules: ['cooldown', 'scripts', 'provenance'] }),
    {}
  );
  const overrideMatches = result.match(/--override \S+/g) || [];
  assert.equal(overrideMatches.length, 3);
});

// ---------------------------------------------------------------------------
// AC: --expires included when policyConfig.default_expiry is set
// ---------------------------------------------------------------------------

test('includes --expires when policyConfig.default_expiry is set', () => {
  const result = generateApprovalCommand(
    makeCheckResult(),
    { default_expiry: '7d' }
  );
  assert.ok(result.includes('--expires 7d'), `expected --expires 7d in: ${result}`);
});

test('includes --expires with hours duration', () => {
  const result = generateApprovalCommand(
    makeCheckResult(),
    { default_expiry: '24h' }
  );
  assert.ok(result.includes('--expires 24h'), `expected --expires 24h in: ${result}`);
});

// ---------------------------------------------------------------------------
// AC: --expires omitted when no default_expiry configured
// ---------------------------------------------------------------------------

test('omits --expires when policyConfig.default_expiry is absent', () => {
  const result = generateApprovalCommand(makeCheckResult(), {});
  assert.ok(!result.includes('--expires'), `expected no --expires in: ${result}`);
});

test('omits --expires when policyConfig.default_expiry is undefined', () => {
  const result = generateApprovalCommand(
    makeCheckResult(),
    { default_expiry: undefined }
  );
  assert.ok(!result.includes('--expires'), `expected no --expires in: ${result}`);
});

test('omits --expires when policyConfig.default_expiry is empty string', () => {
  const result = generateApprovalCommand(
    makeCheckResult(),
    { default_expiry: '' }
  );
  assert.ok(!result.includes('--expires'), `expected no --expires in: ${result}`);
});

// ---------------------------------------------------------------------------
// AC: full command structure — integration-style check
// ---------------------------------------------------------------------------

test('generates correct full command for a real-world scenario', () => {
  const checkResult = {
    packageName: '@babel/core',
    version: '7.24.0',
    blockingRules: ['cooldown', 'provenance'],
  };
  const policyConfig = { default_expiry: '30d' };

  const result = generateApprovalCommand(checkResult, policyConfig);

  assert.equal(
    result,
    'trustlock approve @babel/core@7.24.0 --override cooldown --override provenance --expires 30d'
  );
});

test('generates correct command without --expires', () => {
  const checkResult = {
    packageName: 'express',
    version: '4.18.2',
    blockingRules: ['new-dep'],
  };

  const result = generateApprovalCommand(checkResult, {});

  assert.equal(result, 'trustlock approve express@4.18.2 --override new-dep');
});
