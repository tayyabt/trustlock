# Story: F09-S1 — Monorepo Root Resolution: paths.js, git.js, and All Command Callers

## Parent
F09: Monorepo Root Resolution & CLI Path Flags

## Description
Introduce `src/utils/paths.js` to decouple `projectRoot` (cwd or `--project-dir`) from `gitRoot` (walked up from projectRoot), modify `src/utils/git.js` to accept an explicit `gitRoot` parameter, add `--project-dir` and `--lockfile` flags to `args.js`, and update all five command callers to call `resolvePaths()` before any file or git operation. This is the blocking prerequisite (C1) for all other v0.2 stories.

## Scope
**In scope:**
- `src/utils/paths.js` — new module; exports `resolvePaths(options)` → `{ projectRoot, gitRoot }`
- `src/utils/git.js` — modified to accept explicit `gitRoot` parameter; implicit cwd assumption removed from all git operations
- `src/cli/args.js` — add `--project-dir <path>` and `--lockfile <path>` flags only (NOT `--quiet`, `--sarif`, or `--profile` — those belong to F10/F14 per C-NEW-5)
- `src/cli/commands/init.js` — updated to call `resolvePaths()`, write `.trustlock/` to `projectRoot`
- `src/cli/commands/check.js` — updated to call `resolvePaths()`, pass `gitRoot` to baseline's `writeAndStage`
- `src/cli/commands/approve.js` — updated to call `resolvePaths()`, resolve all file paths from `projectRoot`
- `src/cli/commands/audit.js` — updated to call `resolvePaths()`, resolve all file paths from `projectRoot`
- `src/cli/commands/install-hook.js` — updated to call `resolvePaths()`, write hook to `gitRoot/.git/hooks/pre-commit` with embedded `--project-dir`
- Unit tests for all `paths.js` scenarios and edge cases

**Not in scope:**
- `--quiet`, `--sarif`, or `--profile` flag additions to `args.js` (F10, F14)
- Monorepo workspace auto-detection from `package.json` workspaces field (deferred to v0.3, D7)
- Any `audit --compare` cross-project functionality (F17)
- Changes to `baseline/manager.js` beyond accepting the explicit `gitRoot` argument it already receives via `git.js`

## Entry Points
- Route / page / screen: All five CLI commands — `trustlock init`, `trustlock check`, `trustlock approve`, `trustlock audit`, `trustlock install-hook`
- Trigger / navigation path: Direct CLI invocation or pre-commit hook execution
- Starting surface: `src/cli/index.js` dispatches to each command handler; command handlers call `resolvePaths()` as their first step

## Wiring / Integration Points
- Caller-side ownership: All five command handlers own their call to `await resolvePaths(args)` and must pass the resolved `{ projectRoot, gitRoot }` pair to every downstream file-read and git operation in that command
- Callee-side ownership: `paths.js` owns `resolvePaths(options)` — reads `options.projectDir` (from `--project-dir`), resolves `projectRoot`, walks up the ancestor chain to find `.git/`, returns `{ projectRoot, gitRoot }` or throws a fatal error
- Caller-side conditional rule: `paths.js` does not exist yet; command callers must treat this story as creating the callee and wiring to it simultaneously — both sides ship together
- Callee-side conditional rule: `git.js` already exists; it must be modified in this story to accept an explicit `gitRoot` argument — the callee contract changes from implicit cwd to explicit parameter
- Boundary / contract check: Every command that previously relied on `process.cwd()` for git root or project root must go through `resolvePaths()` after this story; no command may call `git.js` functions without passing the resolved `gitRoot`
- Files / modules to connect: `paths.js` ← called by all five command handlers; `git.js` ← receives explicit `gitRoot` from callers (including `baseline/manager.js:writeAndStage` if it calls `git add`)
- Deferred integration: none — all callers ship in this story per feature brief

## Not Allowed To Stub
- `paths.js` must be a real implementation: actual filesystem walk for `.git/`, real `projectRoot` resolution from `--project-dir` or `process.cwd()`, real error on no-git-found
- `git.js` modification must be real: the explicit `gitRoot` parameter must replace the implicit cwd assumption in every git operation, not left as optional
- All five command handlers must actually call `resolvePaths()` and use its output — no command may continue resolving project root or git root independently
- `install-hook` must write the hook to `gitRoot/.git/hooks/pre-commit` with a real embedded `--project-dir` path (not a hardcoded placeholder)

## Behavioral / Interaction Rules
- `resolvePaths()` walks from `projectRoot` upward; the first directory containing `.git/` is `gitRoot`. If the filesystem root is reached with no `.git/` found, throw with message `Error: not a git repository (or any parent directory)` and the process exits 2.
- `--project-dir` absolute path: resolved as-is (not relative to cwd). `--project-dir` relative path: resolved relative to `process.cwd()`. `--project-dir` pointing to a non-existent directory: exit 2 with a descriptive error before any git walk.
- `--lockfile <path>` overrides only the lockfile file path, resolved relative to `projectRoot`. `.trustlockrc.json` and `.trustlock/` always resolve from `projectRoot` regardless of `--lockfile`.
- `projectRoot === gitRoot` (flat repo): behavior is identical to v0.1. `install-hook` in this case writes the hook without a `--project-dir` flag (or uses `.`) to avoid a no-op relative path.
- `install-hook` when relative path from `gitRoot` to `projectRoot` contains spaces: the path must be quoted correctly in the generated hook script.
- Multiple `trustlock init` runs from different sub-packages in the same monorepo: each sub-package gets its own `.trustlock/` in its own `projectRoot`; no collision because each call writes to the resolved `projectRoot`.

## Acceptance Criteria
- [ ] `trustlock init` run from `packages/backend/` with `.git/` two levels up: `.trustlock/` written to `packages/backend/`, not to the repo root
- [ ] `trustlock check` run from a monorepo sub-package: baseline written and staged using `gitRoot` (not `projectRoot`)
- [ ] `trustlock install-hook` run from a monorepo sub-package: hook written to `gitRoot/.git/hooks/pre-commit` with `--project-dir packages/backend` (relative path from `gitRoot` to `projectRoot`) embedded in the hook script
- [ ] No `.git/` in any ancestor of `projectRoot`: process exits 2 with `Error: not a git repository (or any parent directory)`
- [ ] `--project-dir` overrides project root for all file reads (lockfile, `.trustlockrc.json`, `.trustlock/`); git operations still use resolved `gitRoot`
- [ ] `--lockfile <path>` overrides only the lockfile file path, resolved relative to `projectRoot`; `.trustlockrc.json` and `.trustlock/` still resolve from `projectRoot`
- [ ] `src/utils/git.js` accepts an explicit `gitRoot` parameter; implicit cwd assumption is removed from all git operations
- [ ] All five command handlers (`init.js`, `check.js`, `approve.js`, `audit.js`, `install-hook.js`) call `resolvePaths()` before any file or git operation
- [ ] `--project-dir` pointing to a non-existent directory: exits 2 with a descriptive error
- [ ] `--project-dir` absolute path: resolved as-is; `--project-dir` relative path: resolved relative to `process.cwd()`
- [ ] `install-hook` when relative path from `gitRoot` to `projectRoot` contains spaces: the path is quoted correctly in the hook script
- [ ] `install-hook` run from `gitRoot` itself (`projectRoot === gitRoot`): `--project-dir` is omitted or `.` in the hook script (no spurious self-referential flag)
- [ ] Multiple `trustlock init` from different sub-packages in the same monorepo: each sub-package produces its own `.trustlock/` in its own `projectRoot` without collision
- [ ] `src/cli/args.js` adds `--project-dir` and `--lockfile` flags and does NOT add `--quiet`, `--sarif`, or `--profile` (those belong to F10/F14)
- [ ] Unit tests for `paths.js` cover: flat repo (no walk needed), `.git/` two levels up, no `.git/` found, `--project-dir` absolute, `--project-dir` relative, `--project-dir` non-existent directory

## Task Breakdown
1. Create `src/utils/paths.js` — export `async function resolvePaths(options)` that resolves `projectRoot` from `options.projectDir || process.cwd()`, validates the directory exists, then walks up ancestor directories to find the first directory containing `.git/`; returns `{ projectRoot, gitRoot }` or throws on failure
2. Modify `src/utils/git.js` — add explicit `gitRoot` parameter to every exported function that performs a git operation (e.g., `gitAdd(filePath, { gitRoot })`); remove all implicit `process.cwd()` references for git root
3. Add `--project-dir` and `--lockfile` flags to `src/cli/args.js` — both take a string value; do not add `--quiet`, `--sarif`, or `--profile`
4. Update `src/cli/commands/init.js` — call `resolvePaths(args)` first; use `projectRoot` for all file writes; error early if `--project-dir` is invalid
5. Update `src/cli/commands/check.js` — call `resolvePaths(args)` first; pass `gitRoot` to `baseline/manager.js:writeAndStage`; use `projectRoot` for lockfile, config, and baseline paths; use resolved `lockfilePath` from `--lockfile` if provided
6. Update `src/cli/commands/approve.js` — call `resolvePaths(args)` first; use `projectRoot` for all file reads/writes
7. Update `src/cli/commands/audit.js` — call `resolvePaths(args)` first; use `projectRoot` for all file reads
8. Update `src/cli/commands/install-hook.js` — call `resolvePaths(args)` first; write hook to `gitRoot/.git/hooks/pre-commit`; compute relative path from `gitRoot` to `projectRoot`; embed `--project-dir` in hook script only when `projectRoot !== gitRoot`; quote path correctly
9. Write unit tests for `paths.js` covering all edge cases in Edge Cases 1–10 from the feature brief; write integration tests for install-hook hook script generation with sub-package path and spaces in path

## Verification
```bash
# Unit tests for paths.js
node --test test/unit/utils/paths.test.js
# Expected: all tests pass — flat repo, .git/ two levels up, no .git/, --project-dir absolute, relative, non-existent

# Unit tests for args.js (confirm new flags present, --profile absent)
node --test test/unit/cli/args.test.js
# Expected: all tests pass; --project-dir and --lockfile parse correctly; --profile not in schema

# Integration test: init from sub-package
node --test test/integration/monorepo-init.test.js
# Expected: .trustlock/ written to packages/backend/, not repo root

# Integration test: check from sub-package
node --test test/integration/monorepo-check.test.js
# Expected: baseline staged using gitRoot

# Integration test: install-hook from sub-package
node --test test/integration/monorepo-install-hook.test.js
# Expected: hook at gitRoot/.git/hooks/pre-commit with --project-dir packages/backend embedded

# Full test suite
node --test
# Expected: all tests pass
```

## Edge Cases to Handle
1. `projectRoot === gitRoot` (flat repo): behaves identically to v0.1; hook script omits `--project-dir` or uses `.`
2. `.git/` two or more levels above `projectRoot`: correctly resolved by the ancestor walk
3. No `.git/` anywhere in the ancestor chain: exit 2, `Error: not a git repository (or any parent directory)`
4. `--project-dir` points to a non-existent directory: exit 2 with descriptive error before git walk
5. `--project-dir` is an absolute path: resolved as-is, not relative to cwd
6. `--project-dir` is a relative path: resolved relative to `process.cwd()`
7. `--lockfile` path does not exist: hard error at lockfile parse step (existing behavior preserved)
8. `install-hook` in a monorepo where relative path from `gitRoot` to `projectRoot` contains spaces: path must be quoted in the hook script
9. `install-hook` run from `gitRoot` itself (`projectRoot === gitRoot`): `--project-dir` omitted or `.` in hook script
10. Multiple `trustlock init` from different sub-packages in the same monorepo: each sub-package gets its own `.trustlock/`; no collision

## Dependencies
- Depends on: F01-S3 (git.js exists and is the module being modified); F08-S1 (args.js exists and is being extended)
- Blocked by: none (all prerequisite infrastructure exists from v0.1 sprint)

## Effort
M — new module (paths.js) plus surgical modification of git.js and five command callers; no new algorithmic complexity beyond a filesystem ancestor walk

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P0

---

## Run Log

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
