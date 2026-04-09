# Review: task-038 — `audit`, `clean-approvals`, and `install-hook` Commands

## Outcome

Implementation complete. All 8 acceptance criteria pass. 26 new tests pass; 56 existing CLI tests unaffected.

## What Was Implemented

### `src/cli/commands/audit.js`
Full implementation replacing stub. Wires to: `parseLockfile` (F02), `createRegistryClient` (F03), `loadPolicy` + `evaluate` (F06), `formatAuditReport` (F07). Creates a synthetic delta treating all packages as "added" and runs the full policy engine. Computes AuditReport stats (totalPackages, provenancePct, packagesWithInstallScripts, sourceTypeCounts, ageDistribution, cooldownViolationCount) from registry metadata. Prints blocked packages with approval commands. Exit 0 always.

### `src/cli/commands/clean.js`
Full implementation replacing stub. Delegates to `cleanExpired()` from `approvals/store.js`. Prints exact messages: "Removed N expired approval(s). N active approval(s) remain." or "No expired approvals found." Exit 0 always; exit 2 on missing approvals.json.

### `src/cli/commands/install-hook.js`
Full implementation replacing stub. Handles 4 states: create, already-installed (edge case #8), append, force-overwrite (edge case #9). Uses `git rev-parse --git-common-dir` via `child_process.execSync` to correctly resolve the hooks directory in worktrees where `.git` is a file. Uses `fs/promises.chmod(0o755)` for executable bit.

## Test Files

- `test/unit/cli/audit.test.js` — 10 tests
- `test/unit/cli/clean.test.js` — 7 tests
- `test/unit/cli/install-hook.test.js` — 9 tests

## Key Design Choice

`install-hook.js` uses `git rev-parse --git-common-dir` rather than directly assuming `.git` is a directory. This correctly handles git worktrees (where `.git` is a symlink/file pointing to the main git dir). The resolver is injectable for test isolation.

## Verification Summary

All 8 ACs: PASS. No deferred criteria.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Task: task-038
