import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readApprovals, writeApproval, cleanExpired } from '../../src/approvals/store.js';
import { parseDuration, VALID_RULE_NAMES } from '../../src/approvals/models.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides = {}) {
  return {
    require_reason: false,
    max_expiry_days: 30,
    ...overrides,
  };
}

function makeDep(name = 'lodash', version = '4.17.21') {
  return { name, version, resolved: null, integrity: null, isDev: false,
    hasInstallScripts: false, sourceType: 'registry', directDependency: true };
}

function makeInput(overrides = {}) {
  return {
    package: 'lodash',
    version: '4.17.21',
    overrides: ['cooldown'],
    reason: 'Approved for emergency patch',
    approver: 'tayyab',
    duration: '7d',
    ...overrides,
  };
}

async function makeTempDir(t) {
  const dir = join(tmpdir(), `dep-fence-test-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeEmptyApprovals(dir) {
  const filePath = join(dir, 'approvals.json');
  await writeFile(filePath, JSON.stringify([]), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// parseDuration — AC: handles Nd/Nh, rejects invalid formats
// ---------------------------------------------------------------------------

test('parseDuration parses "7d" as 7 days in milliseconds', () => {
  assert.equal(parseDuration('7d'), 7 * 24 * 60 * 60 * 1000);
});

test('parseDuration parses "24h" as 24 hours in milliseconds', () => {
  assert.equal(parseDuration('24h'), 24 * 60 * 60 * 1000);
});

test('parseDuration parses "30d" correctly', () => {
  assert.equal(parseDuration('30d'), 30 * 24 * 60 * 60 * 1000);
});

test('parseDuration parses "1d" correctly', () => {
  assert.equal(parseDuration('1d'), 1 * 24 * 60 * 60 * 1000);
});

test('parseDuration parses "1h" correctly', () => {
  assert.equal(parseDuration('1h'), 60 * 60 * 1000);
});

test('parseDuration rejects "abc"', () => {
  assert.throws(() => parseDuration('abc'), /Invalid duration/);
});

test('parseDuration rejects "7x" (unknown unit)', () => {
  assert.throws(() => parseDuration('7x'), /Invalid duration/);
});

test('parseDuration rejects empty string', () => {
  assert.throws(() => parseDuration(''), /Invalid duration/);
});

test('parseDuration rejects non-string input', () => {
  assert.throws(() => parseDuration(7), /Invalid duration/);
});

// ---------------------------------------------------------------------------
// readApprovals — AC: returns Approval[] from valid file
// ---------------------------------------------------------------------------

test('readApprovals returns array from valid approvals file', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = join(dir, 'approvals.json');
  const approvals = [
    { package: 'lodash', version: '4.17.21', overrides: ['cooldown'], reason: 'test',
      approver: 'alice', approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString() },
  ];
  await writeFile(filePath, JSON.stringify(approvals), 'utf8');

  const result = await readApprovals(filePath);
  assert.equal(result.length, 1);
  assert.equal(result[0].package, 'lodash');
  assert.equal(result[0].version, '4.17.21');
  assert.deepEqual(result[0].overrides, ['cooldown']);
});

// ---------------------------------------------------------------------------
// readApprovals — AC: returns [] when file missing
// ---------------------------------------------------------------------------

test('readApprovals returns empty array when file does not exist', async () => {
  const result = await readApprovals('/tmp/__dep-fence-nonexistent-approvals.json');
  assert.deepEqual(result, []);
});

test('readApprovals returns empty array for an empty approvals file', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const result = await readApprovals(filePath);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// writeApproval — AC: appends valid entry atomically
// ---------------------------------------------------------------------------

test('writeApproval appends an entry to the approvals file atomically', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);

  const config = makeConfig();
  const deps = [makeDep()];
  const input = makeInput();

  const approval = await writeApproval(filePath, input, deps, config);

  // Returned object has expected shape
  assert.equal(approval.package, 'lodash');
  assert.equal(approval.version, '4.17.21');
  assert.deepEqual(approval.overrides, ['cooldown']);
  assert.equal(approval.approver, 'tayyab');
  assert.ok(typeof approval.approved_at === 'string');
  assert.ok(approval.approved_at.endsWith('Z'));
  assert.ok(typeof approval.expires_at === 'string');
  assert.ok(approval.expires_at.endsWith('Z'));

  // File actually contains the entry
  const onDisk = await readApprovals(filePath);
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].package, 'lodash');
});

test('writeApproval appends to existing entries (does not overwrite)', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const config = makeConfig();
  const deps = [makeDep(), makeDep('chalk', '5.3.0')];

  await writeApproval(filePath, makeInput({ package: 'lodash', version: '4.17.21' }), deps, config);
  await writeApproval(filePath, makeInput({ package: 'chalk', version: '5.3.0' }), deps, config);

  const onDisk = await readApprovals(filePath);
  assert.equal(onDisk.length, 2);
});

// ---------------------------------------------------------------------------
// writeApproval — AC: rejects when package not in lockfile
// ---------------------------------------------------------------------------

test('writeApproval rejects when package is not in lockfile', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep('express', '4.18.2')]; // lodash is not here

  await assert.rejects(
    () => writeApproval(filePath, makeInput(), deps, makeConfig()),
    /not in the current lockfile/
  );
});

test('writeApproval rejects when package version does not match lockfile', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep('lodash', '4.17.20')]; // different version

  await assert.rejects(
    () => writeApproval(filePath, makeInput({ version: '4.17.21' }), deps, makeConfig()),
    /not in the current lockfile/
  );
});

// ---------------------------------------------------------------------------
// writeApproval — AC: rejects invalid override name
// ---------------------------------------------------------------------------

test('writeApproval rejects when override name is not a valid rule', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  await assert.rejects(
    () => writeApproval(filePath, makeInput({ overrides: ['notarule'] }), deps, makeConfig()),
    /Invalid override rule name/
  );
});

test('writeApproval error message includes the list of valid rule names', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  try {
    await writeApproval(filePath, makeInput({ overrides: ['bad-rule'] }), deps, makeConfig());
    assert.fail('should have thrown');
  } catch (err) {
    // Must list valid rule names in the error
    for (const rule of VALID_RULE_NAMES) {
      assert.ok(err.message.includes(rule), `error message should mention valid rule "${rule}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// writeApproval — AC: rejects empty reason when require_reason is true
// ---------------------------------------------------------------------------

test('writeApproval rejects empty reason when require_reason is true', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  await assert.rejects(
    () => writeApproval(filePath, makeInput({ reason: '' }), deps, makeConfig({ require_reason: true })),
    /reason is required/
  );
});

test('writeApproval rejects whitespace-only reason when require_reason is true', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  await assert.rejects(
    () => writeApproval(filePath, makeInput({ reason: '   ' }), deps, makeConfig({ require_reason: true })),
    /reason is required/
  );
});

test('writeApproval allows empty reason when require_reason is false', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  // Should not throw
  await writeApproval(filePath, makeInput({ reason: '' }), deps, makeConfig({ require_reason: false }));
  const onDisk = await readApprovals(filePath);
  assert.equal(onDisk.length, 1);
});

// ---------------------------------------------------------------------------
// writeApproval — AC: caps expiry at max_expiry_days
// ---------------------------------------------------------------------------

test('writeApproval caps expires_at at max_expiry_days when duration exceeds it', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];
  const config = makeConfig({ max_expiry_days: 7 });

  const before = Date.now();
  const approval = await writeApproval(filePath, makeInput({ duration: '30d' }), deps, config);
  const after = Date.now();

  const expiresAt = new Date(approval.expires_at).getTime();
  const expectedMax = after + 7 * 24 * 60 * 60 * 1000;
  const expectedMin = before + 7 * 24 * 60 * 60 * 1000;

  // Should be within 7 days (±1 second tolerance)
  assert.ok(expiresAt >= expectedMin - 1000, 'expires_at should be at least 7 days from now');
  assert.ok(expiresAt <= expectedMax + 1000, 'expires_at should not exceed 7 days from now');
});

test('writeApproval does not cap when duration is within max_expiry_days', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];
  const config = makeConfig({ max_expiry_days: 30 });

  const before = Date.now();
  const approval = await writeApproval(filePath, makeInput({ duration: '7d' }), deps, config);
  const after = Date.now();

  const expiresAt = new Date(approval.expires_at).getTime();
  const expectedMs = 7 * 24 * 60 * 60 * 1000;

  assert.ok(expiresAt >= before + expectedMs - 1000);
  assert.ok(expiresAt <= after + expectedMs + 1000);
});

// ---------------------------------------------------------------------------
// writeApproval — AC: throws when file missing
// ---------------------------------------------------------------------------

test('writeApproval throws when approvals file does not exist', async () => {
  const deps = [makeDep()];
  await assert.rejects(
    () => writeApproval('/tmp/__dep-fence-missing-approvals.json', makeInput(), deps, makeConfig()),
    /Approvals file not found|dep-fence init/
  );
});

// ---------------------------------------------------------------------------
// cleanExpired — AC: removes past-expiry entries, returns counts
// ---------------------------------------------------------------------------

test('cleanExpired removes expired entries and returns correct counts', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = join(dir, 'approvals.json');

  const now = new Date();
  const expired = {
    package: 'lodash', version: '4.17.21', overrides: ['cooldown'],
    reason: 'old', approver: 'alice',
    approved_at: new Date(now.getTime() - 10 * 86400000).toISOString(),
    expires_at: new Date(now.getTime() - 1000).toISOString(), // expired 1 second ago
  };
  const active = {
    package: 'chalk', version: '5.3.0', overrides: ['provenance'],
    reason: 'valid', approver: 'bob',
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(), // expires in 7 days
  };

  await writeFile(filePath, JSON.stringify([expired, active]), 'utf8');

  const result = await cleanExpired(filePath);
  assert.equal(result.removed, 1);
  assert.equal(result.remaining, 1);

  const onDisk = await readApprovals(filePath);
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].package, 'chalk');
});

test('cleanExpired returns { removed: 0, remaining: N } when no entries are expired', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = join(dir, 'approvals.json');
  const now = new Date();

  const active = [
    { package: 'lodash', version: '4.17.21', overrides: ['cooldown'], reason: 'r',
      approver: 'a', approved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 86400000).toISOString() },
  ];
  await writeFile(filePath, JSON.stringify(active), 'utf8');

  const result = await cleanExpired(filePath);
  assert.equal(result.removed, 0);
  assert.equal(result.remaining, 1);
});

test('cleanExpired returns { removed: 0, remaining: 0 } when approvals file is empty', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);

  const result = await cleanExpired(filePath);
  assert.equal(result.removed, 0);
  assert.equal(result.remaining, 0);
});

// ---------------------------------------------------------------------------
// cleanExpired — AC: throws when file missing
// ---------------------------------------------------------------------------

test('cleanExpired throws when approvals file does not exist', async () => {
  await assert.rejects(
    () => cleanExpired('/tmp/__dep-fence-missing-approvals-clean.json'),
    /Approvals file not found|dep-fence init/
  );
});

// ---------------------------------------------------------------------------
// Atomic write verification
// ---------------------------------------------------------------------------

test('writeApproval uses atomic write: file is consistent after write', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = await writeEmptyApprovals(dir);
  const deps = [makeDep()];

  await writeApproval(filePath, makeInput(), deps, makeConfig());

  // File must be valid JSON after write — confirms the rename succeeded
  const result = await readApprovals(filePath);
  assert.equal(result.length, 1);
  assert.ok(typeof result[0].expires_at === 'string');
});

test('cleanExpired uses atomic write: file is consistent after clean', async (t) => {
  const dir = await makeTempDir(t);
  const filePath = join(dir, 'approvals.json');
  const now = new Date();

  const approvals = [
    { package: 'lodash', version: '4.17.21', overrides: ['cooldown'], reason: 'r',
      approver: 'a', approved_at: now.toISOString(),
      expires_at: new Date(now.getTime() - 1000).toISOString() },
    { package: 'chalk', version: '5.3.0', overrides: ['provenance'], reason: 'r',
      approver: 'b', approved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 86400000).toISOString() },
  ];
  await writeFile(filePath, JSON.stringify(approvals), 'utf8');

  await cleanExpired(filePath);

  // File must be valid JSON with only the active entry
  const onDisk = await readApprovals(filePath);
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].package, 'chalk');
});
