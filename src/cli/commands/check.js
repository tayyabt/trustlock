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
import { applyProfileOverlay, isBuiltinProfile } from '../../policy/builtin-profiles.js';
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
import { formatSarifReport } from '../../output/sarif.js';
import { createProgress } from '../../utils/progress.js';
import { resolvePaths, getRelativePath } from '../../utils/paths.js';

/** Lockfiles searched in auto-detection order (D5: single lockfile in v0.1). */
const EXPECTED_LOCKFILES = ['package-lock.json'];

/**
 * Mandatory ecosystem warning emitted when provenance.required_for: ["*"] is active.
 * Not suppressible by --quiet (F14-S2, ADR-005 step 4).
 */
const PROVENANCE_ALL_WARNING =
  'Warning: ~85-90% of npm packages have no provenance. All packages are required to have provenance under the active profile.';

/**
 * Run the `check` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _writeAndStage?: Function, _registryClient?: object, _cwd?: string }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _writeAndStage = writeAndStage, _registryClient = null, _cwd } = {}) {
  const startTime = Date.now();

  const { values } = args;
  const enforce     = values['enforce']  ?? false;
  const json        = values['json']     ?? false;
  const sarif       = values['sarif']    ?? false;
  const quiet       = values['quiet']    ?? false;
  const dryRun      = values['dry-run']  ?? false;
  const lockfileArg = values['lockfile'] ?? null;
  const noCache     = values['no-cache'] ?? false;
  const profileName = values['profile']  ?? null;

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

  // ── 1b. Apply profile overlay (F14-S2) ────────────────────────────────────
  // NOTE: In Sprint 4, loader.js (F15) will own this call; check.js will then
  // receive the overlaid config from loadPolicy and stop calling applyProfileOverlay.
  let hasProvenanceAllWarning = false;
  if (profileName !== null) {
    const userDefinedProfiles = policy.profiles ?? {};
    const userDefinedExists = Object.prototype.hasOwnProperty.call(userDefinedProfiles, profileName);
    // User-defined presence wins over built-in by name (edge case: user-defined "relaxed" is not built-in)
    const isBuiltin = !userDefinedExists && isBuiltinProfile(profileName);

    if (!userDefinedExists && !isBuiltinProfile(profileName)) {
      process.stderr.write(
        `Profile "${profileName}" not found in .trustlockrc.json or built-in profiles.\n`
      );
      process.exitCode = 2;
      return;
    }

    // applyProfileOverlay throws on floor violation; propagates to top-level error handler → exit 2
    const overlayResult = applyProfileOverlay(policy, profileName, userDefinedProfiles, isBuiltin);
    policy = overlayResult.config;
    hasProvenanceAllWarning = overlayResult.warnings.includes('provenance-all');
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

  // ── 3b. Compute lockfileUri (relative to projectRoot) for SARIF output ──────
  const lockfileUri = getRelativePath(lockfilePath, projectRoot);

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
    // Mandatory provenance-all warning: not suppressible by --quiet in terminal mode
    if (hasProvenanceAllWarning && !json && !sarif) {
      process.stdout.write(PROVENANCE_ALL_WARNING + '\n');
    }
    if (!quiet) {
      if (json) {
        const emptyBase = { blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] };
        const emptyGrouped = hasProvenanceAllWarning
          ? { ...emptyBase, warnings: [PROVENANCE_ALL_WARNING] }
          : emptyBase;
        process.stdout.write(formatJson(emptyGrouped) + '\n');
      } else if (sarif) {
        const emptyGrouped = { blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] };
        process.stdout.write(formatSarifReport(emptyGrouped, lockfileUri) + '\n');
      } else {
        process.stdout.write(formatStatusMessage('No dependency changes'));
      }
    }
    return;
  }

  // ── 9. Fetch registry metadata ─────────────────────────────────────────────
  const client = _registryClient ?? createRegistryClient({ cacheDir, noCache });
  const depsToEvaluate = [
    ...delta.added,
    ...delta.changed.map((c) => c.dep),
  ];

  // Wire progress counter: fires only when >= 5 packages need fetch and !quiet (D1)
  const fetchCount = depsToEvaluate.length;
  const progress = (fetchCount >= 5 && !quiet)
    ? createProgress(fetchCount, process.stderr)
    : null;

  const metadataMap = new Map();
  await Promise.all(
    depsToEvaluate.map(async (dep) => {
      const [fullMeta, attestResult, versionMetaResult] = await Promise.all([
        client.fetchPackageMetadata(dep.name),
        client.getAttestations(dep.name, dep.version),
        client.getVersionMetadata(dep.name, dep.version),
      ]);

      const publishedAt = fullMeta.data?.time?.[dep.version] ?? null;
      const hasProvenance = attestResult.data !== null;
      const warnings = [...new Set([...fullMeta.warnings, ...attestResult.warnings])];
      // Extract publisher from version metadata; fall back to raw _npmUser for old cache entries.
      const versionData = versionMetaResult.data;
      const newPublisherAccount = versionData?.publisherAccount ?? versionData?._npmUser?.name ?? null;

      metadataMap.set(dep.name, { publishedAt, hasProvenance, warnings, newPublisherAccount });

      if (progress) progress.tick();
    })
  );

  if (progress) progress.done();

  // ── 9b. Lazy migration: fetch old-version publisher for changed v1/null-publisher packages ──
  // For each changed package whose baseline entry has no publisherAccount (v1 legacy or prior
  // fetch failure), attempt to fetch the old version's metadata to populate the old publisher
  // before rule evaluation (ADR-006).
  for (const { dep, previousProfile } of delta.changed) {
    const meta = metadataMap.get(dep.name);

    if (previousProfile?.publisherAccount != null) {
      // Already migrated — use existing publisher from baseline directly in the engine.
      // effectiveOldPublisherAccount is not needed (engine reads previousProfile).
      continue;
    }

    // v1 or null-publisher entry — try to fetch old version.
    const oldVersion = previousProfile?.version;
    if (!oldVersion) continue;

    const oldVersionResult = await client.getVersionMetadata(dep.name, oldVersion);
    if (oldVersionResult.data === null) {
      // Registry unreachable for old version — warn and mark fetch failed.
      process.stderr.write(
        `Warning: Could not fetch publisher for ${dep.name}@${oldVersion} — registry unreachable. Publisher comparison skipped.\n`
      );
      metadataMap.set(dep.name, { ...meta, effectiveOldPublisherAccount: null, oldPublisherFetchFailed: true });
    } else {
      const oldData = oldVersionResult.data;
      const oldPublisher = oldData?.publisherAccount ?? oldData?._npmUser?.name ?? null;
      metadataMap.set(dep.name, { ...meta, effectiveOldPublisherAccount: oldPublisher, oldPublisherFetchFailed: false });
    }
  }

  // ── 10. Evaluate policy ───────────────────────────────────────────────────
  const { results, allAdmitted } = await evaluate(
    delta, policy, baseline, approvals, metadataMap, { packageJsonPath }
  );

  // ── 11. Build grouped results (grouping decisions made once) ──────────────
  const newPackageNames = new Set(delta.added.map((d) => d.name));
  const now = new Date();

  // Terminal-format grouped results (used for default terminal and SARIF branches)
  const terminalGrouped = {
    blocked: [],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };

  // JSON-format grouped results (used for --json branch; schema_version 2 shape)
  const jsonGrouped = {
    blocked: [],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };

  for (const r of results) {
    const { decision, findings, approvalCommand } = r.checkResult;

    if (decision === 'blocked') {
      const change = delta.changed.find((c) => c.dep.name === r.name);
      const oldVersion = change?.previousProfile?.version ?? undefined;
      const blockFindings = findings.filter((f) => f.severity === 'block');
      const rules = blockFindings.map((f) => f.rule);

      terminalGrouped.blocked.push({
        name: r.name,
        version: r.version,
        oldVersion,
        findings,
      });
      jsonGrouped.blocked.push({
        name: r.name,
        version: r.version,
        from_version: oldVersion ?? '',
        rules,
        approve_command: approvalCommand ?? '',
      });

    } else if (decision === 'admitted_with_approval') {
      // Look up the active approval for this package to get approver/expires/reason
      const approval = approvals.find(
        (a) => a.package === r.name && a.version === r.version && new Date(a.expires_at) > now
      );
      const approvalEntry = {
        name: r.name,
        version: r.version,
        approver: approval?.approver ?? '',
        expires_at: approval?.expires_at ?? '',
        reason: approval?.reason ?? '',
      };
      terminalGrouped.admitted_with_approval.push(approvalEntry);
      jsonGrouped.admitted_with_approval.push({ ...approvalEntry });

    } else if (decision === 'admitted') {
      if (newPackageNames.has(r.name)) {
        terminalGrouped.new_packages.push({ name: r.name, version: r.version });
        jsonGrouped.new_packages.push({ name: r.name, version: r.version, admitted: true });
      } else {
        terminalGrouped.admitted.push({ name: r.name, version: r.version });
        jsonGrouped.admitted.push({ name: r.name, version: r.version });
      }
    }
  }

  const wallTimeMs = Date.now() - startTime;

  // ── 12. Format and write output ───────────────────────────────────────────
  // Mandatory provenance-all warning: not suppressible by --quiet in terminal mode (F14-S2)
  if (hasProvenanceAllWarning && !json && !sarif) {
    process.stdout.write(PROVENANCE_ALL_WARNING + '\n');
  }

  if (!quiet) {
    if (json) {
      const jsonGroupedWithSummary = {
        ...jsonGrouped,
        summary: {
          changed: results.length,
          blocked: jsonGrouped.blocked.length,
          admitted: jsonGrouped.admitted.length + jsonGrouped.admitted_with_approval.length,
          wall_time_ms: wallTimeMs,
        },
        ...(hasProvenanceAllWarning ? { warnings: [PROVENANCE_ALL_WARNING] } : {}),
      };
      process.stdout.write(formatJson(jsonGroupedWithSummary) + '\n');
    } else if (sarif) {
      // SARIF formatter reads entry.checkResult.findings — pass original DependencyCheckResult shape
      const sarifGrouped = {
        blocked: results.filter((r) => r.checkResult.decision === 'blocked'),
        admitted_with_approval: results.filter(
          (r) => r.checkResult.decision === 'admitted_with_approval'
        ),
        new_packages: [],
        admitted: results.filter((r) => r.checkResult.decision === 'admitted'),
      };
      process.stdout.write(formatSarifReport(sarifGrouped, lockfileUri) + '\n');
    } else {
      process.stdout.write(formatTerminal(terminalGrouped, wallTimeMs));
    }
  }

  // ── 13. Determine overall admission outcome ───────────────────────────────
  const anyBlocked = !allAdmitted;

  // ── 14. Advance baseline (D1, D10, --dry-run guards) ─────────────────────
  // D1: any blocked → do not advance for any
  // D10: --enforce → never advance
  // --dry-run: never advance
  if (!anyBlocked && !enforce && !dryRun) {
    // Build publisherAccounts map: package name → new-version publisher account.
    // All evaluated packages (added + changed) contribute their newPublisherAccount.
    // Unchanged packages are not in depsToEvaluate; they receive null in advanceBaseline.
    const publisherAccounts = {};
    for (const dep of depsToEvaluate) {
      const meta = metadataMap.get(dep.name);
      if (meta) {
        publisherAccounts[dep.name] = meta.newPublisherAccount ?? null;
      }
    }

    const newBaseline = advanceBaseline(baseline, currentDeps, lockfileHash, publisherAccounts);
    await _writeAndStage(newBaseline, baselinePath, { gitRoot });
  }

  // ── 15. Set exit code ─────────────────────────────────────────────────────
  // Advisory mode: always exit 0 even with blocks
  // --enforce: exit 1 when any blocked
  // --dry-run: exit 0 even with blocks
  if (anyBlocked && enforce) {
    process.exitCode = 1;
  }
}
