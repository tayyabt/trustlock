# Module Guidance: CLI

## Responsibilities
- Parse arguments and route to command handlers
- Wire modules together for each command
- Set exit codes
- Trigger baseline advancement after successful advisory check

## Stable Rules
- No business logic in command handlers — delegate to module APIs
- Exit codes: 0 (success/advisory), 1 (blocked + enforce), 2 (fatal error)
- `index.js` is the bin entry point: `#!/usr/bin/env node`
- Each command is a separate file in `commands/`
- Argument parsing uses `node:util.parseArgs`

## Usage Expectations
- `check` is the hot path — most frequently called, triggered by pre-commit hook
- `init` runs once per project setup
- `approve` runs after a block event
- `audit` runs on-demand for posture assessment
- `clean-approvals` runs periodically for hygiene

## Integration Guidance
- Each command handler: parse args → load data via module APIs → call policy engine or module functions → format via output → set exit code
- `check` command orchestrates the full flow: loadPolicy → parseLockfile → readBaseline → computeDelta → evaluate → formatOutput → advanceBaseline
- Never import from one command handler to another

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: cli
