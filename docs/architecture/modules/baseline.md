# Module Architecture: Baseline

## Purpose
Manage the trust baseline — the last known-good state of the dependency tree. Compute deltas between baseline and current lockfile. Handle advancement with auto-staging.

## Responsibilities
- Read baseline from `.dep-fence/baseline.json`
- Create initial baseline during `init` (trust all current packages)
- Compute `DependencyDelta` (added, removed, changed, unchanged)
- Advance baseline on full admission: update packages, update timestamp, update lockfile hash
- Auto-stage baseline after advancement (`git add`)
- Silently remove packages from baseline that were removed from lockfile (D3)
- Never advance in enforce mode (D10) or dry-run mode

## Entry Points
- `manager.js:readBaseline(baselinePath)` → `Baseline`
- `manager.js:createBaseline(dependencies, lockfileHash)` → `Baseline`
- `manager.js:advanceBaseline(baseline, admittedResults, lockfileHash)` → updated `Baseline`
- `manager.js:writeAndStage(baseline, baselinePath)` → writes file + git add
- `diff.js:computeDelta(baseline, currentDeps)` → `DependencyDelta`

## Dependencies
- Depends on: utils/git (for `git add` staging)
- Used by: policy (for delta computation and trust profile lookup), cli (for init and advancement)

## Allowed Interactions
- Read/write `.dep-fence/baseline.json`
- Call `git add` on the baseline file after writing
- Compute hash of lockfile content

## Forbidden Interactions
- Must NOT fetch from registry
- Must NOT evaluate policy rules
- Must NOT read or write approvals

## Notes
- Baseline packages are keyed by package name for O(1) lookup
- `schema_version` field enables future migration (e.g., v2 for publisher identity in v0.2)
- Delta computation treats version change as "changed" (triggers full re-evaluation), not "removed + added"
- `lockfile_hash` is SHA-256 of the lockfile content, used for quick "no changes" short-circuit

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: baseline
