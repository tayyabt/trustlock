/**
 * `trustlock install-hook` — install or update the Git pre-commit hook.
 *
 * Creates or appends `trustlock check [--project-dir <relPath>]` to
 * `gitRoot/.git/hooks/pre-commit` and makes the file executable.
 *
 * The `--project-dir` flag is embedded only when `projectRoot !== gitRoot`.
 * The relative path from `gitRoot` to `projectRoot` is single-quoted to handle spaces.
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

import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { execSync } from 'node:child_process';
import { resolvePaths } from '../../utils/paths.js';

const HOOK_CHECK_MARKER = 'trustlock check';
const HOOK_SHEBANG      = '#!/bin/sh';

/**
 * Resolve the git common directory (handles worktrees where .git is a file).
 * Returns an absolute path, or null if not in a git repository.
 *
 * Uses `git rev-parse --git-common-dir` so the hooks are always placed in
 * the main repository's .git/hooks/ directory, not the worktree-specific dir.
 *
 * @param {string} repoRoot  Absolute path to the git root directory
 * @returns {string|null} Absolute path to git common dir, or null if not a repo
 */
function resolveGitCommonDir(repoRoot) {
  try {
    const result = execSync('git rev-parse --git-common-dir', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    const raw = result.trim();
    // git may return an absolute path (worktrees) or a relative path (normal repos)
    return isAbsolute(raw) ? raw : join(repoRoot, raw);
  } catch {
    return null;
  }
}

/**
 * Quote a filesystem path for safe embedding in a POSIX shell script.
 * Uses single quotes; embedded single quotes are escaped via the '\'' idiom.
 *
 * @param {string} p
 * @returns {string} Shell-safe quoted path
 */
function quoteShellPath(p) {
  if (!p.includes("'")) return `'${p}'`;
  // Escape embedded single quotes: end quote, literal ', resume quote
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the hook invocation line based on projectRoot vs gitRoot.
 *
 * When projectRoot === gitRoot (flat repo), no --project-dir is needed.
 * When they differ, embed the relative path from gitRoot to projectRoot.
 *
 * @param {string} projectRoot  Absolute project root
 * @param {string} gitRoot      Absolute git root
 * @returns {string} The hook line (e.g. "trustlock check --project-dir 'packages/backend'")
 */
function buildHookLine(projectRoot, gitRoot) {
  if (projectRoot === gitRoot) return HOOK_CHECK_MARKER;
  const relPath = relative(gitRoot, projectRoot);
  return `${HOOK_CHECK_MARKER} --project-dir ${quoteShellPath(relPath)}`;
}

/**
 * Run the `install-hook` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _cwd?: string, _resolveGitCommonDir?: Function }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _cwd, _resolveGitCommonDir } = {}) {
  const force      = args.values['force'] ?? false;
  const resolveDir = _resolveGitCommonDir ?? resolveGitCommonDir;

  // ── 1. Resolve projectRoot and gitRoot via resolvePaths ──────────────────
  let projectRoot, gitRoot;
  try {
    ({ projectRoot, gitRoot } = await resolvePaths(args.values, { _cwd }));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  // ── 2. Resolve git common dir (handles worktrees) ─────────────────────────
  const gitCommonDir = resolveDir(gitRoot);
  if (!gitCommonDir) {
    process.stderr.write('Not a git repository (could not resolve git directory)\n');
    process.exitCode = 2;
    return;
  }

  // ── 3. Ensure hooks/ directory exists ────────────────────────────────────
  const hooksDir = join(gitCommonDir, 'hooks');
  try {
    await mkdir(hooksDir, { recursive: true });
  } catch (err) {
    process.stderr.write(`Error creating hooks directory: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const hookPath = join(hooksDir, 'pre-commit');

  // ── 4. Build the hook invocation line ─────────────────────────────────────
  const hookLine  = buildHookLine(projectRoot, gitRoot);
  const freshHook = `${HOOK_SHEBANG}\n${hookLine}\n`;

  // ── 5. Read existing hook (if any) ───────────────────────────────────────
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

  // ── 6. State machine ──────────────────────────────────────────────────────

  // State 1: Hook does not exist → create fresh
  if (existingContent === null) {
    try {
      await writeFile(hookPath, freshHook, 'utf8');
      await chmod(hookPath, 0o755);
    } catch (err) {
      process.stderr.write(`Error creating hook file: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`Installed trustlock pre-commit hook at ${hookPath}\n`);
    return;
  }

  // State 2: Hook already contains a trustlock check invocation → no duplicate
  if (existingContent.includes(HOOK_CHECK_MARKER)) {
    process.stdout.write('Hook already installed.\n');
    return;
  }

  // State 4: Hook exists without trustlock check and --force → warn + overwrite
  if (force) {
    process.stdout.write('Overwriting existing pre-commit hook.\n');
    try {
      await writeFile(hookPath, freshHook, 'utf8');
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
    ? `${existingContent}${hookLine}\n`
    : `${existingContent}\n${hookLine}\n`;

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
