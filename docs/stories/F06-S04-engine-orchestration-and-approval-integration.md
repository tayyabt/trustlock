# Story: F06-S04 — Engine Orchestration & Approval Integration

## Parent
F06: Policy Engine & Rules

## Description
Implement the policy engine: `src/policy/engine.js` (orchestrates all 7 rules per dependency), `src/policy/decision.js` (intersects findings with valid approvals to produce the final decision), and `src/policy/index.js` (module export). This is the integration layer that wires together config (S01), trust rules (S02), execution rules (S03), and the approvals module (F05) into the top-level `evaluate()` function consumed by the CLI (F08).

## Scope
**In scope:**
- `src/policy/engine.js` — `evaluate(delta, policy, baseline, approvals, registryData)` → `CheckResult[]`
- `src/policy/decision.js` — `decide(findings, approvals, packageVersion)` → `"admitted" | "admitted_with_approval" | "blocked"`
- `src/policy/index.js` — public API: re-exports `evaluate` and `loadPolicy`
- All-or-nothing aggregate pass/fail for baseline advancement (D1)
- Empty delta short-circuit (feature brief edge case #1)
- Unit tests: per-dependency decisions, approval intersection, all-or-nothing semantics

**Not in scope:**
- Writing baseline (baseline module's job, triggered by CLI after the engine returns)
- Writing approvals (approvals module's job)
- Formatting output (output module's job — F07)
- Git operations
- Calling the registry client directly — registry data is passed in as a pre-fetched argument

## Entry Points
- Route / page / screen: N/A — internal module
- Trigger / navigation path: CLI `check` command calls `engine.evaluate()` after loading all data
- Starting surface: `src/policy/engine.js` exports `evaluate(delta, policy, baseline, approvals, registryData): Promise<EvaluationResult>` where `EvaluationResult = { results: CheckResult[], allAdmitted: boolean }`

## Wiring / Integration Points
- Caller-side ownership: CLI (`src/cli/commands/check.js`, F08) calls `evaluate()` — that file does not exist yet. Keep the seam explicit: export `evaluate` from `src/policy/index.js` with a clear, documented signature.
- Callee-side ownership: This story implements `evaluate()` and `decide()` fully, importing all 7 rule functions from `src/policy/rules/` (S02, S03) and calling `approvals` module's `isValidApproval()` (F05-S02, which already exists).
- Caller-side conditional rule: CLI (caller) does not exist yet — keep seam explicit. Contract: `evaluate(delta: DependencyDelta, policy: PolicyConfig, baseline: Baseline, approvals: Approval[], registryData: Map<string, RegistryMetadata>): Promise<EvaluationResult>`
- Callee-side conditional rule: All 7 rule modules (F06-S02, F06-S03) must exist before this story starts. The approvals module `isValidApproval(approval, packageName, version, ruleName): boolean` from F05-S02 must already exist — wire to it now.
- Boundary / contract check: Integration tests confirm that `evaluate()` returns `{ results: CheckResult[], allAdmitted: boolean }` where `allAdmitted` is false if any single result is `"blocked"`. Unit tests confirm approval intersection: a valid approval flips a `"blocked"` result to `"admitted_with_approval"`.
- Files / modules to connect: `engine.js` ← all 7 rule files in `src/policy/rules/`; `engine.js` ← `decision.js`; `decision.js` ← F05 approvals module (`src/approvals/store.js` or equivalent); `index.js` ← `engine.js` + `config.js`
- Deferred integration, if any: CLI wiring deferred to F08.

## Not Allowed To Stub
- `evaluate()` must invoke all 7 rules for every changed dependency — no conditional rule skipping based on config (config determines block vs. not, but the rule still runs).
- `decide()` must implement real approval intersection: check each blocking finding against `approvals` for a valid (non-expired, scope-matching) override. A valid approval covering all blocking findings → `"admitted_with_approval"`. Partial approval coverage → still `"blocked"` for uncovered findings.
- All-or-nothing semantics must be computed and returned as `allAdmitted` in the result — not deferred to the CLI.
- Empty delta short-circuit: if `delta.changed` is empty, return `{ results: [], allAdmitted: true }` immediately — do not run rules.
- Warning-severity findings (delta rules) must NOT influence `decide()` output — `decide()` only looks at `severity: "error"` findings.

## Behavioral / Interaction Rules
- Rule evaluation order is intentionally arbitrary — all 7 rules run independently; findings are collected, then decisions are made. No short-circuit on first block.
- `admitted_with_approval` requires: at least one blocking finding AND a valid approval covering every blocking rule name for that package.
- `allAdmitted` is `true` only when every dependency's result is `"admitted"` or `"admitted_with_approval"`. One `"blocked"` result sets `allAdmitted = false`.
- The `approvalCommand` field on each blocked `CheckResult` must be a ready-to-run `trustlock approve` command string. It lists the exact package, version, and `--override` flags for all blocking rule names. This is a string the output module renders verbatim.
- Registry-unreachable skipped findings do NOT cause a block — they contribute only informational detail to the result.

## Acceptance Criteria
- [ ] `evaluate()` runs all 7 rules for each changed dependency and returns `CheckResult[]`.
- [ ] Empty delta (`delta.changed = []`) returns `{ results: [], allAdmitted: true }` immediately with no rule evaluation.
- [ ] `decide()` returns `"admitted"` when no blocking findings exist.
- [ ] `decide()` returns `"admitted_with_approval"` when all blocking findings are covered by a valid approval.
- [ ] `decide()` returns `"blocked"` when any blocking finding is not covered by a valid approval.
- [ ] Warning-severity findings (delta:new-dependency, delta:transitive-surprise) never cause `"blocked"` regardless of approval state.
- [ ] `allAdmitted` is `false` if any single dependency is `"blocked"`; `true` otherwise.
- [ ] Blocked results include a populated `approvalCommand` string with correct package, version, and `--override` flags.
- [ ] Unit tests cover: all-admitted, one-blocked (all-or-nothing fires), approval intersection (partial vs. full coverage), empty delta, warning-only findings.

## Task Breakdown
1. Create `src/policy/decision.js` — implement `decide(findings, approvals, packageName, version)`: filter `severity: "error"` findings; for each, check for a valid approval covering the rule name; return decision string.
2. Create `src/policy/engine.js` — implement `evaluate(delta, policy, baseline, approvals, registryData)`: short-circuit on empty delta; for each changed dep, call all 7 rules; call `decide()`; build `CheckResult` including `approvalCommand`; compute `allAdmitted`; return `EvaluationResult`.
3. Create `src/policy/index.js` — re-export `evaluate` from `engine.js` and `loadPolicy` from `config.js`.
4. Write `test/policy/engine.test.js` and `test/policy/decision.test.js` with fixture deltas, baselines, and approval data covering all AC cases.

## Verification
```
node --test test/policy/decision.test.js
node --test test/policy/engine.test.js
# Expected: all tests pass, no errors

# Smoke test via CLI (once F08 exists — deferred to F08 integration test):
# node src/cli/index.js check
```

## Edge Cases to Handle
- Empty delta → short-circuit, return `{ results: [], allAdmitted: true }` (feature brief edge case #1)
- All warning-only findings (e.g., only delta rules fire) → `allAdmitted: true`, no blocking
- Partial approval: approval covers one rule name but two blocking rules fired → still `"blocked"`
- Expired approval: treated as no approval — `"blocked"`
- `approvalCommand` for a blocked package with multiple blocking rules must list all `--override <rule>` flags

## Dependencies
- Depends on: F06-S02 (trust and exposure rules must exist), F06-S03 (execution and delta rules must exist)
- Blocked by: F06-S02 task and F06-S03 task

## Effort
M — orchestration and approval intersection have several behavioral rules; integration test setup is the bulk of the work

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: 4

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
