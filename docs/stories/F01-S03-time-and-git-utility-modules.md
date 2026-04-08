# Story: F01-S03 — Time and Git Utility Modules

## Parent
F01: Project Scaffolding & Shared Utilities

## Description
Implement the time utility (ISO 8601 parsing, age calculation) and git utility (child_process wrappers for git add, git config, hook file operations). These modules are consumed by baseline management (F04), approvals (F05), policy engine (F06), and CLI (F08).

## Scope
**In scope:**
- `src/utils/time.js`: parseTimestamp, calculateAgeInHours
- `src/utils/git.js`: gitAdd, getGitUserName, readHookFile, writeHookFile
- Unit tests in `test/utils/time.test.js` and `test/utils/git.test.js`

**Not in scope:**
- semver.js — that is F01-S02
- Full git operations (commit, push, branch) — only the specific operations listed
- Hook installation logic — that is F08's install-hook command

## Entry Points
- Route / page / screen: N/A — internal utility modules, no direct user invocation
- Trigger / navigation path: Imported by other modules (`import { calculateAgeInHours } from '../utils/time.js'`, `import { gitAdd } from '../utils/git.js'`)
- Starting surface: Consumed by baseline (git add for auto-staging), approvals (git config for identity), policy (time for cooldown)

## Wiring / Integration Points
- Caller-side ownership: Callers (baseline manager, approval store, policy engine, CLI) will import from these modules. Those callers don't exist yet.
- Callee-side ownership: This story owns both full implementations. time.js exports: `parseTimestamp(str)`, `calculateAgeInHours(isoString, now?)`. git.js exports: `gitAdd(filePath)`, `getGitUserName()`, `readHookFile(hookPath)`, `writeHookFile(hookPath, content)`.
- Caller-side conditional rule: No callers exist yet. The seam is the module's public exports. F04 (baseline) will wire to `gitAdd`. F05 (approvals) will wire to `getGitUserName`. F06 (policy) will wire to `calculateAgeInHours`. F08 (CLI) will wire to hook file operations.
- Callee-side conditional rule: No caller to wire to yet — modules are self-contained.
- Boundary / contract check: Unit tests validate all exported functions. For git.js, tests must verify behavior when git is not available.
- Files / modules to connect: `src/utils/time.js` (no deps), `src/utils/git.js` (uses `node:child_process`)
- Deferred integration: Caller wiring deferred to F04, F05, F06, F08

## Not Allowed To Stub
- `parseTimestamp` must return a real Date object or null — not a hardcoded value
- `calculateAgeInHours` must compute real duration — not a placeholder
- `gitAdd` must call real `git add` via `child_process.execSync` — not a no-op
- `getGitUserName` must call real `git config user.name` — not a hardcoded string
- `readHookFile` and `writeHookFile` must perform real filesystem operations on the hook path
- Error handling for git-not-installed and no-repo must produce clear error messages, not swallow errors

## Behavioral / Interaction Rules
- `gitAdd`, `getGitUserName` must throw a descriptive error when git is not installed (not a cryptic child_process error)
- `gitAdd` must throw a descriptive error when not in a git repo
- `getGitUserName` must return `null` (not throw) when `user.name` is not configured — callers handle this (D7)
- `calculateAgeInHours` accepts an optional `now` parameter for testability (avoids time-dependent tests)

## Acceptance Criteria
- [ ] `src/utils/time.js` exports `parseTimestamp` and `calculateAgeInHours`
- [ ] `parseTimestamp("2024-01-15T10:30:00Z")` returns a valid Date
- [ ] `parseTimestamp("2024-01-15T10:30:00+05:00")` handles timezone offset correctly
- [ ] `parseTimestamp("invalid")` returns `null`
- [ ] `calculateAgeInHours("2024-01-15T10:00:00Z", new Date("2024-01-15T22:00:00Z"))` returns `12`
- [ ] `src/utils/git.js` exports `gitAdd`, `getGitUserName`, `readHookFile`, `writeHookFile`
- [ ] `gitAdd` calls `git add <path>` via child_process and throws descriptive error on failure
- [ ] `getGitUserName` returns the configured user.name or `null` if unconfigured
- [ ] `readHookFile` reads hook content from `.git/hooks/<name>` and returns string or `null` if missing
- [ ] `writeHookFile` writes hook content and sets executable permission
- [ ] Git utility errors (no git, no repo) produce clear human-readable messages
- [ ] `node --test test/utils/time.test.js test/utils/git.test.js` — all tests pass

## Task Breakdown
1. Create `src/utils/time.js` with `parseTimestamp` (ISO 8601 parser) and `calculateAgeInHours`
2. Create `test/utils/time.test.js` with tests covering timezones, milliseconds, invalid input
3. Create `src/utils/git.js` with `gitAdd`, `getGitUserName`, `readHookFile`, `writeHookFile`
4. Create `test/utils/git.test.js` with tests covering happy path, git-not-installed, no-repo, empty user.name
5. Verify all tests pass

## Verification
```
node --test test/utils/time.test.js
# Expected: all tests pass

node --test test/utils/git.test.js
# Expected: all tests pass

node -e "import('./src/utils/time.js').then(m => { const d = m.parseTimestamp('2024-01-15T10:30:00Z'); console.assert(d instanceof Date); console.log('OK') })"
# Expected: prints OK

node -e "import('./src/utils/git.js').then(m => { console.assert(typeof m.gitAdd === 'function'); console.assert(typeof m.getGitUserName === 'function'); console.log('OK') })"
# Expected: prints OK
```

## Edge Cases to Handle
- ISO 8601 with timezone offset (`+05:00`, `-08:00`) — must parse correctly
- ISO 8601 with milliseconds (`2024-01-15T10:30:00.123Z`) — must parse correctly
- Invalid timestamp strings — return `null`, do not crash
- Git not installed — `gitAdd` and `getGitUserName` must produce clear errors like "git is not installed" rather than raw child_process ENOENT
- Not a git repository — `gitAdd` must produce clear error like "not a git repository"
- `git config user.name` returns empty — `getGitUserName` returns `null`
- Hook file doesn't exist — `readHookFile` returns `null`
- Hook directory doesn't exist — `writeHookFile` creates the directory

## Dependencies
- Depends on: F01-S01 (project skeleton and test harness)
- Blocked by: none

## Effort
M — Two small modules with distinct edge case patterns; git.js requires careful error handling.

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
