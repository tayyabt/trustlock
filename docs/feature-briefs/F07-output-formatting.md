# Feature: F07 Output Formatting

## Summary
Format check results, audit reports, and status messages for human (colored terminal) and machine (JSON) consumption. Pure formatting — no business logic.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Presentation layer — deterministic formatting of data structures, tested via unit tests comparing output strings
- Target Sprint: 2
- Sprint Rationale: Needed by CLI commands (F08) to display results; can be built in parallel with policy engine (F06)

## Description
This feature implements the output module. Two formatters: terminal (human-readable with ANSI colors) and JSON (machine-readable for CI).

The terminal formatter produces colored output: red for blocks, green for admits, yellow for warnings, dim for informational. It formats per-package decisions with findings, generated approval commands (copy-pasteable), and the cooldown `clears_at` timestamp (D4). It formats audit reports with summary statistics and simple heuristic suggestions.

The JSON formatter outputs `CheckResult[]` directly as structured JSON. Audit output is also structured JSON.

Both formatters respect `NO_COLOR` and `TERM=dumb` environment variables for accessibility. ANSI color codes are manual constants, not a library (ADR-001).

## User-Facing Behavior
Developers see formatted output in their terminal after every `check`, `audit`, and other commands. The quality of this output directly affects whether developers find trustlock useful or annoying.

## UI Expectations (if applicable)
N/A — CLI tool terminal output, not web UI.

## Primary Workflows
- none

## Edge Cases
1. `NO_COLOR` environment variable set — must suppress all ANSI codes
2. `TERM=dumb` — must suppress all ANSI codes
3. Very long package names (e.g., `@anthropic/very-long-scoped-package-name`) — output must not break alignment
4. Many findings for a single package — must format all, not truncate
5. Empty results (no changes) — must print "No dependency changes" message
6. Mixed results (some admitted, some blocked) — must clearly separate sections
7. Approval command with special characters in reason — must be properly shell-escaped
8. Cooldown `clears_at` timestamp must be human-readable (not just ISO 8601)
9. Audit report with 0% provenance — heuristic suggestion: "Consider relaxing block_on_regression since no packages have provenance"
10. JSON output must be valid JSON even with unusual characters in package names or messages

## Acceptance Criteria
- [ ] `formatCheckResults()` produces colored terminal output with per-package decisions, findings, and approval commands
- [ ] `formatCheckResults()` in JSON mode produces valid, parseable JSON matching `CheckResult[]` structure
- [ ] Cooldown findings include human-readable `clears_at` timestamp (D4)
- [ ] Generated approval commands are copy-pasteable shell commands
- [ ] `formatAuditReport()` produces summary stats: total packages, provenance %, install scripts list, source types, age distribution
- [ ] Audit report includes 2-3 simple heuristic suggestions based on stats
- [ ] `NO_COLOR` and `TERM=dumb` suppress ANSI escape codes
- [ ] Unit tests verify terminal output format and JSON validity

## Dependencies
- F01 (shared utilities — time.js for timestamp formatting)

## Layering
- Single layer: output (leaf module)

## Module Scope
- output

## Complexity Assessment
- Modules affected: output
- New patterns introduced: yes — manual ANSI color constants, NO_COLOR detection
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- Audit heuristic suggestions are simple conditional messages, not a recommendation engine. Examples: "High cooldown violation rate — consider lowering cooldown_hours", "No packages have provenance — block_on_regression has no effect".
- Terminal column width is not detected; output is designed to be readable at 80 columns.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-trustlock-full-spec.md
- Sprint: 2
