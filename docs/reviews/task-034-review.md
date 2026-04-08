# Review Handoff: task-034 — CLI Scaffolding: Entry Point, Router, and Argument Parser

## Status
Ready for review.

## Summary
All acceptance criteria pass. The CLI entry point, argument parser, command routing skeleton, and six command stubs are implemented. The `package.json` bin field is updated. Unit tests cover the full argument parsing surface.

## Deliverables

| File | Purpose |
|---|---|
| `src/cli/index.js` | Shebang entry point, command router, top-level error handler |
| `src/cli/args.js` | `parseArgs` wrapper with full flag schema (12 flags) |
| `src/cli/commands/init.js` | Stub — deferred to F08-S2 |
| `src/cli/commands/check.js` | Stub — deferred to F08-S2 |
| `src/cli/commands/approve.js` | Stub — deferred to F08-S3 |
| `src/cli/commands/audit.js` | Stub — deferred to F08-S4 |
| `src/cli/commands/clean.js` | Stub (handles `clean-approvals`) — deferred to F08-S4 |
| `src/cli/commands/install-hook.js` | Stub — deferred to F08-S5 |
| `package.json` | `bin` updated to `src/cli/index.js` |
| `test/unit/cli/args.test.js` | 12 unit tests for argument parsing |
| `test/smoke.test.js` | Updated bin assertion to match new path |

## Verification Results

- `node src/cli/index.js` → prints help, exit 2 ✓
- All 6 known commands → exit 0 ✓
- `node src/cli/index.js unknowncmd` → prints "Unknown command: ..." + exit 2 ✓
- Unhandled error path → exit 2 ✓
- `node --test test/unit/cli/args.test.js` → 12/12 PASS ✓
- `node --test 'test/**/*.test.js'` → 372/372 PASS ✓

## Notes for Reviewer

- `test/smoke.test.js` line 29 was updated from `src/index.js` to `src/cli/index.js` — this test was written before this story changed the bin field and needed to track the new entry point.
- `src/index.js` (old placeholder) is intentionally retained — it is still imported by `test/smoke.test.js` as an ES module import sanity check. It is no longer the bin entry point.
- Command stubs are documented in design note. They are intentional and match the final handler contract (`async function run(args)`).
