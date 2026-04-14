/**
 * Policy engine — orchestrates all 7 rule evaluations and approval intersection.
 *
 * Public API:
 *   evaluate(delta, policy, baseline, approvals, registryData, options?)
 *     → Promise<{ results: DependencyCheckResult[], allAdmitted: boolean }>
 *
 * Parameters:
 *   delta         {DependencyDelta}      From baseline/diff.computeDelta
 *   policy        {PolicyConfig}         From policy/config.loadPolicy
 *   baseline      {object}              Full baseline object (packages map)
 *   approvals     {object[]}            From approvals/store.readApprovals (includes expired)
 *   registryData  {Map<string, object>} Pre-fetched registry metadata per package:
 *                   meta.publishedAt  {string|null}   ISO 8601 UTC publish timestamp
 *                   meta.hasProvenance {boolean}       True if SLSA attestation exists
 *                   meta.warnings     {string[]}       Registry degradation warnings
 *   options.packageJsonPath {string}    Required for the pinning rule
 *
 * Return:
 *   results      {DependencyCheckResult[]}  One entry per evaluated dependency
 *   allAdmitted  {boolean}                 False if any dependency is "blocked"
 */

import { evaluate as cooldownEval } from './rules/cooldown.js';
import { evaluate as pinningEval } from './rules/pinning.js';
import { evaluate as provenanceEval } from './rules/provenance.js';
import { evaluate as scriptsEval } from './rules/scripts.js';
import { evaluate as sourcesEval } from './rules/sources.js';
import { evaluate as newDepEval } from './rules/new-dependency.js';
import { evaluate as transitiveEval } from './rules/transitive-surprise.js';
import { decide, uncoveredBlockingRules } from './decision.js';
import { generateApprovalCommand } from '../approvals/generator.js';
import { comparePublisher } from '../registry/publisher.js';

/**
 * Normalize finding severity from the historical rule convention to the model convention.
 *   'error'   → 'block'   (blocking findings)
 *   'skipped' → 'warn'    (registry-unreachable findings are informational)
 *   all others unchanged  ('warn' stays 'warn')
 * @param {string} severity
 * @returns {string}
 */
function normalizeSeverity(severity) {
  if (severity === 'error') return 'block';
  if (severity === 'skipped') return 'warn';
  return severity;
}

/**
 * Evaluate all policy rules for every added and changed dependency in the delta.
 *
 * Empty-delta short-circuit: when both delta.added and delta.changed are empty,
 * returns { results: [], allAdmitted: true } immediately without running any rules.
 *
 * @param {object} delta              DependencyDelta from computeDelta
 * @param {object} policy             PolicyConfig
 * @param {object} baseline           Full baseline object
 * @param {object[]} approvals        Raw approvals array (may include expired)
 * @param {Map<string,object>} registryData  Registry metadata per package name
 * @param {{ packageJsonPath?: string }} [options]
 * @returns {Promise<{ results: object[], allAdmitted: boolean }>}
 */
export async function evaluate(delta, policy, baseline, approvals, registryData, options = {}) {
  const { packageJsonPath } = options;

  // Short-circuit: nothing to evaluate.
  if (delta.added.length === 0 && delta.changed.length === 0) {
    return { results: [], allAdmitted: true };
  }

  // Pre-compute new transitive count for the transitive-surprise rule.
  // New transitive packages = packages in delta.added that are NOT direct dependencies.
  const newTransitiveCount = delta.added.filter((dep) => !dep.directDependency).length;
  const transitiveRegistryData = { newTransitiveCount };

  // Combine added (previousProfile = null) and changed into a single list.
  // Removed packages are silently skipped per product decision D3.
  const depsToEvaluate = [
    ...delta.added.map((dep) => ({ dep, previousProfile: null })),
    ...delta.changed.map(({ dep, previousProfile }) => ({ dep, previousProfile })),
  ];

  const results = [];

  for (const { dep, previousProfile } of depsToEvaluate) {
    const meta = (registryData ?? new Map()).get(dep.name) ?? {
      publishedAt: null,
      hasProvenance: false,
      warnings: ['skipped: registry unreachable'],
    };

    const registryUnreachable = meta.warnings?.includes('skipped: registry unreachable');

    // Registry data shapes expected by each rule.
    const cooldownRegistryData = registryUnreachable
      ? null
      : meta.publishedAt != null
        ? { publishedAt: meta.publishedAt }
        : null;

    const provenanceRegistryData = registryUnreachable
      ? null
      : { hasProvenance: meta.hasProvenance };

    // Collect all findings from all 7 rules.
    const rawFindings = [];

    // 1. trust-continuity:provenance (sync)
    rawFindings.push(...provenanceEval(dep, previousProfile, provenanceRegistryData, policy));

    // 2. exposure:cooldown (sync)
    rawFindings.push(...cooldownEval(dep, previousProfile, cooldownRegistryData, policy));

    // 3. exposure:pinning (async — reads package.json)
    if (packageJsonPath) {
      rawFindings.push(...await pinningEval(dep, previousProfile, null, policy, packageJsonPath));
    }

    // 4. execution:scripts (sync)
    rawFindings.push(...scriptsEval(dep, previousProfile, null, policy));

    // 5. execution:sources (sync)
    rawFindings.push(...sourcesEval(dep, previousProfile, null, policy));

    // 6. delta:new-dependency (sync) — warning only
    rawFindings.push(...newDepEval(dep, previousProfile, null, policy));

    // 7. delta:transitive-surprise (sync) — warning only
    rawFindings.push(...transitiveEval(dep, previousProfile, transitiveRegistryData, policy));

    // 8. trust-continuity:publisher (sync) — changed packages only, step 5b
    // Only runs for changed packages (previousProfile !== null).
    // Skip when old-version fetch already failed (warning emitted in check.js step 9).
    if (previousProfile !== null && !meta.oldPublisherFetchFailed) {
      // Use the already-migrated publisher if known (v2 non-null entry),
      // otherwise fall back to what check.js fetched for the old version (lazy migration).
      const oldEntry = {
        publisherAccount: (previousProfile.publisherAccount != null)
          ? previousProfile.publisherAccount
          : (meta.effectiveOldPublisherAccount ?? null),
      };
      const newVersionMeta = { publisherAccount: meta.newPublisherAccount ?? null };
      const publisherResult = comparePublisher(oldEntry, newVersionMeta, policy);

      if (publisherResult.warning) {
        process.stderr.write(publisherResult.warning + '\n');
      }

      if (publisherResult.blocked) {
        rawFindings.push({
          rule: 'trust-continuity:publisher',
          severity: 'error',
          message: `${dep.name}@${dep.version} publisher changed`,
          detail: {
            name: dep.name,
            version: dep.version,
            oldPublisher: oldEntry.publisherAccount,
            newPublisher: publisherResult.newPublisherAccount,
          },
        });
      }
    }

    // Normalize severity to match the model contract ('error' → 'block', 'skipped' → 'warn').
    const findings = rawFindings.map((f) => ({
      ...f,
      severity: normalizeSeverity(f.severity),
    }));

    // Determine per-dependency decision using approval intersection.
    const decision = decide(findings, approvals, dep.name, dep.version);

    // Generate approval command for blocked packages.
    let approvalCommand = null;
    if (decision === 'blocked') {
      const blockingRules = uncoveredBlockingRules(findings, approvals, dep.name, dep.version);
      approvalCommand = generateApprovalCommand(
        { packageName: dep.name, version: dep.version, blockingRules },
        policy
      );
    }

    results.push({
      name: dep.name,
      version: dep.version,
      checkResult: {
        decision,
        findings,
        approvalCommand,
      },
    });
  }

  // All-or-nothing (D1): allAdmitted is false when any dependency is blocked.
  const allAdmitted = results.every((r) => r.checkResult.decision !== 'blocked');

  return { results, allAdmitted };
}
