/**
 * Approvals store — read, write, and clean the approvals JSON file.
 *
 * File location: .dep-fence/approvals.json
 * Format: JSON array of Approval objects (see models.js)
 *
 * Behavioral rules:
 *   - readApprovals: returns [] when the file does not exist
 *   - writeApproval: throws when the file does not exist (project must be initialized)
 *   - cleanExpired:  throws when the file does not exist
 *   - All writes are atomic: write to temp file → rename
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { createApproval, VALID_RULE_NAMES } from './models.js';

/**
 * Build the temp file path for an atomic write.
 * Placed in the same directory as the target so rename() is within one filesystem.
 *
 * @param {string} filePath  Target file path
 * @returns {string}         Temp file path
 */
function tempPathFor(filePath) {
  return join(dirname(filePath), `.${basename(filePath)}.tmp.${process.pid}`);
}

/**
 * Write data atomically: write to a temp file in the same directory, then rename.
 *
 * @param {string} filePath  Target file path
 * @param {string} content   String content to write
 */
async function atomicWrite(filePath, content) {
  const tmp = tempPathFor(filePath);
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

/**
 * Load the approvals array from the approvals file.
 *
 * Returns [] when the file does not exist (for the `check` flow).
 * Throws for any other I/O error or for corrupted JSON.
 *
 * @param {string} approvalsPath  Path to approvals.json
 * @returns {Promise<object[]>}   Array of Approval objects (may be empty)
 */
export async function readApprovals(approvalsPath) {
  let content;
  try {
    content = await readFile(approvalsPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  return JSON.parse(content);
}

/**
 * Append a new approval entry to the approvals file atomically.
 *
 * The file MUST already exist (created by `dep-fence init`). Throws with ENOENT
 * if missing — this enforces that the project is initialized before approving.
 *
 * Validation performed:
 *   - package exists in provided lockfile dependencies
 *   - all override names are valid rule names
 *   - reason is non-empty when config.require_reason is true
 *   - expiry is capped at config.max_expiry_days (not rejected)
 *
 * @param {string}   approvalsPath  Path to approvals.json
 * @param {object}   input          Raw approval input
 * @param {string}     input.package    Package name
 * @param {string}     input.version    Exact version
 * @param {string[]}   input.overrides  Rule names to bypass
 * @param {string}     input.reason     Reason string
 * @param {string}     input.approver   Approver identity
 * @param {string}     input.duration   Duration string (e.g. "7d", "24h")
 * @param {object[]}  lockfileDeps   ResolvedDependency[] from current lockfile
 * @param {object}    config         Policy config object
 * @param {boolean}     config.require_reason    Whether reason is required
 * @param {number}      config.max_expiry_days   Maximum expiry in days
 * @returns {Promise<object>}  The Approval object that was written
 * @throws {Error}  When the file is missing, validation fails, or I/O fails
 */
export async function writeApproval(approvalsPath, input, lockfileDeps, config) {
  // Read existing file — throws ENOENT if missing (project must be initialized)
  let content;
  try {
    content = await readFile(approvalsPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Approvals file not found at ${approvalsPath}. ` +
        `Run "dep-fence init" to initialize the project first.`
      );
    }
    throw err;
  }

  const existing = JSON.parse(content);

  // Validate package exists in current lockfile
  const packageInLockfile = lockfileDeps.some(
    (dep) => dep.name === input.package && dep.version === input.version
  );
  if (!packageInLockfile) {
    throw new Error(
      `Package "${input.package}@${input.version}" is not in the current lockfile. ` +
      `Only packages present in the lockfile can be approved.`
    );
  }

  // Validate override names explicitly here for better error reporting
  // (createApproval also validates, but we want a clear error before calling it)
  if (Array.isArray(input.overrides)) {
    const invalid = input.overrides.filter((r) => !VALID_RULE_NAMES.has(r));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid override rule name(s): ${invalid.join(', ')}. ` +
        `Valid rules: ${[...VALID_RULE_NAMES].join(', ')}`
      );
    }
  }

  // Create and validate the approval (validates overrides, reason, duration, expiry cap)
  const approval = createApproval(input, config);

  // Append and atomically write
  existing.push(approval);
  await atomicWrite(approvalsPath, JSON.stringify(existing, null, 2));

  return approval;
}

/**
 * Remove all expired entries from the approvals file and return counts.
 *
 * The file MUST already exist. Throws with a clear error if missing.
 *
 * @param {string} approvalsPath  Path to approvals.json
 * @returns {Promise<{ removed: number, remaining: number }>}
 * @throws {Error}  When the file is missing or I/O fails
 */
export async function cleanExpired(approvalsPath) {
  let content;
  try {
    content = await readFile(approvalsPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Approvals file not found at ${approvalsPath}. ` +
        `Run "dep-fence init" to initialize the project first.`
      );
    }
    throw err;
  }

  const approvals = JSON.parse(content);
  const now = new Date();

  const active = approvals.filter((a) => new Date(a.expires_at) > now);
  const removed = approvals.length - active.length;

  await atomicWrite(approvalsPath, JSON.stringify(active, null, 2));

  return { removed, remaining: active.length };
}
