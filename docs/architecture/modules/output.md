# Module Architecture: Output

## Purpose
Format check results, audit reports, and status messages for human and machine consumption. No business logic.

## Responsibilities
- Terminal output: colored, human-readable summary of check results with per-package decisions, findings, and approval commands
- JSON output: structured machine-readable output for CI integration
- Audit output: summary statistics for the full dependency tree
- Status messages: "No dependency changes", init summary, approval confirmation, etc.
- Cooldown clears_at timestamp in human-readable format (D4)

## Entry Points
- `terminal.js:formatCheckResults(results)` → string (ANSI-colored)
- `terminal.js:formatAuditReport(report)` → string
- `terminal.js:formatStatusMessage(message)` → string
- `json.js:formatCheckResults(results)` → string (JSON)
- `json.js:formatAuditReport(report)` → string (JSON)

## Dependencies
- Depends on: nothing (leaf module — formats data only)
- Used by: cli (for all user-facing output)

## Allowed Interactions
- Read `CheckResult[]` and audit data structures
- Write formatted strings to stdout/stderr (via return values to CLI)

## Forbidden Interactions
- Must NOT evaluate policy rules
- Must NOT read/write any files
- Must NOT call registry or git operations
- Must NOT contain business logic (decisions about what to show are made by the caller)

## Notes
- ANSI color codes are manual constants, not a library (ADR-001)
- Terminal output uses red for blocks, green for admits, yellow for warnings, dim for informational
- Generated approval commands are formatted as copy-pasteable shell commands
- JSON output structure matches `CheckResult[]` directly — no transformation
- Respects NO_COLOR and TERM=dumb environment variables for accessibility

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: output
