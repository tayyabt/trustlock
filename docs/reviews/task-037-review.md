# Review: task-037 — `dep-fence init` Command

## Status
Ready for review.

## Summary

Implements `dep-fence init` in `src/cli/commands/init.js`, replacing the 2-line stub from F08-S1
with full integration of all sprint 1 modules. The command creates `.depfencerc.json`,
`.dep-fence/` directory scaffold, and the initial trust baseline from the current lockfile.

## What Was Implemented

- **`src/cli/commands/init.js`**: Full implementation with:
  - D6 guard: exits 2 if `.dep-fence/` already exists
  - Lockfile detection: exits 2 if `package-lock.json` absent
  - Q1 guard: exits 2 on unknown lockfile version (v4+), inline check before any writes
  - Default and strict policy objects written to `.depfencerc.json`
  - Scaffold creation: `.dep-fence/` dir, `approvals.json` (`[]`), `.cache/` dir, `.gitignore` (`.cache/`)
  - `--no-baseline` flag: scaffold + config only, deferred audit message
  - Baseline creation: lockfile parsing → SHA-256 hash → `createBaseline` → per-package provenance
    via `registry.getAttestations` → `writeAndStage`
  - Provenance: `verified` (has SLSA attestations), `unverified` (no attestations), `null` (registry unreachable)
  - Summary message: `"Baselined N packages. Detected npm lockfile vX. Next: run 'dep-fence install-hook' ..."`
  - `_registryClient` + `_cwd` injection for test isolation

- **`test/unit/cli/init.test.js`**: 16 unit tests covering all 10 acceptance criteria plus
  provenance status paths and edge cases (empty lockfile, no-baseline with unknown version).

## Acceptance Criteria

| AC | Status |
|----|--------|
| AC1: `.depfencerc.json` with valid default policy | PASS |
| AC2: `.dep-fence/` scaffold (approvals.json, .cache/, .gitignore) | PASS |
| AC3: `baseline.json` with all packages trusted | PASS |
| AC4: Summary message with correct counts | PASS |
| AC5: Already initialized → exit 2 (D6) | PASS |
| AC6: No lockfile → exit 2 | PASS |
| AC7: Unknown lockfile version → exit 2 (Q1) | PASS |
| AC8: `--strict` creates stricter policy | PASS |
| AC9: `--no-baseline` scaffold only, no baseline.json | PASS |
| AC10: Registry unreachable → null provenance + warning | PASS |

## Test Results

```
node --test test/unit/cli/init.test.js
ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ duration_ms 305ms
```

## No Stubs

All sprint 1 module wiring is real:
- `parseLockfile` — real (F02 parser)
- `createRegistryClient` — real (F03 client, injectable for tests)
- `createBaseline` / `writeAndStage` — real (F04 manager)
- `approvals.json` — written directly as `[]` (F05 store's `writeApproval` requires it to exist)

## Deferred

- `install-hook` integration deferred to F08-S5 (per story)
- Full round-trip integration test (`init` → `check`) deferred to F08-S6

## Files Changed

- `src/cli/commands/init.js` — implementation
- `test/unit/cli/init.test.js` — new test file
- `docs/design-notes/F08-S4-approach.md` — design note
- `docs/reviews/task-037-review.md` — this file
