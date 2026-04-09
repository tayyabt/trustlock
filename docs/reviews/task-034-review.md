# Code Review: task-034 — CLI Scaffolding: Entry Point, Router, and Argument Parser

## Summary

Clean, minimal scaffolding that establishes the CLI foundation correctly. All six command routes are wired, argument schema is complete, exit-code contract is honored, and the top-level error boundary works as specified. Full test suite passes (372/372) including 12 new `args.js` unit tests.

## Verdict

Approved

## Findings

No blocking findings.

### Note: `scripts/check-no-stubs.sh` and `scripts/check-review-integrity.sh` do not exist yet
- **Severity:** suggestion
- **Finding:** Both harness scripts are absent from the repo. Reviewer ran verification manually in their place.
- **Proposed Judgment:** Create these scripts in a future maintenance task, or accept that they are not part of this repo's toolchain. No action required for this task.
- **Reference:** Reviewer process step 11/17

### Note: Unhandled-error test is inline simulation, not an independent test case
- **Severity:** suggestion
- **Finding:** The design note claims "unhandled error exits 2 → PASS — inline simulation confirms `main().catch(...)` sets exitCode = 2". There is no dedicated test case in `args.test.js` or `smoke.test.js` that exercises the real `main().catch` path. Reviewer independently verified the pattern against `index.js` and confirmed correctness.
- **Proposed Judgment:** Acceptable for this scaffolding story. A proper test (e.g. in smoke or a new integration test) can be added when the integration test layer is established in F08-S2+.
- **Reference:** Story AC: "Unhandled error in a command stub causes exit 2"

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [N/A] Workflow completeness / blocked-state guidance — no workflow-required work in this story
- [x] Architecture compliance (follows ADR-001, respects module boundaries, cli→policy layering not violated)
- [N/A] Design compliance — pure CLI scaffolding, no UI preview
- [x] Behavioral / interaction rule compliance (`process.exitCode` not `process.exit()`, exit-code contract, unknown-command message format)
- [x] Integration completeness (caller/callee contract: `index.js` → `args.js` → command stubs all wired)
- [x] Pitfall avoidance (no accidental `--no-*` auto-negation; defined directly as per design note)
- [x] Convention compliance (ES modules, kebab-case files, `node:util` prefix, zero runtime dependencies)
- [x] Test coverage (12 unit tests covering all arg parsing edge cases)
- [x] Code quality & documentation (stubs correctly labeled, design note complete with verification results)

## Acceptance Criteria Judgment
- AC: `node src/cli/index.js` prints usage/help and exits 2 → PASS — verified live; prints usage to stderr, exit code 2
- AC: `node src/cli/index.js init` exits 0 → PASS — verified live
- AC: `node src/cli/index.js check` exits 0 → PASS — verified live
- AC: `node src/cli/index.js approve` exits 0 → PASS — verified live
- AC: `node src/cli/index.js audit` exits 0 → PASS — verified live
- AC: `node src/cli/index.js clean-approvals` exits 0 → PASS — verified live
- AC: `node src/cli/index.js install-hook` exits 0 → PASS — verified live
- AC: `node src/cli/index.js unknowncmd` exits 2 and prints available commands → PASS — verified live; "Unknown command: unknowncmd. Available commands: init, check, approve, audit, clean-approvals, install-hook"
- AC: Unhandled error in a command stub causes exit 2 → PASS — `main().catch((err) => { process.exitCode = 2; })` pattern verified in `index.js:42-45`; inline simulation confirmed
- AC: `package.json` `bin` field points to `src/cli/index.js` → PASS — `{"trustlock": "src/cli/index.js"}` confirmed in `package.json`

## Deferred Verification
- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: Pure scaffolding — no business logic, no module integrations. Full test suite 372/372 passes. `smoke.test.js` updated to assert new `bin` field value. Stubs are isolated and cannot regress existing modules.

## Integration / Boundary Judgment
- Boundary: `index.js` → `args.js` → command stubs (all owned by this story)
- Judgment: complete
- Notes: `index.js` calls `parseArgs()` from `args.js`, routes via `COMMANDS` map, and `await handler(args)`. Each stub exports `async function run(_args) {}` matching the final handler contract exactly (same name, same signature). Later stories replace only the function body.

## Test Results
- Command run: `node --test test/unit/cli/args.test.js`
- Result: 12/12 pass
- Command run: `node --test 'test/**/*.test.js'`
- Result: 372/372 pass

## Context Updates Made

No module guidance or pitfalls context files exist yet for the `cli` module. Recording one reusable rule here for when those files are created:

**Rule:** `node:util.parseArgs` does not auto-resolve `--no-*` negations. If you define `--cache` as a boolean, passing `--no-cache` is NOT automatically handled. Always define the hyphenated name directly (e.g. `'no-cache': { type: 'boolean' }`).
- Impact: Silently dropped flags if the rule is not followed.
- Fix: Define each `--no-*` flag explicitly in the options schema.
- Files: `src/cli/args.js:19-20`

No existing module context files to update at this time.

## Artifacts Consulted
- Story: `docs/stories/F08-S1-cli-scaffolding-entry-point-and-argument-parser.md`
- Design note: `docs/design-notes/F08-S1-approach.md`
- Feature brief: `docs/feature-briefs/F08-cli-commands.md`
- Global conventions: `context/global/conventions.md`
- Global architecture: `context/global/architecture.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- Source: `src/cli/index.js`, `src/cli/args.js`, `src/cli/commands/{init,check,approve,audit,clean,install-hook}.js`
- Tests: `test/unit/cli/args.test.js`, `test/smoke.test.js`
- `package.json`

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-034
- Branch: burnish/task-034-implement-cli-scaffolding-entry-point-router-and-argument-parser
