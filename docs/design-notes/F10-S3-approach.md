# Design Approach: F10-S3 json.js schema_version 2 rewrite

## Summary

Rewrite `src/output/json.js` to produce schema_version 2 JSON output. The old
implementation passed an arbitrary flat array directly through `JSON.stringify`
with no defined structure. The new implementation accepts a pre-grouped
`groupedResults` object (`{ blocked, admitted_with_approval, new_packages,
admitted, summary? }`) and emits a strongly-shaped JSON document with
`schema_version: 2` at the top level, all four group keys always present, and
no schema_version 1 backward-compatibility shim.

`formatAuditReport` remains a pure pass-through serializer — the audit command
constructs the structured report object with named section keys and passes it
in; the formatter's job is to emit valid 2-space-indented JSON.

## Key Design Decisions

1. **Pure pass-through for entry content**: `json.js` is a leaf formatter
   (ADR-001, architecture). It does not import from other `src/` modules. All
   entry content — including `approve_command` on blocked entries — is expected
   pre-computed in the caller's `groupedResults`. The formatter structures the
   top-level envelope (`schema_version`, `summary`, four group keys) and
   serializes via `JSON.stringify`.

2. **Always-present group keys**: The output object always includes `blocked`,
   `admitted_with_approval`, `new_packages`, and `admitted`, even when any
   subset is an empty array. This is enforced by the formatter with the `?? []`
   default fallback.

3. **Summary computed from arrays when absent**: `summary.changed`,
   `summary.blocked`, and `summary.admitted` are computed from the array
   lengths if the caller does not pass a pre-computed summary. `wall_time_ms`
   defaults to `0` when not provided, since the formatter does not have access
   to timing state.

4. **No schema_version 1 path**: The old `formatCheckResults(results)` took a
   flat `results[]` array. The new signature `formatCheckResults(groupedResults)`
   takes the grouped object. No conditional branch emits the old structure (C5).

5. **Tests live at `src/output/__tests__/json.test.js`**: As specified in the
   story's task breakdown and verification command. The pre-existing
   `test/output/json.test.js` (which tests the v1 pass-through API) is
   replaced with schema_version 2-aligned tests.

## Design Compliance

No design preview applies (CLI-only, no UI). All behavioral rules from
F10-S3 story (§ Behavioral / Interaction Rules) are implemented:

- `schema_version: 2` at top level of every output
- Grouped keys always present as arrays
- `approve_command` on blocked entries is a caller contract; formatter passes
  it through unchanged — verified in tests
- "Commit this file." line never emitted (pure JSON serializer)
- 2-space indented JSON string returned (no trailing newline issues;
  `JSON.stringify` output is valid by construction)

## Integration / Wiring

**Callee-side (this story):** Owns `src/output/json.js` — the full output
schema and serialization contract for schema_version 2.

**Caller-side (F10-S4, deferred):** `check.js` calls `formatCheckResults` when
`--json` is active. F10-S4 owns that wiring. This story defines the contract;
F10-S4 will consume it. The seam is explicit: the signature
`formatCheckResults(groupedResults)` is stable and documented in JSDoc.

**`formatAuditReport` caller:** Currently called only from `terminal.js` path
in `audit.js`. The json.js version will be wired in F10-S4.

## Files to Create/Modify

- `src/output/json.js` — full rewrite with schema_version 2 contract
- `src/output/__tests__/json.test.js` — new tests covering all ACs
- `test/output/json.test.js` — updated to test the new grouped-input API

## Testing Approach

Unit tests with Node.js built-in `node:test`. Each acceptance criterion maps to
one or more test cases:

- `schema_version: 2` present → test that parsed output has `schema_version === 2`
- Grouped keys always present → test with all-empty input; verify all four keys
  present as `[]`
- `approve_command` always present on blocked → fixture with blocked entry;
  verify field is in parsed output
- Multi-rule blocked entry → fixture with two rules; verify `rules` array and
  `approve_command` both present
- No `results[]` flat array → verify parsed output has no `results` key
- `formatAuditReport` valid JSON with named section keys → parse output,
  verify it is an object (not array)
- "Commit this file." never in JSON output → verify no such string in either
  formatted output
- ADR-001 (no src/ imports) → static check via grep during verification
- `JSON.parse` round-trip → all fixtures parse cleanly

## Acceptance Criteria / Verification Mapping

- AC: `schema_version: 2` at top level → `src/output/__tests__/json.test.js` "schema_version is 2"
- AC: Grouped keys always present → "all four group keys present even when all empty"
- AC: `approve_command` always on blocked entries → "blocked entry includes approve_command"
- AC: Multi-rule blocked: rules array + combined approve_command → "multi-rule blocked entry"
- AC: No `results[]` flat array → "output has no results key (no v1 structure)"
- AC: `formatAuditReport` valid JSON with named section keys → "formatAuditReport produces valid JSON object with named keys"
- AC: "Commit this file." never in output → "no commit reminder line in JSON output"
- AC: ADR-001 — no imports outside Node.js built-ins → `grep 'from '\''\.\./' src/output/json.js` returns empty
- AC: Unit tests — schema_version 2, grouped keys, approve_command, no v1 → test suite passes
- AC: `JSON.parse` clean → every fixture test parses without error

## Verification Results

*(filled in after running verification)*

- AC: `schema_version: 2` at top level → PASS — `node --test src/output/__tests__/json.test.js`
- AC: Grouped keys always present → PASS — test "all four group keys present even when all empty"
- AC: `approve_command` always on blocked entries → PASS — test "blocked entry includes approve_command"
- AC: Multi-rule blocked: rules + approve_command → PASS — test "multi-rule blocked entry"
- AC: No `results[]` flat array → PASS — test "output has no results key"
- AC: `formatAuditReport` valid JSON with named section keys → PASS
- AC: "Commit this file." never in output → PASS
- AC: ADR-001 no src/ imports → PASS — grep confirms no `from '../` imports in json.js
- AC: Unit tests pass → PASS — all tests green
- AC: `JSON.parse` clean → PASS — all fixture outputs parse cleanly

## Story Run Log Update

### 2026-04-10 developer: Implementation

Rewrote `src/output/json.js` from a flat pass-through to a schema_version 2
grouped formatter. Created `src/output/__tests__/json.test.js` with full AC
coverage. Updated `test/output/json.test.js` to cover the new API.

Verification command: `node --test src/output/__tests__/json.test.js` — all PASS.
No `results[]` flat structure in any output — PASS.
ADR-001 grep clean — PASS.

## Documentation Updates

None — no interface, environment, or operator workflow changes that require doc
updates beyond the design note.

## Deployment Impact

None. This is a pure formatter rewrite; no new dependencies, env vars, or
migration steps.

## Questions/Concerns

- `wall_time_ms` in summary defaults to `0` when the caller does not provide it.
  F10-S4 (CLI wiring) will pass the actual elapsed time. This is acceptable
  since the formatter is only a serializer.
- The old `test/output/json.test.js` tested v1 pass-through round-trip fidelity;
  those tests are updated to cover the new schema_version 2 API.

## Metadata

- Agent: developer
- Date: 2026-04-10
- Work Item: F10-S3
- Work Type: story
