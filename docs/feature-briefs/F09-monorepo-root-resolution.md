# Feature: [F09] Monorepo Root Resolution & CLI Path Flags

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

trustlock v0.1 conflates project root and git root, breaking all commands when run from a monorepo sub-package directory. This feature decouples the two concepts via a new `paths.js` module and adds `--project-dir` and `--lockfile` flags to all commands. It is the blocking prerequisite for all other v0.2 work.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Path resolution is an infrastructure change, not a new user-facing flow. All affected commands (init, check, approve, audit, install-hook) already have workflow documentation in the v0.1 workflow docs; the surface change is the addition of `--project-dir` to those commands. No new interactive workflow pattern is introduced.
- Target Sprint: 3
- Sprint Rationale: Must ship before any other v0.2 story (C1). Every subsequent v0.2 feature depends on `paths.js` for correct projectRoot/gitRoot resolution.

## Description

trustlock currently assumes that the directory where the user runs a command contains both `package-lock.json` and `.git/`. In a monorepo, this fails: `.git/` lives at the repo root while `package-lock.json` lives in a sub-package directory.

This feature introduces `src/utils/paths.js`, which resolves two roots at startup: `projectRoot` (cwd or `--project-dir`) and `gitRoot` (found by walking up from projectRoot until `.git/` is found, or hard error). All file operations use `projectRoot`; all git operations use `gitRoot`. All command callers are updated in the same change as `paths.js` ships.

`install-hook` behavior changes: the pre-commit hook is written to `gitRoot/.git/hooks/pre-commit`, not `projectRoot`. The installed hook script calls `trustlock check --project-dir <relative-path-from-gitRoot-to-projectRoot>` so the hook functions regardless of which directory git invokes it from.

## User-Facing Behavior

- All commands gain `--project-dir <path>` flag to override project root explicitly. Useful in CI where cwd may differ from package root.
- `trustlock check --project-dir packages/backend` reads `packages/backend/package-lock.json`, `packages/backend/.trustlockrc.json`, and stages baseline using `gitRoot/.git/`.
- `--lockfile <path>` overrides the lockfile path, resolved relative to `projectRoot`. Independent of `--project-dir`.
- If `.git/` is not found after walking up to the filesystem root, all commands exit with: `Error: not a git repository (or any parent directory)`.
- `trustlock install-hook` in a monorepo writes the hook to `gitRoot/.git/hooks/pre-commit` and embeds `--project-dir` pointing from gitRoot to projectRoot.

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. `projectRoot` is the same as `gitRoot` (flat repo) — behaves identically to v0.1.
2. `.git/` is two or more levels above `projectRoot` — correctly resolved.
3. No `.git/` anywhere in the ancestor chain — hard error with message.
4. `--project-dir` points to a non-existent directory — exit 2 with descriptive error.
5. `--project-dir` is an absolute path — resolved as-is (not relative to cwd).
6. `--project-dir` is a relative path — resolved relative to cwd.
7. `--lockfile` path does not exist — hard error at lockfile parse step (existing behavior preserved).
8. `install-hook` in a monorepo where relative path from gitRoot to projectRoot contains spaces — path must be quoted correctly in the installed hook script.
9. `install-hook` run from gitRoot itself (`projectRoot === gitRoot`) — `--project-dir` is omitted or `.` in the hook script.
10. Multiple `trustlock init` runs from different sub-packages in the same monorepo — each sub-package gets its own `.trustlock/` in its own `projectRoot`; no collision.

## Acceptance Criteria
- [ ] `trustlock init` from `packages/backend/` with `.git/` two levels up: `.trustlock/` written to `packages/backend/`, not repo root.
- [ ] `trustlock check` from monorepo sub-package: baseline staged to git index using `gitRoot`.
- [ ] `trustlock install-hook`: hook written to `gitRoot/.git/hooks/pre-commit` with `--project-dir packages/backend` embedded.
- [ ] No `.git/` in any ancestor: exits 2 with `Error: not a git repository (or any parent directory)`.
- [ ] `--project-dir` overrides project root for all file reads; git operations still use resolved `gitRoot`.
- [ ] `--lockfile <path>` overrides lockfile path, resolved relative to `projectRoot`; `.trustlockrc.json` and `.trustlock/` still resolve from `projectRoot`.
- [ ] `src/utils/git.js` accepts explicit `gitRoot` parameter; implicit cwd assumption removed from all git operations.
- [ ] All command callers updated to call `paths.js` before any file or git operation.

## Dependencies
- F01 (utils infrastructure — `git.js` is part of this module)
- All v0.2 features depend on this feature shipping first (C1)

## Layering
- `src/utils/paths.js` (new) → `src/utils/git.js` (modified to accept explicit gitRoot) → all command callers updated in the same story

## Module Scope
- utils

## Complexity Assessment
- Modules affected: utils/paths.js (new), utils/git.js (modified), cli/args.js (new flags), cli/commands/init.js, check.js, approve.js, audit.js, install-hook.js (all updated)
- New patterns introduced: yes — dual-root resolution pattern; all commands must await `resolvePaths()` before proceeding
- Architecture review needed: no (covered by spec review)
- Design review needed: no

## PM Assumptions (if any)
- Monorepo workspace auto-detection (reading `package.json` workspaces field) is deferred to v0.3 per D7. This feature is lockfile-level path resolution only.
- `--project-dir` and `--lockfile` are independent flags per D13. Story must not conflate them.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §1.1, §3.6, §5.1–5.2
- Sprint: 3
