# Story: F05-S01 — Approval Model & Store Operations

## Parent
F05: Approval Store & Validation

## Description
Define the Approval data model and implement the core store operations: read, write, and clean. This is the data foundation for the entire approvals module — validator and generator depend on the model defined here.

## Scope
**In scope:**
- `src/approvals/store.js` — readApprovals, writeApproval, cleanExpired
- `src/approvals/models.js` — Approval model definition and validation
- Atomic file writes (write to temp file, rename)
- Duration string parsing ("7d", "24h", "30d", "1d")
- Input validation: package exists in lockfile, valid override names, expiry within max, non-empty reason when required
- `test/approvals/store.test.js`

**Not in scope:**
- Approval validation/matching logic (F05-S02)
- Approval command generation (F05-S03)
- CLI `approve` command wiring (F08)
- Policy rule evaluation

## Entry Points
- Route / page / screen: N/A — library module, not user-facing
- Trigger / navigation path: Called by CLI `approve` command (F08) and `clean-approvals` command (F08)
- Starting surface: Other modules import `store.js` functions directly

## Wiring / Integration Points
- Caller-side ownership: CLI module (F08) will call `writeApproval()` and `cleanExpired()` — F08 owns that wiring
- Callee-side ownership: This story owns the full store implementation: read, write, clean, atomic file I/O
- Caller-side conditional rule: CLI (F08) does not exist yet. Export the public API (`readApprovals`, `writeApproval`, `cleanExpired`) and document the function signatures. F08 wires to these when it lands.
- Callee-side conditional rule: This story has no callees beyond `node:fs/promises`. Wire file I/O directly.
- Boundary / contract check: Unit tests verify each function's input/output contract independently
- Files / modules to connect: `src/approvals/store.js` ← `node:fs/promises`, `node:path`, `node:os` (for temp dir)
- Deferred integration, if any: CLI command wiring deferred to F08

## Not Allowed To Stub
- Atomic file writes — must use real write-to-temp + rename pattern, not a plain `writeFile`
- Duration parsing — must handle "7d", "24h", "30d", "1d" and reject invalid formats
- Input validation — package-in-lockfile check, valid override names, expiry cap, reason requirement must all be real
- `readApprovals` missing-file handling — must return empty array, not throw

## Behavioral / Interaction Rules
- `readApprovals` returns `[]` when the approvals file does not exist (for `check` flow)
- `writeApproval` rejects (throws) when the approvals file does not exist (for `approve` flow — project must be initialized)
- `cleanExpired` rejects (throws) when the approvals file does not exist
- Atomic writes: write to temp file in same directory, then `rename()` to target path
- Expiry that exceeds `max_expiry_days` from config is capped at `max_expiry_days`, not rejected

## Acceptance Criteria
- [ ] `readApprovals(approvalsPath)` loads and returns `Approval[]` from a valid approvals file
- [ ] `readApprovals(approvalsPath)` returns `[]` when the file does not exist
- [ ] `writeApproval(approvalsPath, approval)` appends a valid entry atomically (read → push → write-temp → rename)
- [ ] `writeApproval` rejects when package is not in the provided lockfile dependencies
- [ ] `writeApproval` rejects when any override name is not a valid rule name
- [ ] `writeApproval` rejects when reason is empty and `require_reason` is true
- [ ] `writeApproval` caps expiry at `max_expiry_days` when the requested duration exceeds it
- [ ] Duration parsing handles "7d", "24h", "30d", "1d" and rejects invalid formats (e.g., "abc", "7x")
- [ ] `cleanExpired(approvalsPath)` removes past-expiry entries and returns `{ removed, remaining }` counts
- [ ] `cleanExpired` rejects when the approvals file does not exist
- [ ] All file writes are atomic (temp + rename)
- [ ] Unit tests cover: valid write, expired clean, missing file read, invalid override rejection, expiry cap, duration parsing, empty reason rejection
- [ ] `node test/approvals/store.test.js` — all tests pass

## Task Breakdown
1. Create `src/approvals/models.js` — define `Approval` shape, valid rule names list, `createApproval()` factory with validation
2. Implement duration parsing in `src/approvals/models.js` — parse "Nd" and "Nh" strings to milliseconds
3. Create `src/approvals/store.js` — implement `readApprovals()` with missing-file fallback
4. Implement `writeApproval()` in `store.js` — validate inputs, append to array, atomic write
5. Implement `cleanExpired()` in `store.js` — filter by expiry, atomic write, return counts
6. Write `test/approvals/store.test.js` — cover all acceptance criteria

## Verification
```
node test/approvals/store.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- No approvals file exists — `readApprovals` returns `[]`, `writeApproval` and `cleanExpired` throw
- Approval for package not in current lockfile — `writeApproval` rejects with clear error
- Invalid override name (e.g., "notarule") — `writeApproval` rejects with valid rule list in error message
- Expiry exceeds `max_expiry_days` — cap at max, do not reject
- Duration string parsing — handle "7d", "24h", "30d", "1d"; reject "abc", "7x", "", negative values
- Empty reason string when `require_reason: true` — reject
- Atomic file writes — write to temp, rename, to prevent corruption on crash
- Multiple approvals for same package@version — store appends (validator handles precedence in S02)

## Dependencies
- Depends on: none
- Blocked by: none

## Effort
M — three store operations with validation, atomic writes, and duration parsing

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
