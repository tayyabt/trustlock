/**
 * `dep-fence audit` — whole-tree trust posture scan.
 *
 * Parses the full lockfile (not just delta), evaluates every package against
 * all policy rules, and prints aggregate stats with heuristic suggestions.
 *
 * Exit codes:
 *   0 — always (informational command, no enforcement)
 *   2 — fatal error (missing config, lockfile parse failure)
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { parseLockfile } from '../../lockfile/parser.js';
import { loadPolicy } from '../../policy/config.js';
import { readApprovals } from '../../approvals/store.js';
import { createRegistryClient } from '../../registry/client.js';
import { evaluate } from '../../policy/engine.js';
import { calculateAgeInHours } from '../../utils/time.js';
import { formatAuditReport, formatStatusMessage } from '../../output/terminal.js';

/** Lockfiles searched in auto-detection order (D5: single lockfile in v0.1). */
const EXPECTED_LOCKFILES = ['package-lock.json'];

/**
 * Run the `audit` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI args
 * @param {{ _registryClient?: object, _cwd?: string }} [_opts]  Injectable overrides for tests
 */
export async function run(args, { _registryClient = null, _cwd } = {}) {
  const cwd           = _cwd ?? process.cwd();
  const configPath    = join(cwd, '.depfencerc.json');
  const approvalsPath = join(cwd, '.dep-fence', 'approvals.json');
  const cacheDir      = join(cwd, '.dep-fence', '.cache');
  const packageJsonPath = join(cwd, 'package.json');

  // ── 1. Load policy ─────────────────────────────────────────────────────────
  let policy;
  try {
    policy = await loadPolicy(configPath);
  } catch (err) {
    const isMissing = err.exitCode === 2 && err.cause?.code === 'ENOENT';
    if (isMissing) {
      process.stderr.write('No .depfencerc.json found. Run `dep-fence init` first.\n');
    } else {
      process.stderr.write(`${err.message}\n`);
    }
    process.exitCode = 2;
    return;
  }

  // ── 2. Resolve lockfile path ───────────────────────────────────────────────
  let lockfilePath = null;
  for (const candidate of EXPECTED_LOCKFILES.map((f) => join(cwd, f))) {
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

  // ── 3. Parse full lockfile ─────────────────────────────────────────────────
  // parseLockfile calls process.exit(2) internally on fatal parse errors.
  const allDeps = await parseLockfile(lockfilePath, packageJsonPath);

  if (allDeps.length === 0) {
    process.stdout.write(formatStatusMessage('No packages found in lockfile'));
    return;
  }

  // ── 4. Load approvals (for decision intersection in engine) ───────────────
  const approvals = await readApprovals(approvalsPath);

  // ── 5. Fetch registry metadata for all packages concurrently ──────────────
  const client = _registryClient ?? createRegistryClient({ cacheDir });
  const registryData = new Map();
  const registryWarnings = [];

  await Promise.all(
    allDeps.map(async (dep) => {
      const [fullMeta, attestResult] = await Promise.all([
        client.fetchPackageMetadata(dep.name),
        client.getAttestations(dep.name, dep.version),
      ]);

      const publishedAt  = fullMeta.data?.time?.[dep.version] ?? null;
      const hasProvenance = attestResult.data !== null;
      const warnings     = [...new Set([...fullMeta.warnings, ...attestResult.warnings])];

      if (warnings.length > 0) {
        for (const w of warnings) {
          registryWarnings.push(`warning: registry unavailable for ${dep.name}@${dep.version} — ${w}`);
        }
      }

      registryData.set(dep.name, { publishedAt, hasProvenance, warnings });
    })
  );

  // Print registry warnings to stderr
  for (const w of registryWarnings) {
    process.stderr.write(`${w}\n`);
  }

  // ── 6. Evaluate all packages via policy engine (synthetic delta) ───────────
  // Treat every package as "added" with no previous profile — informational audit.
  const syntheticDelta = {
    added:   allDeps,
    changed: [],
    removed: [],
    unchanged: [],
    shortCircuited: false,
  };

  // Empty baseline — no packages trusted in baseline context for audit.
  const emptyBaseline = { lockfile_hash: '', packages: {} };

  const { results } = await evaluate(
    syntheticDelta,
    policy,
    emptyBaseline,
    approvals,
    registryData,
    { packageJsonPath }
  );

  // ── 7. Compute AuditReport stats ──────────────────────────────────────────
  const totalPackages = allDeps.length;

  // Provenance: % of packages with SLSA attestations
  const provenanceCount = [...registryData.values()].filter((m) => m.hasProvenance).length;
  const provenancePct   = totalPackages > 0 ? (provenanceCount / totalPackages) * 100 : 0;

  // Install scripts: packages where hasInstallScripts === true (v3 lockfiles only)
  const packagesWithInstallScripts = allDeps
    .filter((d) => d.hasInstallScripts === true)
    .map((d) => d.name);

  // Source type breakdown
  const sourceTypeCounts = {};
  for (const dep of allDeps) {
    sourceTypeCounts[dep.sourceType] = (sourceTypeCounts[dep.sourceType] ?? 0) + 1;
  }

  // Age distribution (based on publishedAt from registry)
  let under24h = 0;
  let under72h = 0;
  let over72h  = 0;
  for (const dep of allDeps) {
    const meta = registryData.get(dep.name);
    if (!meta?.publishedAt) continue; // unknown age — skip bucket
    const ageHours = calculateAgeInHours(meta.publishedAt);
    if (ageHours < 24) {
      under24h++;
    } else if (ageHours < 72) {
      under72h++;
    } else {
      over72h++;
    }
  }

  // Cooldown violation count: packages newer than policy.cooldown_hours
  let cooldownViolationCount = 0;
  for (const dep of allDeps) {
    const meta = registryData.get(dep.name);
    if (!meta?.publishedAt) continue;
    const ageHours = calculateAgeInHours(meta.publishedAt);
    if (ageHours < policy.cooldown_hours) {
      cooldownViolationCount++;
    }
  }

  // blockOnRegression: approximate from whether provenance is required for any packages
  const blockOnRegression = policy.provenance.required_for.length > 0;

  const report = {
    totalPackages,
    provenancePct,
    packagesWithInstallScripts,
    sourceTypeCounts,
    ageDistribution: { under24h, under72h, over72h },
    cooldownViolationCount,
    blockOnRegression,
  };

  // ── 8. Print audit stats ──────────────────────────────────────────────────
  process.stdout.write(formatAuditReport(report));

  // ── 9. Print blocked packages with approval commands ──────────────────────
  const blocked = results.filter((r) => r.checkResult.decision === 'blocked');
  if (blocked.length > 0) {
    process.stdout.write('\nCurrently blocked packages:\n');
    for (const r of blocked) {
      process.stdout.write(`  ${r.name}@${r.version}\n`);
      if (r.checkResult.approvalCommand) {
        process.stdout.write(`    Run to approve: ${r.checkResult.approvalCommand}\n`);
      }
    }
  }

  // Exit 0 always (informational command).
}
