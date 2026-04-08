# Story: F04-S03 — Baseline advancement and auto-staging

## Parent
F04: Baseline Management

## Description
Implement advanceBaseline() to merge newly admitted packages into the baseline and writeAndStage() to persist the updated baseline and auto-stage it via `git add`. Enforces all-or-nothing semantics (D1), silent removal of deleted packages (D3), and mode guards for --dry-run and --enforce (D10).

## Scope
**In scope:**
- `src/baseline/manager.js` — add `advanceBaseline()` and `writeAndStage()` to existing module
- `test/baseline/manager.test.js` — add unit tests for advancement and staging logic

**Not in scope:**
- Baseline data model, read, create (F04-S01 — already implemented)
- Delta computation (F04-S02)
- Policy evaluation (F06)
- CLI command orchestration (F08)

## Entry Points
- Route / page / screen: N/A — internal data layer module
- Trigger / navigation path: Called programmatically by CLI check command (F08, future) after policy evaluation passes
- Starting surface: `src/baseline/manager.js` — adds exports to existing module

## Wiring / Integration Points
- Caller-side ownership: CLI check command (F08) will call `advanceBaseline()` then `writeAndStage()` after all packages are admitted. Caller does not exist yet — keep the seam explicit. Expected contract: caller checks `--dry-run` and `--enforce` flags and skips calling these functions entirely when either is set.
- Callee-side ownership: This story owns `advanceBaseline()` and `writeAndStage()` in `src/baseline/manager.js`.
- Caller-side conditional rule: No caller exists yet. Export functions as named exports. The caller is responsible for the mode guard (not calling advance in dry-run/enforce mode). The functions themselves do not check CLI flags.
- Callee-side conditional rule: Imports `gitAdd` from `src/utils/git.js` (F01-S03, already exists). Wire to it now.
- Boundary / contract check: Unit tests verify advancement merges correct packages and writeAndStage calls git add.
- Files / modules to connect: `src/baseline/manager.js` imports from `src/utils/git.js`
- Deferred integration, if any: CLI check command wiring (F08) — deferred to sprint 2. All-or-nothing guard is the caller's responsibility (caller only calls advanceBaseline when all packages are admitted).

## Not Allowed To Stub
- `advanceBaseline()` must perform real package merging — update existing, add new, remove deleted
- `writeAndStage()` must write real JSON to disk and call real `git add` via the git utility
- git add failure handling must produce a real warning message, not silently swallow errors

## Behavioral / Interaction Rules
- All-or-nothing (D1): the caller (CLI check) is responsible for only calling advanceBaseline when every package is admitted. advanceBaseline itself does not re-check admission — it trusts its inputs.
- Removed packages (D3): packages present in the old baseline but absent from the admitted results are silently dropped from the new baseline.
- `advanceBaseline()` updates `lockfile_hash`, `updated_at` timestamp, and merges the packages map.
- `writeAndStage()` writes JSON with 2-space indentation, then calls `gitAdd('.dep-fence/baseline.json')`. If `gitAdd` fails, it logs a warning but does not throw — the baseline file is still written.
- Mode guards (D10): `advanceBaseline()` and `writeAndStage()` do not check `--dry-run` or `--enforce` flags themselves. The caller is responsible for skipping these calls in those modes.

## Acceptance Criteria
- [ ] `advanceBaseline(baseline, admittedDeps, lockfileHash)` returns an updated Baseline with newly admitted packages merged, removed packages dropped, updated `lockfile_hash`, and updated `updated_at` timestamp
- [ ] Newly admitted packages get fresh TrustProfile entries with current timestamp as `admittedAt`
- [ ] Packages in old baseline but not in `admittedDeps` and not in the current lockfile are silently removed (D3)
- [ ] Packages in old baseline that are unchanged (same version, still in lockfile) retain their original TrustProfile
- [ ] `writeAndStage(baseline, baselinePath)` writes JSON to disk and calls `gitAdd('.dep-fence/baseline.json')`
- [ ] If `gitAdd` fails, `writeAndStage` logs a warning (e.g., "Warning: could not auto-stage baseline file") but does not throw
- [ ] Unit tests cover: merge new packages, remove deleted packages, retain unchanged, git add success, git add failure warning

## Task Breakdown
1. Implement `advanceBaseline(baseline, admittedDeps, lockfileHash)` in `src/baseline/manager.js` — merge admitted packages, remove deleted, update metadata
2. Implement `writeAndStage(baseline, baselinePath)` in `src/baseline/manager.js` — write JSON + call gitAdd
3. Add git add failure handling with warning log
4. Write unit tests in `test/baseline/manager.test.js` for advancement and staging

## Verification
```
node --test test/baseline/manager.test.js
# Expected: all tests pass (including new advancement and staging tests), no errors
```

## Edge Cases to Handle
- All packages are new (first baseline advancement after init with changes) — all get fresh TrustProfiles
- All packages removed — baseline ends up with empty packages map
- git add fails (e.g., baseline file in .gitignore) — warning logged, no throw, baseline file still written to disk
- Unchanged packages retain their original admittedAt timestamp — not overwritten with current time
- Package version changed — old TrustProfile replaced with new one (fresh admittedAt)

## Dependencies
- Depends on: F04-S01 (Baseline and TrustProfile structures), F01-S03 (git utility — `gitAdd` in `src/utils/git.js`)
- Blocked by: none

## Effort
M — advancement logic + file write + git staging + error handling

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
