# Design Approach: F07-S02 JSON Formatter

## Summary
Implement `src/output/json.js` — the machine-readable JSON formatter that serializes `CheckResult[]` and audit report objects to JSON strings. Both public functions delegate entirely to `JSON.stringify(value, null, 2)`, which natively handles all unusual characters (quotes, backslashes, Unicode, scoped package names) via the JSON spec's string escaping rules.

The implementation is intentionally minimal: pure serialization, no business logic, no ANSI, no external dependencies. The main deliverable is the test suite that proves round-trip fidelity, empty-array edge cases, and unusual-character safety.

## Key Design Decisions
1. **`JSON.stringify(value, null, 2)`**: Two-space indented output per the story's preference ("2-space indent preferred for readability in CI logs"). The replacer is `null` — no field filtering, no transformation — ensuring structural identity between input and parsed output.
2. **No null guard / coercion**: The functions accept whatever the caller passes. Passing non-array to `formatCheckResults` will produce non-array JSON; this matches how `terminal.js` behaves (it similarly trusts its caller). The boundary tests cover the valid contract.
3. **No import of `time.js`**: Story explicitly states "no time.js needed — timestamps are already in the data structures as-is." json.js has zero module dependencies.

## Design Compliance
No design preview applicable — this is a non-UI formatting module.

## Integration / Wiring
- **Callee-side**: This story owns the full callee-side. Both `formatCheckResults` and `formatAuditReport` are exported as named ES module exports from `src/output/json.js`, accepting the same data shapes that `terminal.js` accepts.
- **Caller-side**: Deferred to F08 (CLI). CLI will detect `--json` flag and route to `json.js` instead of `terminal.js`. Both modules expose identically-named functions so the CLI can switch without restructuring.
- **Seam**: The exported function signatures are the contract: `formatCheckResults(results: CheckResult[]) → string`, `formatAuditReport(report: object) → string`. CLI writes the returned string directly to stdout.

## Files to Create/Modify
- `src/output/json.js` — new file, ES module, two named exports
- `test/output/json.test.js` — new file, Node.js built-in test runner, covers all ACs

## Testing Approach
Node.js built-in test runner (`node:test` + `node:assert`). Tests are unit-level — no file I/O, no mocks needed (pure functions).

Test cases:
- `formatCheckResults`: JSON.parse succeeds on output
- `formatCheckResults([])`: returns `"[]"` (empty array serialization)
- Round-trip fidelity: `JSON.parse(formatCheckResults(results))` deeply equals input array
- `formatAuditReport`: JSON.parse succeeds on output
- Unusual chars in package name (`@scope/pkg-name`, slashes, hyphens): valid JSON
- Unusual chars in message (double-quotes, backslashes, Unicode): valid JSON

## Acceptance Criteria / Verification Mapping
- AC: `formatCheckResults(results)` returns parseable JSON string → Verification: `assert.doesNotThrow(() => JSON.parse(...))`
- AC: Parsed output structurally identical to input → Verification: `assert.deepStrictEqual(JSON.parse(result), input)`
- AC: `formatCheckResults([])` returns `"[]"` → Verification: `assert.strictEqual(formatCheckResults([]), '[]')`
- AC: `formatAuditReport(report)` returns parseable JSON string → Verification: `assert.doesNotThrow(() => JSON.parse(...))`
- AC: `@scope/name` and slashes don't break JSON → Verification: test with scoped package name, assert parseable
- AC: Quotes, backslashes, Unicode in messages don't break JSON → Verification: test with those chars, assert parseable
- AC: Unit tests verify round-trip fidelity, empty results, unusual chars → Verification: all test cases listed above

## Verification Results
- AC: `formatCheckResults(results)` returns parseable JSON string → PASS — `assert.doesNotThrow(() => JSON.parse(result))` (test: "returns a string parseable by JSON.parse")
- AC: Parsed output structurally identical to input → PASS — `assert.deepStrictEqual(JSON.parse(result), sampleResults)` (test: "parsed output is structurally identical to the input array")
- AC: `formatCheckResults([])` returns `"[]"` → PASS — `assert.strictEqual(formatCheckResults([]), '[]')` (test: "returns '[]' for an empty array")
- AC: `formatAuditReport(report)` returns parseable JSON string → PASS — `assert.doesNotThrow(() => JSON.parse(result))` (test: "returns a string parseable by JSON.parse")
- AC: `@scope/name` and slashes don't break JSON → PASS — (tests: "handles @scope/name package names", "handles slashes and hyphens in package names")
- AC: Quotes, backslashes, Unicode in messages don't break JSON → PASS — (tests: "handles double-quotes", "handles backslashes", "handles Unicode characters")
- AC: Unit tests verify round-trip fidelity, empty results, unusual chars → PASS — All 13 tests pass; Command: `node --test test/output/json.test.js`

**Full run: 13 pass, 0 fail, 0 skipped — duration 90ms**

## Story Run Log Update
### 2026-04-09 developer: Implementation

## Documentation Updates
None — no new interfaces, env vars, or operator workflow changes.

## Deployment Impact
None.

## Questions/Concerns
None — story is fully specified, no ambiguities.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Work Item: F07-S02
- Work Type: story
- Branch: burnish/task-033-implement-json-formatter
- ADR: ADR-001 (zero runtime dependencies — json.js uses no imports)
