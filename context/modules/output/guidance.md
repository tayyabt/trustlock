# Module Guidance: Output

## Responsibilities
- Format check results, audit reports, and status messages for terminal and JSON output
- Surface data quality warnings (stale cache, skipped checks)
- Generate copy-pasteable approval commands for blocked packages
- Display cooldown clears_at timestamps (D4)

## Stable Rules
- No business logic — output module formats, never decides
- Terminal output respects NO_COLOR and TERM=dumb environment variables
- JSON output structure matches `CheckResult[]` directly
- All output to stdout. Errors to stderr.
- ANSI color codes are manual constants (ADR-001)

## Usage Expectations
- Called once per command invocation to format the final output
- Receives fully evaluated data — never triggers evaluation or data fetching

## Integration Guidance
- CLI passes `CheckResult[]` to the appropriate formatter based on `--json` flag
- Formatters return strings — CLI writes to stdout
- To add a new format (v0.2 SARIF): create a new formatter file following the same pattern

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: output
