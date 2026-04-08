/**
 * Rule: delta:new-dependency
 *
 * Produces a WARNING (non-blocking) finding when a dependency is new — i.e.,
 * it was not present in the baseline (`previousProfile` is null).
 *
 * Warning-severity findings never cause a blocked decision (story behavioral rule).
 *
 * @param {{ name: string, version: string }} dependency
 * @param {object | null} previousProfile  TrustProfile from baseline; null when the package is new.
 * @param {object | null} registryData  Registry metadata (not used by this rule).
 * @param {object} policy  Policy config (not used by this rule).
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, previousProfile, registryData, policy) {
  // Not a new dependency — no finding.
  if (previousProfile != null) {
    return [];
  }

  return [
    {
      rule: 'delta:new-dependency',
      severity: 'warn',
      message: `${dependency.name}@${dependency.version} is a new dependency not in the baseline`,
      detail: {
        name: dependency.name,
        version: dependency.version,
      },
    },
  ];
}
