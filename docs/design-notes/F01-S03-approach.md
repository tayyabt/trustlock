# Design Approach: F01-S03 Time and Git Utility Modules

## Summary
Implement two leaf-layer utility modules: `src/utils/time.js` (ISO 8601 timestamp parsing and age calculation) and `src/utils/git.js` (child_process wrappers for git operations and hook file I/O). Both are pure utility modules with no runtime dependencies, following ADR-001. No callers exist yet — the public export contract is validated entirely through unit tests.

## Key Design Decisions
1. **`parseTimestamp` delegates to `new Date()`**: JavaScript's built-in Date constructor parses ISO 8601 strings including timezone offsets and milliseconds. A null-return guard catches invalid strings by checking `isNaN(d.getTime())`.
2. **`calculateAgeInHours` accepts optional `now` parameter**: Required by the story for testability — avoids time-dependent tests that would break on CI.
3. **`gitAdd` and `getGitUserName` use `execSync`**: Synchronous, fits the no-async-where-not-needed convention. Errors from `execSync` are caught and re-thrown with human-readable messages.
4. **Git error classification**: Inspect `error.message` / `error.stderr` for `ENOENT` (git not installed) vs non-zero exit (not-a-repo or other). Descriptive messages per story behavioral rules.
5. **`getGitUserName` returns `null` on unconfigured user.name**: `git config --get user.name` exits non-zero when unset; catch that specific case and return `null` (D7).
6. **`readHookFile` returns `null` on ENOENT**: Uses `fs.readFile` and catches the specific error code.
7. **`writeHookFile` creates parent directory**: Uses `fs.mkdir({ recursive: true })` before writing; sets `0o755` mode for executable permission.

## Integration / Wiring
These are callee-side-only modules. The public exports are:
- `time.js`: `parseTimestamp(str)`, `calculateAgeInHours(isoString, now?)`
- `git.js`: `gitAdd(filePath)`, `getGitUserName()`, `readHookFile(hookPath)`, `writeHookFile(hookPath, content)`

Caller wiring is intentionally deferred: F04 (baseline) → `gitAdd`, F05 (approvals) → `getGitUserName`, F06 (policy) → `calculateAgeInHours`, F08 (CLI) → hook file operations.

## Files to Create/Modify
- `src/utils/time.js` — new, implements parseTimestamp and calculateAgeInHours
- `src/utils/git.js` — new, implements gitAdd, getGitUserName, readHookFile, writeHookFile
- `test/utils/time.test.js` — new, unit tests for all time.js exports
- `test/utils/git.test.js` — new, unit tests for all git.js exports

## Testing Approach
- `time.test.js`: covers valid ISO strings (UTC, timezone offset, milliseconds), invalid strings returning null, calculateAgeInHours with explicit `now` parameter.
- `git.test.js`: covers happy path with mocked child_process (via `node:module` register is not available without extra setup — instead uses a temporary directory approach for file ops, and tests error paths by catching expected throws). git operations are tested with the real git binary (present in all dev environments); for git-not-installed simulation, tests call the functions with a bad PATH env override via `spawnSync` approach — actually, since we can't easily mock `execSync` in Node test runner without a mock framework, we test the git-not-installed path by verifying the error message format through a subprocess that overrides PATH. Alternatively: test error-message formatting directly by invoking the error-rewriting logic at the call site.

After reflection: for `git-not-installed` test, the cleanest approach with `node:test` (no mock framework) is to test in a child process with `PATH=''` or by directly catching real errors from a known-bad invocation. We'll use `spawnSync` in the test to invoke a test helper script with empty PATH. For `writeHookFile`/`readHookFile`, tests use `node:os` temp directories.

## Acceptance Criteria / Verification Mapping
- AC: `src/utils/time.js` exports `parseTimestamp` and `calculateAgeInHours` → Verification: module exports check in test
- AC: `parseTimestamp("2024-01-15T10:30:00Z")` returns valid Date → Verification: time.test.js
- AC: `parseTimestamp("2024-01-15T10:30:00+05:00")` handles timezone offset → Verification: time.test.js
- AC: `parseTimestamp("invalid")` returns null → Verification: time.test.js
- AC: `calculateAgeInHours(...)` returns 12 for 12-hour delta → Verification: time.test.js
- AC: `src/utils/git.js` exports all four functions → Verification: module exports check in test
- AC: `gitAdd` calls `git add <path>` and throws on failure → Verification: git.test.js (real git in temp repo, error on bad path)
- AC: `getGitUserName` returns configured name or null → Verification: git.test.js (real git config)
- AC: `readHookFile` reads content or returns null if missing → Verification: git.test.js (temp dir)
- AC: `writeHookFile` writes content and sets executable → Verification: git.test.js (temp dir + stat check)
- AC: Git utility errors produce clear human-readable messages → Verification: git.test.js (error message assertions)
- AC: `node --test test/utils/time.test.js test/utils/git.test.js` passes → Verification: actual test run

## Verification Results
- AC: `src/utils/time.js` exports `parseTimestamp` and `calculateAgeInHours` → PASS — module exports check in test/utils/time.test.js
- AC: `parseTimestamp("2024-01-15T10:30:00Z")` returns valid Date → PASS — time.test.js: "returns a Date for UTC ISO string"
- AC: `parseTimestamp("2024-01-15T10:30:00+05:00")` handles timezone offset → PASS — time.test.js: "handles positive timezone offset"
- AC: `parseTimestamp("invalid")` returns null → PASS — time.test.js: "returns null for \"invalid\""
- AC: `calculateAgeInHours("2024-01-15T10:00:00Z", new Date("2024-01-15T22:00:00Z"))` returns 12 → PASS — time.test.js: "returns 12 for a 12-hour delta"
- AC: `src/utils/git.js` exports all four functions → PASS — git.test.js: module exports suite
- AC: `gitAdd` calls `git add <path>` and throws on failure → PASS — git.test.js: "stages a file without throwing", "throws a descriptive error for a non-existent path"
- AC: `getGitUserName` returns configured user.name or null → PASS — git.test.js: "returns the configured user.name", "returns null when user.name is not configured"
- AC: `readHookFile` reads content or returns null if missing → PASS — git.test.js: readHookFile suite
- AC: `writeHookFile` writes content and sets executable → PASS — git.test.js: "sets executable permission (mode includes 0o111)"
- AC: Git utility errors produce clear human-readable messages → PASS — git.test.js: "throws with 'not a git repository'", "throws with 'git is not installed'"
- AC: `node --test test/utils/time.test.js test/utils/git.test.js` passes → PASS — 39 tests, 0 failures

## Environment Setup Blocker
None — pure Node.js, git available in dev environment.

## Stubs
None — all implementations are real per anti-stub rule.
