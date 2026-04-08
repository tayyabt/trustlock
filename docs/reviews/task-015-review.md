# Review Handoff: task-015 — Time and Git Utility Modules

## Status
Ready for review.

## What Was Implemented
- `src/utils/time.js`: `parseTimestamp` (ISO 8601 → Date | null) and `calculateAgeInHours` (with injectable `now` for testability)
- `src/utils/git.js`: `gitAdd`, `getGitUserName`, `readHookFile`, `writeHookFile` using `node:child_process` and `node:fs/promises`

## Acceptance Criteria Outcome
All 12 acceptance criteria: **PASS**. 39 unit tests, 0 failures.

## Key Design Points
- `parseTimestamp` delegates to `new Date()` — handles UTC, timezone offsets, and milliseconds natively.
- `runGit` detects git-not-installed via `err.status === 127` (shell exit code for command not found) in addition to `ENOENT`.
- `getGitUserName` re-throws "git is not installed" errors but swallows non-zero exits caused by unconfigured `user.name`, returning `null` per D7.
- `writeHookFile` uses `mkdir({ recursive: true })` then `writeFile` with mode `0o755`.

## Verification Commands Run
```
node --test test/utils/time.test.js test/utils/git.test.js
# Result: 39 pass, 0 fail

node -e "import('./src/utils/time.js').then(m => { const d = m.parseTimestamp('2024-01-15T10:30:00Z'); console.assert(d instanceof Date); console.log('OK') })"
# Result: OK

node -e "import('./src/utils/git.js').then(m => { console.assert(typeof m.gitAdd === 'function'); console.assert(typeof m.getGitUserName === 'function'); console.log('OK') })"
# Result: OK
```

## No Stubs
All exports are real implementations. No internal wiring is stubbed.

## Deferred Wiring
Caller-side wiring intentionally deferred: F04 → `gitAdd`, F05 → `getGitUserName`, F06 → `calculateAgeInHours`, F08 → hook file operations.
