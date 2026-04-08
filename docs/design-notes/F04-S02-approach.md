# Design Note: F04-S02 — Delta Computation

## Summary

Implement `computeDelta()` in `src/baseline/diff.js` to compare current lockfile state against the stored baseline and classify each package as added, removed, changed, or unchanged. Includes a `lockfile_hash` short-circuit for fast "no changes" detection.

## Approach

Pure comparison function — no I/O, no async. Takes `(baseline, currentDeps, currentLockfileHash)` and returns a `DependencyDelta` plain object.

### Algorithm

1. **Short-circuit check:** If `baseline.lockfile_hash === currentLockfileHash`, return early with all baseline package names in `unchanged` and `shortCircuited: true`. No per-package iteration needed.
2. **Build lookup map:** `Map<name, ResolvedDependency>` from `currentDeps` for O(1) lookup.
3. **Classify current deps:** Iterate `currentDeps`:
   - Name not in `baseline.packages` → `added`
   - Same name, same version → `unchanged` (push package name)
   - Same name, different version → `changed` (push `{ dep, previousProfile }`)
4. **Collect removed:** Iterate `baseline.packages` keys; names not in the current deps map → `removed` (push package name).

### DependencyDelta shape

```js
{
  added: ResolvedDependency[],
  removed: string[],                                            // package names only
  changed: { dep: ResolvedDependency, previousProfile: TrustProfile }[],
  unchanged: string[],                                          // package names only
  shortCircuited: boolean,
}
```

## Integration / Wiring Plan

- `src/baseline/diff.js` imports nothing from `manager.js` at runtime — it operates on the already-loaded `Baseline` plain object, so no circular dependency.
- The JSDoc references `manager.js` TrustProfile and `lockfile/models.js` ResolvedDependency for type documentation only.
- Policy engine (F06) will call `computeDelta()` — that wiring is deferred and the seam is kept explicit via named export.

## Files Expected to Change

| File | Action |
|---|---|
| `src/baseline/diff.js` | Create (new) |
| `test/baseline/diff.test.js` | Create (new) |

No other files are modified. No existing files need changes.

## Acceptance Criteria to Verification Mapping

| AC | Verification |
|---|---|
| Returns DependencyDelta with all 5 fields | Test: basic return shape |
| Hash match → shortCircuited: true, unchanged = all packages | Test: short-circuit case |
| New packages in `added` with full ResolvedDependency | Test: all-added (empty baseline) |
| Missing packages in `removed` as names | Test: all-removed (empty currentDeps) |
| Version-changed packages in `changed` with dep + previousProfile | Test: version change classification |
| Same-version packages in `unchanged` as names | Test: mixed case + unchanged |
| Unit tests cover all paths | Test file covers: hash match, empty baseline, empty lockfile, mixed, version change |

## Test Strategy

Node.js built-in `node:test` runner. Pure unit tests — no file I/O, no async. All inputs are plain objects constructed inline. Run with:

```
node --test test/baseline/diff.test.js
```

## Stubs

None. No external dependencies to stub.

## Risks and Questions

- None significant. The comparison logic is straightforward.
- Short-circuit `unchanged` list is sourced from baseline package names (authoritative on hash match).

## Verification Results

Command: `node --test test/baseline/diff.test.js`

```
✔ computeDelta returns a DependencyDelta with all five required fields
✔ computeDelta short-circuits when hashes match — returns all packages as unchanged
✔ computeDelta short-circuit returns shortCircuited: false when hashes differ
✔ computeDelta classifies all deps as added when baseline.packages is empty
✔ computeDelta added entry contains full ResolvedDependency data
✔ computeDelta classifies all baseline packages as removed when currentDeps is empty
✔ computeDelta removed entries are package names (strings), not objects
✔ computeDelta classifies version-changed package as changed, not removed+added
✔ computeDelta changed entry contains full ResolvedDependency and previousProfile
✔ computeDelta classifies same-version packages as unchanged (returns names)
✔ computeDelta correctly classifies a mixed set of added, removed, changed, and unchanged
✔ computeDelta on first check after init returns hash short-circuit with all packages unchanged
tests 12, pass 12, fail 0
```

Full suite: `node --test test/**/*.test.js` → 165 tests, 165 pass, 0 fail.

| AC | Status | Evidence |
|---|---|---|
| Returns DependencyDelta with all 5 fields | PASS | test: "all five required fields" |
| Hash match → shortCircuited | PASS | test: "short-circuits when hashes match" |
| Added packages correct | PASS | test: "all deps as added", "full ResolvedDependency data" |
| Removed packages correct | PASS | test: "all baseline packages as removed", "names (strings)" |
| Changed packages correct | PASS | test: "changed, not removed+added", "full ResolvedDependency and previousProfile" |
| Unchanged packages correct | PASS | test: "same-version packages as unchanged" |
| Unit tests cover all paths | PASS | 12 tests: hash match, empty baseline, empty lockfile, mixed, version change |
