# Review Handoff: task-080 Fix monorepo lockfile discovery — add --project-dir hint to no-lockfile error

## Summary

Implementation-complete. All four acceptance criteria pass. No regressions introduced.

## What Changed

**Root cause fixed:** Both `init.js` and `audit.js` had a bare "No lockfile found" error with no actionable guidance for monorepo users.

**Fix:**
1. Added `detectMonorepoWorkspaces(projectRoot)` to `src/utils/paths.js` — reads root `package.json`, expands `dir/*` workspace glob patterns to concrete sub-package paths (filters for directories with their own `package.json`).
2. `src/cli/commands/init.js` — enhanced ENOENT error path to call `detectMonorepoWorkspaces` and emit either targeted workspace guidance (with per-package `--project-dir` examples) or a generic `--project-dir` hint.
3. `src/cli/commands/audit.js` — same as above for the `audit` command.
4. `test/integration/monorepo-init.test.js` — added 2 regression tests for `init` error messaging.
5. `test/integration/monorepo-audit.test.js` — new test file with 2 analogous tests for `audit` error messaging.

## Acceptance Criteria Results

| Criterion | Result | Evidence |
|---|---|---|
| `init`/`audit` at monorepo root with no lockfile → error includes `--project-dir` hint | PASS | `monorepo-init.test.js` BUG-003 test; `monorepo-audit.test.js` BUG-003 test |
| Root `package.json` with `"workspaces"` → error names workspace packages | PASS | `monorepo-init.test.js` and `monorepo-audit.test.js` workspace tests |
| Existing per-package `--project-dir` workflow continues to work | PASS | AC1/AC10 in `monorepo-init.test.js` pass unchanged |
| Regression: test asserts error contains `--project-dir` hint | PASS | New tests added in both test files |

## Pre-existing Failures (unrelated)

The following failures exist on the base branch and are unaffected by this change: `parseYarn` classic/berry tests, `parseUv`, `F10-S4 args --profile`, `AC2b check baseline gitRoot`. Verified via `git stash && npm test` comparison.

## Files Changed

- `src/utils/paths.js` — added `detectMonorepoWorkspaces` export
- `src/cli/commands/init.js` — enhanced lockfile-not-found error
- `src/cli/commands/audit.js` — enhanced lockfile-not-found error
- `test/integration/monorepo-init.test.js` — 2 new BUG-003 regression tests
- `test/integration/monorepo-audit.test.js` — new file, 2 BUG-003 regression tests

## Metadata

- Agent: developer
- Date: 2026-04-13
- Task: task-080
- Bug: BUG-003
