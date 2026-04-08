# Design Approach: task-037 — `dep-fence init` Command

## Summary

Implements `dep-fence init` by replacing the stub in `src/cli/commands/init.js` with full
integration of all sprint 1 modules: lockfile parser (F02), registry client (F03), baseline
manager (F04), and approvals store (F05). The command orchestrates a linear flow — guards
first (nothing written until all checks pass), then scaffold creation, then optional baseline
build from lockfile + registry provenance.

The init command is the entry point that gates all subsequent dep-fence usage. It must succeed
cleanly or fail with actionable messages; partial writes are prevented by ordering guards before
all writes.

## Key Design Decisions

1. **Guards before writes**: All exit-2 conditions (D6: `.dep-fence/` exists, no lockfile,
   unknown lockfile version) are checked before any file is written to disk. This prevents
   partial initialization state.

2. **Inline lockfile version check**: `init.js` performs its own lockfile version validation
   (SUPPORTED_NPM_VERSIONS = {1,2,3}) before calling `parseLockfile`. This is necessary for
   testability — the parser calls `process.exit(2)` which terminates the test process, but
   `init.js` uses `process.exitCode = 2; return` which allows test assertions. After the inline
   check passes, `parseLockfile` will never encounter an unknown version.

3. **Provenance status during init**: `createBaseline` sets all entries to `provenanceStatus:
   'unknown'`. After creating the baseline object, `init.js` calls `registry.getAttestations`
   per package to update to `'verified'` (has SLSA attestations), `'unverified'` (404 — no
   attestations), or `null` (registry unreachable — per story requirement). Warnings are printed
   to stderr per package when registry is unreachable.

4. **Registry client injection**: `run(args, { _registryClient, _cwd })` accepts injectable
   dependencies to enable unit testing without real network calls or real working directories.
   This follows the pattern established by other commands (approve.js uses `_cwd`).

5. **`--no-baseline`**: When present, skips lockfile reading/parsing entirely (after checking
   the file exists). Prints the deferred audit message. Lockfile version validation is also
   skipped (not needed without parsing).

6. **`.dep-fence/.gitignore` content**: D8 requires `.dep-fence/.cache/` to be gitignored.
   The `.gitignore` inside `.dep-fence/` contains `.cache/` (relative path).

7. **Strict policy**: Sets `cooldown_hours: 24` (vs 72), `pinning.required: true`,
   `provenance.required_for: ['*']` (all packages), `transitive.max_new: 3` (vs 5).

## Integration / Wiring

- **Caller-side**: `src/cli/index.js` already routes `init` to `commands/init.js` (stub from F08-S1).
  This story replaces the stub — no changes to `index.js` needed. ✓
- **Callee-side** (all wired in this story):
  - `parseLockfile(lockfilePath, packageJsonPath)` from `src/lockfile/parser.js`
  - `createRegistryClient({ cacheDir })` from `src/registry/client.js` → `getAttestations`
  - `createBaseline(deps, hash)` + `writeAndStage(baseline, path)` from `src/baseline/manager.js`
  - `approvals.json` initialized directly (no `createEmptyStore()` needed — store has no such export;
    `writeApproval` throws ENOENT if missing, so we write `[]` directly)
- **Deferred**: `install-hook` deferred to F08-S5. Full round-trip integration test deferred to F08-S6.

## Files to Create/Modify

- `src/cli/commands/init.js` — full implementation (replaces 2-line stub)
- `test/unit/cli/init.test.js` — new test file covering all 10 ACs

## Testing Approach

Unit tests in `test/unit/cli/init.test.js` using `node:test`:
- Real temp directories for file I/O (no mocking of fs)
- Injected mock registry client (`_registryClient`) for provenance tests
- `_cwd` injection to isolate from real project state
- `process.exitCode` reset to `undefined` in `afterEach`
- `process.stdout.write` / `process.stderr.write` captured per test

## Acceptance Criteria / Verification Mapping

| AC | Test | Method |
|----|------|--------|
| AC1: creates `.depfencerc.json` with valid default policy | `creates .depfencerc.json with default policy` | File read + JSON parse |
| AC2: creates `.dep-fence/` with `approvals.json`, `.cache/`, `.gitignore` | `creates .dep-fence/ scaffold` | File stat + content check |
| AC3: creates `baseline.json` with all packages trusted | `creates baseline.json with trusted packages` | File read + JSON parse |
| AC4: prints "Baselined N packages" with correct count | `prints summary with correct package count` | stdout capture |
| AC5: already initialized → exit 2 + D6 message | `exits 2 if .dep-fence/ already exists` | exitCode + stderr |
| AC6: no lockfile → exit 2 + message | `exits 2 if no lockfile found` | exitCode + stderr |
| AC7: unknown lockfile version → exit 2 | `exits 2 on unknown lockfile version` | exitCode + stderr |
| AC8: `--strict` creates stricter policy | `--strict creates stricter .depfencerc.json` | File read + JSON parse |
| AC9: `--no-baseline` creates scaffold but not `baseline.json` | `--no-baseline creates scaffold but skips baseline` | File stat (absent) |
| AC10: registry unreachable → null provenance + warning | `registry unreachable sets null provenance and warns` | baseline.json + stderr |

## Risks and Questions

- **writeAndStage calls gitAdd**: During tests, `writeAndStage` will attempt to call `gitAdd`
  which runs `git add .dep-fence/baseline.json`. In temp directories, this won't be a git repo,
  so it'll print a warning to stderr. This is acceptable test noise — the test suite captures
  stderr per test so we can filter or ignore the warning. Alternatively the test can mock
  `writeAndStage` via injection... but looking at baseline manager, `writeAndStage` accepts
  `{ _gitAdd }` only as a third arg, not injectable from `run`. The warning doesn't fail the
  test; it's just noise. This is documented here.

## Stubs

No internal stubs. All sprint 1 module wiring is real. Registry client uses real HTTP in
production; injectable in tests.

## Verification Results

All 16 unit tests pass. Run: `node --test test/unit/cli/init.test.js`
Result: `ℹ tests 16 | ℹ pass 16 | ℹ fail 0`

| AC | Result | Evidence |
|----|--------|----------|
| AC1: `.depfencerc.json` default policy | PASS | `creates .depfencerc.json with default policy` — reads + parses policy, asserts all fields |
| AC2: `.dep-fence/` scaffold | PASS | `creates .dep-fence/ scaffold with approvals.json, .cache/, and .gitignore` |
| AC3: `baseline.json` trusted packages | PASS | `creates baseline.json with all current packages` |
| AC4: summary message | PASS | `prints summary with correct package count and lockfile version` |
| AC5: already initialized exit 2 | PASS | `exits 2 with "already initialized" message when .dep-fence/ exists (D6)` |
| AC6: no lockfile exit 2 | PASS | `exits 2 with "No lockfile found" when package-lock.json is absent` |
| AC7: unknown version exit 2 | PASS | `exits 2 on unknown lockfile version (Q1)` + missing field test |
| AC8: `--strict` policy | PASS | `--strict creates .depfencerc.json with stricter policy thresholds` |
| AC9: `--no-baseline` scaffold only | PASS | `--no-baseline creates scaffold and config but not baseline.json` |
| AC10: registry unreachable | PASS | `registry unreachable sets provenanceStatus to null and prints warning per package` |
