# Review Artifact: task-068 — Implement SARIF CLI Wiring (`check.js` integration)

## Status
Ready for review.

## Summary
Implemented F13-S2: wired `src/cli/commands/check.js` to invoke `formatSarifReport` when `--sarif` is passed, resolved `--quiet --sarif` interaction (G-NEW-2), added `--sarif` and `--quiet` flags to `args.js` with `--json`/`--sarif` mutex, added `getRelativePath` to `paths.js`, and created the `src/output/sarif.js` formatter (F13-S1 work absorbed because task-067 was not yet complete).

## Files Changed

| File | Change |
|---|---|
| `src/utils/paths.js` | Added `getRelativePath(absolutePath, projectRoot)` export |
| `src/cli/args.js` | Added `--sarif` and `--quiet` boolean flags; added `--json`/`--sarif` mutual exclusion guard (exits 2 with error message) |
| `src/output/sarif.js` | New file — SARIF 2.1.0 formatter; `formatSarifReport(groupedResults, lockfileUri) → string`; 8 static driver rules; maps qualified rule names to SARIF short IDs |
| `src/cli/commands/check.js` | Imported `formatSarifReport` and `getRelativePath`; extracted `sarif` and `quiet` from args; computed `lockfileUri` via `getRelativePath`; added SARIF output branch in step 11 |
| `test/unit/output/sarif.test.js` | New file — 20 unit tests covering formatter contract |
| `test/integration/check.sarif.test.js` | New file — 9 integration tests covering all behavioral rules |

## Dependency Gap Absorbed

F13-S1 (`sarif.js` formatter, task-067) and F10-S4 (`--sarif`/`--quiet` flags in args.js, task-063) were prerequisites that had not landed. Since the anti-stub rule prohibits stubbing `formatSarifReport` and the story cannot be AC-complete without them, both were implemented in full per their story specs. The `getRelativePath` function was also missing from `paths.js` (task-059 delivered `resolvePaths` but not `getRelativePath`).

## Verification

- **Unit tests**: `node --test test/unit/output/sarif.test.js` → 20 pass, 0 fail
- **Integration tests**: `node --test test/integration/check.sarif.test.js` → 9 pass, 0 fail
- **Full suite**: `node --test` → 649 pass, 0 fail
- **Anti-stub check**: `.burnish/check-no-stubs.sh` → OK

## Acceptance Criteria Result

All 11 acceptance criteria from the F13-S2 story: **PASS**.

See `docs/design-notes/F13-S2-approach.md` for full AC-to-verification mapping.
