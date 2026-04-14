/**
 * Unit tests for `trustlock install-hook` command.
 *
 * Coverage:
 *   AC1  - no hook → creates with shebang + trustlock check + chmod +x
 *   AC2  - hook already contains "trustlock check" → "Hook already installed." (edge case #8)
 *   AC3  - hook exists without trustlock check, no --force → appends
 *   AC4  - hook exists with custom content + --force → warns + overwrites (edge case #9)
 *   AC5  - no .git/ directory → exit 2 + "Not a git repository"
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../../src/cli/commands/install-hook.js';

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

/** Create a fake .git/hooks/ directory (and optionally a pre-commit file). */
async function setupGitDir(content = null) {
  const hooksDir = join(testDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  if (content !== null) {
    await writeFile(join(hooksDir, 'pre-commit'), content, 'utf8');
  }
}

/** Build a minimal parsed-args object. */
function makeArgs({ force = false } = {}) {
  return {
    values: { force },
    positionals: ['install-hook'],
  };
}

/**
 * Injectable `_resolveGitCommonDir` that returns the testDir's .git directory.
 * Needed because temp dirs are not real git repos, so git rev-parse would fail.
 */
function fakeResolveGitDir(cwd) {
  return join(cwd, '.git');
}

/** Check whether a file has executable bit set for owner (mode & 0o100). */
async function isExecutable(filePath) {
  const s = await stat(filePath);
  return !!(s.mode & 0o100);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  testDir = join(tmpdir(), `trustlock-hook-test-${process.pid}-${Date.now()}`);
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

test('AC1: no hook → creates with shebang + trustlock check, makes executable', async () => {
  await setupGitDir(); // .git/hooks/ exists, no pre-commit file

  await run(makeArgs(), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);
  assert.equal(stderrLines.length, 0);

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  assert.ok(content.startsWith('#!/bin/sh'), 'Hook should start with shebang');
  assert.ok(content.includes('trustlock check'), 'Hook should contain trustlock check');
  assert.ok(await isExecutable(hookPath), 'Hook file should be executable');

  const out = stdoutLines.join('');
  assert.ok(out.includes('Installed trustlock pre-commit hook'), `Unexpected output: ${out}`);
});

test('AC1b: creates .git/hooks/ directory if it does not exist', async () => {
  // Only .git/ dir, no hooks/ subdir
  await mkdir(join(testDir, '.git'), { recursive: true });

  await run(makeArgs(), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');
  assert.ok(content.includes('trustlock check'));
});

test('AC2: hook already contains "trustlock check" → "Hook already installed." (edge case #8)', async () => {
  const existingHook = '#!/bin/sh\n# CI checks\ntrustlock check\n';
  await setupGitDir(existingHook);

  await run(makeArgs(), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  assert.equal(stderrLines.length, 0);

  const out = stdoutLines.join('');
  assert.ok(out.includes('Hook already installed.'), `Expected already-installed message, got: ${out}`);

  // File must NOT be modified
  const content = await readFile(join(testDir, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.equal(content, existingHook, 'Hook content should not be changed when already installed');
});

test('AC3: hook exists without trustlock, no --force → appends trustlock check', async () => {
  const existingHook = '#!/bin/sh\necho "Running my custom checks"\n';
  await setupGitDir(existingHook);

  await run(makeArgs({ force: false }), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  assert.equal(stderrLines.length, 0);

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  // Existing content must still be there
  assert.ok(content.includes('echo "Running my custom checks"'), 'Existing content should be preserved');
  // trustlock check must be appended
  assert.ok(content.includes('trustlock check'), 'trustlock check should be appended');
  // Must not have duplicate lines
  const depFenceLineCount = content.split('\n').filter((l) => l.trim() === 'trustlock check').length;
  assert.equal(depFenceLineCount, 1, 'trustlock check should appear exactly once');

  assert.ok(await isExecutable(hookPath), 'Hook should be executable after append');

  const out = stdoutLines.join('');
  assert.ok(out.includes('Appended trustlock check'), `Unexpected output: ${out}`);
});

test('AC3b: appends correctly when existing hook has no trailing newline', async () => {
  const existingHook = '#!/bin/sh\nmy-check'; // no trailing newline
  await setupGitDir(existingHook);

  await run(makeArgs({ force: false }), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);

  const content = await readFile(join(testDir, '.git', 'hooks', 'pre-commit'), 'utf8');
  // Should have added a newline before trustlock check
  assert.ok(content.includes('my-check\ntrustlock check'), 'Should insert newline before appended line');
});

test('AC4: hook exists with custom content + --force → warns + overwrites (edge case #9)', async () => {
  const existingHook = '#!/bin/sh\necho "My important custom hook"\nmy-special-check\n';
  await setupGitDir(existingHook);

  await run(makeArgs({ force: true }), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  assert.equal(stderrLines.length, 0);

  const out = stdoutLines.join('');
  assert.ok(
    out.includes('Overwriting existing pre-commit hook.'),
    `Expected overwrite warning, got: ${out}`
  );
  assert.ok(
    out.includes('Installed trustlock pre-commit hook'),
    `Expected install message, got: ${out}`
  );

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  // Old custom content should be gone
  assert.ok(!content.includes('My important custom hook'), 'Old content should be replaced');
  // Fresh hook content
  assert.ok(content.startsWith('#!/bin/sh'), 'Fresh hook should start with shebang');
  assert.ok(content.includes('trustlock check'), 'Fresh hook should contain trustlock check');

  assert.ok(await isExecutable(hookPath), 'Overwritten hook should be executable');
});

test('AC5: no .git/ directory → exit 2 with "not a git repository"', async () => {
  // testDir exists but has no .git/ entry — resolvePaths walks up and finds nothing
  await run(makeArgs(), { _cwd: testDir });

  assert.equal(process.exitCode, 2);
  const errOut = stderrLines.join('');
  assert.ok(
    errOut.toLowerCase().includes('not a git repository'),
    `Expected "not a git repository" error, got: ${errOut}`
  );
  assert.equal(stdoutLines.length, 0, 'Should produce no stdout on fatal error');
});

test('--force on non-existent hook still creates fresh hook', async () => {
  await setupGitDir(); // hooks dir exists, no pre-commit

  await run(makeArgs({ force: true }), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');
  assert.ok(content.includes('trustlock check'));
  assert.ok(await isExecutable(hookPath));
});

test('hook containing trustlock check is not modified even with --force', async () => {
  // --force only applies when hook exists WITHOUT trustlock check
  // Edge case #8 takes priority: if already installed, no action even with --force
  const existingHook = '#!/bin/sh\ntrustlock check\n';
  await setupGitDir(existingHook);

  await run(makeArgs({ force: true }), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  const out = stdoutLines.join('');
  assert.ok(out.includes('Hook already installed.'), `Expected already-installed message, got: ${out}`);

  const content = await readFile(join(testDir, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.equal(content, existingHook);
});

// ---------------------------------------------------------------------------
// Monorepo: --project-dir embedded in hook script
// ---------------------------------------------------------------------------

test('flat repo (projectRoot === gitRoot) — hook has no --project-dir flag', async () => {
  await setupGitDir(); // .git/ in testDir (projectRoot === gitRoot)

  await run(makeArgs(), { _cwd: testDir, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0);
  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  assert.ok(content.includes('trustlock check'), 'Hook should contain trustlock check');
  assert.ok(!content.includes('--project-dir'), 'Flat repo hook should not have --project-dir');
});

test('monorepo — hook embeds --project-dir with relative path from gitRoot to projectRoot', async () => {
  // gitRoot is testDir, projectRoot is testDir/packages/backend
  const subPackage = join(testDir, 'packages', 'backend');
  await mkdir(subPackage, { recursive: true });
  // .git/ is in testDir (gitRoot)
  const hooksDir = join(testDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });

  // fakeResolveGitDir will be called with gitRoot (= testDir) and return testDir/.git
  await run(makeArgs(), { _cwd: subPackage, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  assert.ok(content.includes('trustlock check'), 'Hook should contain trustlock check');
  assert.ok(
    content.includes('--project-dir'),
    `Monorepo hook should have --project-dir, got: ${content}`
  );
  assert.ok(
    content.includes('packages/backend'),
    `Hook should embed relative path 'packages/backend', got: ${content}`
  );
});

test('monorepo path with spaces — correctly single-quoted in hook script', async () => {
  // projectRoot is testDir/my packages/backend (path contains a space)
  const subPackage = join(testDir, 'my packages', 'backend');
  await mkdir(subPackage, { recursive: true });
  const hooksDir = join(testDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });

  await run(makeArgs(), { _cwd: subPackage, _resolveGitCommonDir: fakeResolveGitDir });

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${stderrLines.join('')}`);

  const hookPath = join(testDir, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  // The path with spaces must be quoted — check for single-quoted segment
  assert.ok(
    content.includes("'my packages/backend'"),
    `Expected single-quoted path in hook, got: ${content}`
  );
  assert.ok(
    content.includes('--project-dir'),
    `Hook should have --project-dir flag, got: ${content}`
  );
});
