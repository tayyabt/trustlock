# Design Approach: task-080 Fix monorepo lockfile discovery — add --project-dir hint to no-lockfile error

## Summary

Both `trustlock init` and `trustlock audit` emit a generic "No lockfile found" error when no `package-lock.json` exists at the project root. Neither error message mentions `--project-dir` or explains how to operate trustlock in a monorepo layout. This causes a hard onboarding dead-end for users with workspace-style monorepos.

The fix enriches the lockfile-not-found error paths in both commands to:
1. Always include a `--project-dir` usage hint.
2. When the root `package.json` has a `"workspaces"` field, expand the workspace patterns to concrete sub-package paths and show example per-package invocations.

## Root-Cause Hypothesis

`init.js:94-101` and `audit.js:78-83` both catch `ENOENT` when the hardcoded `package-lock.json` path is absent and immediately write a generic error with no actionable guidance. Neither reads `package.json` to detect workspace configuration before giving up.

## Key Design Decisions

1. **Add `detectMonorepoWorkspaces(projectRoot)` to `src/utils/paths.js`**: Reads `package.json`, extracts the `workspaces` field (supports both array-of-patterns and Yarn-style `{ packages: [...] }` shapes), expands `dir/*` glob patterns via `readdir`, filters for directories that contain their own `package.json`. Returns an array of relative paths. `resolvePaths()` is not modified per the bug contract.

2. **Inline enhanced error in `init.js` and `audit.js` error paths**: Each command calls `detectMonorepoWorkspaces` in its ENOENT-on-lockfile branch and builds a message that always includes `--project-dir` and conditionally includes workspace examples.

3. **No abstraction of the message-building code**: The two command files produce slightly different messages (one says `trustlock init`, the other `trustlock audit`). The helper only returns workspace paths; the command files assemble the final message, keeping the helper reusable and free of presentation coupling.

## Integration / Wiring

No new public interfaces or CLI flags are introduced. The change is confined to internal error paths in two commands and the addition of a utility function. `resolvePaths()` is not changed. Registry, baseline, policy, and lockfile parsing subsystems are unaffected.

## Files to Create/Modify

- `src/utils/paths.js` — Add exported `detectMonorepoWorkspaces(projectRoot)` helper.
- `src/cli/commands/init.js` — Enhance lockfile-ENOENT error (lines 94-101). Import `detectMonorepoWorkspaces`.
- `src/cli/commands/audit.js` — Enhance lockfile-not-found error (lines 78-83). Import `detectMonorepoWorkspaces`.
- `test/integration/monorepo-init.test.js` — Add 2 regression tests for new error messaging.
- `test/integration/monorepo-audit.test.js` — New file with analogous tests for `audit`.

## Testing Approach

Integration tests call the command's `run()` function directly with `_cwd` injection (matching existing monorepo-init.test.js pattern):
- No lockfile at project root, no workspaces → error contains `--project-dir`.
- No lockfile at project root, root `package.json` has `"workspaces": ["apps/*"]`, actual subdirs with `package.json` present → error names each workspace with `--project-dir` examples.
- Existing per-package `--project-dir` init/audit flows continue to pass (regression).

## Acceptance Criteria / Verification Mapping

- AC1: `trustlock init` at monorepo root with no root lockfile → error includes `--project-dir` and usage hint → `test/integration/monorepo-init.test.js` "no-lockfile error includes --project-dir hint"
- AC2: Root `package.json` has `"workspaces"` → error names workspace packages → `test/integration/monorepo-init.test.js` "no-lockfile error names workspaces when workspaces field present"
- AC3: Same AC1+AC2 for `trustlock audit` → `test/integration/monorepo-audit.test.js`
- AC4: Existing per-package `--project-dir` workflow works → existing AC1/AC10 tests in `monorepo-init.test.js` continue to pass (`npm test`)

## Stubs

None. No stubs or deferred wiring.

## Verification Results

- AC1: PASS — `monorepo-init.test.js` "BUG-003: no-lockfile error at repo root includes --project-dir hint (no workspaces)" passes (`npm test`)
- AC2: PASS — `monorepo-init.test.js` "BUG-003: no-lockfile error names workspace packages when workspaces field present" passes (`npm test`)
- AC3: PASS — `monorepo-audit.test.js` "BUG-003 audit: no-lockfile error at repo root includes --project-dir hint (no workspaces)" and "no-lockfile error names workspace packages when workspaces field present" pass (`npm test`)
- AC4: PASS — All pre-existing `monorepo-init.test.js` AC1 and AC10 tests continue to pass; no regressions introduced by this change. Pre-existing failures (parseYarn, parseUv, F10-S4 args, AC2b) are unchanged — confirmed by running `git stash && npm test` against base branch.

## Documentation Updates

None — no new CLI flags, env vars, or operator workflow changes.

## Deployment Impact

None.

## Questions/Concerns

Workspace glob expansion covers the common `dir/*` pattern. Deeply nested globs (e.g. `apps/*/*`) or negation patterns are left as the pattern text verbatim — enough to orient the user without requiring a full glob implementation. This matches the minimum acceptance bar stated in the bug.

## Metadata

- Agent: developer
- Date: 2026-04-13
- Work Item: task-080
- Work Type: bug-fix
- Branch: burnish/task-080-fix-monorepo-lockfile-discovery-add-project-dir-hint-to-no-lockfile-error
- ADR: ADR-004 (lockfile architecture context)
