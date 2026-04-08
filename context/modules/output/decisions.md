# Module Decisions: Output

## Durable Decisions
1. Manual ANSI codes, no library (ADR-001)
   - Why: Zero runtime dependencies.
   - Consequence: A small set of color constants (red, green, yellow, dim, bold, reset). No 256-color or true-color support.

2. JSON output matches CheckResult model directly
   - Why: No transformation layer. CI consumers parse the same structure the policy engine produces.
   - Consequence: JSON output is stable. Changes to CheckResult model are changes to JSON output schema.

3. Respect NO_COLOR standard
   - Why: Accessibility. The NO_COLOR standard (no-color.org) is widely adopted.
   - Consequence: Check `process.env.NO_COLOR`, `process.env.TERM === 'dumb'`, and `!process.stdout.isTTY` before emitting ANSI codes.

## Deferred Decisions
- SARIF output format (v0.2)

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: output
