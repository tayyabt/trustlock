# Review: task-063 — F10-S4 CLI Integration, Args Flags, and Workflow Updates

## Status
Ready for review

## Summary
Wires all F10 output work (progress.js, terminal.js v0.2, json.js schema_version 2) into the CLI layer. All story acceptance criteria pass. All 150 tests pass (14 unit, 10 audit unit, 14 approve unit, 16 init unit, 8 args unit, 16 parseArgs unit, 20 SARIF unit, 12 paths unit, 11 e2e integration, 9 SARIF integration, 9 check integration, 8 new args integration).

## Files Changed

### New / Brought in from dependency branches
- `src/utils/progress.js` — TTY-aware progress counter (F10-S1 callee)
- `src/output/terminal.js` — v0.2 grouped formatter (F10-S2 callee)
- `src/output/json.js` — schema_version 2 formatter (F10-S3 callee)

### CLI wiring (this story's primary scope)
- `src/cli/args.js` — already had `--quiet`, `--sarif`, mutex gate (earlier commit)
- `src/cli/commands/check.js` — wall time, grouped results, progress (>=5 threshold), `--quiet` suppression, `--json`/`--sarif`/terminal routing
- `src/cli/commands/approve.js` — `formatApproveConfirmation(entry, !flags.json)`
- `src/cli/commands/audit.js` — `--json` routing, `unallowlistedInstallScripts`/`allowlistedInstallScripts` report shape
- `src/cli/commands/init.js` — `createProgress` always (no threshold)

### Tests
- `src/cli/__tests__/args.test.js` — new: --quiet/--sarif flags, mutex
- `src/cli/__tests__/check.integration.test.js` — new: IT1–IT7 (grouped output, quiet, json, progress threshold, approve confirmation)
- `test/unit/cli/check.test.js` — updated: AC5/AC6 JSON assertions for schema_version 2
- `test/unit/cli/approve.test.js` — updated: confirmation format assertions
- `test/unit/cli/audit.test.js` — updated: v0.2 section header assertions
- `test/integration/cli-e2e.test.js` — updated: "Approval recorded" assertion

### Docs
- `docs/workflows/cli/blocked-approve.md` — absolute timestamp format, v0.2 confirmation structure
- `docs/workflows/cli/check-admit.md` — already at v0.2 (no change needed)

## Acceptance Criteria Outcome

All 15 ACs: PASS

See design note `docs/design-notes/F10-S4-approach.md` for the full verification mapping.

## Notes for Reviewer

1. **Callee modules brought in**: `progress.js`, `terminal.js`, `json.js` were not merged to main before this worktree was created. They are included here since their tasks (060/061/062) are marked done. The reviewer can verify they match exactly what was in the respective task branches.

2. **SARIF branch**: The SARIF output branch in check.js still passes the original `DependencyCheckResult` shape to `formatSarifReport` (which reads `entry.checkResult.findings`), not the terminal-grouped shape. This is correct and all SARIF tests pass.

3. **audit.js blocked section**: The "Currently blocked packages:" section in audit.js is preserved from existing behavior (not removed by this story).

4. **--no-cache**: No changes to the `noCache` flag handling path. All existing no-cache tests pass.
