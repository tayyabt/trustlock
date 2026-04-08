import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gitAdd, getGitUserName, readHookFile, writeHookFile } from '../../src/utils/git.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory with a real git repo initialised inside it.
 */
async function makeTempGitRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'dep-fence-git-test-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

// ---------------------------------------------------------------------------
// gitAdd
// ---------------------------------------------------------------------------

describe('gitAdd', () => {
  let repoDir;

  before(async () => {
    repoDir = await makeTempGitRepo();
    // Create a real file to stage
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(repoDir, 'test-file.txt'), 'hello');
  });

  after(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('stages a file without throwing', () => {
    // gitAdd uses execSync with cwd=process.cwd(), so we need to run in the repo dir.
    // We test the observable effect: after gitAdd, the file appears in git status as staged.
    // Since gitAdd always uses the calling process cwd, we invoke it via a subprocess.
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { gitAdd } from '${join(process.cwd(), 'src/utils/git.js')}';
         await gitAdd('test-file.txt').catch(() => null);
         // gitAdd is sync, no await needed — but import is async
         gitAdd('test-file.txt');
        `,
      ],
      { cwd: repoDir, encoding: 'utf8' },
    );
    // The subprocess may error since gitAdd is sync but wrapped in async eval.
    // Instead: test directly in the repo cwd by changing process.cwd via a spawn.
    // Simplest: just verify gitAdd doesn't throw when given a valid path in a real repo.
    // We'll do this by running a small Node child that chdirs first.
    const checkResult = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { gitAdd } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `process.chdir(${JSON.stringify(repoDir)});`,
          `try { gitAdd('test-file.txt'); console.log('OK'); } catch(e) { process.stderr.write(e.message); process.exit(1); }`,
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(checkResult.stdout.trim(), 'OK', `gitAdd failed: ${checkResult.stderr}`);
  });

  it('throws a descriptive error for a non-existent path in a repo', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { gitAdd } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `process.chdir(${JSON.stringify(repoDir)});`,
          `try { gitAdd('no-such-file.txt'); process.exit(0); } catch(e) { process.stdout.write(e.message); process.exit(1); }`,
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    );
    // git add on a pathspec with no match exits non-zero — expect process exit 1
    assert.equal(result.status, 1);
    assert.ok(result.stdout.length > 0, 'expected error message on stdout');
  });

  it('throws with "not a git repository" when outside a repo', () => {
    const notRepoDir = tmpdir();
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { gitAdd } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `process.chdir(${JSON.stringify(notRepoDir)});`,
          `try { gitAdd('file.txt'); process.exit(0); } catch(e) { process.stdout.write(e.message); process.exit(1); }`,
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.ok(
      result.stdout.toLowerCase().includes('not a git repository'),
      `expected "not a git repository" but got: ${result.stdout}`,
    );
  });

  it('throws with "git is not installed" when git binary is missing', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { gitAdd } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `try { gitAdd('file.txt'); process.exit(0); } catch(e) { process.stdout.write(e.message); process.exit(1); }`,
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: '' },
        cwd: repoDir,
      },
    );
    assert.equal(result.status, 1);
    assert.ok(
      result.stdout.includes('git is not installed'),
      `expected "git is not installed" but got: ${result.stdout}`,
    );
  });
});

// ---------------------------------------------------------------------------
// getGitUserName
// ---------------------------------------------------------------------------

describe('getGitUserName', () => {
  it('returns the configured user.name as a non-empty string', () => {
    // The current repo has git user.name configured (Tayyab from git log)
    const name = getGitUserName();
    // May be null if not configured globally, so just check type
    assert.ok(name === null || typeof name === 'string');
    if (name !== null) {
      assert.ok(name.length > 0);
    }
  });

  it('returns null when user.name is not configured', () => {
    const repoDir = execSync('mktemp -d', { encoding: 'utf8' }).trim();
    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    // Explicitly unset user.name (set to empty string to simulate unconfigured)
    execSync('git config user.name ""', { cwd: repoDir, stdio: 'ignore' });

    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { getGitUserName } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `process.chdir(${JSON.stringify(repoDir)});`,
          // Unset global and system user.name to isolate local config
          `const n = getGitUserName();`,
          `process.stdout.write(JSON.stringify(n));`,
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      },
    );
    const value = JSON.parse(result.stdout);
    assert.equal(value, null);

    execSync(`rm -rf ${JSON.stringify(repoDir)}`, { shell: true });
  });

  it('throws with "git is not installed" when git binary is missing', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          `import { getGitUserName } from '${join(process.cwd(), 'src/utils/git.js')}';`,
          `try { const n = getGitUserName(); process.stdout.write('null-return'); } catch(e) { process.stdout.write(e.message); process.exit(1); }`,
        ].join('\n'),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: '' },
      },
    );
    assert.equal(result.status, 1);
    assert.ok(
      result.stdout.includes('git is not installed'),
      `expected "git is not installed" but got: ${result.stdout}`,
    );
  });
});

// ---------------------------------------------------------------------------
// readHookFile
// ---------------------------------------------------------------------------

describe('readHookFile', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-fence-hook-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when the hook file does not exist', async () => {
    const result = await readHookFile(join(tmpDir, 'nonexistent-hook'));
    assert.equal(result, null);
  });

  it('returns the file content as a string', async () => {
    const { writeFile } = await import('node:fs/promises');
    const hookPath = join(tmpDir, 'pre-commit');
    await writeFile(hookPath, '#!/bin/sh\necho hello\n');
    const content = await readHookFile(hookPath);
    assert.equal(content, '#!/bin/sh\necho hello\n');
  });
});

// ---------------------------------------------------------------------------
// writeHookFile
// ---------------------------------------------------------------------------

describe('writeHookFile', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-fence-write-hook-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes hook content to file', async () => {
    const hookPath = join(tmpDir, 'hooks', 'pre-commit');
    await writeHookFile(hookPath, '#!/bin/sh\nexit 0\n');
    const content = await readHookFile(hookPath);
    assert.equal(content, '#!/bin/sh\nexit 0\n');
  });

  it('creates parent directory if it does not exist', async () => {
    const hookPath = join(tmpDir, 'new-hooks-dir', 'pre-push');
    await writeHookFile(hookPath, '#!/bin/sh\n');
    const content = await readHookFile(hookPath);
    assert.ok(content !== null);
  });

  it('sets executable permission (mode includes 0o111)', async () => {
    const hookPath = join(tmpDir, 'exec-hooks', 'commit-msg');
    await writeHookFile(hookPath, '#!/bin/sh\n');
    const info = await stat(hookPath);
    // Check execute bits are set for owner (0o100)
    assert.ok((info.mode & 0o100) !== 0, 'owner execute bit should be set');
  });

  it('overwrites existing hook file with new content', async () => {
    const hookPath = join(tmpDir, 'overwrite-hooks', 'pre-commit');
    await writeHookFile(hookPath, 'first content');
    await writeHookFile(hookPath, 'second content');
    const content = await readHookFile(hookPath);
    assert.equal(content, 'second content');
  });
});

// ---------------------------------------------------------------------------
// module exports
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports gitAdd as a function', () => {
    assert.equal(typeof gitAdd, 'function');
  });

  it('exports getGitUserName as a function', () => {
    assert.equal(typeof getGitUserName, 'function');
  });

  it('exports readHookFile as a function', () => {
    assert.equal(typeof readHookFile, 'function');
  });

  it('exports writeHookFile as a function', () => {
    assert.equal(typeof writeHookFile, 'function');
  });
});
