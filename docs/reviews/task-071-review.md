# Code Review: task-071 Fix progress.test.js location: move from src/utils/__tests__/ to test/unit/utils/

## Summary
Implementation is correct and minimal: `test/unit/utils/progress.test.js` was created at the right location with the correct import path; `src/utils/__tests__/` was never present on this branch. All 22 tests pass live.

## Verdict
Approved

## Findings

None.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (not applicable — no workflow UI)
- [x] Architecture compliance (follows ADR, respects module boundaries)
- [x] Design compliance (not applicable — no UI)
- [x] Behavioral / interaction rule compliance (not applicable)
- [x] Integration completeness (import path verified against `paths.test.js` precedent)
- [x] Pitfall avoidance (checked utils pitfalls — `createProgress` is a pure stream utility; no `.git/` lookup, no temp-dir pitfall applies)
- [x] Convention compliance (file in `test/unit/utils/`, import `../../../src/utils/progress.js`, `node:test` + `node:assert/strict`)
- [x] Test coverage (22 tests cover factory shape, TTY mode, non-TTY mode, zero-total, idempotent done, stdout isolation)
- [x] Code quality & documentation (no dead code; design note documents root cause and verified results)

## Acceptance Criteria Judgment
- AC1: Test file at `test/unit/utils/progress.test.js`, `src/utils/__tests__/` absent → **PASS** — file confirmed present; `__tests__/` confirmed absent via `ls src/utils/`
- AC2: All 22 tests pass → **PASS** — `node --test test/unit/utils/progress.test.js` ran live: 22 pass, 0 fail
- AC3: Design note captures root cause → **PASS** — `docs/design-notes/task-071-approach.md` documents spec error in F10-S1 story + task-060 output binding; verification results appended and honest

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: This is a pure file-location fix; no source code changed. The only change is adding the test at the correct path. The test itself exercises `createProgress` which was already implemented in task-060; no new logic was introduced.

## Integration / Boundary Judgment
- Boundary: import path `../../../src/utils/progress.js` from `test/unit/utils/`
- Judgment: complete
- Notes: Matches the exact relative import used by `paths.test.js` → `'../../../src/utils/paths.js'`. `src/utils/progress.js` confirmed present.

## Test Results
- Command run: `node --test test/unit/utils/progress.test.js`
- Result: all pass — 22 pass, 0 fail, duration_ms ~105

## Context Updates Made
No context updates needed. The utils pitfalls already document the `.git/` temp-dir requirement for command unit tests. `createProgress` is a pure stream utility that does not call `resolvePaths()`, so that pitfall does not apply here. No new reusable trap discovered.

## Artifacts Reviewed
- Bug: `docs/bugs/BUG-progress-test-location.md`
- Design note: `docs/design-notes/task-071-approach.md`
- Global conventions: `context/global/conventions.md`
- Module pitfalls: `context/modules/utils/pitfalls.md`

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-071
- Branch: burnish/task-071-fix-progress-test-js-location-move-from-src-utils-tests-to-test-unit-utils
