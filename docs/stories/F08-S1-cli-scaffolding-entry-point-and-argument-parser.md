# Story: F08-S1 — CLI Scaffolding: Entry Point, Router, and Argument Parser

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Deliver the CLI entry point (`index.js`), argument parser (`args.js`), and command routing skeleton. This story establishes the structural foundation that every subsequent F08 story builds on — command routing, argument schema, exit-code contract, and top-level error handling.

## Scope
**In scope:**
- `src/cli/index.js` — shebang, bin entry, top-level router, global error handler
- `src/cli/args.js` — `node:util.parseArgs` wrapper, argument schema for all 6 commands
- Stub implementations for all 6 command modules (`init`, `check`, `approve`, `audit`, `clean-approvals`, `install-hook`) — enough to route and exit 0 without crashing
- `package.json` `bin` field wiring: `"trustlock": "src/cli/index.js"`
- Unknown-command handling: print help text and exit 2

**Not in scope:**
- Any real command logic (each command is implemented in its own story)
- Output formatting (delegates to output module, not wired yet)
- Integration tests

## Entry Points
- Route / page / screen: `trustlock <command>` in the terminal
- Trigger / navigation path: `npx trustlock <command>` or global install `trustlock <command>`
- Starting surface: `package.json` `bin` field → `src/cli/index.js`

## Wiring / Integration Points
- Caller-side ownership: This story IS the caller entry — it owns wiring from `index.js` to each command handler stub
- Callee-side ownership: Each command stub file is the callee seam; stubs must export an async function with the signature `async function run(args) {}` and return without error
- Caller-side conditional rule: `index.js` must route to stubs now; real handlers are wired in F08-S2 through F08-S5
- Callee-side conditional rule: Stubs must match the final handler contract (same function name, same args shape) so later stories can replace the stub body without touching `index.js`
- Boundary / contract check: `node src/cli/index.js <command>` must exit 0 for known commands and exit 2 for unknown commands
- Files / modules to connect: `index.js` → `args.js` → individual command stubs
- Deferred integration: Real command logic deferred to F08-S2 through F08-S5; output module not wired here

## Not Allowed To Stub
- `index.js` routing logic — must be real; all 6 command routes must be wired
- `args.js` argument schema — must declare the full argument surface for all commands (flags: `--enforce`, `--json`, `--dry-run`, `--lockfile`, `--no-cache`, `--override`, `--reason`, `--expires`, `--as`, `--force`, `--strict`, `--no-baseline`)
- Top-level error handler in `index.js` — must catch unhandled errors and exit 2 with the error message
- Unknown-command branch — must print available commands and exit 2

## Behavioral / Interaction Rules
- Exit codes: 0 (success), 1 (policy block in enforce mode — set by check command, not here), 2 (fatal error, unknown command)
- `index.js` must set `process.exitCode` rather than calling `process.exit()` so the event loop can flush stdout before exit
- Unknown command prints: `"Unknown command: <cmd>. Available commands: init, check, approve, audit, clean-approvals, install-hook"`

## Acceptance Criteria
- [ ] `node src/cli/index.js` prints usage/help and exits 2
- [ ] `node src/cli/index.js init` exits 0 (stub returns without error)
- [ ] `node src/cli/index.js check` exits 0 (stub)
- [ ] `node src/cli/index.js approve` exits 0 (stub)
- [ ] `node src/cli/index.js audit` exits 0 (stub)
- [ ] `node src/cli/index.js clean-approvals` exits 0 (stub)
- [ ] `node src/cli/index.js install-hook` exits 0 (stub)
- [ ] `node src/cli/index.js unknowncmd` exits 2 and prints available commands
- [ ] Unhandled error in a command stub causes exit 2 (not an uncaught exception crash)
- [ ] `package.json` `bin` field points to `src/cli/index.js`

## Task Breakdown
1. Create `src/cli/args.js` — export `parseArgs(argv)` wrapping `node:util.parseArgs` with the full flag schema
2. Create `src/cli/index.js` — shebang, parse args, route command, top-level try/catch → exit 2
3. Create `src/cli/commands/init.js` — stub: `export async function run(args) {}`
4. Create `src/cli/commands/check.js` — stub
5. Create `src/cli/commands/approve.js` — stub
6. Create `src/cli/commands/audit.js` — stub
7. Create `src/cli/commands/clean.js` — stub (command name: `clean-approvals`)
8. Create `src/cli/commands/install-hook.js` — stub
9. Wire `"bin"` field in `package.json`
10. Write unit tests for `args.js` argument parsing edge cases (missing required positional, unknown flag)

## Verification
```bash
node src/cli/index.js
# Expected: prints help, exits 2

node src/cli/index.js init && echo "exit $?"
# Expected: exits 0

node src/cli/index.js unknowncmd; echo "exit: $?"
# Expected: prints "Unknown command: unknowncmd. Available commands: ..." and prints "exit: 2"

node --test test/unit/cli/args.test.js
# Expected: all tests pass
```

## Edge Cases to Handle
- `trustlock` with no arguments: print help and exit 2
- Unknown command: exit 2 with list of valid commands
- Unhandled async error in a command: caught by top-level handler, printed to stderr, exit 2

## Dependencies
- Depends on: none (this is the foundation story)
- Blocked by: none

## Effort
S — pure scaffolding, no business logic, no module integration

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P0

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
