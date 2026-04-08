/**
 * Rule: delta:transitive-surprise
 *
 * Produces a WARNING (non-blocking) finding when a direct dependency upgrade pulls in
 * more new transitive packages than the policy threshold allows.
 *
 * The engine pre-computes the total count of new transitive dependencies and passes it
 * via `registryData.newTransitiveCount`. This rule fires only on direct dependencies
 * (dep.directDependency === true) when the count exceeds the threshold.
 *
 * Warning-severity findings never cause a blocked decision (story behavioral rule).
 *
 * @param {{ name: string, version: string, directDependency: boolean }} dependency
 * @param {object | null} previousProfile  TrustProfile from baseline (not used directly).
 * @param {{ newTransitiveCount: number } | null} registryData
 *   Engine-provided context. newTransitiveCount is the total count of new transitive
 *   packages introduced by the delta.
 * @param {{ transitive: { max_new: number } }} policy
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, previousProfile, registryData, policy) {
  // Only applies to direct dependencies.
  if (!dependency.directDependency) {
    return [];
  }

  const newTransitiveCount = registryData?.newTransitiveCount ?? 0;
  const maxNew = policy.transitive?.max_new ?? 5;

  if (newTransitiveCount <= maxNew) {
    return [];
  }

  return [
    {
      rule: 'delta:transitive-surprise',
      severity: 'warn',
      message: `${dependency.name}@${dependency.version} upgrade introduced ${newTransitiveCount} new transitive dependencies (threshold: ${maxNew})`,
      detail: {
        name: dependency.name,
        version: dependency.version,
        newTransitiveCount,
        max_new: maxNew,
      },
    },
  ];
}
