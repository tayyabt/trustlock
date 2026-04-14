# Code Review: task-015 Implement Time and Git Utility Modules

## Summary
Clean, complete implementation of two leaf-layer utility modules. All 11 acceptance criteria are concretely verified by 39 passing tests. Code follows ADR-001, global conventions, and story behavioral rules exactly.

## Verdict
Approved

## Findings

No blocking findings.

### Suggestion: `git add` path quoting via JSON.stringify
- **Severity:** suggestion
- **Finding:** `gitAdd` at `src/utils/git.js:45` uses `JSON.stringify(filePath)` to quote the path in the shell command string. This works for standard paths but would break if a path contains a literal `"` character (edge case unlikely in hook paths but worth documenting).
- **Proposed Judgment:** Acceptable for v0.1 scope — hook file paths are well-formed. If paths become user-controlled in the future, switch to `spawnSync(['git', 'add', '--', filePath])` to avoid any shell interpolation.
- **Reference:** Global conventions: "throw on fatal errors"; ADR-001 scope (v0.1 only).

### Suggestion: `getGitUserName` test does not assert a specific name
- **Severity:** suggestion
- **Finding:** `test/utils/git.test.js:150-157` — the happy-path `getGitUserName` test only asserts `null || typeof string`. It cannot assert a specific name because the test runs in the current repo where the name is environment-dependent.
- **Proposed Judgment:** Acceptable — the subprocess-based test for unconfigured user.name provides sufficient coverage of the null return path, and the "not installed" path is also covered. The current test is honest about the constraint.
- **Reference:** Story note: "May be null if not configured globally".

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — internal utility, no user-facing workflow)
- [x] Architecture compliance (follows ADR-001, `utils` is leaf layer with no project imports)
- [x] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (git error messages, null return on unconfigured user.name, optional `now` param)
- [x] Integration completeness (callee-side only; caller wiring correctly deferred to F04/F05/F06/F08)
- [x] Pitfall avoidance (error classification, ENOENT detection, status-127 guard)
- [x] Convention compliance (camelCase exports, kebab-case files, `node:` prefix imports, async only where needed)
- [x] Test coverage (39 tests: all ACs covered, edge cases: timezone offsets, milliseconds, empty PATH, no-repo, overwrite, executable bit)
- [x] Code quality & documentation (JSDoc on all exports, no dead code, no stubs confirmed)

## Acceptance Criteria Judgment
- AC: `src/utils/time.js` exports `parseTimestamp` and `calculateAgeInHours` → PASS — verified by module exports suite in time.test.js
- AC: `parseTimestamp("2024-01-15T10:30:00Z")` returns a valid Date → PASS — time.test.js: "returns a Date for UTC ISO string"
- AC: `parseTimestamp("2024-01-15T10:30:00+05:00")` handles timezone offset correctly → PASS — time.test.js: "handles positive timezone offset (+05:00)" asserts correct UTC conversion
- AC: `parseTimestamp("invalid")` returns `null` → PASS — time.test.js: "returns null for 'invalid'"
- AC: `calculateAgeInHours("2024-01-15T10:00:00Z", new Date("2024-01-15T22:00:00Z"))` returns `12` → PASS — time.test.js: "returns 12 for a 12-hour delta"
- AC: `src/utils/git.js` exports `gitAdd`, `getGitUserName`, `readHookFile`, `writeHookFile` → PASS — git.test.js module exports suite
- AC: `gitAdd` calls `git add <path>` via child_process and throws descriptive error on failure → PASS — git.test.js: "stages a file without throwing" + "throws a descriptive error for a non-existent path in a repo"
- AC: `getGitUserName` returns the configured user.name or `null` if unconfigured → PASS — git.test.js: "returns null when user.name is not configured" (subprocess with GIT_CONFIG_GLOBAL=/dev/null)
- AC: `readHookFile` reads hook content and returns string or `null` if missing → PASS — git.test.js: readHookFile suite (null for missing, string content for existing)
- AC: `writeHookFile` writes hook content and sets executable permission → PASS — git.test.js: "sets executable permission (mode includes 0o111)" verifies `mode & 0o100 !== 0`
- AC: Git utility errors (no git, no repo) produce clear human-readable messages → PASS — git.test.js: "throws with 'not a git repository'" and "throws with 'git is not installed'" for both gitAdd and getGitUserName
- AC: `node --test test/utils/time.test.js test/utils/git.test.js` — all tests pass → PASS — 39 tests, 0 failures, 0 skipped

## Deferred Verification
- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: Both modules are self-contained leaf-layer utilities with no callers yet. All exported functions are covered by tests including error paths. The only regression surface is internal Node.js API behavior changes, which are stable across Node >= 18.3.

## Integration / Boundary Judgment
- Boundary: Callee-side only — `time.js` and `git.js` public exports
- Judgment: complete
- Notes: Export contracts match story spec exactly. Caller wiring to F04 (`gitAdd`), F05 (`getGitUserName`), F06 (`calculateAgeInHours`), and F08 (hook file ops) is correctly deferred. `readHookFile` and `writeHookFile` are async (Promise-returning) — future callers must `await` them; this is consistent with their use of `node:fs/promises`.

## Test Results
- Command run: `node --test test/utils/time.test.js test/utils/git.test.js`
- Result: 39 pass, 0 fail, 0 skip — duration 783ms

## Context Updates Made
No module guidance or pitfalls files were registered as inputs for this task (`module_guidance_input_paths` and `module_pitfalls_input_paths` are empty). Reusable findings for future `utils` module work:
- `readHookFile` and `writeHookFile` are async (unlike the sync `gitAdd`/`getGitUserName`) — callers must `await`.
- `getGitUserName` uses `git config --get user.name` which exits non-zero when unset — the null-return catch is scoped to avoid masking git-not-installed errors.
- Testing git-not-installed without a mock framework: use `spawnSync` with `env: { PATH: '' }` in a child process (validated pattern).

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-015
- Branch: burnish/task-015-implement-time-and-git-utility-modules
- Artifacts reviewed: docs/stories/F01-S03-time-and-git-utility-modules.md, docs/feature-briefs/F01-project-scaffolding.md, docs/design-notes/F01-S03-approach.md, src/utils/time.js, src/utils/git.js, test/utils/time.test.js, test/utils/git.test.js, context/global/conventions.md, context/global/architecture.md, docs/adrs/ADR-001-zero-runtime-dependencies.md
