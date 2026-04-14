# Code Review: task-031 Implement Engine Orchestration & Approval Integration

## Summary
Implementation is functionally complete and all 9 story ACs are verified by passing tests.
One conventions gap was found and resolved in revision: `scripts.js` and `sources.js` lacked
dedicated rule-level unit tests. Both test files have been added with all required cases
(should-admit, should-block, should-admit-with-approval, expired-approval).

## Verdict
Approved (after revision)

## Findings

### Missing dedicated unit tests for newly created blocking rules
- **Severity:** warning
- **Finding:** This task expanded scope to create 4 rule files absent from the worktree
  (`scripts.js`, `sources.js`, `new-dependency.js`, `transitive-surprise.js`). The design note
  acknowledges this scope expansion. The two blocking rules — `src/policy/rules/scripts.js` and
  `src/policy/rules/sources.js` — lack their own test files in `test/policy/rules/`.
  Existing rules from prior stories each have dedicated files: `cooldown.test.js`,
  `pinning.test.js`, `provenance.test.js`. Missing test cases for scripts and sources:
  - `admitted_with_approval` (valid approval covers the rule, flips blocked → admitted_with_approval)
  - `expired-approval` (expired approval does NOT flip the decision)
  These cases are partially covered at the engine integration level but not at the rule
  isolation level. `new-dependency.js` and `transitive-surprise.js` are warn-only rules;
  their engine test coverage is sufficient since there are no block/approval scenarios.
- **Proposed Judgment:** Add `test/policy/rules/scripts.test.js` and
  `test/policy/rules/sources.test.js` with at minimum: should-admit, should-block,
  should-admit-with-approval, and expired-approval test cases per global conventions.
- **Reference:** `context/global/conventions.md` → Testing: "Each policy rule has:
  should-admit, should-block, should-admit-with-approval, expired-approval test cases";
  Feature brief F06 AC: "Unit tests for each rule: should-admit, should-block,
  should-admit-with-approval, expired-approval cases"

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — N/A (internal module)
- [x] Architecture compliance (ADR-001 zero deps; policy → approvals layering correct)
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (all 7 rules run, warn findings never block,
      allAdmitted semantics, approvalCommand populated)
- [x] Integration completeness (caller/callee contract honored — check.js updated, index.js correct)
- [x] Pitfall avoidance — no module pitfalls file bound
- [x] Convention compliance (naming, imports, file structure)
- [x] Test coverage — scripts.test.js (11/11) and sources.test.js (12/12) added in revision
- [x] Code quality & documentation (no stubs, design note complete and honest)

## Acceptance Criteria Judgment
- AC: evaluate() runs all 7 rules for each changed dependency → PASS — engine.js L107-128 calls all 7 rule functions; pinning conditional on packageJsonPath (always provided by check.js); engine.test.js "all 7 rules" test verifies 6 rule IDs (pinning tested separately in pinning.test.js)
- AC: Empty delta returns {results: [], allAdmitted: true} immediately → PASS — engine.js L66-68; engine.test.js 2 tests
- AC: decide() returns "admitted" when no blocking findings → PASS — decision.js L59; decision.test.js 2 tests
- AC: decide() returns "admitted_with_approval" when all blocks covered → PASS — decision.js L78; decision.test.js 3 tests
- AC: decide() returns "blocked" when any block uncovered → PASS — decision.js L75-77; decision.test.js 5 tests
- AC: Warning findings never cause "blocked" → PASS — normalizeSeverity keeps 'warn'; decide() filters only 'block'; decision.test.js warn-only + engine.test.js new-dep test
- AC: allAdmitted = false when any dep blocked → PASS — engine.js L161; engine.test.js one-blocked test
- AC: Blocked results include approvalCommand → PASS — engine.js L141-147; engine.test.js asserts trustlock approve + lodash@4.17.21 + --override cooldown
- AC: Unit tests cover all-admitted, one-blocked, approval intersection, empty delta, warn-only → PASS — 31 combined tests across decision.test.js (15) + engine.test.js (16)

## Deferred Verification
- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: All three regression suites pass — check.test.js (14/14), validator.test.js (17/17),
  generator.test.js (13/13). normalizeSeverity ('error' → 'block', 'skipped' → 'warn') correctly
  bridges existing rule conventions to the decision model. check.js destructuring update
  verified by check regression suite.

## Integration / Boundary Judgment
- Boundary: `evaluate()` public API consumed by CLI check command (check.js F08 seam)
- Judgment: complete
- Notes: check.js L155-157 destructures `{results, allAdmitted}` from evaluate() with
  `{packageJsonPath}` options. All 7 rule imports wired in engine.js. index.js re-exports
  evaluate and loadPolicy correctly.

## Test Results
- `node --test test/policy/rules/scripts.test.js` → 11/11 PASS (reviewer revision)
- `node --test test/policy/rules/sources.test.js` → 12/12 PASS (reviewer revision)
- `node --test test/policy/decision.test.js` → 15/15 PASS
- `node --test test/policy/engine.test.js` → 16/16 PASS
- `node --test test/unit/cli/check.test.js` (regression) → 14/14 PASS
- `node --test test/approvals/validator.test.js` (regression) → 17/17 PASS
- `node --test test/approvals/generator.test.js` (regression) → 13/13 PASS

## Context Updates Made
No context updates needed.

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-031
- Branch: burnish/task-031-implement-engine-orchestration-approval-integration
- Artifacts cited: docs/stories/F06-S04-engine-orchestration-and-approval-integration.md,
  docs/feature-briefs/F06-policy-engine.md, docs/design-notes/F06-S04-approach.md,
  context/global/conventions.md, context/global/architecture.md,
  docs/adrs/ADR-001-zero-runtime-dependencies.md
