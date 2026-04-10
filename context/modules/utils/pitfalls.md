# Module Pitfalls: Utils

## Known Pitfalls

1. **Unit tests must create a fake `.git/` directory**
   - Why it happens: After F09-S1, all commands call `resolvePaths()` which walks up the ancestor
     chain looking for `.git/`. Temp directories used in unit tests have no `.git/`, so
     `resolvePaths()` throws "not a git repository" unless the test creates one.
   - How to avoid it: In `beforeEach`, add `await mkdir(join(testDir, '.git'), { recursive: true })`.
     For commands that also call `_resolveGitCommonDir` (install-hook), inject a fake resolver:
     `_resolveGitCommonDir: (gitRoot) => join(gitRoot, '.git')`.
   - Files affected: all command unit tests under `test/unit/cli/`

2. **`--project-dir` relative paths are resolved relative to cwd, not the script's location**
   - Why it happens: `resolvePaths` uses `resolve(baseCwd, projectDir)` where `baseCwd` is
     `_cwd ?? process.cwd()`. The `_cwd` injection only applies when passed explicitly. In
     production, `process.cwd()` is used.
   - How to avoid it: Never assume `--project-dir relative/path` is resolved relative to the
     binary location. It is always cwd-relative.

3. **`git.js` functions other than `gitAdd` do not take `gitRoot`**
   - Why it happens: `getGitUserName()` reads global git config and does not need a repo cwd.
     `readHookFile`/`writeHookFile` work on absolute paths. Only `gitAdd` needs `gitRoot`.
   - How to avoid it: Do not add `gitRoot` to functions that don't exec git in a repo context.

4. **EC3 (no .git/ found) test reliability**
   - Why it happens: The "no .git/ anywhere" test creates a temp dir and relies on `/tmp` not
     being inside a git repository. On development machines where the repo is cloned under
     `/tmp`, this assumption breaks.
   - How to avoid it: If adding new no-.git tests, ensure the temp dir path is outside the
     project's git tree. The existing test uses a date-stamped subdir of `os.tmpdir()` which is
     safe in all standard environments.

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Module: utils
- Source: task-059 review (F09-S1 Monorepo Root Resolution)
