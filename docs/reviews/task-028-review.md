# Code Review: task-028 Implement Policy Config & Data Models (F06-S01)

## Summary
Implementation of `src/policy/models.js` and `src/policy/config.js` is correct, complete, and fully tested. All 6 acceptance criteria pass; 9 unit tests pass with zero failures. ADR-001 and all global conventions are respected.

## Verdict
Approved

## Findings

### F1: Story artifact not accessible from this worktree
- **Severity:** warning
- **Finding:** `read-input.sh --optional "$task_file" story` returned empty. The story file referenced in the task body (`/Users/tayyabtariq/Documents/projects/.burnish-worktrees/dep-fence/task-010/docs/stories/F06-S01-policy-config-and-data-models.md`) does not exist at that path from this worktree. Review was conducted against the design note's AC mapping, which is comprehensive and consistent with the feature brief reference.
- **Proposed Judgment:** No action required on this task. The story artifact lives in the task-010 worktree; if inter-worktree artifact access is required, a symlink or copy convention should be established. Log as a process observation.
- **Reference:** Skill step 7 — "If `task_type=DEV_STORY` and `story_path` is empty, treat that as a blocker or review finding."

### F2: Feature brief not accessible from this worktree
- **Severity:** warning
- **Finding:** The feature brief at `/Users/tayyabtariq/Documents/projects/.burnish-worktrees/dep-fence/task-010/docs/feature-briefs/F06-policy-engine.md` does not exist from this worktree. Review relied on the design note's extraction of relevant decisions (edge case #4 forward-compat, edge case #10 `transitive.max_new`).
- **Proposed Judgment:** Same as F1 — process observation only. Implementation is consistent with the feature brief decisions documented in the design note.
- **Reference:** Feature brief cross-reference in design note `docs/design-notes/F06-S01-approach.md`.

### F3: `check-no-stubs.sh` and `check-review-integrity.sh` absent
- **Severity:** warning
- **Finding:** `./scripts/check-no-stubs.sh` and `./scripts/check-review-integrity.sh` do not exist. Manual stub inspection substituted.
- **Proposed Judgment:** Manual inspection confirms no stubs, TODOs, or placeholders in `src/policy/models.js` or `src/policy/config.js`. The design note explicitly states "Stubs: None." No action required on this task.
- **Reference:** `docs/design-notes/F06-S01-approach.md` § Stubs.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — not applicable (no CLI workflow in scope)
- [x] Architecture compliance (follows ADR-001, respects policy module boundaries)
- [ ] Design compliance — not applicable (no UI)
- [ ] Behavioral / interaction rule compliance — not applicable (library layer only)
- [x] Integration completeness (caller/callee contract and counterpart wiring rules honored)
- [x] Pitfall avoidance (no module guidance/pitfalls artifacts yet; manual check clean)
- [x] Convention compliance (naming, error handling, imports, file structure)
- [x] Test coverage (all 6 ACs have test cases; edge cases covered including unknown-keys)
- [x] Code quality & documentation (no dead code; design note updated; no external docs changes required)

## Acceptance Criteria Judgment
- AC: `loadPolicy()` returns complete `PolicyConfig` with all fields populated → PASS — `config.test.js` "valid full config" and "valid sparse config" tests pass; all field values verified with `assert.equal` / `assert.deepEqual`
- AC: Missing file throws with `.exitCode = 2` and path in message → PASS — `config.test.js` "missing file" test passes; both `exitCode` and path substring verified
- AC: Malformed JSON throws with `.exitCode = 2` with parse error detail → PASS — `config.test.js` "malformed JSON" test passes; `exitCode` and non-empty parse detail verified
- AC: Unknown rule names ignored — no error, known fields still merged correctly → PASS — `config.test.js` "unknown rule names" test creates a tmp fixture inline, verifies unknown keys absent, known fields correct
- AC: `models.js` exports all four shapes with documented fields → PASS — 4 model shape tests verify every required field by name; JSDoc comments present in source
- AC: Unit tests cover valid (all fields), valid (sparse), missing file, malformed JSON, unknown rule name → PASS — 5 distinct behavioral test cases (plus 4 model shape tests = 9 total)

## Deferred Verification
- Follow-up Verification Task: none
- AC: CLI wiring (`src/cli/commands/check.js` calls `loadPolicy`) → DEFERRED to F08 by design. The seam is explicit: exported function signature and `.exitCode = 2` error contract are covered by unit tests. Residual risk: minimal — the contract is stable and documented.

## Regression Risk
- Risk level: low
- Why: This is a leaf data-layer module with no upstream deps. All callers (F06-S02, F06-S03, F06-S04, F08) import from it but do not yet exist. The DEFAULTS constant and merge logic are fully covered by tests. Shape exports are read-only usage patterns — no mutation risk.

## Integration / Boundary Judgment
- Boundary: Callee seam — `src/policy/config.js` exports `loadPolicy(configPath): Promise<PolicyConfig>` consumed by future F06-S02 and F08 work
- Judgment: complete (for this story's scope)
- Notes: CLI wiring deferred to F08 per story spec. The contract is locked: function signature, return type, error shape (`.exitCode = 2`, path in message for missing-file, parse detail for malformed JSON). No caller-side code exists yet so there is no integration gap at this stage.

## Test Results
- Command run: `node --test test/policy/config.test.js`
- Result: 9 pass, 0 fail, 0 skipped (duration ~95ms)

## Context Updates Made
No context updates needed. No reusable pitfalls or guidance emerged that are not already captured in the design note or global conventions.

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-028
- Branch: burnish/task-028-implement-policy-config-data-models
