/**
 * `trustlock install-hook` — install or update the Git pre-commit hook.
 *
 * Creates or appends `trustlock check` to `.git/hooks/pre-commit` and makes
 * the file executable.
 *
 * Four states:
 *   1. Hook does not exist → create with shebang + trustlock check + chmod +x
 *   2. Hook exists and already contains "trustlock check" → "Hook already installed."
 *   3. Hook exists without "trustlock check", no --force → append trustlock check
 *   4. Hook exists with custom content, --force → warn + overwrite + chmod +x
 *
 * Flags:
 *   --force   Overwrite an existing hook that does not contain trustlock check
 *
 * Exit codes:
 *   0 — success
 *   2 — fatal: no git repository, or filesystem error
 */

import { readFile, writeFile, chmod, mkdir, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const HOOK_LINE    = 'trustlock check';
const HOOK_SHEBANG = '#!/bin/sh';
const FRESH_HOOK   = `${HOOK_SHEBANG}\n${HOOK_LINE}\n`;

/**
 * Resolve the git common directory (handles worktrees where .git is a file).
 * Returns null if not in a git repository.
 *
 * Uses `git rev-parse --git-common-dir` so the hooks are always placed in
 * the main repository's .git/hooks/ directory, not the worktree-specific dir.
 *
 * @param {string} cwd  Working directory for git command
 * @returns {string|null} Absolute path to git common dir, or null if not a repo
 */
function resolveGitCommonDir(cwd) {
  try {
    const result = execSync('git rev-parse --git-common-dir', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Run the `install-hook` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _cwd?: string, _resolveGitCommonDir?: Function }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _cwd, _resolveGitCommonDir } = {}) {
  const cwd   = _cwd ?? process.cwd();
  const force = args.values['force'] ?? false;
  const resolveDir = _resolveGitCommonDir ?? resolveGitCommonDir;

  // ── 1. Guard: must be in a git repository ────────────────────────────────
  // First check: .git must exist (file or directory).
  const gitEntryPath = join(cwd, '.git');
  let gitEntryExists = false;
  try {
    await access(gitEntryPath, constants.F_OK);
    gitEntryExists = true;
  } catch {
    // not found
  }

  if (!gitEntryExists) {
    process.stderr.write('Not a git repository (no .git directory found)\n');
    process.exitCode = 2;
    return;
  }

  // Resolve the actual git common dir (handles worktrees where .git is a file).
  const gitCommonDir = resolveDir(cwd);
  if (!gitCommonDir) {
    process.stderr.write('Not a git repository (no .git directory found)\n');
    process.exitCode = 2;
    return;
  }

  // ── 2. Ensure .git/hooks/ directory exists ────────────────────────────────
  const hooksDir = join(gitCommonDir, 'hooks');
  try {
    await mkdir(hooksDir, { recursive: true });
  } catch (err) {
    process.stderr.write(`Error creating hooks directory: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const hookPath = join(hooksDir, 'pre-commit');

  // ── 3. Read existing hook (if any) ────────────────────────────────────────
  let existingContent = null;
  try {
    existingContent = await readFile(hookPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Error reading hook file: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    // ENOENT → does not exist
  }

  // ── 4. State machine ──────────────────────────────────────────────────────

  // State 1: Hook does not exist → create fresh
  if (existingContent === null) {
    try {
      await writeFile(hookPath, FRESH_HOOK, 'utf8');
      await chmod(hookPath, 0o755);
    } catch (err) {
      process.stderr.write(`Error creating hook file: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`Installed trustlock pre-commit hook at ${hookPath}\n`);
    return;
  }

  // State 2: Hook exists and already contains trustlock check → no duplicate (edge case #8)
  if (existingContent.includes(HOOK_LINE)) {
    process.stdout.write('Hook already installed.\n');
    return;
  }

  // State 4: Hook exists without trustlock check and --force → warn + overwrite (edge case #9)
  if (force) {
    process.stdout.write('Overwriting existing pre-commit hook.\n');
    try {
      await writeFile(hookPath, FRESH_HOOK, 'utf8');
      await chmod(hookPath, 0o755);
    } catch (err) {
      process.stderr.write(`Error writing hook file: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`Installed trustlock pre-commit hook at ${hookPath}\n`);
    return;
  }

  // State 3: Hook exists without trustlock check, no --force → append
  const newContent = existingContent.endsWith('\n')
    ? `${existingContent}${HOOK_LINE}\n`
    : `${existingContent}\n${HOOK_LINE}\n`;

  try {
    await writeFile(hookPath, newContent, 'utf8');
    await chmod(hookPath, 0o755);
  } catch (err) {
    process.stderr.write(`Error appending to hook file: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`Appended trustlock check to existing pre-commit hook at ${hookPath}\n`);
}
