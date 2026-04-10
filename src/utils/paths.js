/**
 * Root resolution utilities for trustlock.
 *
 * Decouples `projectRoot` (cwd or --project-dir) from `gitRoot` (walked up
 * from projectRoot until a directory containing `.git/` is found).
 *
 * All file operations use `projectRoot`; all git operations use `gitRoot`.
 */

import { stat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';

/**
 * Resolve projectRoot and gitRoot from parsed CLI options.
 *
 * @param {{ 'project-dir'?: string }} [options]  Parsed CLI values (args.values)
 * @param {{ _cwd?: string }} [_internal]  Internal — override process.cwd() for tests
 * @returns {Promise<{ projectRoot: string, gitRoot: string }>}
 * @throws {{ message: string, exitCode: 2 }} on non-existent projectDir or no .git/ ancestor
 */
export async function resolvePaths(options = {}, { _cwd } = {}) {
  const projectDir = options['project-dir'];
  const baseCwd = _cwd ?? process.cwd();

  // ── 1. Resolve projectRoot ─────────────────────────────────────────────────
  let projectRoot;
  if (projectDir) {
    // Absolute path: resolved as-is. Relative path: resolved relative to cwd.
    projectRoot = isAbsolute(projectDir) ? projectDir : resolve(baseCwd, projectDir);
  } else {
    projectRoot = baseCwd;
  }

  // ── 2. Validate projectRoot exists and is a directory ─────────────────────
  if (projectDir) {
    let s;
    try {
      s = await stat(projectRoot);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw Object.assign(
          new Error(`--project-dir does not exist: ${projectRoot}`),
          { exitCode: 2 }
        );
      }
      throw err;
    }
    if (!s.isDirectory()) {
      throw Object.assign(
        new Error(`--project-dir is not a directory: ${projectRoot}`),
        { exitCode: 2 }
      );
    }
  }

  // ── 3. Walk up ancestor chain to find .git/ ───────────────────────────────
  let dir = projectRoot;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitCandidate = join(dir, '.git');
    let found = false;
    try {
      await stat(gitCandidate);
      found = true;
    } catch {
      // not found — keep walking
    }
    if (found) {
      return { projectRoot, gitRoot: dir };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      // Reached filesystem root — no .git/ found
      throw Object.assign(
        new Error('not a git repository (or any parent directory)'),
        { exitCode: 2 }
      );
    }
    dir = parent;
  }
}
