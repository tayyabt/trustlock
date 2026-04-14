# Design Approach: task-036 — `approve` Command (F08-S3)

## Summary

Replaces the stub in `src/cli/commands/approve.js` with a full orchestration implementation. The command parses `<pkg>@<ver>`, performs pre-flight validation (package in lockfile, valid override names, expiry within max, reason when required, approver identity), then delegates to `writeApproval` (store.js) to atomically append the approval entry.

Validation is performed in-command before calling `writeApproval` to produce the exact error messages specified in the story (exit 2 on any validation failure). `writeApproval` provides a second validation layer but the first-pass errors in `approve.js` own the user-facing messages.

## Key Design Decisions

1. **Pre-validate in approve.js, not just in store.js**: `writeApproval` validates internally but its error messages don't match the story's required error format. `approve.js` validates first with exact error messages, then calls `writeApproval` (which will pass cleanly).

2. **Reject (not cap) on expiry exceeding max**: The story explicitly says "reject with specific error message (do not silently cap)". `createApproval` caps silently, so `approve.js` checks expiry BEFORE calling `writeApproval` and exits 2 if exceeded.

3. **Read approval config from raw .trustlockrc.json**: `max_expiry_days` and `require_reason` are not in the `PolicyConfig` model returned by `loadPolicy()`. The approve command reads `.trustlockrc.json` directly as JSON to extract these fields with defaults (require_reason: true, max_expiry_days: 30).

4. **`--as` takes strict precedence over git config** (D7): If `--as` is provided, it is used unconditionally. Otherwise, `getGitUserName()` is called. If neither is available, exit 2.

5. **`--override` supports both comma-separated and multi-flag forms**: `node:util.parseArgs` with `multiple: true` captures `--override cooldown,provenance` as one string. We flatten by splitting on commas within each override arg.

6. **Default `--expires` to `max_expiry_days` days**: If `--expires` is omitted, defaults to `${max_expiry_days}d`. This is safe (equals max so won't be rejected) and matches the approval generator pattern.

7. **VALID_RULE_NAMES from models.js is authoritative**: The story error message lists stale rule names. The implementation uses `VALID_RULE_NAMES` from `src/approvals/models.js` as the source of truth: `provenance, cooldown, pinning, scripts, sources, new-dep, transitive`.

## Integration / Wiring

- `index.js` already routes `approve` → `commands/approve.js` (F08-S1 stub). This task replaces the stub. No changes to `index.js` needed.
- Callee wiring owned by this task:
  - `src/lockfile/parser.js` → `parseLockfile(lockfilePath, packageJsonPath)` (validates package exists)
  - `src/approvals/store.js` → `writeApproval(approvalsPath, input, lockfileDeps, config)` (atomic append)
  - `src/approvals/models.js` → `VALID_RULE_NAMES`, `parseDuration` (validation)
  - `src/utils/git.js` → `getGitUserName()` (approver identity, D7)
- Lockfile auto-detect uses `package-lock.json` in cwd (D5: single lockfile in v0.1). The `--lockfile` flag from args.js is not wired to `approve` (not in story scope).

## Files to Create/Modify

- `src/cli/commands/approve.js` — full implementation (replaces stub)
- `test/unit/cli/approve.test.js` — new unit tests covering all ACs

## Testing Approach

Unit tests in `test/unit/cli/approve.test.js` using Node.js built-in test runner. Each test:
- Creates a temp directory with real fixture files (`.trustlockrc.json`, `package-lock.json`, `.trustlock/approvals.json`)
- Injects `_cwd` override to isolate from real project state
- Captures process.stdout/stderr via `process.stdout.write` and `process.stderr.write` patching
- Resets `process.exitCode` before each test

Coverage by AC:
- AC1: happy path writes valid entry
- AC2: approval entry shape (package, version, overrides, reason, approved_at, expires_at, approver)
- AC3: `--as` overrides git config
- AC4: package not in lockfile → exit 2 + error message
- AC5: invalid override → exit 2 + error listing valid names
- AC6: `--expires` exceeding max → exit 2 + error with configured max
- AC7: missing `--reason` when require_reason:true → exit 2
- AC8: append (not overwrite) when approvals already exist

## Stubs

None. All wiring is to real modules (F01, F02, F05 are complete). Tests use real file I/O in temp directories.

## Acceptance Criteria / Verification Mapping

- AC1: `approve axios@1.14.1 --override cooldown --reason "ok"` writes entry → unit test + file inspection
- AC2: entry shape (7 fields) → unit test assert on parsed JSON
- AC3: `--as <name>` sets approvedBy → unit test with `--as` arg
- AC4: package not in lockfile → exit 2 + "Error: ... not found in lockfile" → unit test
- AC5: invalid override → exit 2 + "Error: '...' is not a valid rule name..." → unit test
- AC6: `--expires 365d` with max 30 → exit 2 + "Error: Maximum expiry is 30 days..." → unit test
- AC7: no `--reason` with require_reason:true → exit 2 + "Error: --reason is required..." → unit test
- AC8: append to existing approvals → unit test pre-populates approvals.json, verifies 2 entries after

## Verification Results

All 14 unit tests pass: `node --test test/unit/cli/approve.test.js`

- AC1: `approve axios@1.14.1 --override cooldown --reason "ok"` writes entry → PASS — test "AC1: happy path"
- AC2: entry shape (package, version, overrides, reason, approver, approved_at, expires_at) → PASS — test "AC2: approval entry has all required fields"
- AC3: `--as <name>` sets approver field → PASS — test "AC3: --as <name> overrides approvedBy"
- AC4: package not in lockfile → exit 2 + "Error: ... not found in lockfile" → PASS — test "AC4: package not in lockfile"
- AC5: invalid override → exit 2 + "Error: '...' is not a valid rule name..." + valid rules → PASS — test "AC5: invalid --override value"
- AC6: `--expires 365d` with max 30 → exit 2 + "Error: Maximum expiry is 30 days..." → PASS — test "AC6: --expires exceeding max_expiry_days"
- AC7: no `--reason` with require_reason:true → exit 2 + "Error: --reason is required..." → PASS — test "AC7: missing --reason"
- AC8: append to existing approvals (2 entries after) → PASS — test "AC8: appends to existing approvals"

Additional: AC7b (reason optional when require_reason:false), comma-separated overrides, missing override flag, missing config, scoped package — all PASS.
