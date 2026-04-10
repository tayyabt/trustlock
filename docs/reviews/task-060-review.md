# Code Review: task-060 — Implement TTY-aware progress counter utility

## Summary

Clean, correct implementation of `src/utils/progress.js` satisfying all 8 acceptance criteria. All 22 unit tests pass. Zero imports confirmed (ADR-001). One convention deviation is noted: the test file was placed at `src/utils/__tests__/progress.test.js` rather than `test/unit/utils/progress.test.js` per global conventions — however this was explicitly specified in the story's verification section and task output bindings, making it a spec-level issue rather than a developer defect. A follow-up DEV_BUG_FIX task is filed for the relocation.

## Verdict

Approved

## Findings

### Finding 1 — Test file location violates global conventions
- **Severity:** warning
- **Finding:** `src/utils/__tests__/progress.test.js` is placed inside the source tree. Global conventions (`context/global/conventions.md`) specify tests go in `test/` mirroring source structure (`test/unit/utils/`, `test/integration/`). Existing precedent: `test/unit/utils/paths.test.js`. The story verification section and task output binding both specified `src/utils/__tests__/progress.test.js`, so the developer followed the spec faithfully. The spec itself was wrong.
- **Proposed Judgment:** Relocate to `test/unit/utils/progress.test.js` in a follow-up DEV_BUG_FIX task. No changes required on this task.
- **Reference:** `context/global/conventions.md` — "Tests in `test/` mirroring source structure (unit/, integration/)"

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — N/A (utility module, no workflow)
- [x] Architecture compliance (follows ADR-001 zero-dependency rule; stream injection pattern is idiomatic)
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (TTY `\r`-rewrite, non-TTY `\n`-interval, stdout isolation, `done()` idempotency all verified)
- [x] Integration completeness (callee-side complete; F10-S4 owns caller-side wiring — correctly deferred)
- [x] Pitfall avoidance (no division-by-zero, no hardcoded interval, real TTY detection via injected stream)
- [x] Convention compliance (kebab-case filename ✓; camelCase exports ✓; test location ✗ — spec-driven, follow-up filed)
- [x] Test coverage (all 8 ACs have explicit test cases; edge cases total=0, total=1, total=3, n>1 tick all covered)
- [x] Code quality & documentation (no dead code; design note complete and honest; no public doc changes required)

## Acceptance Criteria Judgment

- AC1: `createProgress(total, stream)` exported; returns `{ tick(n), done() }` → **PASS** — test `returns an object with tick and done functions`
- AC2: TTY path: each `tick()` rewrites line with `\r`; `done()` writes `\n` → **PASS** — test group `TTY mode` (5 tests)
- AC3: Non-TTY path: progress line with `\n` at ~10% interval; silent between → **PASS** — test group `non-TTY mode` (7 tests); interval=2 for total=20 verified exactly
- AC4: `tick()` is a no-op when total is 0 → **PASS** — test group `zero total` (3 tests including `n`-argument variant)
- AC5: `done()` is idempotent → **PASS** — test group `idempotent done()` (3 tests, TTY + non-TTY + triple-call)
- AC6: No stdout writes → **PASS** — test group `stdout isolation` (2 tests, one per TTY mode)
- AC7: No imports outside Node.js built-ins (ADR-001) → **PASS** — `grep "^import" src/utils/progress.js | wc -l` = 0
- AC8: Test suite covers all four behavioral rules → **PASS** — 22 tests, 6 describe groups; `node --test src/utils/__tests__/progress.test.js` → 22 pass, 0 fail

## Deferred Verification

none

## Regression Risk

- Risk level: low
- Why: Standalone new module with no callers yet. No existing code path modified. Zero imports means no transitive breakage. F10-S4 (not yet implemented) will be the first caller.

## Integration / Boundary Judgment

- Boundary: `createProgress(total, stream)` — callee contract for F10-S4 (check.js, init.js)
- Judgment: complete (callee-side)
- Notes: The exported API surface `{ tick(n?), done() }` is fully implemented. The design note correctly defers caller-side wiring to F10-S4. No additional surface area is needed.

## Test Results

- Command run: `node --test src/utils/__tests__/progress.test.js`
- Result: 22 pass, 0 fail, 0 skipped

```
ℹ tests 22
ℹ suites 6
ℹ pass 22
ℹ fail 0
ℹ duration_ms 117
```

## Context Updates Made

- Updated `context/modules/utils/pitfalls.md` with a new pitfall about test file location:
  - Pitfall #5: Test files for `src/utils/` modules must go in `test/unit/utils/`, not `src/utils/__tests__/`
  - Source: Story F10-S1 spec incorrectly specified `src/utils/__tests__/`; global conventions require `test/unit/utils/`

## Metadata

- Agent: reviewer
- Date: 2026-04-10
- Task: task-060
- Branch: burnish/task-060-implement-tty-aware-progress-counter-utility
- Story: F10-S1 — TTY-aware progress counter utility
- ADR: ADR-001 (zero runtime dependencies)
- Feature Brief: docs/feature-briefs/F10-output-ux-redesign.md
- Global Conventions: context/global/conventions.md
