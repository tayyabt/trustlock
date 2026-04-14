/**
 * Policy decision module — intersects findings with valid approvals to produce
 * the final per-dependency admission decision.
 *
 * Public API:
 *   decide(findings, approvals, packageName, version) →
 *     "admitted" | "admitted_with_approval" | "blocked"
 *
 * Decision rules:
 *   - Only severity "block" findings participate in the decision.
 *   - Warning-severity findings (e.g. delta:new-dependency) are ignored.
 *   - A finding is "covered" when a valid (non-expired), scope-matching approval
 *     exists that includes the rule's override name in its overrides array.
 *   - All blocking findings covered → "admitted_with_approval"
 *   - Any blocking finding not covered → "blocked"
 *   - No blocking findings → "admitted"
 */

import { findValidApproval } from '../approvals/validator.js';

/**
 * Map a fully-qualified rule identifier to the override name used in approvals.
 *
 * Most rules use the last segment of the colon-separated ID:
 *   "exposure:cooldown"           → "cooldown"
 *   "trust-continuity:provenance" → "provenance"
 *   "exposure:pinning"            → "pinning"
 *   "execution:scripts"           → "scripts"
 *   "execution:sources"           → "sources"
 *
 * Two rules use abbreviated override names that differ from their segment:
 *   "delta:new-dependency"        → "new-dep"
 *   "delta:transitive-surprise"   → "transitive"
 *
 * @param {string} ruleId
 * @returns {string}
 */
function ruleToOverrideName(ruleId) {
  const SPECIAL = {
    'delta:new-dependency': 'new-dep',
    'delta:transitive-surprise': 'transitive',
  };
  return SPECIAL[ruleId] ?? ruleId.split(':').pop();
}

/**
 * Determine the admission decision for a single dependency.
 *
 * @param {import('./models.js').Finding[]} findings   All findings for this dependency
 * @param {object[]} approvals    Full approvals array (may include expired — filtered internally)
 * @param {string}   packageName  Package name
 * @param {string}   version      Exact version
 * @returns {"admitted" | "admitted_with_approval" | "blocked"}
 */
export function decide(findings, approvals, packageName, version) {
  // Only block-severity findings affect the decision.
  const blockingFindings = findings.filter((f) => f.severity === 'block');

  if (blockingFindings.length === 0) {
    return 'admitted';
  }

  let hasUncovered = false;
  let hasCovered = false;

  for (const finding of blockingFindings) {
    const overrideName = ruleToOverrideName(finding.rule);
    const approval = findValidApproval(approvals, packageName, version, overrideName);
    if (approval) {
      hasCovered = true;
    } else {
      hasUncovered = true;
    }
  }

  if (hasUncovered) {
    return 'blocked';
  }
  return 'admitted_with_approval';
}

/**
 * Collect the override names for all blocking findings that are NOT covered by a
 * valid approval. Used by the engine to build the approvalCommand string.
 *
 * @param {import('./models.js').Finding[]} findings
 * @param {object[]} approvals
 * @param {string}   packageName
 * @param {string}   version
 * @returns {string[]}  Override names for uncovered blocking findings
 */
export function uncoveredBlockingRules(findings, approvals, packageName, version) {
  return findings
    .filter((f) => f.severity === 'block')
    .map((f) => ({ finding: f, overrideName: ruleToOverrideName(f.rule) }))
    .filter(
      ({ overrideName }) =>
        !findValidApproval(approvals, packageName, version, overrideName)
    )
    .map(({ overrideName }) => overrideName);
}
