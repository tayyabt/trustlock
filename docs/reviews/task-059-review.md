# Code Review: task-059 — F09-S1 Monorepo Root Resolution: paths.js, git.js, and All Command Callers

## Summary

Implementation is complete and correct. All 15 story acceptance criteria are concretely verified by tests. The dual-root resolution pattern (`projectRoot` / `gitRoot`) is properly introduced in `paths.js` and consistently applied across all five command callers. Full test suite passes 586/586. No stubs. No architecture violations. ADR-001 (zero runtime dependencies) is preserved throughout.

## Verdict

Approved

## Findings

No blocking findings. Two observations recorded as non-blocking notes:

### Note 1: Design note underspecifies `--lockfile` addition to args.js
- **Severity:** suggestion
- **Finding:** `docs/design-notes/F09-S1-approach.md` lists "add `--project-dir` string flag" but does not explicitly mention `--lockfile`. The implementation correctly adds both (`args.js:18-19`); the design note is merely incomplete.
- **Proposed Judgment:** No change required. The implementation is correct per the story. Future design notes should enumerate all flag additions explicitly.
- **Reference:** Story scope: "Add `--project-dir <path>` and `--lockfile <path>` flags only"; `src/cli/args.js:18-19`

### Note 2: EC3 test assumes tmpdir is outside any git repository
- **Severity:** suggestion
- **Finding:** `test/unit/utils/paths.test.js:81-98` (EC3) creates a temp dir and expects `resolvePaths()` to throw "not a git repository". If the test runner's cwd happens to be inside a git repo that owns `/tmp` (unusual but possible in some container setups), the ancestor walk would succeed and the test would fail.
- **Proposed Judgment:** Accept as-is. Standard OS temp directories are not inside git repos. Recorded in `context/modules/utils/pitfalls.md` for awareness.
- **Reference:** `test/unit/utils/paths.test.js:81-98`; `context/modules/utils/pitfalls.md`

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — no workflow coverage required per feature brief)
- [x] Architecture compliance (follows ADR, respects module boundaries — `paths.js` is a leaf in `utils/`; no layering violations)
- [x] Design compliance (N/A — no UI work)
- [x] Behavioral / interaction rule compliance (exit 2 on all fatal paths, `--project-dir` absolute/relative both handled, quoting for spaces, flat-repo omission of `--project-dir`)
- [x] Integration completeness (all five callers wired; both sides ship together; `writeAndStage` bridge updated)
- [x] Pitfall avoidance (fake `.git/` in all unit tests; `_resolveGitCommonDir` injection in install-hook tests)
- [x] Convention compliance (ES modules, camelCase, zero runtime deps, atomic writes preserved, error objects carry `exitCode: 2`)
- [x] Test coverage (all 15 ACs have test evidence; 6 EC edge cases for `paths.js`; monorepo integration tests for init, check, install-hook)
- [x] Code quality & documentation (design note updated with AC-to-test mapping; no dead code; `context/modules/utils/` created)

## Acceptance Criteria Judgment

- AC1: `trustlock init` from `packages/backend/` — `.trustlock/` in sub-package, not repo root → **PASS** — `test/integration/monorepo-init.test.js` AC1 (live run confirmed)
- AC2: `trustlock check` from sub-package — baseline staged using `gitRoot` → **PASS** — `test/integration/monorepo-check.test.js` AC2b asserts `receivedGitRoot === repoRoot`
- AC3: `trustlock install-hook` from sub-package — hook at `gitRoot/.git/hooks/pre-commit` with `--project-dir packages/backend` → **PASS** — `test/integration/monorepo-install-hook.test.js` AC3 (live run confirmed)
- AC4: No `.git/` in any ancestor — exit 2 with `Error: not a git repository (or any parent directory)` → **PASS** — `test/unit/utils/paths.test.js` EC3
- AC5: `--project-dir` overrides project root for all file reads → **PASS** — `paths.test.js` EC5/EC6; `monorepo-check.test.js` AC5
- AC6: `--lockfile` overrides only lockfile path, resolved relative to `projectRoot` → **PASS** — `monorepo-check.test.js` AC6
- AC7: `src/utils/git.js` accepts explicit `gitRoot`; implicit cwd assumption removed → **PASS** — `git.js:45-47`; `gitRoot ? { cwd: gitRoot } : {}`
- AC8: All five command handlers call `resolvePaths()` before any file or git operation → **PASS** — confirmed in `init.js:59`, `check.js:51`, `approve.js:99`, `audit.js:37`, `install-hook.js:99`
- AC9: `--project-dir` non-existent directory — exits 2 with descriptive error → **PASS** — `paths.test.js` EC4/EC4b
- AC10: `--project-dir` absolute resolved as-is; relative resolved relative to cwd → **PASS** — `paths.test.js` EC5 (absolute), EC6 (relative)
- AC11: `install-hook` spaces in path — path correctly single-quoted in hook script → **PASS** — `install-hook.test.js` (spaces test); `monorepo-install-hook.test.js` AC8
- AC12: `install-hook` flat repo — `--project-dir` omitted from hook script → **PASS** — `install-hook.test.js` (flat repo test); `monorepo-install-hook.test.js` AC9
- AC13: Multiple `trustlock init` from different sub-packages — no collision → **PASS** — `monorepo-init.test.js` AC10
- AC14: `args.js` adds `--project-dir` and `--lockfile`, NOT `--quiet/--sarif/--profile` → **PASS** — `args.test.js`: `--project-dir` (pass), `--lockfile` (pass), `--profile` throws TypeError
- AC15: Unit tests for `paths.js` cover all 6 scenarios → **PASS** — 12 tests covering EC1–EC8

## Deferred Verification

none

## Regression Risk

- **Risk level:** low
- **Why:** The dual-root change is additive — `paths.js` is new, `git.js:gitAdd` gains an optional parameter with fallback to existing behavior. All five command callers are updated uniformly. Full suite (586 tests) passes with no failures. The only regression surface is code that called `gitAdd` without `gitRoot`; those callers are now all updated to pass it.

## Integration / Boundary Judgment

- **Boundary:** `paths.js` ← called by all five command handlers; `git.js:gitAdd` ← called by `writeAndStage`; `baseline/manager.js:writeAndStage` ← intermediate bridge with new `gitRoot` param
- **Judgment:** complete
- **Notes:** Both sides of every boundary ship in this story. Caller-side (five commands) and callee-side (`paths.js` created, `git.js` modified) are present. `baseline/manager.js:writeAndStage` correctly bridges the `gitRoot` through to `gitAdd`. No deferred integration sides.

## Test Results

- `node --test test/unit/utils/paths.test.js` → **12/12 PASS**
- `node --test test/unit/cli/args.test.js` → **16/16 PASS**
- `node --test test/unit/cli/install-hook.test.js` → **12/12 PASS**
- `node --test test/integration/monorepo-init.test.js` → **2/2 PASS**
- `node --test test/integration/monorepo-check.test.js` → **4/4 PASS**
- `node --test test/integration/monorepo-install-hook.test.js` → **4/4 PASS**
- `node --test` (full suite) → **586/586 PASS, 0 fail**
- `.burnish/check-no-stubs.sh` → **OK**
- `.burnish/check-review-integrity.sh` → **OK**

## Context Updates Made

Created `context/modules/utils/` with guidance and pitfalls:

- **File:** `context/modules/utils/guidance.md`
  - Dual-root resolution pattern and command handler contract
  - `gitAdd` explicit `gitRoot` usage
  - `writeAndStage` `gitRoot` forwarding

- **File:** `context/modules/utils/pitfalls.md`
  - Unit tests must create fake `.git/` directory in temp dirs
  - `--project-dir` relative paths are cwd-relative, not binary-location-relative
  - `git.js` functions other than `gitAdd` do not take `gitRoot`
  - EC3 test assumption about tmpdir location

## Cited Artifacts

- `docs/stories/F09-S1-monorepo-root-resolution-paths-git-and-callers.md`
- `docs/feature-briefs/F09-monorepo-root-resolution.md`
- `docs/design-notes/F09-S1-approach.md`
- `docs/architecture/system-overview.md`
- `context/global/conventions.md`
- `context/global/architecture.md`
- `docs/adrs/ADR-001-zero-runtime-dependencies.md`

## Metadata

- Agent: reviewer
- Date: 2026-04-10
- Task: task-059
- Branch: burnish/task-059-implement-monorepo-root-resolution-paths-js-git-js-and-all-command-callers
