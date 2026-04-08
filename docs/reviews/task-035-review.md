# Code Review: task-035 — Implement check Command

## Summary
Full, clean implementation of `dep-fence check` and the missing `src/policy/engine.js`. All 11 acceptance criteria are concretely verified with passing unit tests. All binding product decisions (D1, D3, D4, D10) are correctly implemented. 14/14 unit tests pass; 434/434 full suite passes.

## Verdict
Approved

## Findings

No blocking findings. One minor coverage observation (non-blocking):

### "No baseline" edge case has no dedicated unit test
- **Severity:** suggestion
- **Finding:** `check.js:71-76` handles the missing-baseline case correctly (exit 2 + "No baseline found. Run `dep-fence init` first.") but `check.test.js` has no test for it. The story's edge-cases section lists it; it is absent from the numbered AC list.
- **Proposed Judgment:** Implementation is correct and the code path is simple; a future test would lock the behavior. Non-blocking since no numbered AC requires it.
- **Reference:** Story edge-cases section — "check with no baseline: exit 2, run dep-fence init first"

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — check-admit workflow fully covered; all error states (config missing, baseline missing, no lockfile) produce correct exit 2 messages with "run dep-fence init" guidance per check-admit.md
- [x] Architecture compliance — check.js is thin orchestration in cli layer; all decision logic stays in policy/engine.js; module layering respected; no runtime dependencies (ADR-001)
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance — D1, D3, D4, D10, Q2 all satisfied
- [x] Integration completeness — all 8 downstream modules wired with real (not stubbed) APIs; registry is injectable for tests only
- [x] Pitfall avoidance — no module pitfalls file exists; verified no common issues (no process.chdir race, no global stdout mutation persisted across tests)
- [x] Convention compliance — ES modules, camelCase functions, kebab-case filenames, errors to stderr, output to stdout
- [x] Test coverage — all 11 ACs covered; D1 + D10 + --dry-run + --lockfile flag also have dedicated tests; 14 tests total
- [x] Code quality — no dead code, no stubs, no TODO-driven behavior in critical paths

## Acceptance Criteria Judgment

- AC1: advisory mode + all admitted → baseline advanced — **PASS** — AC1 test: writeAndStageCalled=true, path contains 'baseline.json', advanced baseline includes lodash
- AC2: `--enforce` + blocked → exit 1, no baseline write — **PASS** — AC2 test: exitCode===1, writeAndStageCalled===false
- AC3: `--enforce` + all admitted → exit 0, no baseline write (D10) — **PASS** — AC3 test: exitCode===0, writeAndStageCalled===false
- AC4: `--dry-run` → no baseline write even if all admitted — **PASS** — AC4 test: writeAndStageCalled===false
- AC5: `--json` → valid JSON matching F07 shape — **PASS** — AC5 test: JSON.parse succeeds, array with decision field
- AC6: block output includes per-pkg reasons, clears_at (D4), approval command — **PASS** — terminal AC6 test checks 'clears'/'UTC' and 'approve'; JSON AC6 test checks finding.detail.clears_at and approvalCommand
- AC7: no lockfile → exit 2 with expected filenames — **PASS** — AC7 test: exitCode===2, stderr includes 'package-lock.json'
- AC8: no `.depfencerc.json` → exit 2 with init message — **PASS** — AC8 test: exitCode===2, stderr includes 'dep-fence init'
- AC9: no dep changes → exit 0 + "No dependency changes" — **PASS** — AC9 test: exitCode===0, stdout includes 'No dependency changes'
- AC10: registry unreachable → exit 0, warnings, local rules evaluated — **PASS** — AC10 test: exitCode===0, output includes evaluation result
- AC11: `git diff --staged` shows baseline after advisory admit — **PASS** — AC1 test: writeAndStage called with correct baselinePath (advisory, non-dry-run); real writeAndStage calls git add per ADR-002

## Deferred Verification
- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: All core behaviors tested with fixture files and injected mocks. engine.js is pure orchestration of pre-existing rule modules (cooldown, pinning, provenance) — no new evaluation logic. Full suite (434 tests) continues to pass, confirming no regression in upstream modules.

## Integration / Boundary Judgment
- Boundary: check.js → {parser, registry client, engine, baseline manager, diff, approvals store, approval generator, output formatters}
- Judgment: complete
- Notes: All 8 downstream modules wired to real APIs. Registry is injectable for test isolation only (standard pattern per conventions.md). No callee stubs in production code path.

## Test Results
- Command run: `node --test test/unit/cli/check.test.js`
- Result: 14/14 pass (0 failures)
- Command run: `node --test` (full suite)
- Result: 434/434 pass (0 failures)

## Context Updates Made
No context updates needed. engine.js placement in the policy module and check.js injection pattern for registry and writeAndStage align with existing conventions and are documented in the design note.

## Artifacts Used for Judgment
- Story: `docs/stories/F08-S2-check-command.md`
- Feature brief: `docs/feature-briefs/F08-cli-commands.md`
- Design note: `docs/design-notes/F08-S2-approach.md`
- Workflow: `docs/workflows/cli/check-admit.md`
- System overview: `docs/architecture/system-overview.md`
- Global conventions: `context/global/conventions.md`
- Global architecture: `context/global/architecture.md`
- ADR-001 (zero runtime deps), ADR-002 (baseline advancement), ADR-003 (registry caching), ADR-004 (lockfile parser)

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-035
- Branch: burnish/task-035-implement-check-command
