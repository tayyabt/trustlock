import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../src/policy/rules/cooldown.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dep = { name: 'lodash', version: '4.17.21' };
const policy72h = { cooldown_hours: 72 };

// Reference "now" for all tests: 2026-04-09T12:00:00.000Z
const NOW = new Date('2026-04-09T12:00:00.000Z');

// Published 1 hour ago — too new for a 72h cooldown.
const publishedAt1HourAgo = new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString();

// Published 100 hours ago — old enough for a 72h cooldown.
const publishedAt100HoursAgo = new Date(NOW.getTime() - 100 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Skipped — publishedAt unavailable
// ---------------------------------------------------------------------------

test('cooldown: skipped when registryData is null', () => {
  const findings = evaluate(dep, null, null, policy72h, NOW);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'exposure:cooldown');
  assert.equal(f.severity, 'skipped');
  assert.equal(f.message, 'skipped: registry unreachable');
  assert.ok('detail' in f);
});

test('cooldown: skipped when registryData.publishedAt is null', () => {
  const findings = evaluate(dep, null, { publishedAt: null }, policy72h, NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'skipped');
});

test('cooldown: skipped when registryData.publishedAt is undefined', () => {
  const findings = evaluate(dep, null, {}, policy72h, NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'skipped');
});

test('cooldown: skipped when publishedAt is not a valid ISO timestamp', () => {
  const findings = evaluate(dep, null, { publishedAt: 'not-a-date' }, policy72h, NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'skipped');
});

// ---------------------------------------------------------------------------
// Block — too new, includes clears_at (D4)
// ---------------------------------------------------------------------------

test('cooldown: blocks when age < cooldown_hours', () => {
  const findings = evaluate(dep, null, { publishedAt: publishedAt1HourAgo }, policy72h, NOW);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'exposure:cooldown');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('lodash@4.17.21'));
  assert.ok(f.message.includes('72h'));
});

test('cooldown: clears_at is ISO 8601 UTC string and equals publishedAt + cooldown_hours (D4)', () => {
  const findings = evaluate(dep, null, { publishedAt: publishedAt1HourAgo }, policy72h, NOW);
  assert.equal(findings.length, 1);
  const { detail } = findings[0];
  assert.ok('clears_at' in detail, 'detail.clears_at must be present');

  // clears_at = publishedAt + 72h
  const expectedClearsAt = new Date(
    new Date(publishedAt1HourAgo).getTime() + 72 * 60 * 60 * 1000
  ).toISOString();
  assert.equal(detail.clears_at, expectedClearsAt);

  // Must be a valid ISO 8601 UTC string (ends with Z or +00:00)
  assert.ok(
    detail.clears_at.endsWith('Z') || detail.clears_at.includes('+00:00'),
    `clears_at must be UTC: ${detail.clears_at}`
  );
});

test('cooldown: detail includes publishedAt and cooldown_hours', () => {
  const findings = evaluate(dep, null, { publishedAt: publishedAt1HourAgo }, policy72h, NOW);
  const { detail } = findings[0];
  assert.equal(detail.publishedAt, publishedAt1HourAgo);
  assert.equal(detail.cooldown_hours, 72);
  assert.equal(detail.name, 'lodash');
  assert.equal(detail.version, '4.17.21');
});

// ---------------------------------------------------------------------------
// Admit — old enough
// ---------------------------------------------------------------------------

test('cooldown: admits when age >= cooldown_hours', () => {
  const findings = evaluate(dep, null, { publishedAt: publishedAt100HoursAgo }, policy72h, NOW);
  assert.equal(findings.length, 0);
});

test('cooldown: admits when age exactly equals cooldown_hours', () => {
  const exactlyOnCooldown = new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const findings = evaluate(dep, null, { publishedAt: exactlyOnCooldown }, policy72h, NOW);
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Custom cooldown threshold
// ---------------------------------------------------------------------------

test('cooldown: respects custom cooldown_hours from policy', () => {
  const policy24h = { cooldown_hours: 24 };
  // Published 1 hour ago — blocks under 24h policy.
  const findingsBlock = evaluate(dep, null, { publishedAt: publishedAt1HourAgo }, policy24h, NOW);
  assert.equal(findingsBlock.length, 1);
  assert.equal(findingsBlock[0].detail.cooldown_hours, 24);

  // Published 100 hours ago — admits under 24h policy.
  const findingsAdmit = evaluate(dep, null, { publishedAt: publishedAt100HoursAgo }, policy24h, NOW);
  assert.equal(findingsAdmit.length, 0);
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('cooldown: all Finding fields present on block finding', () => {
  const findings = evaluate(dep, null, { publishedAt: publishedAt1HourAgo }, policy72h, NOW);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.ok('rule' in f, 'missing rule');
  assert.ok('severity' in f, 'missing severity');
  assert.ok('message' in f, 'missing message');
  assert.ok('detail' in f, 'missing detail');
});

test('cooldown: all Finding fields present on skipped finding', () => {
  const findings = evaluate(dep, null, null, policy72h, NOW);
  const f = findings[0];
  assert.ok('rule' in f);
  assert.ok('severity' in f);
  assert.ok('message' in f);
  assert.ok('detail' in f);
});
