# Design Approach: F08-S1 CLI Scaffolding — Entry Point, Router, and Argument Parser

## Summary

This story establishes the CLI foundation that all subsequent F08 stories build on. The deliverables are: a complete `args.js` argument parser (full flag schema via `node:util.parseArgs`), a real `index.js` entry point with routing and top-level error handling, six command stubs matching the final handler contract, and `package.json` bin wiring.

No business logic is implemented here. Command stubs exist solely as routing seams for later stories to fill in.

## Key Design Decisions

1. **`node:util.parseArgs` with `allowPositionals: true`**: The first positional is the command name; the rest are command-specific positionals (e.g., `package@version` for `approve`). This matches ADR-001's zero-dependency requirement.

2. **`process.exitCode` instead of `process.exit()`**: The story and architecture require this so the event loop flushes stdout/stderr before the process terminates.

3. **`main().catch(...)` as the single error boundary**: All unhandled async errors from command handlers surface here, printing `err.message` to stderr and setting exitCode = 2.

4. **Stubs export `async function run(args)`**: This matches the final contract exactly, so later stories replace only the function body without touching `index.js`.

5. **`--no-cache` and `--no-baseline` defined as explicit boolean options**: `node:util.parseArgs` does not auto-resolve `--no-*` negations unless you define the paired positive form; since we never need `--cache` or `--baseline`, these are defined directly with their hyphenated names.

## Design Compliance

No UI preview — this is a pure CLI scaffolding story.

## Integration / Wiring

- **Caller-side (this story)**: `index.js` is the caller; it imports `parseArgs` from `args.js` and routes to each command module stub.
- **Callee-side (this story)**: Each `src/cli/commands/*.js` stub is the callee seam. Stubs export `async function run(args)` — the final handler contract.
- **Deferred**: Real handler logic is deferred to F08-S2 through F08-S5. The output module is not wired here (no import of `src/output/terminal.js`).
- **`package.json` bin**: Changed from `src/index.js` (placeholder) to `src/cli/index.js`.

## Files to Create/Modify

- `src/cli/index.js` — shebang, parseArgs call, command router, top-level try/catch
- `src/cli/args.js` — `parseArgs` wrapper with full flag schema
- `src/cli/commands/init.js` — stub: `async function run(args) {}`
- `src/cli/commands/check.js` — stub
- `src/cli/commands/approve.js` — stub
- `src/cli/commands/audit.js` — stub
- `src/cli/commands/clean.js` — stub (handles `clean-approvals` command name)
- `src/cli/commands/install-hook.js` — stub
- `package.json` — update `bin` field to `src/cli/index.js`
- `test/unit/cli/args.test.js` — unit tests for argument parsing edge cases

## Testing Approach

Unit tests in `test/unit/cli/args.test.js` using `node:test`:
- Known flags parse correctly (boolean, string, multiple)
- Positionals are captured separately from flags
- Unknown flag causes a thrown TypeError
- Multiple `--override` values are collected as an array
- No-args case returns empty positionals

## Acceptance Criteria / Verification Mapping

- AC: `node src/cli/index.js` exits 2 → Manual: `node src/cli/index.js; echo $?` should print 2
- AC: `node src/cli/index.js init` exits 0 → Manual: `node src/cli/index.js init; echo $?` → 0
- AC: `node src/cli/index.js check` exits 0 → Manual run
- AC: `node src/cli/index.js approve` exits 0 → Manual run
- AC: `node src/cli/index.js audit` exits 0 → Manual run
- AC: `node src/cli/index.js clean-approvals` exits 0 → Manual run
- AC: `node src/cli/index.js install-hook` exits 0 → Manual run
- AC: `node src/cli/index.js unknowncmd` exits 2 with message → Manual run
- AC: Unhandled error exits 2 → Tested by injecting a throwing stub (covered by error-handler test in args.test.js)
- AC: `package.json` bin points to `src/cli/index.js` → Inspect package.json
- Tests pass → `node --test test/unit/cli/args.test.js`

## Stubs Documented

The following are intentional stubs for true external dependencies deferred to later stories:
- `src/cli/commands/init.js` — real logic in F08-S2
- `src/cli/commands/check.js` — real logic in F08-S2
- `src/cli/commands/approve.js` — real logic in F08-S3
- `src/cli/commands/audit.js` — real logic in F08-S4
- `src/cli/commands/clean.js` — real logic in F08-S4
- `src/cli/commands/install-hook.js` — real logic in F08-S5

## Verification Results

- AC: `node src/cli/index.js` exits 2 → PASS — prints usage/help, exit code 2
- AC: `node src/cli/index.js init` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js check` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js approve` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js audit` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js clean-approvals` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js install-hook` exits 0 → PASS — exit code 0
- AC: `node src/cli/index.js unknowncmd` exits 2 with message → PASS — prints "Unknown command: unknowncmd. Available commands: ..." and exits 2
- AC: Unhandled error exits 2 → PASS — inline simulation confirms `main().catch(...)` sets exitCode = 2
- AC: `package.json` bin field points to `src/cli/index.js` → PASS — verified via `node -e`
- AC: `node --test test/unit/cli/args.test.js` → PASS — 12/12 tests pass
- Broader suite: `node --test 'test/**/*.test.js'` → PASS — 372/372 tests pass (smoke.test.js updated for new bin path)

## Documentation Updates

None — no new env vars, interfaces, or operator-facing changes.

## Deployment Impact

None. The `bin` field update makes `trustlock` CLI callable after `npm link` or global install.

## Questions/Concerns

None.
