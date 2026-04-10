/**
 * `trustlock check` — core command.
 *
 * Orchestrates: lockfile parsing, delta computation, registry metadata,
 * policy evaluation, output formatting, and baseline advancement.
 *
 * Exit codes:
 *   0 — all changes admitted (or no changes), advisory mode, or --dry-run
 *   1 — one or more packages blocked AND --enforce is set
 *   2 — fatal configuration or parse error
 */

import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { parseLockfile } from '../../lockfile/parser.js';
import { loadPolicy } from '../../policy/config.js';
import { readBaseline, advanceBaseline, writeAndStage } from '../../baseline/manager.js';
import { computeDelta } from '../../baseline/diff.js';
import { readApprovals } from '../../approvals/store.js';
import { createRegistryClient } from '../../registry/client.js';
import { evaluate } from '../../policy/engine.js';
import {
  formatCheckResults as formatTerminal,
  formatStatusMessage,
} from '../../output/terminal.js';
import { formatCheckResults as formatJson } from '../../output/json.js';
import { resolvePaths } from '../../utils/paths.js';

/** Lockfiles searched in auto-detection order (D5: single lockfile in v0.1). */
const EXPECTED_LOCKFILES = ['package-lock.json'];

/**
 * Run the `check` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _writeAndStage?: Function, _registryClient?: object, _cwd?: string }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _writeAndStage = writeAndStage, _registryClient = null, _cwd } = {}) {
  const { values } = args;
  const enforce = values['enforce'] ?? false;
  const json    = values['json']    ?? false;
  const dryRun  = values['dry-run'] ?? false;
  const lockfileArg = values['lockfile'] ?? null;
  const noCache = values['no-cache'] ?? false;

  // ── Resolve projectRoot and gitRoot ─────────────────────────────────────────
  let projectRoot, gitRoot;
  try {
    ({ projectRoot, gitRoot } = await resolvePaths(values, { _cwd }));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const configPath     = join(projectRoot, '.trustlockrc.json');
  const baselinePath   = join(projectRoot, '.trustlock', 'baseline.json');
  const approvalsPath  = join(projectRoot, '.trustlock', 'approvals.json');
  const cacheDir       = join(projectRoot, '.trustlock', '.cache');
  const packageJsonPath = join(projectRoot, 'package.json');

  // ── 1. Load policy ─────────────────────────────────────────────────────────
  let policy;
  try {
    policy = await loadPolicy(configPath);
  } catch (err) {
    const isMissing = err.exitCode === 2 && err.cause?.code === 'ENOENT';
    if (isMissing) {
      process.stderr.write('No .trustlockrc.json found. Run `trustlock init` first.\n');
    } else {
      process.stderr.write(`${err.message}\n`);
    }
    process.exitCode = 2;
    return;
  }

  // ── 2. Load baseline ───────────────────────────────────────────────────────
  const baseline = await readBaseline(baselinePath);
  if (baseline.error === 'not_initialized') {
    process.stderr.write('No baseline found. Run `trustlock init` first.\n');
    process.exitCode = 2;
    return;
  }
  if (baseline.error) {
    process.stderr.write(
      `Baseline is corrupted or uses an unsupported schema version. Run \`trustlock init\` first.\n`
    );
    process.exitCode = 2;
    return;
  }

  // ── 3. Resolve lockfile path ───────────────────────────────────────────────
  let lockfilePath;
  if (lockfileArg) {
    // --lockfile is resolved relative to projectRoot
    lockfilePath = resolve(projectRoot, lockfileArg);
  } else {
    lockfilePath = null;
    for (const candidate of EXPECTED_LOCKFILES.map((f) => join(projectRoot, f))) {
      try {
        await readFile(candidate, 'utf8');
        lockfilePath = candidate;
        break;
      } catch {
        // not found — try next
      }
    }
    if (!lockfilePath) {
      process.stderr.write(
        `No lockfile found. Expected: ${EXPECTED_LOCKFILES.join(', ')}\n`
      );
      process.exitCode = 2;
      return;
    }
  }

  // ── 4. Parse lockfile (parseLockfile calls process.exit(2) on fatal errors) ─
  const currentDeps = await parseLockfile(lockfilePath, packageJsonPath);

  // ── 5. Compute lockfile hash ───────────────────────────────────────────────
  const lockfileContent = await readFile(lockfilePath, 'utf8');
  const lockfileHash = createHash('sha256').update(lockfileContent).digest('hex');

  // ── 6. Load approvals ─────────────────────────────────────────────────────
  const approvals = await readApprovals(approvalsPath);

  // ── 7. Compute delta ──────────────────────────────────────────────────────
  const delta = computeDelta(baseline, currentDeps, lockfileHash);

  // ── 8. No dependency changes ──────────────────────────────────────────────
  if (delta.shortCircuited || (delta.added.length === 0 && delta.changed.length === 0)) {
    if (json) {
      process.stdout.write(formatJson([]) + '\n');
    } else {
      process.stdout.write(formatStatusMessage('No dependency changes'));
    }
    return;
  }

  // ── 9. Fetch registry metadata ─────────────────────────────────────────────
  const client = _registryClient ?? createRegistryClient({ cacheDir, noCache });
  const depsToEvaluate = [
    ...delta.added,
    ...delta.changed.map((c) => c.dep),
  ];

  const metadataMap = new Map();
  await Promise.all(
    depsToEvaluate.map(async (dep) => {
      const [fullMeta, attestResult] = await Promise.all([
        client.fetchPackageMetadata(dep.name),
        client.getAttestations(dep.name, dep.version),
      ]);

      const publishedAt = fullMeta.data?.time?.[dep.version] ?? null;
      const hasProvenance = attestResult.data !== null;
      const warnings = [...new Set([...fullMeta.warnings, ...attestResult.warnings])];

      metadataMap.set(dep.name, { publishedAt, hasProvenance, warnings });
    })
  );

  // ── 10. Evaluate policy ───────────────────────────────────────────────────
  const { results, allAdmitted } = await evaluate(
    delta, policy, baseline, approvals, metadataMap, { packageJsonPath }
  );

  // ── 11. Format and write output ───────────────────────────────────────────
  if (json) {
    process.stdout.write(formatJson(results) + '\n');
  } else {
    process.stdout.write(formatTerminal(results));
  }

  // ── 12. Determine overall admission outcome ───────────────────────────────
  const anyBlocked = !allAdmitted;

  // ── 13. Advance baseline (D1, D10, --dry-run guards) ─────────────────────
  // D1: any blocked → do not advance for any
  // D10: --enforce → never advance
  // --dry-run: never advance
  if (!anyBlocked && !enforce && !dryRun) {
    const newBaseline = advanceBaseline(baseline, currentDeps, lockfileHash);
    await _writeAndStage(newBaseline, baselinePath, { gitRoot });
  }

  // ── 14. Set exit code ─────────────────────────────────────────────────────
  // Advisory mode: always exit 0 even with blocks
  // --enforce: exit 1 when any blocked
  // --dry-run: exit 0 even with blocks
  if (anyBlocked && enforce) {
    process.exitCode = 1;
  }
}
