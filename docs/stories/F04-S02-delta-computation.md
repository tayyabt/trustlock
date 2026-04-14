# Story: F04-S02 — Delta computation

## Parent
F04: Baseline Management

## Description
Implement computeDelta() to compare the current lockfile state against the stored baseline and classify each package as added, removed, changed, or unchanged. Includes lockfile_hash short-circuit for fast "no changes" detection.

## Scope
**In scope:**
- `src/baseline/diff.js` — computeDelta() function and DependencyDelta data structure
- `test/baseline/diff.test.js` — unit tests for all classification paths and short-circuit

**Not in scope:**
- Baseline read/create (F04-S01)
- Baseline advancement and auto-staging (F04-S03)
- Policy evaluation of delta results (F06)
- Registry fetching

## Entry Points
- Route / page / screen: N/A — internal data layer module
- Trigger / navigation path: Called programmatically by policy engine (F06, future) and CLI check command (F08, future)
- Starting surface: `src/baseline/diff.js` — importable module

## Wiring / Integration Points
- Caller-side ownership: Policy engine (F06) will call `computeDelta()` to determine which packages need evaluation. Caller does not exist yet — keep the seam explicit. Expected contract: `computeDelta(baseline: Baseline, currentDeps: ResolvedDependency[], currentLockfileHash: string) => DependencyDelta`.
- Callee-side ownership: This story owns `diff.js` with the `computeDelta()` function and `DependencyDelta` structure.
- Caller-side conditional rule: No caller exists yet. Export `computeDelta` as a named export from `src/baseline/diff.js`.
- Callee-side conditional rule: Imports `Baseline` structure from `src/baseline/manager.js` (F04-S01). Wire to it now. Imports `ResolvedDependency` from `src/lockfile/models.js` (F02-S01). Wire to it now.
- Boundary / contract check: Unit tests verify delta classification against known baseline + dependency combinations.
- Files / modules to connect: `src/baseline/diff.js` imports from `src/baseline/manager.js` and `src/lockfile/models.js`
- Deferred integration, if any: Policy engine wiring (F06) — deferred to sprint 2.

## Not Allowed To Stub
- `computeDelta()` must perform real comparison logic — no placeholder classifications
- lockfile_hash short-circuit must compare actual hash values
- All four classification categories (added, removed, changed, unchanged) must be fully implemented

## Behavioral / Interaction Rules
- Version change is classified as "changed" (triggers full re-evaluation), not "removed + added"
- Packages in baseline but not in current lockfile are classified as "removed"
- Packages in current lockfile but not in baseline are classified as "added"
- Same name + same version = "unchanged"
- lockfile_hash short-circuit: if `baseline.lockfile_hash === currentLockfileHash`, return early with empty delta (no changes)
- DependencyDelta structure: `{ added: ResolvedDependency[], removed: string[], changed: { dep: ResolvedDependency, previousProfile: TrustProfile }[], unchanged: string[], shortCircuited: boolean }`

## Acceptance Criteria
- [ ] `computeDelta(baseline, currentDeps, currentLockfileHash)` returns a `DependencyDelta` with `added`, `removed`, `changed`, `unchanged`, and `shortCircuited` fields
- [ ] When lockfile_hash matches baseline, returns `{ added: [], removed: [], changed: [], unchanged: [...allPackages], shortCircuited: true }`
- [ ] New packages (in lockfile, not in baseline) appear in `added` with full `ResolvedDependency` data
- [ ] Missing packages (in baseline, not in lockfile) appear in `removed` as package names
- [ ] Version-changed packages appear in `changed` with both the new `ResolvedDependency` and the `previousProfile` from baseline
- [ ] Same-version packages appear in `unchanged` as package names
- [ ] Unit tests cover: no changes (hash match), all added (empty baseline), all removed (empty lockfile), mixed changes, version change classification

## Task Breakdown
1. Create `src/baseline/diff.js` with DependencyDelta structure definition
2. Implement lockfile_hash short-circuit check
3. Implement package-by-package comparison: iterate current deps against baseline packages map, classify each
4. Collect removed packages (in baseline but not in current deps)
5. Write unit tests in `test/baseline/diff.test.js` covering all classification paths

## Verification
```
node --test test/baseline/diff.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- First run after init — no changes from baseline, delta should show all unchanged (or hash match short-circuit)
- Empty baseline packages map — all current deps classified as added
- Empty current deps — all baseline packages classified as removed
- lockfile_hash unchanged but packages differ — should not happen if hash is correct, but comparison runs if hashes don't match
- Package name exists in both but version changed — classified as "changed", not "removed + added"

## Dependencies
- Depends on: F04-S01 (Baseline and TrustProfile structures in `src/baseline/manager.js`)
- Blocked by: none

## Effort
M — comparison logic with multiple classification paths and short-circuit optimization

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
