/**
 * Integration test: `trustlock install-hook` from a monorepo sub-package.
 *
 * Verifies:
 *   AC3  - hook written to gitRoot/.git/hooks/pre-commit with --project-dir embedded
 *   AC8  - spaces in relative path from gitRoot to projectRoot are quoted correctly
 *   AC9  - projectRoot === gitRoot (flat repo): --project-dir omitted from hook
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../src/cli/commands/install-hook.js';

let repoRoot;

function captureOutput() {
  const captured = { stdout: [], stderr: [] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { captured.stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { captured.stderr.push(String(chunk)); return true; };
  return {
    captured,
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

/**
 * Injectable _resolveGitCommonDir that returns gitRoot/.git (absolute).
 * Prevents real `git rev-parse` calls against the fake temp repo.
 */
function fakeResolveGitDir(repoRootDir) {
  return (gitRoot) => join(gitRoot, '.git');
}

beforeEach(async () => {
  repoRoot = join(tmpdir(), `trustlock-monorepo-hook-${process.pid}-${Date.now()}`);
  await mkdir(repoRoot, { recursive: true });
  // Create the repo's .git/hooks/ directory (gitRoot)
  await mkdir(join(repoRoot, '.git', 'hooks'), { recursive: true });
  process.exitCode = 0;
});

afterEach(async () => {
  process.exitCode = 0;
  if (repoRoot) {
    await rm(repoRoot, { recursive: true, force: true });
    repoRoot = null;
  }
});

// ---------------------------------------------------------------------------
// AC3: hook written to gitRoot/.git/hooks/pre-commit with --project-dir
// ---------------------------------------------------------------------------

test('AC3: install-hook from packages/backend — hook at gitRoot with --project-dir embedded', async () => {
  const backendDir = join(repoRoot, 'packages', 'backend');
  await mkdir(backendDir, { recursive: true });

  const cap = captureOutput();
  try {
    await run(
      { values: { force: false }, positionals: ['install-hook'] },
      { _cwd: backendDir, _resolveGitCommonDir: fakeResolveGitDir(repoRoot) }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  // Hook must be at gitRoot/.git/hooks/pre-commit (not backendDir/.git/hooks/)
  const hookPath = join(repoRoot, '.git', 'hooks', 'pre-commit');
  let content;
  try {
    content = await readFile(hookPath, 'utf8');
  } catch (err) {
    assert.fail(`Hook file not found at gitRoot: ${err.message}`);
  }

  assert.ok(content.startsWith('#!/bin/sh'), 'Hook must start with shebang');
  assert.ok(content.includes('trustlock check'), 'Hook must contain trustlock check');
  assert.ok(
    content.includes('--project-dir'),
    `Hook must embed --project-dir for monorepo, got: ${content}`
  );
  assert.ok(
    content.includes('packages/backend'),
    `Hook must embed relative path 'packages/backend', got: ${content}`
  );

  const out = cap.captured.stdout.join('');
  assert.ok(out.includes('Installed trustlock pre-commit hook'), `Got: ${out}`);
});

// ---------------------------------------------------------------------------
// AC8: spaces in path — single-quoted in hook script
// ---------------------------------------------------------------------------

test('AC8: path with spaces from gitRoot to projectRoot — single-quoted in hook', async () => {
  // sub-package path contains a space
  const subPackage = join(repoRoot, 'my packages', 'backend');
  await mkdir(subPackage, { recursive: true });

  const cap = captureOutput();
  try {
    await run(
      { values: { force: false }, positionals: ['install-hook'] },
      { _cwd: subPackage, _resolveGitCommonDir: fakeResolveGitDir(repoRoot) }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  const hookPath = join(repoRoot, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  // The path 'my packages/backend' must be single-quoted
  assert.ok(
    content.includes("'my packages/backend'"),
    `Expected single-quoted path in hook, got: ${content}`
  );
  assert.ok(
    content.includes('--project-dir'),
    `Hook must have --project-dir, got: ${content}`
  );
});

// ---------------------------------------------------------------------------
// AC9: projectRoot === gitRoot (flat repo) — --project-dir omitted
// ---------------------------------------------------------------------------

test('AC9: flat repo (projectRoot === gitRoot) — no --project-dir in hook', async () => {
  // Run from repoRoot itself — gitRoot and projectRoot are the same
  const cap = captureOutput();
  try {
    await run(
      { values: { force: false }, positionals: ['install-hook'] },
      { _cwd: repoRoot, _resolveGitCommonDir: fakeResolveGitDir(repoRoot) }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  const hookPath = join(repoRoot, '.git', 'hooks', 'pre-commit');
  const content  = await readFile(hookPath, 'utf8');

  assert.ok(content.includes('trustlock check'), 'Hook must contain trustlock check');
  assert.ok(
    !content.includes('--project-dir'),
    `Flat repo hook must NOT have --project-dir, got: ${content}`
  );
});

// ---------------------------------------------------------------------------
// AC3 extra: relative path computation is correct for deep nesting
// ---------------------------------------------------------------------------

test('AC3 deep nesting: packages/apps/api — path embedded correctly', async () => {
  const deepDir = join(repoRoot, 'packages', 'apps', 'api');
  await mkdir(deepDir, { recursive: true });

  const cap = captureOutput();
  try {
    await run(
      { values: { force: false }, positionals: ['install-hook'] },
      { _cwd: deepDir, _resolveGitCommonDir: fakeResolveGitDir(repoRoot) }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 0, `Expected exit 0, stderr: ${cap.captured.stderr.join('')}`);

  const content = await readFile(join(repoRoot, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.ok(
    content.includes('packages/apps/api'),
    `Expected 'packages/apps/api' in hook, got: ${content}`
  );
});
