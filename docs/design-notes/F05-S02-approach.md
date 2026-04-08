# Design Note: F05-S02 — Approval Validation

## Summary
Implement `src/approvals/validator.js` with two exports: `isExpired(approval)` and `findValidApproval(approvals, pkg, version, rule)`. These are pure synchronous functions; they do not perform file I/O (the caller loads approvals). The validator is the query interface the policy engine (F06) will use during rule evaluation.

## Approach
Both functions are pure, side-effect-free, and use `Date.now()` for time comparison (no hardcoded values).

### `isExpired(approval)`
- Parses `approval.expires_at` as a Date and compares to `Date.now()`.
- Returns `true` when `expires_at` is in the past (or equal to now); `false` when it is in the future.

### `findValidApproval(approvals, packageName, version, rule)`
Algorithm:
1. Filter the array: keep only entries where `approval.package === packageName` AND `approval.version === version`.
2. From those, filter out expired entries (`isExpired(approval) === true`).
3. From those, filter to entries where `approval.overrides` includes `rule` (exact string equality).
4. No-wildcard enforcement (D9): an empty `overrides` array is never matched (the `includes` check fails naturally on an empty array).
5. If no candidates remain, return `null`.
6. Most-recent-wins: sort remaining candidates by `approved_at` descending, return the first one.

## Integration / Wiring Plan
- `validator.js` imports nothing from the approvals module (no models.js import needed — it operates on plain objects by convention).
- The model shape from `models.js` is used by reference only (field names: `package`, `version`, `overrides`, `expires_at`, `approved_at`).
- F06 (policy engine) will import `findValidApproval` directly when it lands.

## Files Expected to Change
| File | Change |
|---|---|
| `src/approvals/validator.js` | **Create** — full implementation |
| `test/approvals/validator.test.js` | **Create** — full test coverage |

## Acceptance Criteria to Verification Mapping
| AC | Test Case |
|---|---|
| findValidApproval returns matching non-expired approval | `valid match — single approval, not expired` |
| findValidApproval returns null when no approval matches | `no match — wrong package`, `no match — wrong version`, `empty array` |
| findValidApproval returns null when only matching approval is expired | `expired approval skipped` |
| findValidApproval checks override intersection | `override mismatch — approval has cooldown, query is scripts` |
| findValidApproval handles partial override match | `partial override — approval covers cooldown only` |
| findValidApproval resolves multiple approvals: most recent non-expired wins | `multiple approvals — most recent wins` |
| isExpired returns true when expires_at is in the past | `isExpired — past timestamp` |
| isExpired returns false when expires_at is in the future | `isExpired — future timestamp` |
| Empty overrides array never matches any rule (D9) | `empty overrides — never matches` |
| Unit tests: valid match, expired skip, partial override, no match, multiple precedence, empty overrides | All above cases |
| node test/approvals/validator.test.js passes | Final verification |

## Test Strategy
- Use `node:test` (built-in test runner), matching `store.test.js` conventions.
- Mock time deterministically: fixtures carry hardcoded `expires_at` strings set far in past or future. For `isExpired`, use timestamps far in past/future to avoid flakiness.
- No temp directories needed (pure functions, no file I/O).
- Cover all acceptance criteria with explicit, named test cases.

## Risks and Questions
- None. This is a pure logic module with no external dependencies or I/O. The Approval model shape is well-defined in `models.js`.

## Stubs
- None. No external dependencies to stub.

## Verification Results

| AC | Result | Evidence |
|---|---|---|
| findValidApproval returns matching non-expired approval | PASS | `node test/approvals/validator.test.js` — all tests pass |
| findValidApproval returns null when no approval matches | PASS | |
| findValidApproval returns null when only matching approval is expired | PASS | |
| findValidApproval checks override intersection | PASS | |
| findValidApproval handles partial override match | PASS | |
| findValidApproval resolves multiple approvals: most recent non-expired wins | PASS | |
| isExpired returns true when expires_at is in the past | PASS | |
| isExpired returns false when expires_at is in the future | PASS | |
| Empty overrides array never matches any rule (D9) | PASS | |
| node test/approvals/validator.test.js — all tests pass | PASS | Exit code 0, no failures |
