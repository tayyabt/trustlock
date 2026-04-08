import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPolicy } from '../../src/policy/config.js';
import {
  PolicyConfig,
  Finding,
  CheckResult,
  DependencyCheckResult,
} from '../../src/policy/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../fixtures/policy');

// ---------------------------------------------------------------------------
// models.js — shape exports
// ---------------------------------------------------------------------------

test('models: PolicyConfig exports all required fields', () => {
  assert.ok('cooldown_hours' in PolicyConfig, 'missing cooldown_hours');
  assert.ok('pinning' in PolicyConfig, 'missing pinning');
  assert.ok('required' in PolicyConfig.pinning, 'missing pinning.required');
  assert.ok('scripts' in PolicyConfig, 'missing scripts');
  assert.ok('allowlist' in PolicyConfig.scripts, 'missing scripts.allowlist');
  assert.ok('sources' in PolicyConfig, 'missing sources');
  assert.ok('allowed' in PolicyConfig.sources, 'missing sources.allowed');
  assert.ok('provenance' in PolicyConfig, 'missing provenance');
  assert.ok('required_for' in PolicyConfig.provenance, 'missing provenance.required_for');
  assert.ok('transitive' in PolicyConfig, 'missing transitive');
  assert.ok('max_new' in PolicyConfig.transitive, 'missing transitive.max_new');
});

test('models: Finding exports all required fields', () => {
  assert.ok('rule' in Finding, 'missing rule');
  assert.ok('severity' in Finding, 'missing severity');
  assert.ok('message' in Finding, 'missing message');
  assert.ok('detail' in Finding, 'missing detail');
});

test('models: CheckResult exports all required fields', () => {
  assert.ok('decision' in CheckResult, 'missing decision');
  assert.ok('findings' in CheckResult, 'missing findings');
  assert.ok('approvalCommand' in CheckResult, 'missing approvalCommand');
});

test('models: DependencyCheckResult exports all required fields', () => {
  assert.ok('name' in DependencyCheckResult, 'missing name');
  assert.ok('version' in DependencyCheckResult, 'missing version');
  assert.ok('checkResult' in DependencyCheckResult, 'missing checkResult');
});

// ---------------------------------------------------------------------------
// loadPolicy — valid full config (all fields provided)
// ---------------------------------------------------------------------------

test('loadPolicy: valid full config — all fields match file values', async () => {
  const policy = await loadPolicy(join(FIXTURES, 'valid-full.json'));

  assert.equal(policy.cooldown_hours, 48);
  assert.equal(policy.pinning.required, true);
  assert.deepEqual(policy.scripts.allowlist, ['esbuild', 'husky']);
  assert.deepEqual(policy.sources.allowed, ['registry', 'git']);
  assert.deepEqual(policy.provenance.required_for, ['express', 'lodash']);
  assert.equal(policy.transitive.max_new, 3);
});

// ---------------------------------------------------------------------------
// loadPolicy — valid sparse config (defaults fill missing fields)
// ---------------------------------------------------------------------------

test('loadPolicy: valid sparse config — missing fields filled from defaults', async () => {
  const policy = await loadPolicy(join(FIXTURES, 'valid-sparse.json'));

  // File only provides cooldown_hours
  assert.equal(policy.cooldown_hours, 24);

  // All other fields come from defaults
  assert.equal(policy.pinning.required, false);
  assert.deepEqual(policy.scripts.allowlist, []);
  assert.deepEqual(policy.sources.allowed, ['registry']);
  assert.deepEqual(policy.provenance.required_for, []);
  assert.equal(policy.transitive.max_new, 5);
});

// ---------------------------------------------------------------------------
// loadPolicy — missing file
// ---------------------------------------------------------------------------

test('loadPolicy: missing file throws with exitCode 2 and path in message', async () => {
  const missingPath = join(FIXTURES, 'does-not-exist.json');

  await assert.rejects(
    () => loadPolicy(missingPath),
    (err) => {
      assert.equal(err.exitCode, 2, 'exitCode must be 2');
      assert.ok(
        err.message.includes(missingPath),
        `message should include path, got: ${err.message}`
      );
      assert.ok(
        err.message.startsWith('Policy file not found:'),
        `message should start with "Policy file not found:", got: ${err.message}`
      );
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// loadPolicy — malformed JSON
// ---------------------------------------------------------------------------

test('loadPolicy: malformed JSON throws with exitCode 2 and parse error detail', async () => {
  await assert.rejects(
    () => loadPolicy(join(FIXTURES, 'malformed.json')),
    (err) => {
      assert.equal(err.exitCode, 2, 'exitCode must be 2');
      assert.ok(
        err.message.startsWith('Failed to parse policy file:'),
        `message should start with "Failed to parse policy file:", got: ${err.message}`
      );
      // Message should include the parse error detail (not just a generic message)
      assert.ok(
        err.message.length > 'Failed to parse policy file:'.length,
        'message should include parse error detail'
      );
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// loadPolicy — unknown rule names are silently ignored
// ---------------------------------------------------------------------------

test('loadPolicy: unknown rule names in config are ignored — no error, known fields merged', async () => {
  const { writeFile, unlink } = await import('node:fs/promises');
  const { join: j } = await import('node:path');
  const tmpPath = j(FIXTURES, '_tmp-unknown-rules.json');

  const configWithUnknownKeys = JSON.stringify({
    cooldown_hours: 12,
    pinning: { required: true },
    'some-v02-rule': { enabled: true },
    unknown_future_key: 'value',
  });

  await writeFile(tmpPath, configWithUnknownKeys, 'utf8');

  try {
    const policy = await loadPolicy(tmpPath);

    // Known fields should be merged correctly
    assert.equal(policy.cooldown_hours, 12);
    assert.equal(policy.pinning.required, true);

    // Defaults fill in the rest
    assert.deepEqual(policy.scripts.allowlist, []);
    assert.deepEqual(policy.sources.allowed, ['registry']);

    // Unknown keys must NOT appear in the result
    assert.ok(!('some-v02-rule' in policy), 'unknown key should not be in result');
    assert.ok(!('unknown_future_key' in policy), 'unknown key should not be in result');
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
});
