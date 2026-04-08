# Review: task-022 — Baseline Data Model, Read, and Create

## Status
Ready for review

## Outcome
All 7 acceptance criteria pass. 9 unit tests pass (0 fail). Full suite: 41/41 pass.

## Delivery Summary
- `src/baseline/manager.js` — new module implementing `createBaseline()` and `readBaseline()`
- `test/baseline/manager.test.js` — 9 unit tests covering all ACs plus edge cases

## Acceptance Criteria Checklist
- [x] `createBaseline()` returns Baseline with `schema_version: 1`, `created_at`, `lockfile_hash`, `packages` map
- [x] Each packages entry is a TrustProfile with all 6 fields: name, version, admittedAt, provenanceStatus, hasInstallScripts, sourceType
- [x] `readBaseline()` loads, parses, validates schema_version, returns Baseline
- [x] `readBaseline()` returns `{ error: "not_initialized" }` for missing file
- [x] `readBaseline()` returns `{ error: "corrupted" }` for invalid JSON
- [x] `readBaseline()` returns `{ error: "unsupported_schema", version: N }` for wrong schema_version
- [x] Unit tests cover: valid create, valid read round-trip, missing file, corrupted file, wrong schema_version, empty dependency list

## Verification
```
node --test test/baseline/manager.test.js
# 9 pass, 0 fail

node --test
# 41 pass, 0 fail
```

## Notes
- `provenanceStatus` always set to `"unknown"` at creation time — correct per story spec (caller passes `"unknown"` when registry data is unavailable at init time)
- Caller seam (CLI init command F08) is explicit via named exports; no wiring exists yet as specified
- No stubs; no external dependencies in this module
