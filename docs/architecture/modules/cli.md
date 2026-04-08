# Module Architecture: CLI

## Purpose
Command routing, argument parsing, and user-facing entry points. Wires commands to the policy engine, baseline manager, approval store, and output formatters.

## Responsibilities
- Parse CLI arguments using `node:util.parseArgs`
- Route to the correct command handler (init, check, approve, audit, clean-approvals, install-hook)
- Set exit codes (0 = success/advisory, 1 = blocked in enforce mode, 2 = fatal error)
- Wire policy engine output to the appropriate output formatter (terminal or JSON)
- Handle `--enforce`, `--json`, `--dry-run`, `--lockfile`, `--no-cache` flags
- Trigger baseline advancement after successful check (advisory, non-dry-run)

## Entry Points
- `index.js` — main entry point, command router
- `commands/init.js` — `dep-fence init`
- `commands/check.js` — `dep-fence check`
- `commands/approve.js` — `dep-fence approve`
- `commands/audit.js` — `dep-fence audit`
- `commands/clean.js` — `dep-fence clean-approvals`
- `commands/install-hook.js` — `dep-fence install-hook`
- `args.js` — argument parsing wrapper

## Dependencies
- Depends on: policy (engine), baseline (manager), approvals (store), output (formatters), lockfile (parser), registry (client)
- Used by: nothing (top-level entry)

## Allowed Interactions
- Read command-line arguments
- Call any module's public API
- Write to stdout/stderr via output module
- Set process exit code
- Call baseline `writeAndStage` after successful advisory check

## Forbidden Interactions
- Must NOT contain business logic (policy evaluation, approval validation, etc.)
- Must NOT directly format output (delegate to output module)
- Must NOT directly call `node:https` or parse lockfiles (delegate to respective modules)

## Notes
- `index.js` is the `bin` entry in package.json: `#!/usr/bin/env node`
- Each command handler is a thin function: parse args → call module APIs → format output → set exit code
- `check.js` is the most complex command handler because it orchestrates: load policy → parse lockfile → compute delta → evaluate → format → advance baseline
- Error handling: uncaught errors → exit 2 with error message

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: cli
