# Code Review: task-070 — --profile CLI Flag and check.js Integration

## Summary
The implementation is complete and correct. All 13 story acceptance criteria and all 15 integration tests pass. The profile resolution logic, floor enforcement, mandatory warning emission, and JSON output extension are all accurately wired.

## Verdict
Approved

## Findings

No blocking findings. One observation for documentation purposes:

### `--profile` placement in `args.js` is between `--sarif` and `--quiet`
- **Severity:** suggestion
- **Finding:** `--profile` appears at line 18 of `src/cli/args.js`, between `sarif` and `quiet`. The story specifies "add `--profile` after `--sarif` entry from F10-S4" — this is satisfied. The order is correct.
- **Proposed Judgment:** No change needed.
- **Reference:** Story F14-S2, task breakdown step 1.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — N/A, no workflow coverage required (F14 brief)
- [x] Architecture compliance (ADR-005 step 4; ADR-001 zero runtime deps; module boundaries respected)
- [x] Design compliance — N/A, CLI-only, no UI preview
- [x] Behavioral / interaction rule compliance (user-defined wins over built-in by name; mandatory warning placement; `--quiet` non-suppression; no-changes early return path)
- [x] Integration completeness (caller-side: check.js imports and calls applyProfileOverlay; callee: builtin-profiles.js is real, no stub)
- [x] Pitfall avoidance — no module pitfalls file present; standard patterns followed
- [x] Convention compliance (node:util.parseArgs; camelCase; UPPER_SNAKE_CASE constant; zero runtime deps; ES modules)
- [x] Test coverage (all 13 ACs have explicit test cases; edge cases covered: no-profiles-key, user-defined-relaxed-above-base, quiet-no-suppress, C-NEW-2 structural)
- [x] Code quality & documentation (design note complete; F15 seam documented in-code at check.js:96)

## Acceptance Criteria Judgment

- AC-strict-cooldown: `--profile strict` → cooldown_hours=168h; packages under 168h blocked → **PASS** — test `strict profile: packages under 168h but above 72h cooldown are blocked` ✔
- AC-strict-warning: mandatory warning in terminal output → **PASS** — test `strict profile: mandatory provenance-all warning appears in terminal output` ✔
- AC-relaxed-builtin: `--profile relaxed` (built-in) → cooldown=24h, no floor error → **PASS** — tests `relaxed built-in profile: no floor error and cooldown effective at 24h` and `relaxed built-in profile: packages under 24h cooldown are blocked` ✔
- AC-user-defined: `--profile myprofile` (user-defined) → overlay applied → **PASS** — test `user-defined profile: overlay applied (tighter cooldown)` ✔
- AC-unknown: `--profile unknown` → exit 2 with exact message → **PASS** — test `unknown profile: exits 2 with exact error message` ✔
- AC-floor-violation: user-defined profile lowering cooldown → exit 2 with exact C11 message → **PASS** — test `floor violation: user-defined profile lowering cooldown exits 2 with exact message` ✔
- AC-builtin-relaxed-floor-exception: built-in relaxed below base → no error → **PASS** — covered by relaxed-builtin test ✔
- AC-user-defined-relaxed: user-defined `relaxed` → floor enforcement applies → **PASS** — test `user-defined profile named "relaxed": floor enforcement applies (not treated as built-in)` ✔
- AC-required-for-warning: `required_for: ["*"]` in profile → warning in JSON `warnings[]` → **PASS** — test `strict profile: mandatory warning appears in JSON warnings[]` ✔
- AC-quiet-no-suppress: `--quiet` does not suppress mandatory terminal warning → **PASS** — test `--quiet does not suppress the mandatory provenance-all warning` ✔
- AC-no-profile: no `--profile` → base config, no warning → **PASS** — test `no --profile flag: base config used, no mandatory warning in output` ✔
- AC-args-only-profile: `args.js` adds only `--profile`; no re-addition of `--quiet`/`--sarif` → **PASS** — `args.js` line 18 confirms `--profile` only; `--quiet` and `--sarif` not re-added; args.test.js `parses --profile string flag (F14-S2)` ✔
- AC-C-NEW-2: `check.js` calls `applyProfileOverlay` via public exported signature only → **PASS** — test `C-NEW-2: applyProfileOverlay from builtin-profiles.js drives the overlay` ✔; no inline re-implementation in check.js
- AC-integration-test: `node --test test/cli/check-profile.test.js` → 15/15 pass → **PASS** ✔

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: No modification to existing policy evaluation logic. `config.js` change is purely additive (`profiles` passthrough with a no-op conditional). `json.js` change is purely additive (`warnings[]` only included when non-empty). `args.js` adds one new string option. `check.js` profile block is gated on `profileName !== null`. All existing `check.test.js` and `args.test.js` tests continue to pass (39/39). Pre-existing failures in `test/output/json.test.js` are confirmed pre-existing stale schema_version 1 tests, not introduced by this task.

## Integration / Boundary Judgment
- Boundary: `check.js` (caller) → `builtin-profiles.js` (callee, F14-S1)
- Judgment: complete
- Notes: `check.js` imports `applyProfileOverlay` and `isBuiltinProfile` from `src/policy/builtin-profiles.js` at line 19. Caller-side wiring is fully implemented. The callee exists as a real module (no stub). Integration test suite verifies end-to-end behavior from `run()` call through `applyProfileOverlay` execution. F15 seam is documented in `check.js` at line 96 for Sprint 4 migration.

## Test Results
- Command run: `node --test test/cli/check-profile.test.js test/unit/cli/check.test.js test/unit/cli/args.test.js test/policy/config.test.js`
- Result: 54 pass, 0 fail
  - `check-profile.test.js`: 15/15 pass
  - `check.test.js`: 14/14 pass
  - `args.test.js` (`parseArgs` suite): 16/16 pass
  - `config.test.js` (policy + models): 9/9 pass

## Context Updates Made
No context updates needed. No new pitfalls or reusable guidance emerged beyond what is already captured in ADR-005. The F15 seam comment in `check.js` serves as the forward-compatibility documentation.

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-070
- Branch: burnish/task-070-implement-profile-cli-flag-and-check-js-integration
- Artifacts cited: docs/stories/F14-S2-profile-flag-and-check-wiring.md, docs/feature-briefs/F14-policy-profiles.md, docs/adrs/ADR-005-policy-config-load-order-and-floor-enforcement.md, docs/adrs/ADR-001-zero-runtime-dependencies.md, context/global/conventions.md, context/global/architecture.md, docs/design-notes/F14-S2-approach.md
