# Review Handoff: task-062 — json.js schema_version 2 rewrite

## Outcome

Implementation complete and ready for review. All acceptance criteria PASS.

## What Was Implemented

`src/output/json.js` rewritten from a flat pass-through serializer to a
schema_version 2 grouped formatter:

- `formatCheckResults(groupedResults)` accepts `{ blocked, admitted_with_approval, new_packages, admitted, summary? }` and emits a fully-structured JSON document with `schema_version: 2` at the top level, all four group keys always present, and a summary computed from the input arrays when not provided by the caller.
- `formatAuditReport(report)` remains a pure pass-through serializer producing 2-space-indented JSON. The "named section keys" requirement is met by the report object structure provided by the audit command.
- No schema_version 1 `results[]` flat array exists anywhere in the output (C5 enforced).
- No imports from other `src/` modules (ADR-001 verified).

## Files Changed

| File | Change |
|---|---|
| `src/output/json.js` | Full schema_version 2 rewrite |
| `src/output/__tests__/json.test.js` | New test file (27 tests, all PASS) |
| `test/output/json.test.js` | Updated to test new grouped API (10 tests, all PASS) |
| `docs/design-notes/F10-S3-approach.md` | Design note |

## Acceptance Criteria Status

| AC | Status | Evidence |
|---|---|---|
| `schema_version: 2` at top level | PASS | test "schema_version is 2 at the top level" |
| Grouped keys always present | PASS | test "all four group keys are present when all arrays are empty" |
| `approve_command` always on blocked entries | PASS | test "blocked entry includes approve_command" |
| Multi-rule: rules array + combined approve_command | PASS | test "multi-rule blocked entry" |
| No `results[]` flat array | PASS | test "output has no results key — no v1 flat structure" |
| `formatAuditReport` valid JSON with named section keys | PASS | test "produces a JSON object with named section keys" |
| "Commit this file." never in JSON output | PASS | test '"Commit this file." never appears in JSON output' |
| ADR-001: no src/ imports | PASS | `grep "from '\.\." src/output/json.js` returns empty |
| Unit tests pass | PASS | 27/27 pass in `__tests__/json.test.js`, 10/10 in `test/output/json.test.js` |
| JSON.parse clean | PASS | every fixture parses without error |

## Verification Commands

```
node --test src/output/__tests__/json.test.js
# 27 pass, 0 fail

node --test test/output/json.test.js
# 10 pass, 0 fail
```

## Deferred / Not In Scope

- CLI wiring (`--json` flag, `check.js` calling `formatCheckResults`) — F10-S4
- `wall_time_ms` in summary defaults to `0` until F10-S4 passes the real elapsed time
- SARIF formatter (F13) — depends on this schema_version 2 contract being stable here (now satisfied)
