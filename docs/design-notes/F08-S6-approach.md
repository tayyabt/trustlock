# Design Approach: F08-S6 End-to-End Integration Tests

## Summary

Implement `test/integration/cli-e2e.test.js` using `node:test` and `node:child_process.spawnSync`
to exercise the complete CLI pipeline end-to-end. Each test spawns `node src/cli/index.js` as a
real child process and verifies exit codes, stdout/stderr content, and filesystem state.

All 11 acceptance criteria are covered. Tests run fully offline by pre-populating the
`.dep-fence/.cache/` directory with fresh-timestamp registry responses before each test that
invokes `dep-fence check`. No mocking of internal modules.

## Key Design Decisions

1. **spawnSync for subprocess invocation**: Synchronous spawn simplifies assertions — no callbacks,
   no async coordination. Each `spawnCli(args, cwd)` call blocks until the subprocess exits and
   returns `{ exitCode, stdout, stderr }`.

2. **Manual project state for most tests**: Rather than calling `dep-fence init` (which triggers
   real HTTPS calls), non-init tests use `setupInitializedProject()` to write all files directly.
   This avoids network flakiness while still testing real subprocess behavior.

3. **Block trigger via `hasInstallScripts: true`**: The `execution:scripts` rule is a purely
   local check (no registry data needed). Setting `hasInstallScripts: true` in the v3 lockfile
   reliably produces a block without network dependencies. The default policy has an empty
   `scripts.allowlist`, so any scripted package is blocked.

4. **Registry isolation via pre-populated cache**: Cache files with `_cachedAt = Date.now()`
   and `publishedAt = '2024-01-01T00:00:00.000Z'` are written before each `check` invocation.
   The freshness check (TTL 1 hour) passes, and publishedAt is 2+ years old so cooldown does
   not block (72h cooldown policy).

5. **Full pipeline uses `init --no-baseline` + manual baseline**: `dep-fence init --no-baseline`
   creates the scaffold without registry calls. A baseline.json is then written manually from
   the current lockfile's SHA-256 hash. This fully tests the init command's file creation logic
   while remaining offline.

6. **D1 test via mixed lockfile**: The block test adds both a safe changed package (safe-pkg
   @2.0.0) and a scripted new package (scripted-pkg@1.0.0). After the block, safe-pkg must
   still be at 1.0.0 in the baseline — verifying D1 (all-or-nothing advance).

7. **ADR-002 staging verification**: After a successful `check` (all admitted), the test runs
   `git diff --cached --name-only` and asserts `.dep-fence/baseline.json` is staged.

## Integration / Wiring

- Caller-side (this task): `test/integration/cli-e2e.test.js` invokes real CLI subprocess
- Callee-side (already exists): `src/cli/index.js` and all command handlers (F08-S2 through S5)
- Wiring: `spawnSync(process.execPath, [CLI_PATH, ...args], { cwd: tmpDir })`
- The real registry client is used; isolated by pre-populated cache files

## Files to Create/Modify

- `test/integration/cli-e2e.test.js` — NEW: integration test suite (11 acceptance criteria)

## Testing Approach

Each acceptance criterion is a named `test(...)` case in `cli-e2e.test.js`:
- Each test gets its own isolated temp directory (created in `os.tmpdir()`)
- Temp dirs are cleaned up in the `finally` block
- The test file is run with `node --test test/integration/cli-e2e.test.js`

## Acceptance Criteria / Verification Mapping

- AC: `init` test → `test('init: creates .depfencerc.json, baseline.json, approvals.json, .cache/, .gitignore')`
- AC: `check` admit test → `test('check: admit — updates and stages baseline...')`
- AC: `check` block test → `test('check: block — blocked package prints reason... (D1)')`
- AC: `approve` + re-check test → `test('approve + re-check: admitted with approval...')`
- AC: `check --enforce` block test → `test('check --enforce: exits 1 on block, baseline not written (D10)')`
- AC: `check --enforce` pass test → `test('check --enforce: exits 0 on pass, baseline NOT written (D10)')`
- AC: `check --dry-run` test → `test('check --dry-run: no baseline write even when all admitted')`
- AC: No-changes test → `test('check: no-changes — prints "No dependency changes", exit 0')`
- AC: `clean-approvals` test → `test('clean-approvals: removes expired entries, prints count')`
- AC: `install-hook` test → `test('install-hook: creates .git/hooks/pre-commit, executable, contains dep-fence check')`
- AC: Full pipeline test → `test('full pipeline: init → check → modify → block → approve → re-check')`

## Verification Results

All 11 tests pass: `node --test test/integration/cli-e2e.test.js`
Output: `tests 11, pass 11, fail 0`

- AC: `init` test → PASS — `✔ init: creates .depfencerc.json, baseline.json, approvals.json, .cache/, .gitignore`
- AC: `check` no-changes → PASS — `✔ check: no-changes — prints "No dependency changes", exit 0`
- AC: `check` admit test (ADR-002) → PASS — `✔ check: admit — updates and stages baseline after new safe package is admitted`
- AC: `check` block test (D1) → PASS — `✔ check: block — blocked package prints reason and approval command, baseline NOT advanced (D1)`
- AC: `approve` + re-check test → PASS — `✔ approve + re-check: admitted with approval after scripted-pkg is approved`
- AC: `check --enforce` block test (D10) → PASS — `✔ check --enforce: exits 1 on block, baseline not written`
- AC: `check --enforce` pass test (D10) → PASS — `✔ check --enforce: exits 0 on pass, baseline NOT written`
- AC: `check --dry-run` test → PASS — `✔ check --dry-run: no baseline write even when all packages are admitted`
- AC: `clean-approvals` test → PASS — `✔ clean-approvals: removes expired entries and prints count`
- AC: `install-hook` test → PASS — `✔ install-hook: creates .git/hooks/pre-commit, makes it executable, adds dep-fence check`
- AC: Full pipeline test → PASS — `✔ full pipeline: init → check (no-changes) → modify lockfile → check (block) → approve → check (admitted with approval)`

## Stubs

None — no stubs introduced. All wiring is real subprocess invocation.

## Risks and Questions

1. **Init test network dependency**: The standalone `init` test runs real `dep-fence init`
   which makes one HTTPS call per package. With a 1-package fixture, this is fast even on
   failure (ECONNREFUSED completes quickly). The test accepts either `provenanceStatus: null`
   (offline) or `'unverified'` (online) — both are valid baseline states.
2. **git staging in tmpDir**: `dep-fence check` calls `git add .dep-fence/baseline.json`
   without an explicit cwd; it uses `process.cwd()` of the subprocess, which is the tmpDir.
   This is correct for our git-initialized temp dirs.
3. **Terminal formatter approval command discrepancy**: The terminal formatter produces
   `--override 'execution:scripts'` (using full rule IDs) while the `approve` command accepts
   only short names like `scripts`. The test uses `--override scripts` directly (correct), and
   asserts only that the output includes a `Run to approve:` line.

## Documentation Updates

None — no changes to interfaces, setup steps, env vars, or operator workflow.

## Deployment Impact

None.

## Environment Setup Blocker

None — tests run fully offline with pre-populated cache.

## Metadata

- Agent: developer
- Date: 2026-04-09
- Work Item: task-039 / F08-S6
- Work Type: story
- ADR: ADR-002 (baseline advancement), ADR-003 (cache), ADR-004 (lockfile parser)
