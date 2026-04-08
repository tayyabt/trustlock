import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExpired, findValidApproval } from '../../src/approvals/validator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();   // 7 days ago
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

/**
 * Build an Approval object with sensible defaults. Fields can be overridden.
 */
function makeApproval(overrides = {}) {
  return {
    package: 'lodash',
    version: '4.17.21',
    overrides: ['cooldown'],
    reason: 'approved for test',
    approver: 'alice',
    approved_at: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
    expires_at: FUTURE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isExpired — AC: returns true when expires_at is in the past
// ---------------------------------------------------------------------------

test('isExpired returns true when expires_at is in the past', () => {
  const approval = makeApproval({ expires_at: PAST });
  assert.equal(isExpired(approval), true);
});

// ---------------------------------------------------------------------------
// isExpired — AC: returns false when expires_at is in the future
// ---------------------------------------------------------------------------

test('isExpired returns false when expires_at is in the future', () => {
  const approval = makeApproval({ expires_at: FUTURE });
  assert.equal(isExpired(approval), false);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: returns matching non-expired approval when one exists
// ---------------------------------------------------------------------------

test('findValidApproval returns the matching non-expired approval', () => {
  const approval = makeApproval();
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.deepEqual(result, approval);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: returns null when no approval matches
// ---------------------------------------------------------------------------

test('findValidApproval returns null when approvals array is empty', () => {
  const result = findValidApproval([], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

test('findValidApproval returns null when package name does not match', () => {
  const approval = makeApproval({ package: 'chalk' });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

test('findValidApproval returns null when version does not match', () => {
  const approval = makeApproval({ version: '4.17.20' });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: returns null when the only matching approval is expired
// ---------------------------------------------------------------------------

test('findValidApproval returns null when the only matching approval is expired', () => {
  const approval = makeApproval({ expires_at: PAST });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

test('findValidApproval skips expired approvals and returns null when all are expired', () => {
  const approvals = [
    makeApproval({ expires_at: PAST }),
    makeApproval({ expires_at: PAST, approved_at: new Date(Date.now() - 2 * 60 * 1000).toISOString() }),
  ];
  const result = findValidApproval(approvals, 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: override intersection — approval must include queried rule
// ---------------------------------------------------------------------------

test('findValidApproval returns null when approval overrides a different rule (cooldown vs scripts)', () => {
  const approval = makeApproval({ overrides: ['cooldown'] });
  // Query for 'scripts' — approval only covers 'cooldown'
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'scripts');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: partial override match — approval covers cooldown but query is scripts
// ---------------------------------------------------------------------------

test('findValidApproval returns null when approval covers some rules but not the queried one', () => {
  const approval = makeApproval({ overrides: ['cooldown', 'provenance'] });
  // Query for 'scripts' — not in overrides
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'scripts');
  assert.equal(result, null);
});

test('findValidApproval returns the approval when the queried rule is in a multi-rule overrides list', () => {
  const approval = makeApproval({ overrides: ['cooldown', 'scripts'] });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'scripts');
  assert.deepEqual(result, approval);
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: empty overrides array never matches any rule (D9)
// ---------------------------------------------------------------------------

test('findValidApproval returns null when approval has empty overrides array (D9: no wildcard)', () => {
  const approval = makeApproval({ overrides: [] });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

test('findValidApproval with empty overrides returns null regardless of queried rule', () => {
  const approval = makeApproval({ overrides: [] });
  for (const rule of ['cooldown', 'scripts', 'provenance', 'pinning', 'sources', 'new-dep', 'transitive']) {
    const result = findValidApproval([approval], 'lodash', '4.17.21', rule);
    assert.equal(result, null, `empty overrides must not match rule "${rule}"`);
  }
});

// ---------------------------------------------------------------------------
// findValidApproval — AC: most-recent-wins when multiple non-expired approvals match
// ---------------------------------------------------------------------------

test('findValidApproval returns the most recently approved entry when multiple match', () => {
  const older = makeApproval({
    approved_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    reason: 'older approval',
  });
  const newer = makeApproval({
    approved_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    reason: 'newer approval',
  });

  // Pass older first to ensure ordering is not input-order dependent
  const result = findValidApproval([older, newer], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result.reason, 'newer approval');
});

test('findValidApproval skips expired approvals when selecting most-recent non-expired winner', () => {
  const expiredRecent = makeApproval({
    approved_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 min ago (more recent)
    expires_at: PAST,
    reason: 'recently approved but already expired',
  });
  const activeOlder = makeApproval({
    approved_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    expires_at: FUTURE,
    reason: 'older but still active',
  });

  const result = findValidApproval([expiredRecent, activeOlder], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result.reason, 'older but still active');
});

// ---------------------------------------------------------------------------
// findValidApproval — additional edge cases
// ---------------------------------------------------------------------------

test('findValidApproval returns null when approval package matches but version is different', () => {
  // Same package name, different version — should NOT match
  const approval = makeApproval({ version: '3.10.1' });
  const result = findValidApproval([approval], 'lodash', '4.17.21', 'cooldown');
  assert.equal(result, null);
});

test('findValidApproval handles mixed valid and invalid approvals correctly', () => {
  const expired = makeApproval({ expires_at: PAST, reason: 'expired' });
  const wrongPkg = makeApproval({ package: 'chalk', reason: 'wrong package' });
  const wrongRule = makeApproval({ overrides: ['scripts'], reason: 'wrong rule' });
  const valid = makeApproval({ reason: 'valid' });

  const result = findValidApproval(
    [expired, wrongPkg, wrongRule, valid],
    'lodash', '4.17.21', 'cooldown'
  );
  assert.equal(result.reason, 'valid');
});
