/**
 * Rule: trust-continuity:provenance
 *
 * Blocks when:
 *   1. Package is in policy.provenance.required_for and has no attestation
 *      (required ≠ regression; feature brief edge case #5).
 *   2. Package had provenance attestation in baseline (provenanceStatus "verified")
 *      but no longer has it — a trust regression.
 *
 * Skips (severity "skipped") when registryData is null — registry unreachable
 * (feature brief edge case #6). Does not block in that case.
 *
 * @param {{ name: string, version: string }} dependency
 * @param {{ provenanceStatus: string } | null} baseline
 *   TrustProfile from baseline; null when the package is new (not in baseline).
 * @param {{ hasProvenance: boolean } | null} registryData
 *   Pre-fetched registry metadata; null when the registry was unreachable.
 * @param {{ provenance: { required_for: string[] } }} policy
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, baseline, registryData, policy) {
  // Registry unavailable — skip, do not block.
  if (registryData == null) {
    return [
      {
        rule: 'trust-continuity:provenance',
        severity: 'skipped',
        message: 'skipped: registry unreachable',
        detail: { name: dependency.name, version: dependency.version },
      },
    ];
  }

  const { hasProvenance } = registryData;
  const requiredFor = policy.provenance?.required_for ?? [];
  const isRequired = requiredFor.includes(dependency.name);

  // Case 1: Required by policy but has no attestation → block.
  if (isRequired && !hasProvenance) {
    return [
      {
        rule: 'trust-continuity:provenance',
        severity: 'error',
        message: `${dependency.name}@${dependency.version} is in provenance.required_for but has no attestation`,
        detail: { name: dependency.name, version: dependency.version, required: true },
      },
    ];
  }

  // Case 2: Provenance regression — had attestation in baseline, no longer has it → block.
  const baselineHadAttestation = baseline?.provenanceStatus === 'verified';
  if (baselineHadAttestation && !hasProvenance) {
    return [
      {
        rule: 'trust-continuity:provenance',
        severity: 'error',
        message: `${dependency.name}@${dependency.version} had provenance attestation in baseline but no longer has it`,
        detail: { name: dependency.name, version: dependency.version, regression: true },
      },
    ];
  }

  // Admit.
  return [];
}
