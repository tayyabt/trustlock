/**
 * Rule: execution:scripts
 *
 * Blocks packages with install scripts (preinstall, install, postinstall) that
 * are not in the policy allowlist.
 *
 * v3 lockfiles expose `hasInstallScripts` on each entry; v1/v2 and yarn classic
 * lockfiles do not (null). yarn berry lockfiles set null when `dependenciesMeta[pkg].built`
 * is absent.
 *
 * C-NEW-1: When `dep.hasInstallScripts` is null, the rule defers to registry metadata.
 * If `registryData.hasScripts` is true, the package is treated as having install scripts.
 * If registry metadata is unavailable (null) or `hasScripts` is false, the rule skips
 * without blocking — equivalent to the registry-unreachable degradation in ADR-003.
 *
 * @param {{ name: string, version: string, hasInstallScripts: boolean|null }} dependency
 * @param {object | null} baseline     TrustProfile from baseline (not used by this rule).
 * @param {object | null} registryData Registry metadata; must have `hasScripts: boolean`
 *                                     for the C-NEW-1 null-handling path.
 * @param {{ scripts: { allowlist: string[] } }} policy
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, baseline, registryData, policy) {
  // C-NEW-1: null means "unknown — defer to registry metadata"
  if (dependency.hasInstallScripts === null) {
    // Registry unavailable or reports no scripts → skip, do not block (ADR-003 degradation)
    if (registryData == null || !registryData.hasScripts) {
      return [];
    }
    // Registry confirms install scripts are present — fall through to allowlist check
  } else if (!dependency.hasInstallScripts) {
    // No install scripts — admit.
    return [];
  }

  // Has install scripts — check allowlist.
  const allowlist = policy.scripts?.allowlist ?? [];
  if (allowlist.includes(dependency.name)) {
    return [];
  }

  return [
    {
      rule: 'execution:scripts',
      severity: 'error',
      message: `${dependency.name}@${dependency.version} has install scripts and is not in scripts.allowlist`,
      detail: {
        name: dependency.name,
        version: dependency.version,
        allowlist,
      },
    },
  ];
}
