/**
 * `trustlock approve` command.
 *
 * Parses <pkg>@<ver>, validates inputs against policy config and lockfile,
 * resolves approver identity, and writes an approval entry to approvals.json.
 *
 * Exit codes:
 *   0 — approval written successfully
 *   2 — fatal error (validation failure, missing config/lockfile, unknown approver)
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseLockfile } from '../../lockfile/parser.js';
import { writeApproval } from '../../approvals/store.js';
import { VALID_RULE_NAMES, parseDuration } from '../../approvals/models.js';
import { getGitUserName } from '../../utils/git.js';
import { resolvePaths } from '../../utils/paths.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse "<pkg>@<ver>" into { name, version }.
 * Handles scoped packages (e.g. "@scope/pkg@1.0.0"): uses the last "@" as separator.
 *
 * @param {string} spec
 * @returns {{ name: string, version: string } | null}
 */
function parsePackageSpec(spec) {
  if (!spec || typeof spec !== 'string') return null;

  // For scoped packages (@scope/name@ver) the version "@" is the last one.
  // For plain packages (name@ver) the version "@" is the first (and only) one.
  const atIdx = spec.startsWith('@')
    ? spec.lastIndexOf('@')
    : spec.indexOf('@');

  if (atIdx <= 0) return null;

  const name = spec.slice(0, atIdx);
  const version = spec.slice(atIdx + 1);

  if (!name || !version) return null;
  return { name, version };
}

/**
 * Load approval-specific fields from .trustlockrc.json.
 * Returns defaults when fields are absent.
 *
 * @param {string} configPath
 * @returns {Promise<{ require_reason: boolean, max_expiry_days: number }>}
 * @throws {{ message: string, exitCode: 2 }}
 */
async function loadApprovalConfig(configPath) {
  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw Object.assign(
        new Error('No .trustlockrc.json found. Run `trustlock init` first.'),
        { exitCode: 2 }
      );
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to parse .trustlockrc.json: ${err.message}`),
      { exitCode: 2 }
    );
  }

  return {
    require_reason:
      typeof parsed.require_reason === 'boolean' ? parsed.require_reason : true,
    max_expiry_days:
      typeof parsed.max_expiry_days === 'number' ? parsed.max_expiry_days : 30,
  };
}

/**
 * Run the `approve` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _cwd?: string }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _cwd } = {}) {
  const { values, positionals } = args;

  // ── Resolve projectRoot ──────────────────────────────────────────────────────
  let projectRoot;
  try {
    ({ projectRoot } = await resolvePaths(values, { _cwd }));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  // ── 1. Parse <pkg>@<ver> positional ───────────────────────────────────────
  // positionals[0] is "approve"; positionals[1] is the package spec
  const pkgSpec = positionals[1];
  if (!pkgSpec) {
    process.stderr.write(
      'Usage: trustlock approve <pkg>@<ver> --override <rules> --reason <text>' +
      ' [--expires <duration>] [--as <name>]\n'
    );
    process.exitCode = 2;
    return;
  }

  const parsedSpec = parsePackageSpec(pkgSpec);
  if (!parsedSpec) {
    process.stderr.write(
      `Error: Invalid package spec "${pkgSpec}". Expected format: <name>@<version>\n`
    );
    process.exitCode = 2;
    return;
  }
  const { name: pkgName, version: pkgVersion } = parsedSpec;

  // ── 2. Parse --override (supports comma-separated and multi-flag) ─────────
  const overrideRaw = values['override'];
  if (!overrideRaw || overrideRaw.length === 0) {
    process.stderr.write(
      'Error: --override is required. Specify at least one rule name to override' +
      ' (D9: no wildcard approvals).\n'
    );
    process.exitCode = 2;
    return;
  }
  const overrides = overrideRaw
    .flatMap((o) => o.split(',').map((s) => s.trim()))
    .filter(Boolean);

  // ── 3. Load approval-specific config ─────────────────────────────────────
  const configPath = join(projectRoot, '.trustlockrc.json');
  let approvalConfig;
  try {
    approvalConfig = await loadApprovalConfig(configPath);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  const { require_reason, max_expiry_days } = approvalConfig;

  // ── 4. Validate --override rule names ─────────────────────────────────────
  const invalidRules = overrides.filter((r) => !VALID_RULE_NAMES.has(r));
  if (invalidRules.length > 0) {
    const validList = [...VALID_RULE_NAMES].join(', ');
    process.stderr.write(
      `Error: '${invalidRules[0]}' is not a valid rule name. Valid rules: ${validList}\n`
    );
    process.exitCode = 2;
    return;
  }

  // ── 5. Validate --expires ─────────────────────────────────────────────────
  const expiresDur = values['expires'] ?? `${max_expiry_days}d`;
  let expiresMs;
  try {
    expiresMs = parseDuration(expiresDur);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (expiresMs > max_expiry_days * MS_PER_DAY) {
    process.stderr.write(
      `Error: Maximum expiry is ${max_expiry_days} days (configured in .trustlockrc.json)\n`
    );
    process.exitCode = 2;
    return;
  }

  // ── 6. Validate --reason ──────────────────────────────────────────────────
  const reason = values['reason'] ?? '';
  if (require_reason && !reason.trim()) {
    process.stderr.write(
      'Error: --reason is required (configure require_reason: false to disable)\n'
    );
    process.exitCode = 2;
    return;
  }

  // ── 7. Resolve approver identity (D7) ─────────────────────────────────────
  // --as always takes precedence over git config
  const asFlag = values['as'] ?? null;
  let approver;
  if (asFlag) {
    approver = asFlag;
  } else {
    approver = getGitUserName();
    if (!approver) {
      process.stderr.write(
        'Error: Cannot determine approver identity. Set git config user.name or use --as\n'
      );
      process.exitCode = 2;
      return;
    }
  }

  // ── 8. Parse lockfile (exits 2 internally on fatal errors) ────────────────
  const lockfilePath   = join(projectRoot, 'package-lock.json');
  const packageJsonPath = join(projectRoot, 'package.json');
  const lockfileDeps = await parseLockfile(lockfilePath, packageJsonPath);

  // ── 9. Validate package exists in lockfile ────────────────────────────────
  const pkgInLockfile = lockfileDeps.some(
    (dep) => dep.name === pkgName && dep.version === pkgVersion
  );
  if (!pkgInLockfile) {
    process.stderr.write(`Error: ${pkgName}@${pkgVersion} not found in lockfile\n`);
    process.exitCode = 2;
    return;
  }

  // ── 10. Write approval entry ──────────────────────────────────────────────
  const approvalsPath = join(projectRoot, '.trustlock', 'approvals.json');
  let approval;
  try {
    approval = await writeApproval(
      approvalsPath,
      {
        package: pkgName,
        version: pkgVersion,
        overrides,
        reason,
        approver,
        duration: expiresDur,
      },
      lockfileDeps,
      { require_reason, max_expiry_days }
    );
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  // ── 11. Print confirmation ────────────────────────────────────────────────
  const overrideList = approval.overrides.join(', ');
  process.stdout.write(
    `Approved ${pkgName}@${pkgVersion} (overrides: ${overrideList}). Expires: ${approval.expires_at}\n`
  );
}
