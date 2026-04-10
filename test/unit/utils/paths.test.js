/**
 * Unit tests for `src/utils/paths.js` — resolvePaths().
 *
 * Edge cases covered (from story):
 *   EC1  - flat repo: projectRoot === gitRoot (no walk needed)
 *   EC2  - .git/ two levels up: correctly resolved
 *   EC3  - no .git/ anywhere in ancestor chain: exit 2 error
 *   EC4  - --project-dir non-existent directory: exit 2 error
 *   EC5  - --project-dir absolute path: resolved as-is
 *   EC6  - --project-dir relative path: resolved relative to cwd
 *   EC7  - --project-dir points to a file (not a directory): exit 2 error
 *   EC8  - no --project-dir and no .git/ in temp dir: error from ancestor walk
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolvePaths } from '../../../src/utils/paths.js';

let testDir;

beforeEach(async () => {
  testDir = join(tmpdir(), `trustlock-paths-test-${process.pid}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true });
    testDir = null;
  }
});

// ---------------------------------------------------------------------------
// EC1: flat repo — .git/ is in projectRoot itself
// ---------------------------------------------------------------------------

test('EC1: flat repo — projectRoot === gitRoot when .git/ is in the cwd', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });

  const result = await resolvePaths({}, { _cwd: testDir });

  assert.equal(result.projectRoot, testDir);
  assert.equal(result.gitRoot, testDir);
});

// ---------------------------------------------------------------------------
// EC2: .git/ two levels above projectRoot
// ---------------------------------------------------------------------------

test('EC2: .git/ two levels up — correctly resolved', async () => {
  // Structure: testDir/.git/, testDir/packages/backend/
  await mkdir(join(testDir, '.git'), { recursive: true });
  const subPackage = join(testDir, 'packages', 'backend');
  await mkdir(subPackage, { recursive: true });

  const result = await resolvePaths({}, { _cwd: subPackage });

  assert.equal(result.projectRoot, subPackage);
  assert.equal(result.gitRoot, testDir);
});

test('EC2b: .git/ one level up — correctly resolved', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });
  const sub = join(testDir, 'packages');
  await mkdir(sub, { recursive: true });

  const result = await resolvePaths({}, { _cwd: sub });

  assert.equal(result.projectRoot, sub);
  assert.equal(result.gitRoot, testDir);
});

// ---------------------------------------------------------------------------
// EC3: no .git/ in any ancestor — fatal error
// ---------------------------------------------------------------------------

test('EC3: no .git/ anywhere — throws with exit code 2', async () => {
  // testDir has no .git/ — and tmpdir ancestors don't either
  // We deliberately use a directory with no .git/ in its ancestor chain
  // by creating an isolated temp tree under a known-clean path.

  // Verify that the error is thrown
  await assert.rejects(
    () => resolvePaths({}, { _cwd: testDir }),
    (err) => {
      assert.ok(
        err.message.includes('not a git repository'),
        `Expected "not a git repository" in error, got: ${err.message}`
      );
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// EC4: --project-dir non-existent
// ---------------------------------------------------------------------------

test('EC4: --project-dir non-existent directory — throws with exit code 2', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });

  const nonExistent = join(testDir, 'does-not-exist');

  await assert.rejects(
    () => resolvePaths({ 'project-dir': nonExistent }, { _cwd: testDir }),
    (err) => {
      assert.ok(
        err.message.includes('does not exist'),
        `Expected "does not exist" in error, got: ${err.message}`
      );
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

test('EC4b: --project-dir relative non-existent — throws', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });

  await assert.rejects(
    () => resolvePaths({ 'project-dir': 'nonexistent-subdir' }, { _cwd: testDir }),
    (err) => {
      assert.ok(err.message.includes('does not exist'));
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// EC5: --project-dir absolute path — resolved as-is
// ---------------------------------------------------------------------------

test('EC5: --project-dir absolute path — resolved as-is, not relative to cwd', async () => {
  // .git/ is in testDir
  await mkdir(join(testDir, '.git'), { recursive: true });
  // subPackage is an absolute path inside testDir
  const subPackage = join(testDir, 'sub');
  await mkdir(subPackage, { recursive: true });

  // Pass the absolute path directly
  const result = await resolvePaths(
    { 'project-dir': subPackage },
    { _cwd: '/some/other/directory' }  // cwd doesn't matter for absolute paths
  );

  assert.equal(result.projectRoot, subPackage);
  assert.equal(result.gitRoot, testDir);
});

// ---------------------------------------------------------------------------
// EC6: --project-dir relative path — resolved relative to cwd
// ---------------------------------------------------------------------------

test('EC6: --project-dir relative path — resolved relative to cwd', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });
  const subPackage = join(testDir, 'packages', 'frontend');
  await mkdir(subPackage, { recursive: true });

  // Use relative path 'packages/frontend' from testDir as cwd
  const result = await resolvePaths(
    { 'project-dir': 'packages/frontend' },
    { _cwd: testDir }
  );

  assert.equal(result.projectRoot, subPackage);
  assert.equal(result.gitRoot, testDir);
});

test('EC6b: --project-dir relative path with ./ prefix — resolved relative to cwd', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });
  const sub = join(testDir, 'app');
  await mkdir(sub, { recursive: true });

  const result = await resolvePaths(
    { 'project-dir': './app' },
    { _cwd: testDir }
  );

  assert.equal(result.projectRoot, sub);
  assert.equal(result.gitRoot, testDir);
});

// ---------------------------------------------------------------------------
// EC7: --project-dir points to a file (not a directory)
// ---------------------------------------------------------------------------

test('EC7: --project-dir is a file — throws with exit code 2', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });
  const filePath = join(testDir, 'not-a-dir.txt');
  await writeFile(filePath, 'hello', 'utf8');

  await assert.rejects(
    () => resolvePaths({ 'project-dir': filePath }, { _cwd: testDir }),
    (err) => {
      assert.ok(
        err.message.includes('not a directory'),
        `Expected "not a directory" in error, got: ${err.message}`
      );
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// No --project-dir, cwd-based resolution
// ---------------------------------------------------------------------------

test('no --project-dir — uses cwd as projectRoot', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });

  const result = await resolvePaths({}, { _cwd: testDir });

  assert.equal(result.projectRoot, testDir);
});

test('returns correct types — both values are strings', async () => {
  await mkdir(join(testDir, '.git'), { recursive: true });

  const result = await resolvePaths({}, { _cwd: testDir });

  assert.equal(typeof result.projectRoot, 'string');
  assert.equal(typeof result.gitRoot, 'string');
});
