/**
 * Git utility wrappers for trustlock.
 * All operations use node:child_process (sync) or node:fs/promises (async).
 * Errors are translated into clear, human-readable messages.
 */

import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Run execSync and translate cryptic child_process errors into clear messages.
 * @param {string} cmd
 * @param {import('node:child_process').ExecSyncOptions} [opts]
 * @returns {Buffer}
 */
function runGit(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    // ENOENT: direct exec without shell; exit code 127: shell reports command not found;
    // also catch shell-generated "No such file or directory" for the git binary itself.
    const isNotInstalled =
      err.code === 'ENOENT' ||
      (err.message && err.message.includes('ENOENT')) ||
      err.status === 127;
    if (isNotInstalled) {
      throw new Error('git is not installed or not in PATH');
    }
    // Detect "not a git repository" from stderr
    if (stderr.toLowerCase().includes('not a git repository')) {
      throw new Error('not a git repository (or any parent directory)');
    }
    throw new Error(stderr || err.message);
  }
}

/**
 * Stage a file with `git add`.
 * @param {string} filePath — path to stage (passed directly to git add)
 * @param {{ gitRoot?: string }} [opts]  gitRoot sets cwd for the git command
 * @throws if git is not installed or the repository cannot be found
 */
export function gitAdd(filePath, { gitRoot } = {}) {
  const cmdOpts = gitRoot ? { cwd: gitRoot } : {};
  runGit(`git add -- ${JSON.stringify(filePath)}`, cmdOpts);
}

/**
 * Retrieve the configured git user.name.
 * @returns {string | null} The configured name, or null if user.name is not set.
 * @throws if git is not installed
 */
export function getGitUserName() {
  try {
    const out = runGit('git config --get user.name');
    const name = out.toString().trim();
    return name.length > 0 ? name : null;
  } catch (err) {
    // Re-throw installation errors — callers cannot recover from missing git
    if (err.message.includes('git is not installed')) throw err;
    // Any other non-zero exit means user.name is not configured → return null (D7)
    return null;
  }
}

/**
 * Read the content of a git hook file.
 * @param {string} hookPath — absolute or relative path to the hook file
 * @returns {Promise<string | null>} The file content as a string, or null if the file does not exist.
 */
export async function readHookFile(hookPath) {
  try {
    const content = await readFile(hookPath, 'utf8');
    return content;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write content to a git hook file and make it executable.
 * Creates the parent directory if it does not exist.
 * @param {string} hookPath — absolute or relative path to the hook file
 * @param {string} content — hook script content
 * @returns {Promise<void>}
 */
export async function writeHookFile(hookPath, content) {
  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, content, { mode: 0o755 });
}
