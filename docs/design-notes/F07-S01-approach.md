# Design Approach: F07-S01 — Terminal Formatter

## Summary
Implements `src/output/terminal.js` — the ANSI-colored terminal formatter for dep-fence. The module is a pure leaf: no business logic, no I/O, accepts plain data objects and returns formatted strings. It also adds `formatHumanReadableTimestamp` to `src/utils/time.js` so that cooldown `clears_at` values render as "April 12, 2026 at 14:30 UTC" rather than raw ISO 8601 (D4 requirement).

The module exports three public functions: `formatCheckResults(results)`, `formatAuditReport(report)`, and `formatStatusMessage(message)`. All return plain strings; the caller (CLI, F08) writes them to stdout/stderr. Colors are real ANSI escape constants (ADR-001, no library). `NO_COLOR` and `TERM=dumb` suppress all ANSI output.

## Key Design Decisions

1. **Human-readable timestamp in `time.js`**: The story requires calling `time.js` (F01-S03), not inlining an ISO string. `formatHumanReadableTimestamp` is added to `src/utils/time.js` using `Intl.DateTimeFormat` which is Node built-in (ADR-001 compliant). Format: "April 12, 2026 at 14:30 UTC".

2. **Color suppression captured once per call**: `isColorDisabled()` reads `process.env.NO_COLOR` and `process.env.TERM` at the top of each public function to avoid mid-call env inconsistency and keep helper functions pure.

3. **Approval command generated from findings**: The terminal formatter generates the `dep-fence approve` command from the `DependencyCheckResult`'s `name`, `version`, and the block-severity findings. Shell-escaping uses single-quote wrapping for the `pkg@version` argument.

4. **`DependencyCheckResult[]` as input shape**: `formatCheckResults` accepts the `DependencyCheckResult` model (from `src/policy/models.js`) — objects with `name`, `version`, `checkResult: { decision, findings, approvalCommand }`.

5. **Audit report shape defined by this formatter**: Since F08 (CLI) doesn't exist yet, the `AuditReport` shape is defined here by documentation. Fields: `totalPackages`, `provenancePct`, `packagesWithInstallScripts`, `sourceTypeCounts`, `ageDistribution`, `cooldownViolationCount`, `blockOnRegression`.

## Design Compliance
No design preview for this feature (CLI output, not web UI).

## Integration / Wiring
- **Callee-side**: This story owns the full callee implementation. All three public functions are ES module exports from `src/output/terminal.js`.
- **Caller-side**: CLI (F08) will import and call these functions. That wiring is explicitly deferred to F08.
- **Seam**: Functions accept `DependencyCheckResult[]` or the audit report object; return plain strings. No I/O or side effects.
- **`time.js` integration**: `formatHumanReadableTimestamp` is added to `src/utils/time.js` and imported by `terminal.js`.

## Files to Create/Modify
- `src/utils/time.js` — add `formatHumanReadableTimestamp(isoString)` export
- `src/output/terminal.js` — new file; ANSI constants, color helpers, and all three public functions
- `test/output/terminal.test.js` — new file; unit tests for all edge cases from the story

## Testing Approach
Unit tests using Node.js built-in test runner (`node:test`). Each test calls the public function directly and asserts on the returned string content. ANSI code presence/absence verified by checking for `\x1b[` byte sequences. Tests override `process.env.NO_COLOR` and `process.env.TERM` per-test and restore them after.

## Acceptance Criteria / Verification Mapping
- AC: `formatCheckResults(results)` returns colored per-package sections → test: admit, blocked, warn result types
- AC: `formatCheckResults([])` returns "No dependency changes" → test: empty results case
- AC: Cooldown findings include human-readable `clears_at` via `time.js` → test: finding with `detail.clears_at` ISO string
- AC: Generated approval commands are real shell-escaped `dep-fence approve ...` strings → test: blocked result, multi-rule blocked, special chars
- AC: `formatAuditReport(report)` returns stats + conditional heuristics → test: 0% provenance, high violation rate
- AC: `formatStatusMessage(message)` returns dim-styled plain text → test: basic message
- AC: `NO_COLOR` suppresses ANSI → test: set NO_COLOR=1, assert no `\x1b[` in output
- AC: `TERM=dumb` suppresses ANSI → test: set TERM=dumb, assert no `\x1b[` in output
- AC: All edge cases from story (long names, multi-findings, special chars) → individual test cases

## Stubs
None. All functionality is real. This module has no external dependencies.

## Verification Results

Command: `node --test test/output/terminal.test.js`
Result: **47 tests, 47 pass, 0 fail**

Command: `node --test test/utils/time.test.js`
Result: **22 tests, 22 pass, 0 fail** (confirming `formatHumanReadableTimestamp` addition is non-breaking)

- AC: `formatCheckResults(results)` colored sections → **PASS** — "applies green color to admitted line", "applies red color to blocked decision line", all finding/approval tests pass
- AC: `formatCheckResults([])` "No dependency changes" → **PASS** — "returns 'No dependency changes' for an empty array"
- AC: Cooldown `clears_at` human-readable → **PASS** — "includes human-readable clears_at when present in finding detail" (verifies "April", "2026", "UTC" present; raw ISO absent)
- AC: Approval commands real + shell-escaped → **PASS** — "includes a dep-fence approve command", "multiple blocking rules each get --override flag", "package name with single quote is shell-escaped"
- AC: `formatAuditReport` stats + heuristics → **PASS** — all summary stats tests + heuristic suggestion tests pass
- AC: `formatStatusMessage` dim styling → **PASS** — "applies dim styling when colors are enabled"
- AC: NO_COLOR suppresses ANSI → **PASS** — 4 tests covering NO_COLOR=1, NO_COLOR=true; zero ANSI bytes confirmed
- AC: TERM=dumb suppresses ANSI → **PASS** — 3 tests for all three format functions; zero ANSI bytes confirmed
- AC: Edge cases (long names, multi-findings, special chars, 0% provenance) → **PASS** — individual tests for each case

## Documentation Updates
None — this is a new leaf module with no operator-facing config changes.

## Deployment Impact
None.

## Questions/Concerns
- The `AuditReport` shape is implicit (no formal model in `policy/models.js`). Documented in JSDoc in `terminal.js` as the contract for F08.
- `formatHumanReadableTimestamp` is added to `time.js` to satisfy the "call `time.js`" requirement. This is additive, not breaking.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Work Item: F07-S01
- Work Type: story
- Branch: burnish/task-032-implement-terminal-formatter
- ADR: ADR-001 (zero runtime dependencies)
