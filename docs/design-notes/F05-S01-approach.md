# Design Approach: F05-S01 Approval Model & Store Operations

## Summary
Implement the `approvals` module data foundation: `src/approvals/models.js` (Approval shape, valid rule names, duration parsing, factory with validation) and `src/approvals/store.js` (readApprovals, writeApproval, cleanExpired with atomic writes). All file I/O uses the write-to-temp + rename pattern. No runtime dependencies — pure `node:fs/promises`, `node:path`, `node:os`.

This is a pure data-layer module. The CLI `approve` command (F08) is the caller-side owner and wires to these functions later. This story owns the full callee-side implementation including all validation logic.

## Key Design Decisions
1. **Split model/store responsibility**: `models.js` owns the Approval shape, `VALID_RULE_NAMES`, `parseDuration`, and `createApproval` factory. `store.js` owns file I/O and delegates validation to the model factory. This keeps the store thin and the model pure and testable without file I/O.
2. **`writeApproval` signature**: `writeApproval(approvalsPath, input, lockfileDeps, config)` — takes raw CLI inputs (package, version, overrides, reason, approver, duration string) and does all validation internally. Consistent with how baseline/manager.js passes structured args rather than pre-validated objects.
3. **Atomic writes**: use `os.tmpdir()` on a sub-path within the same directory for temp files (`<dir>/<name>.tmp.<pid>`), then `rename()`. Using same-directory temp ensures rename is atomic on POSIX (same filesystem).
4. **Expiry cap, not reject**: When requested duration exceeds `max_expiry_days`, silently cap at max. This matches the story behavioral rule and the feature brief edge case 4.
5. **Missing file behavior asymmetry**: `readApprovals` → return `[]`; `writeApproval` and `cleanExpired` → throw with ENOENT. Matches story behavioral rules exactly.
6. **Duration parsing**: Only "Nd" (days) and "Nh" (hours) formats. Reject anything else (empty string, "abc", "7x", negative values via non-numeric parsing).

## Design Compliance
No UI — data layer module only. No design preview required per feature brief.

## Integration / Wiring
- **Callee-side (this story owns)**: Full store implementation — read, write, clean, atomic I/O, all validation.
- **Caller-side (deferred to F08)**: CLI `approve` and `clean-approvals` commands will call `writeApproval()` and `cleanExpired()`. The seam is the exported function signatures documented in store.js.
- **No callees beyond node built-ins**: `node:fs/promises`, `node:path`, `node:os`.
- **Deferred**: Policy engine (F05-S02) will call `readApprovals()` for validation. That is also a caller-side concern for those stories.

## Files to Create/Modify
- `src/approvals/models.js` — Approval shape, VALID_RULE_NAMES, parseDuration, createApproval factory
- `src/approvals/store.js` — readApprovals, writeApproval, cleanExpired
- `test/approvals/store.test.js` — all acceptance criteria covered

## Testing Approach
Node.js built-in test runner (`node:test`). Tests use real file I/O with `tmpdir()` + cleanup via `t.after()`, matching the pattern in `test/baseline/manager.test.js`.

Coverage plan:
- `readApprovals`: valid file → returns array; missing file → returns []; corrupted JSON → throws
- `writeApproval`: valid write → appends atomically; package not in lockfile → rejects; invalid override → rejects; empty reason + require_reason → rejects; duration exceeds max → caps
- `cleanExpired`: removes expired entries and returns counts; missing file → rejects
- `parseDuration`: "7d", "24h", "30d", "1d" → valid; "abc", "7x", "" → throws

## Acceptance Criteria / Verification Mapping
- AC: readApprovals returns Approval[] from valid file → test: "readApprovals returns array from valid file"
- AC: readApprovals returns [] when file missing → test: "readApprovals returns empty array when file missing"
- AC: writeApproval appends atomically → test: "writeApproval appends entry atomically"
- AC: writeApproval rejects package not in lockfile → test: "writeApproval rejects when package not in lockfile"
- AC: writeApproval rejects invalid override name → test: "writeApproval rejects invalid override name"
- AC: writeApproval rejects empty reason when require_reason → test: "writeApproval rejects empty reason when require_reason is true"
- AC: writeApproval caps expiry at max_expiry_days → test: "writeApproval caps expiry at max_expiry_days"
- AC: Duration parsing handles Nd/Nh, rejects invalid → test: "parseDuration handles valid and invalid formats"
- AC: cleanExpired removes past-expiry entries, returns counts → test: "cleanExpired removes expired entries"
- AC: cleanExpired rejects when file missing → test: "cleanExpired throws when file missing"
- AC: All writes are atomic → verified in writeApproval and cleanExpired tests
- AC: Unit tests cover all listed scenarios → node test/approvals/store.test.js

## Verification Results
Command: `node test/approvals/store.test.js` — 30 tests pass, 0 fail, duration 35ms.

- AC: readApprovals returns Approval[] from valid file → PASS — test: "readApprovals returns array from valid approvals file"
- AC: readApprovals returns [] when file missing → PASS — test: "readApprovals returns empty array when file does not exist"
- AC: writeApproval appends atomically → PASS — test: "writeApproval appends an entry to the approvals file atomically" + atomic write test
- AC: writeApproval rejects package not in lockfile → PASS — tests: package missing + version mismatch cases
- AC: writeApproval rejects invalid override name → PASS — tests: invalid name + error message includes valid rule list
- AC: writeApproval rejects empty reason when require_reason → PASS — tests: empty string and whitespace-only
- AC: writeApproval caps expiry at max_expiry_days → PASS — test: "writeApproval caps expires_at at max_expiry_days when duration exceeds it"
- AC: Duration parsing handles "7d", "24h", "30d", "1d", rejects "abc", "7x", "" → PASS — 9 parseDuration tests
- AC: cleanExpired removes past-expiry entries, returns counts → PASS — tests: removes expired, no-op when none expired, empty file
- AC: cleanExpired rejects when file missing → PASS — test: "cleanExpired throws when approvals file does not exist"
- AC: All writes are atomic (temp + rename) → PASS — verified in writeApproval and cleanExpired atomic write tests
- AC: node test/approvals/store.test.js passes → PASS — all 30 tests pass

## Story Run Log Update
### 2026-04-08 Developer: Implementation
Created `src/approvals/models.js` (VALID_RULE_NAMES, parseDuration, createApproval) and `src/approvals/store.js` (readApprovals, writeApproval, cleanExpired) with atomic writes. Added `test/approvals/store.test.js` covering all 12 acceptance criteria across 30 test cases. Command: `node test/approvals/store.test.js` — 30 pass, 0 fail. All ACs: PASS.

## Documentation Updates
None — no env vars, no setup changes, no operator-facing interface changes.

## Deployment Impact
None.

## Questions/Concerns
- `VALID_RULE_NAMES` is hardcoded from system overview (provenance, cooldown, pinning, scripts, sources, new-dep, transitive). If rules are added later, this list must be updated. Acceptable for v0.1.
- `createApproval` produces an Approval with `expires_at` already computed. The validator (F05-S02) will use this field directly, not re-parse duration.

## Stubs
None. All file I/O is real. Duration parsing is real. All validations are real.

## Metadata
- Agent: developer
- Date: 2026-04-08
- Work Item: F05-S01
- Work Type: story
- Branch: burnish/task-025-implement-approval-model-store-operations
- ADR: ADR-001-zero-runtime-dependencies
