/**
 * Root resolution utilities for trustlock.
 *
 * Decouples `projectRoot` (cwd or --project-dir) from `gitRoot` (walked up
 * from projectRoot until a directory containing `.git/` is found).
 *
 * All file operations use `projectRoot`; all git operations use `gitRoot`.
 */

import { stat, readFile, readdir } from 'node:fs/promises';
import { join, resolve, isAbsolute, relative } from 'node:path';

/**
 * Compute a path relative to `projectRoot`.
 *
 * Used to produce `artifactLocation.uri` values in SARIF output and other
 * contexts where a project-relative path is required.
 *
 * @param {string} absolutePath  Absolute path to the target file.
 * @param {string} projectRoot   Absolute path to the project root directory.
 * @returns {string}  Relative path from `projectRoot` to `absolutePath`, using
 *   forward slashes (POSIX convention for URI compatibility).
 */
export function getRelativePath(absolutePath, projectRoot) {
  return relative(projectRoot, absolutePath).replace(/\\/g, '/');
}

/**
 * Detect workspace sub-packages in a monorepo.
 *
 * Reads `package.json` at `projectRoot`, extracts the `workspaces` field,
 * and expands `dir/*` glob patterns to concrete sub-package paths (directories
 * that contain their own `package.json`). Non-`*` patterns are included verbatim.
 *
 * @param {string} projectRoot  Absolute path to the project root.
 * @returns {Promise<string[]>} Relative paths of detected workspace packages (may be empty).
 */
export async function detectMonorepoWorkspaces(projectRoot) {
  let pkg;
  try {
    const content = await readFile(join(projectRoot, 'package.json'), 'utf8');
    pkg = JSON.parse(content);
  } catch {
    return [];
  }

  let patterns = pkg.workspaces;
  if (!patterns) return [];
  // Support Yarn-style { packages: [...] }
  if (!Array.isArray(patterns) && patterns.packages) patterns = patterns.packages;
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  const workspaceDirs = [];
  for (const pattern of patterns) {
    const parts = pattern.split('/');
    if (parts[parts.length - 1] === '*') {
      // Expand "dir/*" by listing directories that contain a package.json
      const parentDir = join(projectRoot, ...parts.slice(0, -1));
      let entries;
      try {
        entries = await readdir(parentDir, { withFileTypes: true });
      } catch {
        workspaceDirs.push(pattern); // can't expand — show the pattern verbatim
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          await stat(join(parentDir, entry.name, 'package.json'));
          workspaceDirs.push([...parts.slice(0, -1), entry.name].join('/'));
        } catch {
          // no package.json in this dir — skip
        }
      }
    } else {
      workspaceDirs.push(pattern);
    }
  }

  return workspaceDirs;
}

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
