/**
 * Approval validator — query interface consumed by the policy engine (F06).
 *
 * These are pure, synchronous functions. They do not perform file I/O;
 * the caller is responsible for loading the Approval[] array.
 *
 * Approval shape (from models.js):
 *   package      {string}    Package name
 *   version      {string}    Exact version
 *   overrides    {string[]}  Policy rule names this approval bypasses
 *   reason       {string}    Human-readable reason
 *   approver     {string}    Identity string
 *   approved_at  {string}    ISO 8601 UTC timestamp of when approval was granted
 *   expires_at   {string}    ISO 8601 UTC timestamp of expiry
 */

/**
 * Check whether an approval has expired.
 *
 * Compares `approval.expires_at` against the current time using `Date.now()`.
 * An approval is considered expired when `expires_at` is in the past or
 * exactly equal to now.
 *
 * @param {{ expires_at: string }} approval  Approval object
 * @returns {boolean}  true when the approval has expired; false otherwise
 */
export function isExpired(approval) {
  return new Date(approval.expires_at).getTime() <= Date.now();
}

/**
 * Find the best valid approval for a given package+version+rule combination.
 *
 * Rules:
 *   - Package and version must match exactly.
 *   - The approval must not be expired (isExpired returns false).
 *   - The approval's `overrides` array must include `rule` (exact string equality).
 *   - An approval with an empty `overrides` array never matches (D9: no wildcard approvals).
 *   - When multiple non-expired approvals match, the one with the latest `approved_at`
 *     timestamp wins (most-recent-wins).
 *   - Returns `null` when no matching non-expired approval exists.
 *
 * @param {object[]} approvals   Full Approval[] array (already loaded by the caller)
 * @param {string}   packageName Package name to look up
 * @param {string}   version     Exact version to look up
 * @param {string}   rule        Policy rule name to check (e.g. "cooldown", "scripts")
 * @returns {object|null}  The best matching Approval, or null if none found
 */
export function findValidApproval(approvals, packageName, version, rule) {
  const candidates = approvals.filter(
    (a) =>
      a.package === packageName &&
      a.version === version &&
      !isExpired(a) &&
      Array.isArray(a.overrides) &&
      a.overrides.includes(rule)
  );

  if (candidates.length === 0) {
    return null;
  }

  // Most-recent-wins: sort by approved_at descending, take the first
  candidates.sort(
    (a, b) => new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime()
  );

  return candidates[0];
}
