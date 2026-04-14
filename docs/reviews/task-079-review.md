# Code Review: task-079 — Fix npm v2/v3 parser crash on workspace link entries

## Summary

Minimal, correct fix: a single guard (`if (entry.link === true) continue;`) added at the right position in `_parseV2V3`. All six new regression tests pass; all pre-existing npm parser tests pass. Design note is honest and complete.

## Verdict

Approved

## Findings

No findings. Implementation is clean and exactly matches the root-cause hypothesis in BUG-002.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — not applicable (no UI/workflow)
- [x] Architecture compliance (follows ADR, respects module boundaries)
- [ ] Design compliance — not applicable (no UI)
- [ ] Behavioral / interaction rule compliance — not applicable (parser-only internal change)
- [x] Integration completeness (caller/callee contract and counterpart wiring rules are honored)
- [x] Pitfall avoidance (checked all listed pitfalls for affected modules)
- [x] Convention compliance (naming, error handling, imports, file structure)
- [x] Test coverage (every acceptance criterion has a test, edge cases covered)
- [x] Code quality & documentation (no dead code, design note updated, no changelog entry required for a bug fix)

## Acceptance Criteria Judgment

- AC1: `init`/`audit` complete without error on workspace lockfile → PASS — `assert.doesNotThrow(() => parseNpm(...))` tests for both v2 and v3 pass.
- AC2: Workspace link entries not in parsed array → PASS — `result.find(d => d.name === 'apps/frontend')` and `'apps/backend'` are each asserted undefined in both v2 and v3 tests.
- AC3: Non-link entries still parsed correctly → PASS — all 39 pre-existing fixture tests pass unchanged; lodash verified present with correct version in mixed-lockfile tests.
- AC4: Regression unit test covers v2/v3 lockfile with link entry → PASS — 6 new tests in 2 describe blocks (`v2 workspace link entries are skipped`, `v3 workspace link entries are skipped`).

## Deferred Verification

none

## Regression Risk

- Risk level: low
- Why: Change is a single `continue` guard on a property check (`entry.link === true`). Normal packages never have `link: true` set; the guard is unreachable for all pre-existing fixture content. All 45 npm parser tests (39 pre-existing + 6 new) pass.

## Integration / Boundary Judgment

- Boundary: `parseNpm` → `validateDependency` / callers (`init`, `audit`, `check`)
- Judgment: complete
- Notes: Bug report specifies the contract — `parseNpm` must return only entries satisfying `validateDependency`. The fix ensures link entries never reach the validator. No caller changes needed.

## Test Results

- Command run: `npm test` (full suite via `node --test`)
- Result: 844 pass, 64 fail — all 64 failures are pre-existing and in unrelated modules (`args.js` (1), `terminal.test.js` output formatting (many)), not in the npm parser. All npm-parser suites pass 100%.

## Context Updates Made

No context updates needed.

## Metadata

- Agent: reviewer
- Date: 2026-04-13
- Task: task-079
- Branch: burnish/task-079-fix-npm-v2-v3-parser-crash-on-workspace-link-entries
