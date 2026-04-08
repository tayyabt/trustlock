/**
 * Policy engine — orchestrates rule evaluation and approval matching.
 *
 * Public API:
 *   evaluate(delta, metadataMap, policy, approvals, options) → DependencyCheckResult[]
 *
 * delta         {DependencyDelta}     From baseline/diff.computeDelta
 * metadataMap   {Map<name, meta>}     Pre-fetched registry data per package:
 *                 meta.publishedAt  {string|null}   ISO 8601 UTC publish timestamp
 *                 meta.hasProvenance {boolean}       True if SLSA attestation exists
 *                 meta.warnings     {string[]}       Registry degradation warnings
 * policy        {PolicyConfig}        From policy/config.loadPolicy
 * approvals     {object[]}            From approvals/store.readApprovals (includes expired)
 * options.packageJsonPath {string}    Required for pinning rule
 */

import { evaluate as cooldownEval } from './rules/cooldown.js';
import { evaluate as pinningEval } from './rules/pinning.js';
import { evaluate as provenanceEval } from './rules/provenance.js';
import { generateApprovalCommand } from '../approvals/generator.js';

/**
 * Map a fully-qualified rule identifier to the override name used in approvals.
 * e.g. "exposure:cooldown" → "cooldown"
 *      "trust-continuity:provenance" → "provenance"
 * @param {string} ruleId
 * @returns {string}
 */
function ruleToOverrideName(ruleId) {
  const parts = ruleId.split(':');
  return parts[parts.length - 1];
}

/**
 * Normalize finding severity from the historical rule convention to the model convention.
 *   'error'   → 'block'   (rules currently emit 'error' for blocking findings)
 *   'skipped' → 'warn'    (registry-unreachable findings are informational warnings)
 *   all others unchanged
 * @param {string} severity
 * @returns {string}
 */
function normalizeSeverity(severity) {
  if (severity === 'error') return 'block';
  if (severity === 'skipped') return 'warn';
  return severity;
}

/**
 * Find active (non-expired) approvals for a specific package@version.
 * @param {object[]} approvals
 * @param {string} name
 * @param {string} version
 * @param {Date} now
 * @returns {object[]}
 */
function activeApprovalsFor(approvals, name, version, now) {
  return approvals.filter(
    (a) =>
      a.package === name &&
      a.version === version &&
      new Date(a.expires_at) > now
  );
}

/**
 * Evaluate all policy rules for every added and changed dependency in the delta.
 *
 * @param {object} delta              DependencyDelta from computeDelta
 * @param {Map<string,object>} metadataMap  Registry metadata per package name
 * @param {object} policy             PolicyConfig
 * @param {object[]} approvals        Raw approvals array (may include expired — filtered here)
 * @param {{ packageJsonPath?: string }} [options]
 * @returns {Promise<object[]>}       DependencyCheckResult[]
 */
export async function evaluate(delta, metadataMap, policy, approvals, options = {}) {
  const { packageJsonPath } = options;
  const now = new Date();

  // Combine added and changed dependencies into a single list to evaluate.
  // Removed packages are silently skipped (D3).
  const depsToEvaluate = [
    ...delta.added.map((dep) => ({ dep, previousProfile: null })),
    ...delta.changed.map(({ dep, previousProfile }) => ({ dep, previousProfile })),
  ];

  const results = [];

  for (const { dep, previousProfile } of depsToEvaluate) {
    const meta = metadataMap.get(dep.name) ?? {
      publishedAt: null,
      hasProvenance: false,
      warnings: ['skipped: registry unreachable'],
    };

    const registryUnreachable = meta.warnings.includes('skipped: registry unreachable');

    // Registry data shapes expected by each rule.
    const cooldownRegistryData = registryUnreachable
      ? null
      : meta.publishedAt != null
        ? { publishedAt: meta.publishedAt }
        : null;

    const provenanceRegistryData = registryUnreachable
      ? null
      : { hasProvenance: meta.hasProvenance };

    // Collect all findings from all rules.
    const rawFindings = [];

    // 1. Cooldown rule (sync)
    const cooldownFindings = cooldownEval(dep, previousProfile, cooldownRegistryData, policy, now);
    rawFindings.push(...cooldownFindings);

    // 2. Pinning rule (async — reads package.json)
    if (packageJsonPath) {
      const pinningFindings = await pinningEval(dep, previousProfile, null, policy, packageJsonPath);
      rawFindings.push(...pinningFindings);
    }

    // 3. Provenance rule (sync)
    const provenanceFindings = provenanceEval(dep, previousProfile, provenanceRegistryData, policy);
    rawFindings.push(...provenanceFindings);

    // Normalize severity to match the model contract.
    const findings = rawFindings.map((f) => ({
      ...f,
      severity: normalizeSeverity(f.severity),
    }));

    // Determine decision using approval matching.
    const active = activeApprovalsFor(approvals, dep.name, dep.version, now);

    let hasUncoveredBlock = false;
    let hasApprovedBlock = false;

    for (const finding of findings) {
      if (finding.severity === 'block') {
        const overrideName = ruleToOverrideName(finding.rule);
        const covered = active.some((a) => Array.isArray(a.overrides) && a.overrides.includes(overrideName));
        if (covered) {
          hasApprovedBlock = true;
        } else {
          hasUncoveredBlock = true;
        }
      }
    }

    let decision;
    if (hasUncoveredBlock) {
      decision = 'blocked';
    } else if (hasApprovedBlock) {
      decision = 'admitted_with_approval';
    } else {
      decision = 'admitted';
    }

    // Generate approval command for blocked packages.
    let approvalCommand = null;
    if (decision === 'blocked') {
      const blockingRules = findings
        .filter((f) => f.severity === 'block')
        .map((f) => ruleToOverrideName(f.rule));

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

  return results;
}
