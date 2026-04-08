/**
 * Rule: execution:scripts
 *
 * Blocks packages with install scripts (preinstall, install, postinstall) that
 * are not in the policy allowlist.
 *
 * v3 lockfiles expose `hasInstallScripts` on each entry; v1/v2 do not (null).
 * When `dep.hasInstallScripts` is null (unknown), the rule skips without blocking —
 * equivalent to the registry-unreachable behavior on other rules.
 *
 * @param {{ name: string, version: string, hasInstallScripts: boolean|null }} dependency
 * @param {object | null} baseline  TrustProfile from baseline (not used by this rule).
 * @param {object | null} registryData  Registry metadata (not used by this rule).
 * @param {{ scripts: { allowlist: string[] } }} policy
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, baseline, registryData, policy) {
  // Unknown install-script status (v1/v2 lockfile) — skip, do not block.
  if (dependency.hasInstallScripts == null) {
    return [];
  }

  // No install scripts — admit.
  if (!dependency.hasInstallScripts) {
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
