import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePublisher } from '../../src/registry/publisher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOld(publisherAccount) {
  return { publisherAccount };
}

function makeNew(publisherAccount) {
  return { publisherAccount };
}

function makeConfig(opts = {}) {
  const base = {};
  if (opts.block_on_publisher_change !== undefined) {
    base.provenance = { block_on_publisher_change: opts.block_on_publisher_change };
  }
  return base;
}

// ---------------------------------------------------------------------------
// AC5 / AC11: Publisher change + block_on_publisher_change: true (default) → blocked
// ---------------------------------------------------------------------------

test('comparePublisher blocks when old and new publishers differ and block_on_publisher_change is true', () => {
  const result = comparePublisher(
    makeOld('alice'),
    makeNew('bob'),
    makeConfig({ block_on_publisher_change: true })
  );
  assert.equal(result.blocked, true);
  assert.equal(result.warning, null);
  assert.equal(result.newPublisherAccount, 'bob');
});

// AC11: absent block_on_publisher_change → defaults to true
test('comparePublisher defaults block_on_publisher_change to true when absent from config', () => {
  const result = comparePublisher(makeOld('alice'), makeNew('bob'), {});
  assert.equal(result.blocked, true);
  assert.equal(result.warning, null);
});

test('comparePublisher defaults block_on_publisher_change to true when config.provenance is absent', () => {
  const result = comparePublisher(makeOld('alice'), makeNew('bob'), {});
  assert.equal(result.blocked, true);
});

test('comparePublisher defaults block_on_publisher_change to true when config is null/undefined', () => {
  assert.equal(comparePublisher(makeOld('alice'), makeNew('bob'), null).blocked, true);
  assert.equal(comparePublisher(makeOld('alice'), makeNew('bob'), undefined).blocked, true);
});

// ---------------------------------------------------------------------------
// AC7: block_on_publisher_change: false → warn only, no block
// ---------------------------------------------------------------------------

test('comparePublisher warns but does not block when block_on_publisher_change is false', () => {
  const result = comparePublisher(
    makeOld('alice'),
    makeNew('bob'),
    makeConfig({ block_on_publisher_change: false })
  );
  assert.equal(result.blocked, false);
  assert.ok(typeof result.warning === 'string' && result.warning.length > 0,
    'warning must be a non-empty string');
  assert.equal(result.newPublisherAccount, 'bob');
});

// ---------------------------------------------------------------------------
// AC6 / EC8: Old publisher null → warn only, never block (D15)
// ---------------------------------------------------------------------------

test('comparePublisher warns but does not block when old publisher is null', () => {
  const result = comparePublisher(
    makeOld(null),
    makeNew('bob'),
    makeConfig({ block_on_publisher_change: true })
  );
  assert.equal(result.blocked, false);
  assert.ok(typeof result.warning === 'string', 'warning must be returned');
  assert.ok(result.warning.includes('no prior record'), `expected "no prior record" in: ${result.warning}`);
  assert.equal(result.newPublisherAccount, 'bob');
});

test('comparePublisher warns but does not block when old publisher is undefined (v1 entry)', () => {
  const result = comparePublisher(
    { publisherAccount: undefined },
    makeNew('bob'),
    makeConfig({ block_on_publisher_change: true })
  );
  assert.equal(result.blocked, false);
  assert.ok(result.warning !== null, 'warning must be returned');
});

// EC8: Both publishers null → warn only
test('comparePublisher warns but does not block when both publishers are null', () => {
  const result = comparePublisher(makeOld(null), makeNew(null), makeConfig({ block_on_publisher_change: true }));
  assert.equal(result.blocked, false);
  assert.ok(result.warning !== null, 'warning must be returned');
  assert.equal(result.newPublisherAccount, null);
});

// ---------------------------------------------------------------------------
// New publisher null → warn only, no block
// ---------------------------------------------------------------------------

test('comparePublisher warns but does not block when new publisher is null', () => {
  const result = comparePublisher(makeOld('alice'), makeNew(null), {});
  assert.equal(result.blocked, false);
  assert.ok(typeof result.warning === 'string', 'warning must be returned for null new publisher');
  assert.equal(result.newPublisherAccount, null);
});

// ---------------------------------------------------------------------------
// Same publisher → no action
// ---------------------------------------------------------------------------

test('comparePublisher returns no block and no warning when publishers are the same', () => {
  const result = comparePublisher(makeOld('alice'), makeNew('alice'), {});
  assert.equal(result.blocked, false);
  assert.equal(result.warning, null);
  assert.equal(result.newPublisherAccount, 'alice');
});

test('comparePublisher returns no block when same publisher, block_on_publisher_change: true', () => {
  const result = comparePublisher(
    makeOld('alice'),
    makeNew('alice'),
    makeConfig({ block_on_publisher_change: true })
  );
  assert.equal(result.blocked, false);
  assert.equal(result.warning, null);
});

// ---------------------------------------------------------------------------
// AC13 / EC4: Publisher reverts to original account → rule fires again
// ---------------------------------------------------------------------------

test('comparePublisher blocks when publisher changes back to an earlier account (regression scenario)', () => {
  // Current baseline publisher is 'bob' (was set after initial change).
  // New version publisher is 'alice' again — still a change from 'bob'.
  const result = comparePublisher(
    makeOld('bob'),
    makeNew('alice'),
    makeConfig({ block_on_publisher_change: true })
  );
  assert.equal(result.blocked, true);
  assert.equal(result.newPublisherAccount, 'alice');
});

// ---------------------------------------------------------------------------
// Return shape contract
// ---------------------------------------------------------------------------

test('comparePublisher always returns the correct shape', () => {
  const cases = [
    [makeOld('alice'), makeNew('bob'), {}],
    [makeOld(null), makeNew('bob'), {}],
    [makeOld('alice'), makeNew(null), {}],
    [makeOld(null), makeNew(null), {}],
    [makeOld('alice'), makeNew('alice'), {}],
  ];

  for (const [old, newMeta, config] of cases) {
    const result = comparePublisher(old, newMeta, config);
    assert.ok('blocked' in result, 'must have blocked field');
    assert.ok('warning' in result, 'must have warning field');
    assert.ok('newPublisherAccount' in result, 'must have newPublisherAccount field');
    assert.ok(typeof result.blocked === 'boolean', 'blocked must be boolean');
    assert.ok(result.warning === null || typeof result.warning === 'string', 'warning must be null or string');
  }
});

// ---------------------------------------------------------------------------
// Scoped package names (edge case)
// ---------------------------------------------------------------------------

test('comparePublisher handles scoped package publishers correctly', () => {
  const result = comparePublisher(makeOld('scope-owner'), makeNew('other-owner'), {});
  assert.equal(result.blocked, true);
});
