# Review: task-033 — Implement JSON Formatter (F07-S02)

## Outcome
Ready for review. All acceptance criteria pass.

## Summary
Implemented `src/output/json.js` — the machine-readable JSON formatter with two named exports:
- `formatCheckResults(results)` — `JSON.stringify(results, null, 2)`
- `formatAuditReport(report)` — `JSON.stringify(report, null, 2)`

Both functions are pure serialization with no imports, no business logic, no ANSI. `JSON.stringify` natively handles all unusual characters (scoped package names, quotes, backslashes, Unicode) per the JSON spec.

## Files Delivered
- `src/output/json.js` — new ES module, two named exports
- `test/output/json.test.js` — 13 tests, all pass

## Test Results
```
node --test test/output/json.test.js

▶ formatCheckResults (9 tests: all pass)
▶ formatAuditReport  (4 tests: all pass)

tests 13 | pass 13 | fail 0 | duration 90ms
```

## Acceptance Criteria
- [x] `formatCheckResults(results)` returns parseable JSON — PASS
- [x] Parsed output structurally identical to input — PASS
- [x] `formatCheckResults([])` returns `"[]"` — PASS
- [x] `formatAuditReport(report)` returns parseable JSON — PASS
- [x] `@scope/name`, slashes, special chars in package names — PASS
- [x] Quotes, backslashes, Unicode in messages — PASS
- [x] Unit tests: round-trip fidelity, empty results, unusual chars — PASS (13 tests)

## Integration Seam
CLI (`--json` flag routing, F08) is deferred. Seam is explicit: functions are named exports matching `terminal.js` signatures so the CLI can switch without restructuring.

## ADR Compliance
ADR-001 (zero runtime dependencies): `json.js` has no imports. Pure `JSON.stringify`.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Task: task-033
- Story: F07-S02
- Branch: burnish/task-033-implement-json-formatter
