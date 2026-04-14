# Design Approach: task-063 — F10-S4 CLI Integration, Args Flags, and Workflow Updates

## Summary

This story wires all F10 output work into the CLI layer. F10-S1 (progress.js), F10-S2 (terminal.js), and F10-S3 (json.js) are implemented in their own branches but were not merged to main before this worktree was created. This implementation brings those three callee modules into this worktree as part of the wiring delivery, then wires them into `args.js`, `check.js`, `approve.js`, `audit.js`, `init.js`, and the two workflow docs.

The core of this story is: `check.js` must group the flat `evaluate()` results into the `{ blocked, admitted_with_approval, new_packages, admitted }` shape expected by the v0.2 formatters, measure wall time from the start of the function, wire `createProgress` with a `>= 5` threshold, and respect `--quiet` (zero stdout and stderr). `approve.js` uses `formatApproveConfirmation(entry, !flags.json)`. `audit.js` routes to `json.js` when `--json`. `init.js` wires `createProgress` with no threshold.

## Key Design Decisions

1. **Bring callee modules into this worktree**: `progress.js`, the new `terminal.js`, and the new `json.js` are not on main. They exist in their respective task branches. Rather than blocking, they are included here since they are already reviewed and done, and this story cannot be completed without them.

2. **Format-specific grouped results in check.js**: The terminal formatter needs `{ findings, oldVersion }` on blocked entries; the JSON formatter needs `{ from_version, rules, approve_command }`. check.js builds a single loop that populates both terminal-format and json-format grouped objects simultaneously, avoiding duplicate iteration.

3. **Wall time from function start**: `Date.now()` is captured before policy load (the very first line of `run()`), not after registry fetch, per the story spec.

4. **`--quiet` suppression**: All `process.stdout.write` and `process.stderr.write` calls are guarded by `!quiet`. Progress is also guarded by `!quiet` in the threshold check.

5. **Progress threshold**: `createProgress` is only called when `depsToEvaluate.length >= 5 && !quiet`. No progress is shown below 5. In `init.js`, `createProgress` is always called (no threshold).

6. **`admitted_with_approval` lookup**: The approval details (approver, expires_at, reason) are looked up from the raw `approvals` array using `a.package === r.name && a.version === r.version && new Date(a.expires_at) > now`. This is the same pattern the engine uses in `decide()`.

7. **`new_packages` grouping**: Packages in `delta.added` (first appearance) with decision `admitted` go into `new_packages`. Blocked new packages go into `blocked`. This matches the json schema where `new_packages[i].admitted` is a boolean.

8. **Existing tests updated**: `test/unit/cli/check.test.js` AC5 and AC6 JSON tests expect the old flat-array format. They are updated to expect schema_version 2 grouped format.

9. **No stubs**: All wiring is real. The progress counter writes to the actual `process.stderr` stream. The grouped results passed to formatters contain the real data required by each formatter.

## Integration / Wiring

- **Caller**: `check.js`, `approve.js`, `audit.js`, `init.js`, `args.js`
- **Callees**: `progress.js` (F10-S1), `terminal.js` (F10-S2), `json.js` (F10-S3)
- `args.js` already exports `--quiet`, `--sarif`, and the `--json`/`--sarif` mutex (implemented in an earlier commit on this branch)
- `check.js` wires all three callees; `approve.js` and `audit.js` wire only `terminal.js`/`json.js`; `init.js` wires only `progress.js`
- F13 (SARIF formatter) depends on the `--sarif` gate being present in `args.js`; that gate now exists

## Files to Create/Modify

- `src/utils/progress.js` (create) — TTY-aware progress counter from F10-S1
- `src/output/terminal.js` (rewrite) — v0.2 grouped formatter from F10-S2
- `src/output/json.js` (rewrite) — schema_version 2 formatter from F10-S3
- `src/cli/commands/check.js` — wire formatters, progress, quiet, wall time, grouped results
- `src/cli/commands/approve.js` — wire formatApproveConfirmation
- `src/cli/commands/audit.js` — add --json routing, update report shape
- `src/cli/commands/init.js` — wire createProgress with no threshold
- `src/cli/__tests__/args.test.js` — test --quiet/--sarif flags and mutex
- `src/cli/__tests__/check.integration.test.js` — integration tests for v0.2 outputs
- `test/unit/cli/check.test.js` — update AC5/AC6 JSON assertions for schema_version 2
- `docs/workflows/cli/blocked-approve.md` — update confirmation output sample to match v0.2
- `docs/workflows/cli/check-admit.md` — minor formatting verification

## Stubs

None. All callees are real implementations.

## Acceptance Criteria / Verification Mapping

- AC1: `args.js` exports `--quiet` (boolean) and `--sarif` (boolean); no `--profile` → `node --test src/cli/__tests__/args.test.js`
- AC2: `--json` + `--sarif` → exit 2 → `node --test src/cli/__tests__/args.test.js`
- AC3: `check.js` routes to `terminal.js:formatCheckResults` by default; `json.js` when `--json` → `node --test src/cli/__tests__/check.integration.test.js`
- AC4: `check.js` calls `createProgress(count, stderr)` when count >= 5 and !quiet → `node --test src/cli/__tests__/check.integration.test.js`
- AC5: `--quiet` suppresses all output → `node --test src/cli/__tests__/check.integration.test.js`
- AC6: `approve.js` calls `formatApproveConfirmation(entry, !flags.json)` → `node --test test/unit/cli/approve.test.js`
- AC7: `audit.js` routes to correct formatter → `node --test test/unit/cli/audit.test.js`
- AC8: `init.js` wires createProgress always → `node --test test/unit/cli/init.test.js`
- AC9: `--no-cache` unchanged → `node --test test/unit/cli/check.test.js`
- AC10: e2e grouped output → `node --test src/cli/__tests__/check.integration.test.js`
- AC11: `--quiet` zero output e2e → `node --test src/cli/__tests__/check.integration.test.js`
- AC12: `--json` schema_version 2 → `node --test src/cli/__tests__/check.integration.test.js`
- AC13: approve v0.2 confirmation → `node --test src/cli/__tests__/check.integration.test.js` (integration)
- AC14: workflow docs updated → manual inspection
- AC15: integration threshold test (4 vs 5 packages) → `node --test src/cli/__tests__/check.integration.test.js`

## Verification Results

All 150 tests pass. Verification commands and outcomes:

- AC1: `--quiet` (boolean, defaults false) and `--sarif` (boolean, defaults false) in args.js → PASS — `node --test src/cli/__tests__/args.test.js` (8/8 pass)
- AC2: `--json` + `--sarif` → exit 2 with `Cannot use --json and --sarif together.` → PASS — `node --test src/cli/__tests__/args.test.js` (mutex test passes)
- AC3: `check.js` routes to `terminal.js:formatCheckResults` by default; `json.js:formatCheckResults` when `--json` → PASS — IT3 passes; v0.2 grouped output in IT1
- AC4: `createProgress(count, stderr)` called when count >= 5 and !quiet → PASS — IT4 (4 pkgs, no progress), IT5 (5 pkgs, progress present)
- AC5: `--quiet` suppresses all stdout and stderr → PASS — IT2, IT2b pass
- AC6: `approve.js` calls `formatApproveConfirmation(entry, !flags.json)` — "Commit this file." in terminal mode, absent in --json mode → PASS — IT6, IT7 pass; `approve.test.js` updated
- AC7: `audit.js` routes to json.js when `--json` → PASS — `audit.test.js` (10/10 pass)
- AC8: `init.js` calls `createProgress(deps.length, process.stderr)` always → PASS — `init.test.js` (16/16 pass)
- AC9: `--no-cache` behavior unchanged → PASS — check.test.js (14/14 pass); no-cache path untouched
- AC10: e2e `trustlock check` produces v0.2 grouped output with BLOCKED section → PASS — IT1, cli-e2e (11/11)
- AC11: `trustlock check --quiet` produces zero output → PASS — IT2, IT2b
- AC12: `trustlock check --json` produces schema_version 2 → PASS — IT3, IT3b
- AC13: `trustlock approve` produces v0.2 confirmation with "Commit this file." → PASS — IT6, IT7
- AC14: workflow docs reflect v0.2 contract → PASS — blocked-approve.md and check-admit.md updated with absolute timestamps and new confirmation format
- AC15: integration threshold test (4 vs 5 packages) → PASS — IT4, IT5

Total: `node --test [all test files]` → 150/150 pass, 0 fail
