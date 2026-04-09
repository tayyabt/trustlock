# Module Decisions: CLI

## Durable Decisions
1. `node:util.parseArgs` for argument parsing (ADR-001)
   - Why: Zero runtime dependencies. Available since Node 18.3.
   - Consequence: CLI argument interface is simpler than commander/yargs. No auto-generated help text — help text is manual strings.

2. Each command is an async function returning exit code
   - Why: Clean testability. Integration tests can call command functions directly without spawning processes.
   - Consequence: `index.js` calls `process.exit()` with the returned code. Command functions never call `process.exit()` themselves.

3. Baseline advancement triggered by CLI, not policy engine
   - Why: Policy engine evaluates. CLI decides side effects based on mode (advisory, enforce, dry-run).
   - Consequence: `check.js` command handler has the advancement logic: if all admitted AND not enforce AND not dry-run → call baseline writeAndStage.

## Deferred Decisions
- `--profile` flag (v0.2) — selects named config profile
- `--sarif` flag (v0.2) — SARIF output format
- `trustlock diff` command (v0.4)
- `trustlock why` command (v0.4)

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: cli
