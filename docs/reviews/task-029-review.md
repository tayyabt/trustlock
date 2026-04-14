# Code Review: task-029 — Implement Trust & Exposure Rules (F06-S02)

## Summary
Three pure-function policy rules are correctly implemented, fully tested, and compliant with ADR-001 (zero runtime deps) and the global architecture. All 35 tests pass on live execution. Design note accurately maps every AC to a passing test. One suggestion-level forward-risk finding on the `models.js` severity constant.

## Verdict
Approved

## Findings

### Finding 1: `models.js` documents `severity: 'block'` but rules emit `severity: 'error'`
- **Severity:** suggestion
- **Finding:** `src/policy/models.js` line 57 documents the `Finding.severity` default as `'block'` and the comment states `'block' or 'warn'` as the valid values. All three rules (`provenance.js`, `cooldown.js`, `pinning.js`) emit `severity: 'error'` for blocking findings as specified by the story behavioral rules. The design note acknowledges the conflict and defers alignment to F06-S04. However, `models.js` itself is not updated, leaving the canonical contract document stale.
- **Proposed Judgment:** Before F06-S04 lands, update `models.js` to document `'error'` (and `'skipped'`) as the correct severity values. The engine implementor will rely on `models.js` to understand the contract.
- **Reference:** Design note § "Questions/Concerns" — severity conflict; `src/policy/models.js:57`

### Finding 2: Story artifact inaccessible in this worktree
- **Severity:** warning
- **Finding:** The task references `story: /Users/tayyabtariq/Documents/projects/.burnish-worktrees/trustlock/task-010/docs/stories/F06-S02-trust-and-exposure-rules.md` but that file does not exist in the worktree. Review was conducted against the design note, which preserves the behavioral spec in sufficient detail.
- **Proposed Judgment:** No action required for this review. Ensure the story artifact is preserved for the F06-S04 reviewer.
- **Reference:** Task file inputs section; `read-input.sh` returned empty for `story` key

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — no workflow integration in this story)
- [x] Architecture compliance (follows ADR-001, respects module boundaries — callee only)
- [x] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (skip-don't-block edge cases honored for both provenance and cooldown)
- [x] Integration completeness (callee-side complete; caller seam explicit and intentionally deferred)
- [x] Pitfall avoidance (no runtime deps, no global mocking, pinning tests use real temp files)
- [x] Convention compliance (kebab-case files, ES modules, `node:fs/promises` per conventions.md)
- [x] Test coverage (all ACs covered; edge cases: null registry, invalid timestamp, disabled policy, missing dep)
- [x] Code quality & documentation (design note complete, stubs section explicitly "None")

## Acceptance Criteria Judgment
- AC: provenance blocks regression (had attestation, lost it) → PASS — `provenance.test.js` "blocks on provenance regression"
- AC: provenance blocks required_for with no attestation → PASS — 3 cases: no baseline, unverified, unknown
- AC: provenance admits when attestation present → PASS — 2 cases (required / not required)
- AC: provenance admits when not required and no prior attestation → PASS — 2 cases (unverified baseline, null baseline)
- AC: provenance skips when registry unavailable → PASS — `severity: 'skipped'`, does not block
- AC: cooldown blocks with clears_at when age < cooldown_hours → PASS — clears_at = publishedAt + cooldown_hours, ISO 8601 UTC
- AC: cooldown admits when age >= cooldown_hours → PASS — 2 cases (100h, exactly 72h)
- AC: cooldown skips when publishedAt unavailable → PASS — 4 cases (null registry, null publishedAt, undefined, invalid timestamp)
- AC: pinning blocks floating ranges when required → PASS — 5 operators: `^`, `~`, `*`, `>=`, devDeps
- AC: pinning admits exact versions → PASS — deps and devDeps
- AC: pinning admits when disabled → PASS — no file read, immediate return
- AC: all three return correct Finding[] fields → PASS — shape validated in dedicated tests for each rule

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: All rules are pure functions (cooldown injects `now`, pinning injects `packageJsonPath`). No shared state, no globals mocked. Tests cover admit, block, and skip paths for each rule. The only forward risk is the severity string mismatch noted in Finding 1, which is documentation-level and does not affect this story's behavior.

## Integration / Boundary Judgment
- Boundary: callee-side — `evaluate(dependency, baseline, registryData, policy[, extra]) → Finding[]`
- Judgment: complete
- Notes: Engine wiring (F06-S04) is explicitly deferred with a design-note seam record. `pinning.js` correctly returns `Promise<Finding[]>` and documents that the engine must `await` it. No stub in `engine.js` was created.

## Test Results
- Command run: `node --test test/policy/rules/provenance.test.js`
- Result: 12/12 PASS

- Command run: `node --test test/policy/rules/cooldown.test.js`
- Result: 12/12 PASS

- Command run: `node --test test/policy/rules/pinning.test.js`
- Result: 11/11 PASS

## Context Updates Made
No context updates needed. No module guidance, pitfalls, or decisions files are bound to this task.

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-029
- Branch: burnish/task-029-implement-trust-exposure-rules
- Artifacts reviewed: `docs/design-notes/F06-S02-approach.md`, `src/policy/rules/provenance.js`, `src/policy/rules/cooldown.js`, `src/policy/rules/pinning.js`, `test/policy/rules/provenance.test.js`, `test/policy/rules/cooldown.test.js`, `test/policy/rules/pinning.test.js`, `src/policy/models.js`, `context/global/conventions.md`, `context/global/architecture.md`, `docs/adrs/ADR-001-zero-runtime-dependencies.md`
