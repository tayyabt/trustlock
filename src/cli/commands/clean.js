/**
 * `trustlock clean-approvals` — remove expired approval entries.
 *
 * Reads .trustlock/approvals.json, filters out expired entries, writes back
 * atomically, and prints a count summary.
 *
 * Exit codes:
 *   0 — always (informational; no enforcement)
 *   2 — fatal: approvals.json missing (project not initialized)
 */

import { join } from 'node:path';
import { cleanExpired } from '../../approvals/store.js';

/**
 * Run the `clean-approvals` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _cwd?: string }} [_opts]  Injectable overrides for tests
 */
export async function run(_args, { _cwd } = {}) {
  const cwd           = _cwd ?? process.cwd();
  const approvalsPath = join(cwd, '.trustlock', 'approvals.json');

  let result;
  try {
    result = await cleanExpired(approvalsPath);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (result.removed === 0) {
    process.stdout.write('No expired approvals found.\n');
  } else {
    process.stdout.write(
      `Removed ${result.removed} expired approval(s). ${result.remaining} active approval(s) remain.\n`
    );
  }
}
