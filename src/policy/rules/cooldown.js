/**
 * Rule: exposure:cooldown
 *
 * Blocks versions published less than policy.cooldown_hours ago.
 * When blocking, includes the exact UTC clears_at timestamp in finding.detail (D4).
 *
 * Skips (severity "skipped") when registryData is null or publishedAt is missing —
 * the registry was unreachable or did not return a publish timestamp.
 *
 * @param {{ name: string, version: string }} dependency
 * @param {object | null} baseline  TrustProfile from baseline (not used by this rule).
 * @param {{ publishedAt: string | null } | null} registryData
 *   Pre-fetched registry metadata. publishedAt must be an ISO 8601 UTC string.
 *   Pass null when the registry was unreachable.
 * @param {{ cooldown_hours: number }} policy
 * @param {Date} [now]  Reference time; defaults to current time. Injectable for tests.
 * @returns {import('../models.js').Finding[]}
 */
export function evaluate(dependency, baseline, registryData, policy, now = new Date()) {
  const publishedAt = registryData?.publishedAt ?? null;

  // publishedAt unavailable — skip, do not block.
  if (publishedAt == null) {
    return [
      {
        rule: 'exposure:cooldown',
        severity: 'skipped',
        message: 'skipped: registry unreachable',
        detail: { name: dependency.name, version: dependency.version },
      },
    ];
  }

  const publishedDate = new Date(publishedAt);
  if (isNaN(publishedDate.getTime())) {
    return [
      {
        rule: 'exposure:cooldown',
        severity: 'skipped',
        message: 'skipped: registry unreachable',
        detail: { name: dependency.name, version: dependency.version },
      },
    ];
  }

  const cooldownMs = policy.cooldown_hours * 60 * 60 * 1000;
  const ageMs = now.getTime() - publishedDate.getTime();

  // Package is old enough — admit.
  if (ageMs >= cooldownMs) {
    return [];
  }

  // Package is too new — block. Include clears_at ISO 8601 UTC timestamp (D4).
  const clearsAt = new Date(publishedDate.getTime() + cooldownMs).toISOString();
  const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);

  return [
    {
      rule: 'exposure:cooldown',
      severity: 'error',
      message: `${dependency.name}@${dependency.version} was published ${ageHours}h ago; cooldown requires ${policy.cooldown_hours}h`,
      detail: {
        name: dependency.name,
        version: dependency.version,
        publishedAt,
        clears_at: clearsAt,
        cooldown_hours: policy.cooldown_hours,
      },
    },
  ];
}
