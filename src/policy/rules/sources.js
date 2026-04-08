/**
 * Rule: execution:sources
 *
 * Blocks dependencies resolved from disallowed source types (git, http/url, file)
 * when the source type is not in policy.sources.allowed.
 *
 * Default policy allows only 'registry'. To permit git deps the policy must
 * explicitly include 'git' in sources.allowed.
 *
 * @param {{ name: string, version: string, sourceType: string }} dependency
 * @param {object | null} baseline  TrustProfile from baseline (not used by this rule).
 * @param {object | null} registryData  Registry metadata (not used by this rule).
 * @param {{ sources: { allowed: string[] } }} policy
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, baseline, registryData, policy) {
  const allowed = policy.sources?.allowed ?? ['registry'];

  if (allowed.includes(dependency.sourceType)) {
    return [];
  }

  return [
    {
      rule: 'execution:sources',
      severity: 'error',
      message: `${dependency.name}@${dependency.version} uses source type "${dependency.sourceType}" which is not in sources.allowed`,
      detail: {
        name: dependency.name,
        version: dependency.version,
        sourceType: dependency.sourceType,
        allowed,
      },
    },
  ];
}
