# Review Handoff: task-076 — F17-S1 Cross-Project Audit Command

## Status
Ready for review.

## Summary
Implements `trustlock audit --compare <dir1> <dir2> ...` — a new cross-project audit command that reads lockfiles from multiple project directories and produces a unified report of version drift, provenance inconsistency, and allowlist inconsistency.

## Files Changed

### Source
- `src/cli/args.js` — added `--compare: { type: 'boolean', default: false }` flag
- `src/cli/index.js` — imports `runCrossAudit` and dispatches to it when `args.values['compare']` is true
- `src/cli/commands/cross-audit.js` — new command handler (all comparison logic, output formatting)

### Tests
- `src/cli/commands/__tests__/cross-audit.test.js` — 24 unit tests for pure comparison functions
- `test/integration/cross-audit.test.js` — 17 integration tests with real fixture directories

## Verification Summary

All acceptance criteria PASS:

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC1 | Three report sections in stdout | PASS | Integration test `AC1+AC5+AC12` |
| AC2 | No loadPolicy import | PASS | `grep -r 'loadPolicy' src/cli/commands/cross-audit.js` → no matches |
| AC3 | fs.readFile for .trustlockrc.json, scripts.allowlist only | PASS | Code + AC13 test |
| AC4 | No baseline writes | PASS | `grep -r 'writeAndStage\|writeBaseline' src/cli/commands/cross-audit.js` → no matches |
| AC5 | Exit code 0 on success | PASS | Integration tests + smoke test |
| AC6 | < 2 dirs → error + exit 2 | PASS | Integration tests AC6 |
| AC7 | Dir not found → error + exit 2 | PASS | Integration test AC7 |
| AC8 | No lockfile → warning + skip + continues | PASS | Integration test AC8 |
| AC9 | npm + pnpm multi-format | PASS | Integration tests AC9 |
| AC10 | source.path entries excluded (C12) | PASS | Unit tests filterSourcePathEntries |
| AC11 | Packages in 1 dir not in drift section | PASS | Unit tests + integration test AC11 |
| AC12 | Clean sections show confirmation | PASS | Integration test AC1+AC5+AC12 |
| AC13 | Malformed extends no network call | PASS | Integration test AC3+AC13 |
| AC14 | Absolute and relative paths accepted | PASS | Integration tests AC14 |

## Test Results
- Unit tests: 24 pass, 0 fail (`node --test src/cli/commands/__tests__/cross-audit.test.js`)
- Integration tests: 17 pass, 0 fail (`node --test test/integration/cross-audit.test.js`)
- Anti-stub check: OK (`.burnish/check-no-stubs.sh`)
- grep AC2: no loadPolicy → PASS
- grep AC4: no writeAndStage/writeBaseline → PASS

## Design Decisions
See `docs/design-notes/F17-S1-approach.md` for full design rationale.

Key decisions:
1. `--compare` is a boolean flag; directories are positionals[1..n] after `audit`
2. Manual lockfile detection before calling `parseLockfile` to avoid `process.exit(2)` on missing/unsupported files — allows graceful skip-with-warning
3. Provenance data sourced from `.trustlock/baseline.json` (no registry calls)
4. `filterSourcePathEntries` implements C12 uv.lock path exclusion (no-op for currently supported formats)

## Notes for Reviewer
- The `computeProvenanceInconsistency` function intentionally excludes packages where either directory has "unknown" provenance — consistent with the story spec: "inconsistency requires same name but different versions where provenance state differs."
- Python/uv.lock support is not yet available; directories without npm or pnpm lockfiles are skipped with a warning (correct per F16 dependency note in the story).
