# Review Handoff: task-059 — F09-S1 Monorepo Root Resolution

## Implementation Summary

All acceptance criteria are implemented and verified. The task introduces dual-root resolution
(`projectRoot` / `gitRoot`) across the entire trustlock CLI.

## What Was Built

### New Files
- `src/utils/paths.js` — `resolvePaths(options, { _cwd })` with real filesystem ancestor walk
- `test/unit/utils/paths.test.js` — 12 unit tests covering all 6 edge cases
- `test/integration/monorepo-init.test.js` — 2 integration tests
- `test/integration/monorepo-check.test.js` — 4 integration tests
- `test/integration/monorepo-install-hook.test.js` — 4 integration tests

### Modified Files
- `src/utils/git.js` — `gitAdd(filePath, { gitRoot })` now accepts explicit `gitRoot` parameter
- `src/cli/args.js` — added `--project-dir` string flag (NOT `--quiet`, `--sarif`, `--profile`)
- `src/baseline/manager.js` — `writeAndStage` accepts `{ gitRoot }` and forwards to `gitAdd`
- `src/cli/commands/init.js` — calls `resolvePaths()` first, passes `gitRoot` to `writeAndStage`
- `src/cli/commands/check.js` — calls `resolvePaths()` first, passes `gitRoot` to `_writeAndStage`
- `src/cli/commands/approve.js` — calls `resolvePaths()` first, uses `projectRoot` for all paths
- `src/cli/commands/audit.js` — calls `resolvePaths()` first, uses `projectRoot` for all paths
- `src/cli/commands/install-hook.js` — major overhaul: uses `resolvePaths()`, computes relative
  path from `gitRoot` to `projectRoot`, embeds `--project-dir` in hook script with proper quoting
- Updated unit tests for all five commands: added fake `.git/` to test setup

### Key Behaviors

1. **`resolvePaths(options, { _cwd })`**: Resolves `projectRoot` from `--project-dir` or cwd,
   validates it exists and is a directory, walks ancestor chain to find `.git/`, returns
   `{ projectRoot, gitRoot }` or throws with `{ exitCode: 2 }`.

2. **`install-hook` monorepo awareness**: Hook written to `gitRoot/.git/hooks/pre-commit`. When
   `projectRoot !== gitRoot`, embeds `trustlock check --project-dir '<relPath>'` using single
   quotes. Flat repos omit `--project-dir`. Paths with spaces are correctly single-quoted.

3. **`gitAdd` explicit cwd**: All `git add` operations now run with `cwd: gitRoot`, ensuring git
   staging is relative to the repo root regardless of which sub-package the user runs from.

## Verification

Full test suite: **586 tests pass, 0 failures**.

```
node --test test/unit/utils/paths.test.js     → 12/12 PASS
node --test test/unit/cli/args.test.js        → 16/16 PASS
node --test test/unit/cli/init.test.js        → 16/16 PASS
node --test test/unit/cli/check.test.js       → 14/14 PASS
node --test test/unit/cli/approve.test.js     → 14/14 PASS
node --test test/unit/cli/audit.test.js       → 10/10 PASS
node --test test/unit/cli/install-hook.test.js → 12/12 PASS
node --test test/integration/monorepo-init.test.js         → 2/2 PASS
node --test test/integration/monorepo-check.test.js        → 4/4 PASS
node --test test/integration/monorepo-install-hook.test.js → 4/4 PASS
node --test                                   → 586/586 PASS
```

## Review Focus Areas

1. **`paths.js` ancestor walk correctness** — verify the loop handles symlinks, network mounts, and
   the filesystem-root sentinel correctly on macOS/Linux.

2. **`install-hook.js` quoting** — verify `quoteShellPath` handles the `'\''` idiom correctly for
   paths containing single quotes (edge case not covered by tests since it's extremely rare in
   filesystem paths).

3. **`writeAndStage` backward compat** — `gitRoot` is optional; existing callers that don't pass it
   fall back to `process.cwd()` for git operations (same as pre-task behavior).

4. **`--project-dir` absolute path resolution** — uses `isAbsolute()` check + `resolve(cwd, path)`
   which correctly handles both absolute and relative inputs.

## No Blockers

All required acceptance criteria pass. Implementation is ready for review.
