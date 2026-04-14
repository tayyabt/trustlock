# Module Guidance: Utils

## Dual-Root Resolution Pattern (paths.js)

All commands must call `resolvePaths(args.values, { _cwd })` as their **first step** before
any file I/O or git operation.

`resolvePaths` returns `{ projectRoot, gitRoot }`:
- `projectRoot` — where `.trustlockrc.json`, `.trustlock/`, and lockfiles live (from `--project-dir` or cwd)
- `gitRoot` — the repository root containing `.git/` (found by ancestor walk from projectRoot)

File operations use `projectRoot`. Git operations use `gitRoot`.

### Contract

```js
// In any command handler:
let projectRoot, gitRoot;
try {
  ({ projectRoot, gitRoot } = await resolvePaths(args.values, { _cwd }));
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 2;
  return;
}
```

Errors thrown by `resolvePaths` always have `{ exitCode: 2 }`.

### `gitAdd` explicit gitRoot

`gitAdd(filePath, { gitRoot })` passes `cwd: gitRoot` to git. Always pass the resolved
`gitRoot` so staging is relative to the repository root regardless of cwd.

### `writeAndStage` gitRoot forwarding

`writeAndStage(baseline, baselinePath, { gitRoot })` — pass `gitRoot` from the command caller.
This flows through to `gitAdd`. If omitted, git falls back to `process.cwd()`.

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Module: utils
- Source: task-059 review (F09-S1 Monorepo Root Resolution)
