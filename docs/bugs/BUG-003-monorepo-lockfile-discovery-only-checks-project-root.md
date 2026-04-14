# Bug Report: BUG-003 Monorepo lockfile discovery only checks project root — fails when lockfiles are in sub-package directories

## Summary

When `trustlock init` or `trustlock audit` is run at the root of a monorepo where `package-lock.json` files exist only inside sub-package directories (e.g., `apps/frontend/package-lock.json`, `apps/backend/package-lock.json`) and not at the repo root, trustlock exits with a fatal "lockfile not found" error. The lockfile discovery in both `init` (`src/cli/commands/init.js:69`) and `audit` (`src/cli/commands/audit.js:68-84`) hardcodes a single candidate path: `join(projectRoot, 'package-lock.json')`. There is no walk into workspace sub-directories. The existing `--project-dir` flag can work around this for per-package invocations, but the user must know to use it — the default behavior silently fails with no actionable guidance.

## Expected Behavior

When run from a monorepo root without a root-level lockfile, trustlock either:
1. Detects the workspace structure (reads `workspaces` field in root `package.json`) and offers to init each sub-package, or
2. Fails with a clear, actionable error message telling the user to run `trustlock init --project-dir apps/frontend` and `trustlock init --project-dir apps/backend` for each workspace sub-package.

At minimum, the error message should tell the user what `--project-dir` is and how to use it in a monorepo context.

## Actual Behavior

Trustlock exits with a generic lockfile-not-found error. The user has no hint that `--project-dir` exists or that per-package invocation is the intended pattern. They are left guessing whether trustlock supports their repo layout at all.

## Reproduction

1. Create a monorepo: root `package.json` with `"workspaces": ["apps/*"]`; `apps/frontend/package-lock.json` and `apps/backend/package-lock.json` present; no root `package-lock.json`.
2. Run `trustlock init` from the repo root.

## Scope / Environment

- `src/cli/commands/init.js:69` — hardcoded `join(projectRoot, 'package-lock.json')`
- `src/cli/commands/audit.js:68-84` — `EXPECTED_LOCKFILES` searched only in `projectRoot`
- `src/utils/paths.js` — `resolvePaths()` computes `projectRoot` correctly; problem is upstream in command files
- Monorepo structures where sub-packages have their own install trees (no root lockfile)

## Evidence

- User report from Farhan Salam (resource_ally): "Trustlock is still trying to find a package-lock.json in the root dir but I don't have it — I have package.json files inside the respective backend and frontend dirs."
- Integration tests `test/integration/monorepo-init.test.js` confirm `--project-dir` works per-package but do not test root-invocation UX or error messaging.

## Severity / User Impact

Medium-high — monorepo is a very common project layout. Users without a root lockfile hit a dead end immediately. No data loss, but onboarding fails entirely for this topology without documentation discovery.

## Duplicate Relationship

Distinct from BUG-002 (that bug is a crash during parsing; this bug is a discovery failure before parsing starts). Both may surface in the same session for workspace users, but they have different root causes and fixes.

## Confirmation Snapshot

Bug reported directly by Farhan Salam via Slack. User confirmed the issue persists after investigating the directory structure.

## Behavioral / Interaction Rules

- The error message when no lockfile is found at project root must mention `--project-dir` and give a one-line usage example for monorepo scenarios.
- Workspace discovery (auto-detecting `workspaces` field) is a potential enhancement but not required for a minimal fix — the actionable error message is the minimum acceptance bar.

## Counterpart Boundary / Contract

`resolvePaths()` in `src/utils/paths.js` is correct and should not change. The fix belongs in the error-handling path of `init.js` and `audit.js` where lockfile absence is detected.

## Root-Cause Hypothesis

Both `init` and `audit` fail with a generic "no lockfile found" error without reading the root `package.json` to detect a `"workspaces"` field or advising on `--project-dir`. The fix is twofold:
1. When no lockfile is found, check if root `package.json` has a `"workspaces"` key; if so, emit a targeted monorepo guidance message.
2. Always append a `--project-dir` hint to the lockfile-not-found error regardless.

## Acceptance Criteria

- When `trustlock init` or `trustlock audit` is run at a monorepo root with no root lockfile, the error output includes `--project-dir` and a usage hint.
- When the root `package.json` contains `"workspaces"`, the error message specifically identifies the workspace pattern and shows example `--project-dir` invocations for each workspace.
- The `--project-dir` per-package workflow documented in integration tests continues to work.
- Regression: a test asserts that the error output contains the `--project-dir` hint when the lockfile is absent.

## Verification

- Run `trustlock init` in a scratch directory with no `package-lock.json` — verify error mentions `--project-dir`.
- Run `trustlock init` in a directory with a root `package.json` containing `"workspaces": ["apps/*"]` — verify error names the workspace packages.
- `npm test` — existing init and audit tests must pass.

## Metadata

- Agent: bug-assistant
- Date: 2026-04-13
- Bug ID: BUG-003
- Related Feature or Story: none
- Duplicate Of: none
- UI-Affecting: no
- Design Foundation: none
- Feature Preview: none
- Preview Notes: none
