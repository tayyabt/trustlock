# Story: F08-S2 — `check` Command

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Implement `dep-fence check` — the core command that orchestrates lockfile parsing, delta computation, policy evaluation, output formatting, and baseline advancement. This story covers the check-admit workflow in full and produces the block output consumed by the blocked-approve workflow.

## Scope
**In scope:**
- `src/cli/commands/check.js` — full implementation (replace stub from F08-S1)
- All `check` flag handling: `--enforce`, `--json`, `--dry-run`, `--lockfile <path>`, `--no-cache`
- Loading: `.depfencerc.json` (policy), `.dep-fence/baseline.json`, `.dep-fence/approvals.json`, lockfile
- Calling: lockfile parser, registry client, policy engine evaluation, output formatter (terminal + JSON)
- Baseline advancement on full admission in advisory mode (calls `baseline.writeAndStage`)
- Generated approval commands in block output (calls `approvals.generateCommand` from F05-S03)
- All exit codes: 0 (success/advisory), 1 (blocked + enforce), 2 (fatal config/parse error)

**Not in scope:**
- Writing approvals — that is F08-S3
- `init` or `install-hook` — separate stories
- SARIF output (v0.2)

## Entry Points
- Route / page / screen: `dep-fence check [flags]`
- Trigger / navigation path: manual `dep-fence check` or git pre-commit hook (`dep-fence check` in `.git/hooks/pre-commit`)
- Starting surface: `src/cli/index.js` routes `check` → `commands/check.js`

## Wiring / Integration Points
- Caller-side ownership: `index.js` already routes to the check stub (F08-S1); this story replaces the stub with the real implementation — no changes to `index.js` needed
- Callee-side ownership: This story owns wiring to all downstream modules:
  - `src/lockfile/parser.js` (F02): `parseLockfile(lockfilePath)`
  - `src/registry/client.js` (F03): `fetchMetadata(packages, { noCache })`
  - `src/policy/engine.js` (F06): `evaluate(delta, metadata, policy, approvals)`
  - `src/baseline/manager.js` (F04): `readBaseline()`, `writeAndStage(newBaseline)`
  - `src/baseline/diff.js` (F04): `computeDelta(baseline, current)`
  - `src/approvals/store.js` (F05): `readApprovals()`
  - `src/approvals/generator.js` (F05): `generateCommand(pkg, blockedRules)`
  - `src/output/terminal.js` (F07): `formatCheckResult(results)`
  - `src/output/json.js` (F07): `formatCheckResultJson(results)`
- Caller-side conditional rule: Caller (`index.js`) already exists; wire callee to it now (stub replacement only)
- Callee-side conditional rule: All upstream modules (F02–F07) exist; wire to their real APIs now — no mocking
- Boundary / contract check: Run the full check pipeline end-to-end in the integration test (F08-S6); for this story, verify via unit tests against real fixture files
- Files / modules to connect: `check.js` → parser, registry client, policy engine, baseline manager, approvals store, approval command generator, output formatters
- Deferred integration: End-to-end integration test deferred to F08-S6

## Not Allowed To Stub
- Lockfile parser call — must be real (F02 is done)
- Policy engine evaluation — must be real (F06 is done)
- Output formatter calls — must be real (F07 is done)
- Baseline `writeAndStage` call — must be real (F04-S03 is done)
- Approval command generator — must be real (F05-S03 is done); block output must include the generated command
- Registry client — must be real; `--no-cache` must be honored

## Behavioral / Interaction Rules
- **D1 (all-or-nothing):** If any package is blocked, `writeAndStage` is NOT called for any package
- **D10 (CI read-only):** `--enforce` never calls `writeAndStage` regardless of evaluation result
- **D4 (cooldown clears_at):** Block output for cooldown must include the exact UTC timestamp when cooldown clears
- `--dry-run`: evaluate everything, format output, but never call `writeAndStage`; exit 0 even if blocked (advisory only)
- Registry unreachable: registry-dependent rules emit warnings but do not block; local-only rules still evaluate; exit 0 (not 2)
- Config missing: exit 2 with "No .depfencerc.json found. Run `dep-fence init` first."
- Baseline missing: exit 2 with "No baseline found. Run `dep-fence init` first."
- No lockfile found: exit 2 listing expected filenames
- No dependency changes: print "No dependency changes" and exit 0 (no baseline write)
- Expired approvals: silently skipped — not counted, not errors

## Acceptance Criteria
- [ ] `dep-fence check` with all packages admitted prints admit summary and advances baseline (advisory mode)
- [ ] `dep-fence check --enforce` with blocked packages exits 1; baseline not advanced
- [ ] `dep-fence check --enforce` with all admitted exits 0; baseline not advanced (D10)
- [ ] `dep-fence check --dry-run` evaluates but does not write baseline even if all admitted
- [ ] `dep-fence check --json` outputs valid JSON matching F07 JSON formatter output shape
- [ ] Block output includes per-package block reasons, clears_at for cooldown (D4), and generated approval command
- [ ] `dep-fence check` with no lockfile exits 2 with list of expected filenames
- [ ] `dep-fence check` with no `.depfencerc.json` exits 2 with "run dep-fence init first"
- [ ] `dep-fence check` with no dependency changes exits 0 and prints "No dependency changes"
- [ ] Registry unreachable: exits 0, prints per-check warnings, local rules still evaluated
- [ ] `git diff --staged` shows `.dep-fence/baseline.json` after a successful advisory check

## Task Breakdown
1. Implement `src/cli/commands/check.js` — config loading, lockfile detection, delta computation
2. Wire registry metadata fetching (respecting `--no-cache`)
3. Wire policy engine evaluation
4. Wire output formatters for both terminal and JSON modes
5. Implement baseline advancement: call `writeAndStage` only when all admitted AND not `--enforce` AND not `--dry-run`
6. Wire approval command generator into block output
7. Implement all error-state exits (exit 2 cases)
8. Write unit tests covering happy path, no-changes, enforce, dry-run, and error states using fixture lockfiles

## Verification
```bash
# Requires a repo initialized with dep-fence (see F08-S4) — use a fixture for unit tests
node --test test/unit/cli/check.test.js
# Expected: all tests pass

# Smoke test against a real fixture project
node src/cli/index.js check
# Expected: "No dependency changes" or admit summary, exit 0

node src/cli/index.js check --enforce
# Expected: admit or block + exit 0/1 accordingly

node src/cli/index.js check --json | node -e "process.stdin.resume(); process.stdin.on('data', d => JSON.parse(d.toString()))"
# Expected: valid JSON, no parse error
```

## Edge Cases to Handle
- `check` with no lockfile: exit 2, list expected filenames
- `check` with no `.depfencerc.json`: exit 2, "run dep-fence init first"
- `check` with no baseline: exit 2, "run dep-fence init first"
- `check` with no changes: "No dependency changes" + exit 0
- Registry unreachable: warnings only, no block, no exit 2
- `--dry-run`: no baseline write, exit 0 even with blocks (advisory only)
- D1: any block → skip writeAndStage for all packages
- D10: `--enforce` → never write baseline

## Dependencies
- Depends on: F08-S1 (routing stub must exist)
- Blocked by: F02 (lockfile parser), F04 (baseline manager + diff), F05 (approvals store + command generator), F06 (policy engine), F07 (output formatters) — all must be done before this story is dispatched

## Effort
L — most complex command handler; orchestrates the full evaluation pipeline

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P0

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
Format:
### [ISO date] [Agent]: [Action]
[Details]
-->
