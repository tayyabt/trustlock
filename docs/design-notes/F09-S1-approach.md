# Design Approach: task-059 — F09-S1 Monorepo Root Resolution

## Summary

Introduce `src/utils/paths.js` to decouple `projectRoot` (cwd or `--project-dir`) from `gitRoot`
(walked up from projectRoot). Modify `git.js:gitAdd` to accept an explicit `gitRoot` parameter.
Update `baseline/manager.js:writeAndStage` to accept and forward `gitRoot`. Add `--project-dir`
flag to `args.js`. Update all five command callers to call `resolvePaths()` as their first step.
Overhaul `install-hook.js` to write the hook to `gitRoot/.git/hooks/pre-commit` and embed
`--project-dir <relPath>` in the hook script when `projectRoot !== gitRoot`.

## Key Design Decisions

1. **`resolvePaths` accepts `{ _cwd }` for test injection**: Commands pass their injected `_cwd`
   through to `resolvePaths`. This keeps the existing `_cwd` test-injection pattern working
   while adding real gitRoot resolution. Tests that previously relied on `_cwd` now also need a
   fake `.git/` dir in the temp directory so `resolvePaths` can complete the ancestor walk.

2. **`gitAdd` gains `{ gitRoot }` option, backward compatible**: `gitAdd(filePath, { gitRoot })`
   passes `cwd: gitRoot` to git. When `gitRoot` is undefined (e.g., existing test mocks that
   skip gitAdd), git falls back to process.cwd() — existing behavior unchanged.

3. **`writeAndStage` gains `gitRoot` parameter**: Flows from command callers through
   `writeAndStage` to `gitAdd`. Only init.js and check.js call `writeAndStage`.

4. **`install-hook.js` keeps `resolveGitCommonDir` for worktree support**: Uses it to get the
   actual git common dir (handles worktrees where `.git` is a file). Fixed to return an absolute
   path (join with `gitRoot`). The explicit `.git` existence check is removed — `resolvePaths`
   already validates this.

5. **Hook line is dynamic**: When `projectRoot === gitRoot`, hook is `trustlock check`. When
   `projectRoot !== gitRoot`, hook is `trustlock check --project-dir '<relPath>'`. Single-quoted
   for shell safety; embedded single quotes handled via `'\''` escape.

6. **"Already installed" detection stays on `'trustlock check'` substring**: Avoids
   double-installation regardless of whether the existing hook has a `--project-dir` flag or not.

## Integration / Wiring

- **Callee-side created here**: `paths.js` is new; all five command callers wire to it in this story.
- **Callee-side modified here**: `git.js:gitAdd` — callers (commands via `writeAndStage`) pass `gitRoot`.
- **`baseline/manager.js:writeAndStage`** — intermediate bridge; gains `gitRoot` param and forwards to `gitAdd`.
- **No deferred sides**: All callers ship in this story per feature brief.

## Files to Create/Modify

- `src/utils/paths.js` (NEW) — `resolvePaths(options, { _cwd })` function
- `src/utils/git.js` — add `{ gitRoot }` param to `gitAdd`
- `src/cli/args.js` — add `--project-dir` string flag
- `src/baseline/manager.js` — add `gitRoot` to `writeAndStage` signature
- `src/cli/commands/init.js` — call `resolvePaths`, pass `gitRoot` to `writeAndStage`
- `src/cli/commands/check.js` — call `resolvePaths`, pass `gitRoot` to `_writeAndStage`
- `src/cli/commands/approve.js` — call `resolvePaths`, use `projectRoot` for all paths
- `src/cli/commands/audit.js` — call `resolvePaths`, use `projectRoot` for all paths
- `src/cli/commands/install-hook.js` — major overhaul (hook to gitRoot, embed --project-dir)
- `test/unit/utils/paths.test.js` (NEW) — all edge cases from story
- `test/unit/cli/args.test.js` — add `--project-dir` tests, verify `--profile` absent
- `test/unit/cli/init.test.js` — add `.git/` to beforeEach for resolvePaths
- `test/unit/cli/check.test.js` — add `.git/` to temp dir setup
- `test/unit/cli/approve.test.js` — add `.git/` to temp dir setup
- `test/unit/cli/audit.test.js` — add `.git/` to temp dir setup
- `test/unit/cli/install-hook.test.js` — update AC5 message, add monorepo+spaces tests
- `test/integration/monorepo-init.test.js` (NEW)
- `test/integration/monorepo-check.test.js` (NEW)
- `test/integration/monorepo-install-hook.test.js` (NEW)

## Testing Approach

- Unit tests for `paths.js` cover all 6 edge cases: flat repo, .git two levels up, no .git,
  absolute --project-dir, relative --project-dir, non-existent --project-dir.
- Existing command unit tests are updated to create fake `.git/` dirs so `resolvePaths` resolves.
- Integration tests create real temp monorepo structures with sub-packages.
- `args.test.js` verifies `--project-dir` and `--lockfile` parse, and `--profile` is absent.

## Acceptance Criteria / Verification Mapping

| AC | Test |
|---|---|
| `init` from `packages/backend/` — `.trustlock/` in sub-package | integration/monorepo-init |
| `check` from sub-package — baseline staged using `gitRoot` | integration/monorepo-check |
| `install-hook` from sub-package — hook at `gitRoot/.git/hooks/` with `--project-dir` | integration/monorepo-install-hook |
| No `.git/` in any ancestor — exit 2 | unit/utils/paths (edge case 3) |
| `--project-dir` overrides project root | unit/utils/paths (edge cases 5, 6) |
| `--lockfile` overrides lockfile path only | unit/cli/check (--lockfile tests) |
| `git.js` accepts explicit `gitRoot` | unit/utils/paths via integration |
| All five command handlers call `resolvePaths()` | all command unit tests |
| `--project-dir` non-existent — exit 2 | unit/utils/paths (edge case 4) |
| `--project-dir` absolute/relative resolved correctly | unit/utils/paths (edge cases 5, 6) |
| `install-hook` spaces in path — quoted correctly | integration/monorepo-install-hook (spaces case) |
| `install-hook` flat repo — `--project-dir` omitted | unit/cli/install-hook |
| Multiple `init` from different sub-packages — no collision | integration/monorepo-init |
| `args.js` adds `--project-dir` and `--lockfile`, NOT `--quiet/--sarif/--profile` | unit/cli/args |
| Unit tests for `paths.js` cover all 6 scenarios | unit/utils/paths |

## Stubs

None. All implementation is real:
- `paths.js` is a real filesystem walk.
- `git.js` modification is real (explicit `cwd` parameter).
- All five command callers actually call `resolvePaths()`.
- `install-hook` computes real relative path and embeds it.

## Verification Results

- [x] `node --test test/unit/utils/paths.test.js` — PASS (12/12)
- [x] `node --test test/unit/cli/args.test.js` — PASS (16/16 incl. --project-dir and --profile absent)
- [x] `node --test test/unit/cli/init.test.js` — PASS (16/16)
- [x] `node --test test/unit/cli/check.test.js` — PASS (14/14)
- [x] `node --test test/unit/cli/approve.test.js` — PASS (14/14)
- [x] `node --test test/unit/cli/audit.test.js` — PASS (10/10)
- [x] `node --test test/unit/cli/install-hook.test.js` — PASS (12/12 incl. monorepo+spaces)
- [x] `node --test test/integration/monorepo-init.test.js` — PASS (2/2)
- [x] `node --test test/integration/monorepo-check.test.js` — PASS (4/4)
- [x] `node --test test/integration/monorepo-install-hook.test.js` — PASS (4/4)
- [x] `node --test` (full suite) — PASS (586/586, 0 fail)

### AC-level verification

| AC | Status | Evidence |
|---|---|---|
| `init` from sub-package — `.trustlock/` in sub-package | PASS | monorepo-init AC1 |
| `check` from sub-package — baseline uses `gitRoot` | PASS | monorepo-check AC2b |
| `install-hook` from sub-package — hook at `gitRoot` with `--project-dir` | PASS | monorepo-install-hook AC3 |
| No `.git/` — exit 2 with error message | PASS | paths.test EC3 |
| `--project-dir` overrides project root | PASS | paths.test EC5/EC6 + monorepo-check AC5 |
| `--lockfile` overrides lockfile path relative to projectRoot | PASS | monorepo-check AC6 |
| `git.js` accepts explicit `gitRoot` | PASS | monorepo-check AC2b (gitRoot forwarded) |
| All five command handlers call `resolvePaths()` | PASS | all command tests run with fake .git/ |
| `--project-dir` non-existent — exit 2 | PASS | paths.test EC4 |
| `--project-dir` absolute resolved as-is | PASS | paths.test EC5 |
| `--project-dir` relative resolved relative to cwd | PASS | paths.test EC6 |
| `install-hook` spaces in path — single-quoted | PASS | install-hook.test (spaces) + integration AC8 |
| `install-hook` flat repo — no `--project-dir` | PASS | install-hook.test flat + integration AC9 |
| Multiple `init` from different sub-packages — no collision | PASS | monorepo-init AC10 |
| `args.js` adds `--project-dir` and `--lockfile`, NOT `--profile` | PASS | args.test |
| Unit tests for `paths.js` cover all 6 scenarios | PASS | paths.test 12 tests |
