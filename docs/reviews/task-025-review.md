# Code Review: task-025 — Implement Approval Model & Store Operations

## Summary
Complete, clean implementation of the approvals data foundation. All 12 acceptance criteria are concretely verified by 30 passing unit tests. No stubs, no deferred behavior, ADR-001 compliance confirmed.

## Verdict
Approved

## Findings

No blocking findings. Minor observations below (suggestions only).

### Duplicate override validation in writeApproval
- **Severity:** suggestion
- **Finding:** `store.js:121-129` pre-validates override names before calling `createApproval`, which also validates them (`models.js:96-102`). This is redundant but not harmful — it preserves the early-return ordering pattern consistent with the lockfile check above it.
- **Proposed Judgment:** No change required. The pre-validation provides clear error ordering (lockfile check → override check) and is documented with a code comment.
- **Reference:** Story wiring rule: "validate inputs" order is caller responsibility; this is an acceptable defensive pattern.

### `node:os` not imported despite design note mention
- **Severity:** suggestion
- **Finding:** The design note (Decision 3) mentions `os.tmpdir()` but the implementation correctly uses `dirname(filePath)` for temp placement (`store.js:26`). This is *better* than the design note description — using `os.tmpdir()` would risk cross-filesystem rename failures.
- **Proposed Judgment:** No change needed. Implementation is correct. Design note prose is slightly misleading but the "same directory" intent is captured in the note's own parenthetical.
- **Reference:** Design note §Key Design Decisions item 3: "Using same-directory temp ensures rename is atomic on POSIX (same filesystem)."

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — N/A (no workflow-required feature)
- [x] Architecture compliance (follows ADR-001, respects module boundaries)
- [ ] Design compliance — N/A (no UI, no design preview required per feature brief)
- [x] Behavioral / interaction rule compliance (readApprovals/writeApproval/cleanExpired asymmetry on missing file honored)
- [x] Integration completeness (caller/callee contract documented and ready for F08, F05-S02)
- [x] Pitfall avoidance (no module pitfalls file; manual code review performed)
- [x] Convention compliance (kebab-case files, camelCase functions, UPPER_SNAKE_CASE constants, ES modules)
- [x] Test coverage (every acceptance criterion has at least one test, edge cases covered)
- [x] Code quality & documentation (clear JSDoc on all exports, no dead code, no changelog entry required)

## Acceptance Criteria Judgment
- AC: `readApprovals` loads and returns `Approval[]` from a valid approvals file → **PASS** — test: "readApprovals returns array from valid approvals file"
- AC: `readApprovals` returns `[]` when file does not exist → **PASS** — tests: "returns empty array when file does not exist" + "returns empty array for an empty approvals file"
- AC: `writeApproval` appends a valid entry atomically → **PASS** — tests: "appends an entry to the approvals file atomically" + "appends to existing entries (does not overwrite)" + atomic write consistency test
- AC: `writeApproval` rejects when package is not in lockfile → **PASS** — tests: package missing from lockfile + version mismatch cases
- AC: `writeApproval` rejects when any override name is not a valid rule name → **PASS** — tests: "rejects when override name is not a valid rule" + "error message includes the list of valid rule names"
- AC: `writeApproval` rejects when reason is empty and `require_reason` is true → **PASS** — tests: empty string and whitespace-only reason cases
- AC: `writeApproval` caps expiry at `max_expiry_days` → **PASS** — test: "caps expires_at at max_expiry_days when duration exceeds it"
- AC: Duration parsing handles "7d", "24h", "30d", "1d" and rejects "abc", "7x" → **PASS** — 9 parseDuration tests covering all named formats and rejection cases
- AC: `cleanExpired` removes past-expiry entries and returns `{ removed, remaining }` → **PASS** — tests: removes expired + no-op when none expired + empty file
- AC: `cleanExpired` rejects when file missing → **PASS** — test: "cleanExpired throws when approvals file does not exist"
- AC: All file writes are atomic (temp + rename) → **PASS** — `atomicWrite()` helper at `store.js:35-39`; two dedicated atomic write consistency tests
- AC: `node test/approvals/store.test.js` — all tests pass → **PASS** — 30/30 pass, 0 fail, 35ms (verified directly)

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: Self-contained leaf module with no callee dependencies beyond `node:fs/promises` and `node:path`. Full round-trip coverage (write → read back from disk). No other modules depend on `approvals/store.js` yet (caller-side wiring deferred to F08/F05-S02). Atomic writes prevent partial-write corruption.

## Integration / Boundary Judgment
- Boundary: Callee-side seam — `src/approvals/store.js` exports `readApprovals`, `writeApproval`, `cleanExpired`
- Judgment: complete
- Notes: Public API is fully implemented with JSDoc documenting parameter types, return shapes, and throw conditions. Caller-side (F08 CLI, F05-S02 validator) correctly deferred — the contract is locked and ready for wiring.

## Test Results
- Command run: `node test/approvals/store.test.js`
- Result: all pass — 30 tests, 0 failures, ~35ms

## Context Updates Made
No context updates needed. No existing module guidance, pitfalls, or decisions files named in inputs. No new reusable pitfalls emerged beyond what can be read directly from the code.

## Metadata
- Agent: reviewer
- Date: 2026-04-08
- Task: task-025
- Branch: burnish/task-025-implement-approval-model-store-operations
- Artifacts reviewed: docs/stories/F05-S01-approval-model-and-store-operations.md, docs/feature-briefs/F05-approval-store.md, docs/design-notes/F05-S01-approach.md, src/approvals/models.js, src/approvals/store.js, test/approvals/store.test.js
- Architecture references: context/global/conventions.md, context/global/architecture.md, docs/adrs/ADR-001-zero-runtime-dependencies.md
