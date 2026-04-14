# Story: F07-S02 — JSON Formatter

## Parent
F07: Output Formatting

## Description
Implement `src/output/json.js` — the machine-readable JSON formatter that serializes `CheckResult[]` and audit report objects to JSON strings for CI integration. Pure serialization: no business logic, no ANSI codes.

## Scope
**In scope:**
- `src/output/json.js` — complete implementation of both JSON formatting functions
- `formatCheckResults(results)` — serialize `CheckResult[]` directly to a valid JSON string
- `formatAuditReport(report)` — serialize the audit report object to a valid JSON string
- Edge case: valid JSON output even when package names or messages contain unusual characters
- Unit tests verifying JSON validity and structure fidelity

**Not in scope:**
- `src/output/terminal.js` (F07-S01)
- CLI wiring — CLI (F08) calls these formatters; that wiring is owned by F08
- ANSI colors, NO_COLOR detection (terminal concerns only)
- Any policy evaluation or business logic

## Entry Points
- Route / page / screen: `src/output/json.js` — pure formatting module, no route
- Trigger / navigation path: Called by CLI command handlers (F08) when `--json` flag is passed
- Starting surface: `formatCheckResults(results)` called from `commands/check.js --json`; `formatAuditReport(report)` called from `commands/audit.js --json`

## Wiring / Integration Points
- Caller-side ownership: Owned by F08 (CLI). The CLI detects `--json` flag and routes to `json.js` instead of `terminal.js`. This wiring is NOT in scope for this story.
- Callee-side ownership: This story owns full callee-side wiring — implement both public functions with exact signatures.
- Caller-side conditional rule: Caller (CLI, F08) does not exist yet. Keep the seam explicit: functions must be ES module exports from `src/output/json.js`, accepting the same `CheckResult[]` and audit report shapes that `terminal.js` accepts. The CLI switches between `terminal.js` and `json.js` based on the `--json` flag — both modules expose identically-named functions.
- Callee-side conditional rule: Expected contract for the caller: `formatCheckResults(results: CheckResult[]) → string` (valid JSON), `formatAuditReport(report: object) → string` (valid JSON). CLI writes the returned string directly to stdout.
- Boundary / contract check: Unit tests call each function with known inputs and parse the output with `JSON.parse()` to assert validity and structural fidelity.
- Files / modules to connect: `src/output/json.js` has no module dependencies (pure serialization, no time.js needed — timestamps are already in the data structures as-is).
- Deferred integration, if any: CLI-side `--json` flag routing and invocation of these functions is deferred to F08.

## Not Allowed To Stub
- `formatCheckResults` must serialize the actual `CheckResult[]` array — not a hardcoded string or partial subset
- `formatAuditReport` must serialize the actual audit report object — not a hardcoded string
- JSON output must be parseable by `JSON.parse()` — not pretty-printed with control characters that break parsing
- Both functions must handle unusual characters in package names and message strings without producing invalid JSON

## Behavioral / Interaction Rules
- JSON output structure for `formatCheckResults` matches `CheckResult[]` directly — no transformation, no renaming of fields
- JSON output structure for `formatAuditReport` matches the audit report object directly
- No ANSI codes in any JSON output (none introduced — this module never uses ANSI)
- Output must be valid JSON: `JSON.parse(formatCheckResults(results))` must not throw for any valid input
- Pretty-printing (indentation) is optional; choose one style and be consistent — 2-space indent is preferred for readability in CI logs

## Acceptance Criteria
- [ ] `formatCheckResults(results)` returns a string that `JSON.parse()` can parse without error
- [ ] Parsed output is structurally identical to the input `CheckResult[]` — no fields dropped or renamed
- [ ] `formatCheckResults([])` returns `"[]"` (valid empty JSON array)
- [ ] `formatAuditReport(report)` returns a string that `JSON.parse()` can parse without error
- [ ] Package names with `@scope/name` format, slashes, and special characters do not break JSON validity
- [ ] Message strings with quotes, backslashes, and Unicode characters do not break JSON validity
- [ ] Unit tests verify: round-trip fidelity (parse → re-serialize equals input), empty results, unusual characters in package names, unusual characters in messages

## Task Breakdown
1. Create `src/output/json.js` as an ES module
2. Implement `formatCheckResults(results)` — `JSON.stringify(results, null, 2)`
3. Implement `formatAuditReport(report)` — `JSON.stringify(report, null, 2)`
4. Write unit tests in `test/output/json.test.js` covering round-trip fidelity, empty results, and unusual character inputs

## Verification
```
node --test test/output/json.test.js
# Expected: all test cases pass
#   - formatCheckResults: JSON.parse succeeds on output
#   - formatCheckResults([]): returns "[]"
#   - round-trip: JSON.parse(formatCheckResults(results)) deeply equals results
#   - unusual chars in package name (@scope/pkg-name): valid JSON
#   - unusual chars in message (quotes, backslashes): valid JSON
#   - formatAuditReport: JSON.parse succeeds on output
```

## Edge Cases to Handle
- JSON output must be valid JSON even with unusual characters in package names or messages
- Empty results `[]` must produce `"[]"`, not `""` or `"null"`

## Dependencies
- Depends on: F07-S01 (establishes the output module directory structure; json.js lives alongside terminal.js)
- Blocked by: none

## Effort
S — pure JSON serialization with no external I/O, no complex formatting logic; the main value is the test coverage for edge cases

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P2

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
