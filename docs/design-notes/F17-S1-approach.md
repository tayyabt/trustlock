# Design Approach: F17-S1 Cross-Project Audit Command (`trustlock audit --compare`)

## Summary

Implements `trustlock audit --compare <dir1> <dir2> ...` as a new CLI command that reads lockfiles from multiple project directories and produces a unified report of version drift, provenance inconsistency, and allowlist inconsistency. The command is purely informational: no policy evaluation, no baseline modification, always exits 0.

The implementation adds a `--compare` boolean flag to `args.js`, routes to a new `cross-audit.js` handler in `index.js` when the flag is present, and implements all three comparison passes with real lockfile parsing via the existing `src/lockfile/parser.js` router.

## Key Design Decisions

1. **`--compare` as boolean flag, directories as positionals**: `node:util.parseArgs` does not support mixed positional-collecting after a named flag in the form `--compare dir1 dir2`. The smoke test `trustlock audit --compare packages/frontend packages/backend` works with a boolean `--compare` flag and `args.positionals.slice(1)` as the directory list. This matches the expected CLI UX and avoids repeating `--compare` per directory.

2. **Pre-flight lockfile detection before calling parseLockfile**: `parseLockfile` in `src/lockfile/parser.js` calls `process.exit(2)` on file-not-found and unsupported version. To allow skipping directories with missing/unsupported lockfiles, cross-audit manually stats candidate filenames (`package-lock.json`, `pnpm-lock.yaml`) before calling `parseLockfile`. For pnpm, `_parseLockfileVersion` is called first to pre-validate the version. This avoids invoking exit-prone code paths while still using the existing format-detection router for actual parsing.

3. **Provenance data from baseline**: Cross-audit has no registry access. Provenance status per package is read from `.trustlock/baseline.json` in each directory via `readBaseline`. If a baseline is absent or a package is not in it, provenance status defaults to `"unknown"` (excluded from inconsistency reporting unless both sides have a defined status that differs).

4. **No `loadPolicy` call**: `.trustlockrc.json` is read with `fs.readFile` directly. Only `scripts.allowlist` is extracted. The `loadPolicy` function from `src/policy/config.js` is never imported — verified by grep.

5. **`source.path` filter (uv.lock placeholder)**: The story requires filtering `source.path` entries from uv.lock (C12). Since uv.lock is not yet a supported format (not in candidate lockfile list), the filter is applied as a pre-processing step that removes `sourceType === 'file'` deps whose `resolved` path does not contain a protocol (local path references). For npm `file:` deps, the `resolved` field contains a `file:` protocol so they are not filtered. This makes the filter a no-op for currently supported formats but correctly handles future uv.lock support.

## Integration / Wiring

**Caller-side (owned by this story):**
- `src/cli/args.js`: adds `--compare` as `{ type: 'boolean', default: false }` to the global options object.
- `src/cli/index.js`: after dispatching `audit`, checks `args.values['compare']` — if true, imports and calls `runCrossAudit` from `cross-audit.js` instead of running `audit.js`.

**Callee-side (owned by this story):**
- `src/cli/commands/cross-audit.js`: new command handler. Imports `parseLockfile` from `../../lockfile/parser.js`, `_parseLockfileVersion` from `../../lockfile/pnpm.js`, `readBaseline` from `../../baseline/manager.js`. Reads `.trustlockrc.json` directly with `fs.readFile`. Formats output to stdout using inline ANSI helpers matching `src/output/terminal.js` conventions.

All wiring is completed in this story — no deferred integration.

## Files to Create/Modify

- `src/cli/args.js` — add `--compare: { type: 'boolean', default: false }` option
- `src/cli/index.js` — import `runCrossAudit` and branch on `args.values['compare']`
- `src/cli/commands/cross-audit.js` — new handler (comparison logic, formatting, output)
- `src/cli/commands/__tests__/cross-audit.test.js` — unit tests for comparison functions
- `test/integration/cross-audit.test.js` — integration tests with real fixture directories

## Testing Approach

**Unit tests** (`src/cli/commands/__tests__/cross-audit.test.js`):
- `computeVersionDrift`: packages in 1 dir only (no drift), same version (no drift), different versions (drift reported), ≥3 dirs with mixed versions
- `computeProvenanceInconsistency`: same version (no inconsistency), different versions same provenance (no inconsistency), different versions different provenance (inconsistency), unknown provenance (excluded)
- `computeAllowlistInconsistency`: identical allowlists (no inconsistency), subset/superset, disjoint
- `filterSourcePathEntries`: uv.lock path entries excluded, npm file: entries preserved

**Integration tests** (`test/integration/cross-audit.test.js`):
- Real fixture dirs (one npm `package-lock.json`, one pnpm `pnpm-lock.yaml`) — verifies all three sections appear
- `loadPolicy` not imported by cross-audit.js (grep check in test)
- source.path exclusion via fixture with a `file:` entry where resolved has no protocol
- Malformed `extends` in `.trustlockrc.json` — run completes without HTTP activity
- Single directory → error exit
- Missing directory → error exit  
- No lockfile dir → warning + skip + continues
- Packages only in one dir → not in version drift section
- Exit code 0 on success, even with drift

## Acceptance Criteria / Verification Mapping

- AC1: unified report three sections → Integration test verifies all three headers in stdout
- AC2: `cross-audit.js` does not import `loadPolicy` → `grep -r 'loadPolicy' src/cli/commands/cross-audit.js` no output
- AC3: `.trustlockrc.json` read via `fs.readFile`, only `scripts.allowlist` extracted → Code inspection + unit test with malformed `extends`
- AC4: no baseline modification → `grep -r 'writeAndStage\|writeBaseline' src/cli/commands/cross-audit.js` no output
- AC5: exit code always 0 → Integration test asserts `exitCode === 0`
- AC6: fewer than 2 dirs → unit/integration test for error message and non-zero exit
- AC7: directory not found → integration test for error message and non-zero exit
- AC8: no lockfile dir → integration test verifies warning on stderr and run continues
- AC9: multi-format (npm + pnpm) → integration test uses both formats
- AC10: source.path entries excluded → unit test for `filterSourcePathEntries`
- AC11: packages in only one dir not in drift → unit test for `computeVersionDrift`
- AC12: clean sections show confirmation → integration test checks for "No version drift detected. ✓"
- AC13: malformed `extends` no network call → integration test with fixture `.trustlockrc.json`
- AC14: absolute and relative paths accepted → integration test uses both path styles

## Verification Results

*(Updated after implementation)*

- AC1: unified report three sections → PASS — integration test passes
- AC2: loadPolicy not imported → PASS — `grep` finds no matches
- AC3: fs.readFile, scripts.allowlist only → PASS — code + unit test
- AC4: no baseline writes → PASS — `grep` finds no matches
- AC5: exit code 0 → PASS — integration test
- AC6: fewer than 2 dirs → PASS — unit + integration test
- AC7: directory not found → PASS — integration test
- AC8: no lockfile dir → PASS — integration test
- AC9: npm + pnpm multi-format → PASS — integration test
- AC10: source.path excluded → PASS — unit test
- AC11: only-one-dir packages not in drift → PASS — unit test
- AC12: clean section confirmation → PASS — integration test
- AC13: malformed extends no network → PASS — integration test
- AC14: absolute and relative paths → PASS — integration test

## Documentation Updates

None — no new env vars, interfaces, or setup steps.

## Deployment Impact

None — new subcommand; no breaking changes to existing commands.

## Questions/Concerns

- Provenance inconsistency without registry access is limited: if no baseline exists in a directory, provenance comparison for that directory defaults to "unknown" (excluded). This is the correct behavior per the PM assumption: baseline is the source of provenance data for cross-audit.
- Python lockfiles (uv.lock): not yet supported; directories with only `requirements.txt` or `uv.lock` will be skipped with a "no recognised lockfile" warning. This is correct per the F16 dependency note.

## Metadata

- Agent: developer
- Date: 2026-04-11
- Work Item: F17-S1 / task-076
- Work Type: story
- Branch: burnish/task-076-implement-cross-project-audit-command-trustlock-audit-compare
- ADR: ADR-001 (zero runtime dependencies), ADR-004 (lockfile parser architecture)
