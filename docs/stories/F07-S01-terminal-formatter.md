# Story: F07-S01 — Terminal Formatter

## Parent
F07: Output Formatting

## Description
Implement `src/output/terminal.js` — the ANSI-colored terminal formatter that renders check results, audit reports, and status messages for human consumption. Establishes the output module, ANSI color constants, and NO_COLOR/TERM=dumb detection that the JSON formatter (F07-S02) will sit alongside.

## Scope
**In scope:**
- `src/output/terminal.js` — complete implementation of all terminal formatting functions
- ANSI escape code constants (red, green, yellow, dim, reset) — manual constants, no library (ADR-001)
- `NO_COLOR` and `TERM=dumb` environment detection (strips all ANSI when set)
- `formatCheckResults(results)` — per-package terminal output with decision color, findings, copy-pasteable approval commands, and human-readable `clears_at` timestamp (D4)
- `formatAuditReport(report)` — summary statistics and 2–3 conditional heuristic suggestions
- `formatStatusMessage(message)` — plain-text status messages (e.g., "No dependency changes")
- Unit tests for all three functions covering all edge cases listed in the feature brief

**Not in scope:**
- `src/output/json.js` (F07-S02)
- CLI wiring — CLI (F08) calls these formatters; that wiring is owned by F08
- Any policy evaluation or business logic

## Entry Points
- Route / page / screen: `src/output/terminal.js` — pure formatting module, no route
- Trigger / navigation path: Called by CLI command handlers (F08) after policy engine (F06) produces results
- Starting surface: `formatCheckResults(results)` is the primary callee called from `commands/check.js`; `formatAuditReport(report)` from `commands/audit.js`; `formatStatusMessage(message)` for status/info messages

## Wiring / Integration Points
- Caller-side ownership: Owned by F08 (CLI). The CLI command handlers will import and call the terminal formatter. This wiring is NOT in scope for this story.
- Callee-side ownership: This story owns full callee-side wiring — implement all three public functions with their exact signatures and return types.
- Caller-side conditional rule: Caller (CLI, F08) does not exist yet. Keep the seam explicit: functions must be ES module exports from `src/output/terminal.js`, accepting `CheckResult[]` or the audit report object shape defined by F06.
- Callee-side conditional rule: This story implements the callee fully. The expected contract for the caller is: `formatCheckResults(results: CheckResult[]) → string`, `formatAuditReport(report: object) → string`, `formatStatusMessage(message: string) → string`. All return plain strings; caller writes to stdout/stderr.
- Boundary / contract check: Unit tests call each function directly and assert on the returned string. No CLI wiring is tested in this story.
- Files / modules to connect: `src/output/terminal.js` imports `src/utils/time.js` for human-readable `clears_at` timestamp formatting (F01-S03).
- Deferred integration, if any: CLI-side import and invocation of these functions is deferred to F08.

## Not Allowed To Stub
- ANSI color constants must be real string constants (not `''` placeholders)
- NO_COLOR and TERM=dumb detection must be real environment reads and must suppress all ANSI output when set
- `formatCheckResults` must produce real per-package sections: decision line (admit/block/warn color), findings list, and the generated approval command for blocked packages
- Approval command generation must produce a real shell-escaped `trustlock approve <package>@<version> --override <rules>` string — not a placeholder
- `clears_at` human-readable timestamp must call `time.js` (F01-S03) — not inline a raw ISO string
- `formatAuditReport` must produce real summary stats and real conditional heuristic messages — not hardcoded strings
- `formatStatusMessage` must return a real formatted string

## Behavioral / Interaction Rules
- Colors: red for `blocked`, green for `admitted`/`admitted_with_approval`, yellow for warnings, dim for informational lines
- When `NO_COLOR` env var is set (any non-empty value) or `TERM=dumb`, all ANSI escape codes must be suppressed — returns identical text without color sequences
- `clears_at` timestamp must be human-readable (e.g., "April 12, 2026 at 14:30 UTC"), not raw ISO 8601
- Terminal column width is not detected; output is designed to be readable at 80 columns — no dynamic padding that depends on terminal width
- Approval commands must be a copy-pasteable single shell command; special characters in reason strings must be shell-escaped
- `formatAuditReport` heuristic suggestions are conditional: "High cooldown violation rate — consider lowering cooldown_hours", "No packages have provenance — block_on_regression has no effect", "Consider relaxing block_on_regression since no packages have provenance (0% provenance)" — output only suggestions that apply based on the stats
- Empty results (no CheckResult items) must produce "No dependency changes" via `formatStatusMessage`, not silence
- Many findings for one package must all be printed — no truncation

## Acceptance Criteria
- [ ] `formatCheckResults(results)` returns a colored string with per-package sections: decision line (colored admit/block), each finding, and a `trustlock approve ...` command for blocked packages
- [ ] `formatCheckResults([])` (empty) returns the "No dependency changes" status string
- [ ] Cooldown findings include the human-readable `clears_at` timestamp (D4) via `time.js`
- [ ] Generated approval commands are real shell-escaped `trustlock approve <pkg>@<ver> --override <rules>` strings
- [ ] `formatAuditReport(report)` returns a string with total packages, provenance %, install scripts list, source type breakdown, age distribution, and applicable heuristic suggestions
- [ ] `formatStatusMessage(message)` returns the plain-text message with appropriate dim styling
- [ ] When `NO_COLOR` is set, all functions return output with zero ANSI escape code bytes
- [ ] When `TERM=dumb` is set, all functions return output with zero ANSI escape code bytes
- [ ] Unit tests cover: admit, blocked, warn result types; empty results; NO_COLOR suppression; TERM=dumb suppression; audit with 0% provenance; long package names; multiple findings per package; approval command with special chars in reason

## Task Breakdown
1. Create `src/output/` directory and `src/output/terminal.js` as an ES module
2. Define ANSI color constants (red, green, yellow, dim, reset) and NO_COLOR/TERM detection helper
3. Implement `formatStatusMessage(message)` — dim-styled single-line output
4. Implement `formatCheckResults(results)` — iterate results, render per-package sections with color by decision, findings, and approval commands for blocked packages; call `time.js` for `clears_at`
5. Implement approval command formatter — produce `trustlock approve <package>@<version> --override <rules>` with shell escaping for reason text
6. Implement `formatAuditReport(report)` — summary stats block plus conditional heuristic messages
7. Write unit tests in `test/output/terminal.test.js` covering all edge cases

## Verification
```
node --test test/output/terminal.test.js
# Expected: all test cases pass
#   - admit result: green "admitted" line
#   - blocked result: red "blocked" line with approval command
#   - empty results: "No dependency changes"
#   - NO_COLOR=1: zero ANSI escape bytes in output
#   - TERM=dumb: zero ANSI escape bytes in output
#   - audit 0% provenance: heuristic suggestion present
#   - long package name (@anthropic/very-long-scoped-package-name): output does not break
#   - multi-finding package: all findings printed, none truncated
```

## Edge Cases to Handle
- `NO_COLOR` environment variable set — suppress all ANSI codes
- `TERM=dumb` — suppress all ANSI codes
- Very long package names (e.g., `@anthropic/very-long-scoped-package-name`) — output must not break alignment
- Many findings for a single package — format all, do not truncate
- Empty results (no changes) — print "No dependency changes"
- Mixed results (some admitted, some blocked) — clearly separate sections
- Approval command with special characters in reason — must be properly shell-escaped
- Cooldown `clears_at` timestamp must be human-readable (not just ISO 8601) (D4)
- Audit report with 0% provenance — heuristic suggestion: "Consider relaxing block_on_regression since no packages have provenance"

## Dependencies
- Depends on: F01-S03 (time.js for human-readable timestamp formatting)
- Blocked by: none

## Effort
M — terminal formatting with multiple output sections, NO_COLOR detection, approval command shell-escaping, and heuristic audit suggestions requires careful implementation but involves no external I/O

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P1

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
