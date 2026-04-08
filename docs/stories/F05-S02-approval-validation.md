# Story: F05-S02 — Approval Validation

## Parent
F05: Approval Store & Validation

## Description
Implement the approval validator that determines whether a valid, non-expired approval exists for a given package+version+rule combination. This is the query interface consumed by the policy engine during evaluation.

## Scope
**In scope:**
- `src/approvals/validator.js` — findValidApproval, isExpired
- Package+version exact matching
- Overrides list intersection (approval must list the specific rule being checked)
- Expiry checking against current time
- Most-recent-wins logic for multiple approvals on same package@version
- `test/approvals/validator.test.js`

**Not in scope:**
- Store operations (read/write/clean) — owned by F05-S01
- Approval command generation — owned by F05-S03
- Policy rule evaluation — owned by F06
- CLI command wiring — owned by F08

## Entry Points
- Route / page / screen: N/A — library module, not user-facing
- Trigger / navigation path: Called by policy engine (F06) during rule evaluation
- Starting surface: Policy engine imports `validator.js` functions directly

## Wiring / Integration Points
- Caller-side ownership: Policy engine (F06) will call `findValidApproval()` — F06 owns that wiring
- Callee-side ownership: This story owns the full validation logic: match, intersect overrides, check expiry, resolve precedence
- Caller-side conditional rule: Policy engine (F06) does not exist yet. Export `findValidApproval(approvals, packageName, version, rule)` and `isExpired(approval)`. F06 wires to these when it lands.
- Callee-side conditional rule: This story imports the Approval model from F05-S01's `models.js`. That model exists when this story starts (dependency).
- Boundary / contract check: Unit tests verify findValidApproval against various approval states; contract with F06 verified when F06 lands
- Files / modules to connect: `src/approvals/validator.js` ← `src/approvals/models.js` (Approval shape)
- Deferred integration, if any: Policy engine wiring deferred to F06

## Not Allowed To Stub
- Expiry check — must compare against real `Date.now()`, not a hardcoded value
- Override intersection — must check that the specific rule appears in the approval's `overrides` array
- Most-recent-wins precedence — when multiple non-expired approvals match, the one with the latest `created` timestamp wins
- No-wildcard enforcement — an approval with an empty `overrides` array must never match any rule

## Behavioral / Interaction Rules
- `findValidApproval` receives the full `Approval[]` array (already loaded by the caller) — it does not read files
- `findValidApproval` returns the single best matching approval or `null` — never an array
- Expired approvals are silently skipped, never returned, never deleted (Q2: manual cleanup only)
- Override matching is exact string equality — "exposure:cooldown" matches "exposure:cooldown", not "cooldown"

## Acceptance Criteria
- [ ] `findValidApproval(approvals, pkg, version, rule)` returns a matching non-expired approval when one exists
- [ ] `findValidApproval` returns `null` when no approval matches
- [ ] `findValidApproval` returns `null` when the only matching approval is expired
- [ ] `findValidApproval` checks override intersection — approval must include the queried rule in its `overrides` array
- [ ] `findValidApproval` handles partial override match — approval overrides `cooldown` but query is for `scripts` → returns `null`
- [ ] `findValidApproval` resolves multiple approvals for same package@version: most recent non-expired wins
- [ ] `isExpired(approval)` returns `true` when `expires` is in the past
- [ ] `isExpired(approval)` returns `false` when `expires` is in the future
- [ ] An approval with empty `overrides` array never matches any rule (no-wildcard enforcement, D9)
- [ ] Unit tests cover: valid match, expired skip, partial override, no match, multiple approvals precedence, empty overrides
- [ ] `node test/approvals/validator.test.js` — all tests pass

## Task Breakdown
1. Create `src/approvals/validator.js` — implement `isExpired()` checking `expires` against `Date.now()`
2. Implement `findValidApproval()` — filter by package+version, filter out expired, check override intersection, resolve most-recent-wins
3. Write `test/approvals/validator.test.js` — cover all acceptance criteria with deterministic time mocking

## Verification
```
node test/approvals/validator.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Approval expired but not yet cleaned — `findValidApproval` skips it silently, never uses it
- Multiple approvals for same package@version — most recent non-expired one wins
- Approval overrides `cooldown` but package also blocked for `scripts` — approval only covers cooldown; `findValidApproval` for `scripts` returns `null`
- Empty overrides array — never matches (D9 no-wildcard enforcement)
- Approval for correct package but wrong version — no match
- All approvals expired — returns `null`

## Dependencies
- Depends on: F05-S01 (Approval model definition in `models.js`)
- Blocked by: none

## Effort
S — pure logic with no I/O, focused matching and filtering

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

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
