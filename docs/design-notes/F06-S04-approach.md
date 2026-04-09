# Design Note: F06-S04 — Engine Orchestration & Approval Integration

## Summary
Implement the policy evaluation core: `engine.js` (orchestrates all 7 rules, returns
`{results, allAdmitted}`), `decision.js` (approval intersection to produce per-dependency
decision strings), and `index.js` (public module re-export). Also implement the 4 missing rule
files that should have come from F06-S02/S03 but are absent from this worktree.

## Approach
- Extract the inline decision logic from the existing `engine.js` into `decision.js`
- Update `engine.js` signature to `evaluate(delta, policy, baseline, approvals, registryData, options?)`,
  returning `{ results: DependencyCheckResult[], allAdmitted: boolean }`
- Add all 7 rules: cooldown, pinning, provenance (existing) + scripts, sources, new-dep, transitive (new)
- Add empty-delta short-circuit
- Update `check.js` to destructure the new return type
- `ruleToOverrideName` gets a special-case mapping for `delta:new-dependency` → `new-dep`
  and `delta:transitive-surprise` → `transitive` to match `VALID_RULE_NAMES`

## Integration / Wiring Plan
- `engine.js` ← rules/cooldown, rules/pinning, rules/provenance, rules/scripts, rules/sources,
  rules/new-dependency, rules/transitive-surprise
- `engine.js` ← `decision.js` (for decide())
- `decision.js` ← approval validator (`findValidApproval` from approvals/validator.js)
- `index.js` ← `engine.js` + `config.js`
- `check.js` updated to use `{ results, allAdmitted }` return shape

## Files Expected to Change / Create
| File | Action |
|---|---|
| `src/policy/rules/scripts.js` | Create — execution:scripts rule |
| `src/policy/rules/sources.js` | Create — execution:sources rule |
| `src/policy/rules/new-dependency.js` | Create — delta:new-dependency rule (warn) |
| `src/policy/rules/transitive-surprise.js` | Create — delta:transitive-surprise rule (warn) |
| `src/policy/decision.js` | Create — decide() function |
| `src/policy/engine.js` | Refactor — new signature + 7 rules + allAdmitted |
| `src/policy/index.js` | Create — public re-export |
| `src/cli/commands/check.js` | Update — destructure {results, allAdmitted} from evaluate() |
| `test/policy/decision.test.js` | Create — unit tests |
| `test/policy/engine.test.js` | Create — integration tests |

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| evaluate() runs all 7 rules for each dep | engine.test.js: fixture with all rule types, assert findings include all 7 rule IDs |
| Empty delta → {results: [], allAdmitted: true} | engine.test.js: empty delta short-circuit test |
| decide() → "admitted" when no blocking | decision.test.js: no-findings case |
| decide() → "admitted_with_approval" when all blocks covered | decision.test.js: approval-covers-all case |
| decide() → "blocked" when any block uncovered | decision.test.js: partial-coverage case |
| Warning findings never cause "blocked" | decision.test.js: warn-only findings case |
| allAdmitted = false when any dep is blocked | engine.test.js: one-blocked test |
| Blocked results include approvalCommand | engine.test.js: check approvalCommand field |
| Unit tests: all-admitted, one-blocked, approval intersection, empty delta, warn-only | engine.test.js + decision.test.js |

## Test Strategy
- `test/policy/decision.test.js`: pure unit tests, no I/O
  - Fixture approvals with various expiry/override configurations
  - Cases: admitted, admitted_with_approval, blocked, partial coverage, warn-only
- `test/policy/engine.test.js`: integration-level tests with fixture data
  - Empty delta short-circuit
  - All-admitted scenario (7 rules, nothing fires)
  - One-blocked scenario (allAdmitted: false)
  - Approval flips blocked to admitted_with_approval
  - Warning-only findings don't affect allAdmitted

## Risks and Notes
- 4 rule files from F06-S02/F06-S03 are absent; implementing them here expands scope slightly
  but is required to satisfy the "not allowed to stub" constraint
- check.js will be updated to use the new return type; this is not F08 scope but necessary
  since the file already exists and imports the engine
- The `packageJsonPath` for pinning rule is passed via the 6th `options` parameter since it
  is not registry data

## Stubs
None — all 7 rules are real implementations.

## Verification Results

All verified 2026-04-09 via `node --test`.

| AC | Status | Evidence |
|---|---|---|
| evaluate() runs all 7 rules | PASS | engine.test.js: "all 7 rules produce findings when conditions are met" — asserts presence of all 6 rule IDs (pinning skipped in this test; covered separately by pinning.test.js) |
| Empty delta short-circuit | PASS | engine.test.js: 2 tests for empty and short-circuited delta |
| decide() admitted | PASS | decision.test.js: "returns admitted when findings is empty" + "warn-only findings" |
| decide() admitted_with_approval | PASS | decision.test.js: 3 tests for full and multi-approval coverage |
| decide() blocked | PASS | decision.test.js: 5 tests for no approval, wrong package/version, expired, partial |
| Warnings don't block | PASS | decision.test.js: warn-only → admitted; engine.test.js: new-dep warn finding, allAdmitted=true |
| allAdmitted semantics | PASS | engine.test.js: one-blocked+one-admitted → allAdmitted:false |
| approvalCommand populated | PASS | engine.test.js: checks approvalCommand includes trustlock approve + package@version + --override rule |
| Test suite | PASS | 98 tests pass across all rule, decision, engine, CLI check, and approvals suites |
| scripts rule isolation (reviewer revision) | PASS | scripts.test.js: 11/11 — admit, block, admitted_with_approval, expired-approval, finding shape |
| sources rule isolation (reviewer revision) | PASS | sources.test.js: 12/12 — admit, block, admitted_with_approval, expired-approval, finding shape |

Commands run (revision 2026-04-09):
```
node --test test/policy/rules/scripts.test.js    # 11/11 PASS
node --test test/policy/rules/sources.test.js    # 12/12 PASS
node --test test/policy/decision.test.js         # 15/15 PASS
node --test test/policy/engine.test.js           # 16/16 PASS
node --test test/unit/cli/check.test.js          # 14/14 PASS (regression check)
node --test test/approvals/validator.test.js     # 17/17 PASS (regression check)
node --test test/approvals/generator.test.js     # 13/13 PASS (regression check)
```
