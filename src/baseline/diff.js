/**
 * Delta computation — compare current lockfile state against a stored baseline.
 *
 * DependencyDelta structure:
 *   added           {ResolvedDependency[]}                          In lockfile, not in baseline
 *   removed         {string[]}                                      In baseline, not in lockfile (names only)
 *   changed         {{ dep: ResolvedDependency, previousProfile: TrustProfile }[]}
 *   unchanged       {string[]}                                      Same name + same version (names only)
 *   shortCircuited  {boolean}                                       True when lockfile_hash matched
 */

/**
 * Compare the current lockfile state against the stored baseline.
 *
 * When `currentLockfileHash` equals `baseline.lockfile_hash`, returns early
 * with all baseline packages as unchanged and `shortCircuited: true` — no
 * per-package iteration is performed.
 *
 * Classification rules:
 *   - Package in currentDeps, not in baseline          → added
 *   - Package in baseline, not in currentDeps          → removed (name only)
 *   - Same name, same version in both                  → unchanged (name only)
 *   - Same name, different version                     → changed (dep + previousProfile)
 *
 * @param {{ lockfile_hash: string, packages: Object.<string, TrustProfile> }} baseline
 * @param {import('../lockfile/models.js').ResolvedDependency[]} currentDeps
 * @param {string} currentLockfileHash SHA-256 hex of the raw current lockfile content
 * @returns {DependencyDelta}
 */
export function computeDelta(baseline, currentDeps, currentLockfileHash) {
  // Fast path: if hashes match, there are no changes.
  if (baseline.lockfile_hash === currentLockfileHash) {
    return {
      added: [],
      removed: [],
      changed: [],
      unchanged: Object.keys(baseline.packages),
      shortCircuited: true,
    };
  }

  const added = [];
  const changed = [];
  const unchanged = [];

  // Build O(1) lookup of current dep names.
  const currentMap = new Map(currentDeps.map((dep) => [dep.name, dep]));

  // Classify each current dependency.
  for (const dep of currentDeps) {
    const profile = baseline.packages[dep.name];
    if (profile == null) {
      added.push(dep);
    } else if (profile.version === dep.version) {
      unchanged.push(dep.name);
    } else {
      changed.push({ dep, previousProfile: profile });
    }
  }

  // Packages in baseline but absent from current lockfile → removed.
  const removed = Object.keys(baseline.packages).filter(
    (name) => !currentMap.has(name)
  );

  return { added, removed, changed, unchanged, shortCircuited: false };
}
