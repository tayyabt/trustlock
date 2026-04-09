# Code Review: task-041 Fix BUG-001 — Approval Command Uses Full Rule IDs Instead of Short Names

## Summary

Clean, well-scoped fix. The terminal formatter now correctly translates full finding rule IDs (e.g. `execution:scripts`) to the short approval names accepted by `trustlock approve` (e.g. `scripts`). All three bug acceptance criteria are concretely verified with passing unit tests and honest design-note evidence.

## Verdict

Approved

## Findings

No blocking findings.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — blocked-approve workflow contract ("ready-to-copy shell command with correct flags") is now satisfied
- [x] Architecture compliance — `FINDING_RULE_TO_APPROVAL_NAME` correctly placed in `src/approvals/models.js` (the authority on valid approval names); no changes to the approve-side validator
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance — generated command emits short names matching VALID_RULE_NAMES; `?? f.rule` fallback is explicit and documented
- [x] Integration completeness — caller (terminal.js) and callee (approve command) contract now aligned; VALID_RULE_NAMES and FINDING_RULE_TO_APPROVAL_NAME are co-located in models.js
- [x] Pitfall avoidance — no module pitfalls file; no issues found
- [x] Convention compliance — UPPER_SNAKE_CASE constant, ES module export, zero new runtime deps (ADR-001), kebab-case filenames unchanged
- [x] Test coverage — two targeted BUG-001 regression tests added (positive + negative assertions per AC); existing stale assertion updated
- [x] Code quality & documentation — design note complete with root-cause, approach, AC-to-verification table, and honest verification results; no dead code

## Acceptance Criteria Judgment

- AC1: `execution:scripts` finding → `--override scripts` in generated command → **PASS** — unit test `BUG-001: execution:scripts finding uses short name "scripts" in --override` (terminal.test.js:206) asserts presence of `scripts` and absence of `execution:scripts`; code at `src/output/terminal.js:145` applies `FINDING_RULE_TO_APPROVAL_NAME.get(f.rule) ?? f.rule`
- AC2: `exposure:cooldown` finding → `--override cooldown` in generated command → **PASS** — unit test `BUG-001: exposure:cooldown finding uses short name "cooldown" in --override` (terminal.test.js:215) asserts presence of `cooldown` and absence of `exposure:cooldown`
- AC3: Running the copy-pasted approval command exits 0 → **PASS** — the bug was exclusively a formatting error; the formatter now emits short names that match `VALID_RULE_NAMES`; existing integration tests use `--override scripts` directly (the exact value now emitted); logic chain is complete

## Deferred Verification

none

## Regression Risk

- Risk level: low
- Why: Change is narrowly scoped to one `.map()` call in `formatCheckResults`. All 49 existing unit tests pass, including tests for multi-rule blocks, shell escaping, NO_COLOR, TERM=dumb, and mixed admitted/blocked results. The `?? f.rule` fallback ensures that unknown future rule IDs degrade to the prior behavior rather than silently dropping the flag.

## Integration / Boundary Judgment

- Boundary: terminal.js (caller) → approve command (callee) via generated command string
- Judgment: complete
- Notes: `FINDING_RULE_TO_APPROVAL_NAME` and `VALID_RULE_NAMES` are co-located in `src/approvals/models.js`, making it straightforward to keep them in sync when new rules are added. The compound mismatch case (`delta:new-dependency` → `new-dep`) is handled correctly by the explicit map (not naive prefix-stripping).

## Test Results

- Command run: `node --test test/output/terminal.test.js`
- Result: 49/49 pass

## Context Updates Made

No context updates needed. No module_guidance or module_pitfalls paths are configured for the cli module. The `?? f.rule` fallback risk is documented in the design note and is self-evident from the code.

## Artifacts Reviewed

- `docs/bugs/BUG-001-approval-command-uses-full-rule-ids.md`
- `docs/design-notes/task-041-approach.md`
- `docs/workflows/cli/blocked-approve.md`
- `docs/feature-briefs/F08-cli-commands.md`
- `context/global/conventions.md`
- `src/approvals/models.js`
- `src/output/terminal.js`
- `test/output/terminal.test.js`

## Metadata

- Agent: reviewer
- Date: 2026-04-09
- Task: task-041
- Branch: burnish/task-041-fix-approval-command-in-check-output-uses-full-rule-ids-instead-of-short-names
