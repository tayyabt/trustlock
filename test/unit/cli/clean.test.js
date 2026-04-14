/**
 * Unit tests for `trustlock clean-approvals` command.
 *
 * Coverage:
 *   AC1  - removes expired entries from approvals.json and prints counts
 *   AC2  - no expired entries → "No expired approvals found." exits 0
 *   AC3  - preserves active approvals while removing only expired ones
 *   AC4  - approvals.json missing (project not initialized) → exit 2
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../../src/cli/commands/clean.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir;
let stdoutLines;
let stderrLines;
let origStdoutWrite;
let origStderrWrite;

function captureOutput() {
  stdoutLines = [];
  stderrLines = [];
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    stdoutLines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  process.stderr.write = (chunk) => {
    stderrLines.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
}

function restoreOutput() {
  if (origStdoutWrite) process.stdout.write = origStdoutWrite;
  if (origStderrWrite) process.stderr.write = origStderrWrite;
  origStdoutWrite = null;
  origStderrWrite = null;
}

/** Build a dummy approval entry with a specific expiry. */
function makeApproval(name, version, expiresAt) {
  return {
    package: name,
    version,
    overrides: ['cooldown'],
    reason: 'test',
    approver: 'Test User',
    approved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    expires_at: expiresAt,
  };
}

/** ISO timestamp `offsetMs` milliseconds from now. Negative for past. */
function isoOffset(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Set up a minimal project in testDir with given approvals array. */
async function setupProject(approvals = []) {
  await mkdir(join(testDir, '.trustlock'), { recursive: true });
  await writeFile(join(testDir, '.trustlock', 'approvals.json'), JSON.stringify(approvals, null, 2));
}

/** Build a minimal parsed-args object. */
function makeArgs() {
  return { values: {}, positionals: ['clean-approvals'] };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = join(tmpdir(), `trustlock-clean-test-${process.pid}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  captureOutput();
  process.exitCode = 0;
});

afterEach(async () => {
  restoreOutput();
  process.exitCode = 0;
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
    testDir = null;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('AC1: removes expired entries and prints correct counts', async () => {
  const expired1 = makeApproval('lodash', '4.17.20', isoOffset(-1));     // expired 1ms ago
  const expired2 = makeApproval('axios',  '1.0.0',  isoOffset(-1000));   // expired 1s ago
  const active1  = makeApproval('react',  '18.0.0', isoOffset(86400000)); // expires in 1 day

  await setupProject([expired1, expired2, active1]);

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);
  assert.equal(stderrLines.length, 0, `Unexpected stderr: ${stderrLines.join('')}`);

  const out = stdoutLines.join('');
  assert.ok(
    out.includes('Removed 2 expired approval(s). 1 active approval(s) remain.'),
    `Unexpected output: ${out}`
  );

  // Verify file content: only active approval remains
  const written = JSON.parse(await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 1);
  assert.equal(written[0].package, 'react');
});

test('AC2: no expired entries → "No expired approvals found." exits 0', async () => {
  const active1 = makeApproval('lodash', '4.17.21', isoOffset(86400000));
  const active2 = makeApproval('axios',  '1.14.1',  isoOffset(172800000));

  await setupProject([active1, active2]);

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(
    out.includes('No expired approvals found.'),
    `Expected no-expired message, got: ${out}`
  );

  // File unchanged — both approvals still present
  const written = JSON.parse(await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 2);
});

test('AC2b: empty approvals.json → "No expired approvals found." exits 0', async () => {
  await setupProject([]);

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(out.includes('No expired approvals found.'), `Unexpected output: ${out}`);
});

test('AC3: preserves active approvals while removing only expired', async () => {
  const expired = makeApproval('old-pkg', '1.0.0',  isoOffset(-5000));    // 5s ago
  const active1 = makeApproval('pkg-a',   '2.0.0',  isoOffset(3600000));  // 1 hour
  const active2 = makeApproval('pkg-b',   '3.0.0',  isoOffset(7200000));  // 2 hours

  await setupProject([active1, expired, active2]);

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(
    out.includes('Removed 1 expired approval(s). 2 active approval(s) remain.'),
    `Unexpected output: ${out}`
  );

  const written = JSON.parse(await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 2);

  const names = written.map((e) => e.package);
  assert.ok(names.includes('pkg-a'), 'pkg-a should be preserved');
  assert.ok(names.includes('pkg-b'), 'pkg-b should be preserved');
  assert.ok(!names.includes('old-pkg'), 'old-pkg should be removed');
});

test('AC4: missing approvals.json exits 2 with error message', async () => {
  // Do NOT create .trustlock/approvals.json
  await mkdir(join(testDir, '.trustlock'), { recursive: true });

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(
    errOut.includes('Approvals file not found') || errOut.includes('ENOENT') || errOut.includes('trustlock init'),
    `Expected initialization error, got: ${errOut}`
  );
});

test('singular approval count uses singular form "approval(s)"', async () => {
  const expired = makeApproval('only-expired', '1.0.0', isoOffset(-1));
  const active  = makeApproval('only-active',  '2.0.0', isoOffset(86400000));

  await setupProject([expired, active]);

  await run(makeArgs(), { _cwd: testDir });

  const out = stdoutLines.join('');
  assert.ok(
    out.includes('Removed 1 expired approval(s). 1 active approval(s) remain.'),
    `Unexpected output: ${out}`
  );
});

test('all entries removed → 0 active remain in output', async () => {
  const expired1 = makeApproval('pkg-a', '1.0.0', isoOffset(-1000));
  const expired2 = makeApproval('pkg-b', '2.0.0', isoOffset(-2000));

  await setupProject([expired1, expired2]);

  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(
    out.includes('Removed 2 expired approval(s). 0 active approval(s) remain.'),
    `Unexpected output: ${out}`
  );

  const written = JSON.parse(await readFile(join(testDir, '.trustlock', 'approvals.json'), 'utf8'));
  assert.equal(written.length, 0);
});
