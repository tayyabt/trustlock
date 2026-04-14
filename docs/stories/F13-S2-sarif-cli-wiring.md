# Story: F13-S2 — SARIF CLI Wiring (`check.js` integration)

## Parent
F13: SARIF Output

## Description
Wire `src/cli/commands/check.js` to invoke `sarif.js:formatSarifReport` when `args.sarif === true`, resolve the `--quiet --sarif` interaction explicitly, and verify end-to-end SARIF emission including `--enforce` exit code behavior. The `--sarif` flag and `--json`/`--sarif` mutual exclusion gate are already in `args.js` (F10-S4); this story does not touch `args.js`.

## Scope
**In scope:**
- `src/cli/commands/check.js` — add SARIF output branch alongside the existing `--json` branch
- Compute `lockfileUri` (lockfile path relative to `projectRoot` via F09's `paths.js`) and pass to `formatSarifReport`
- `--quiet --sarif` interaction: `--quiet` suppresses SARIF output (PM decision, resolved here — see Behavioral Rules)
- `--sarif --enforce`: SARIF emitted to stdout; exit code reflects enforce mode (1 on any block)
- Ensure all diagnostic output (progress counter, warnings) remains on stderr; stdout is pure SARIF JSON when `--sarif` is active
- End-to-end integration test: `trustlock check --sarif` against a fixture lockfile emits parseable SARIF 2.1.0

**Not in scope:**
- `args.js` changes (`--sarif` flag and mutex already added by F10-S4/task-063)
- `sarif.js` formatter implementation (F13-S1)
- Any change to the terminal or JSON output paths

## Entry Points
- Route / page / screen: `src/cli/commands/check.js` — orchestrator for the `trustlock check` command
- Trigger / navigation path: `trustlock check --sarif [--enforce]` from CLI or CI
- Starting surface: Existing `check.js` after F10-S4 wiring (has `--quiet`, `--json`, `--sarif` flags already parsed; `--json`/`--sarif` mutex already enforced in args.js)

## Wiring / Integration Points
- Caller-side ownership: This story owns the `check.js` call site that invokes `sarif.js:formatSarifReport(groupedResults, lockfileUri)` and writes the result to `process.stdout`
- Callee-side ownership: F13-S1 owns the `sarif.js` formatter; this story consumes it
- Caller-side conditional rule: `sarif.js` exists after F13-S1 completes — wire to it now. Import `formatSarifReport` from `../output/sarif.js` in `check.js`.
- Callee-side conditional rule: `args.js` already has `--sarif` flag and mutual exclusion from F10-S4 — no changes needed to the callee
- Boundary / contract check: Integration test runs `node src/cli/index.js check --sarif` against a fixture project; verifies: (a) exit code is correct, (b) stdout is parseable SARIF 2.1.0 JSON, (c) stderr contains no SARIF JSON fragments
- Files / modules to connect: `src/cli/commands/check.js` → `src/output/sarif.js`; `src/utils/paths.js` (F09) for `lockfileUri` computation
- Deferred integration, if any: none — this story completes F13 end-to-end

## Not Allowed To Stub
- `formatSarifReport` must be called with the real `groupedResults` from the policy engine evaluation — no synthetic fixture passed directly to check.js
- `lockfileUri` must be computed via F09's `paths.js` (`getRelativePath(lockfilePath, projectRoot)`) — no hardcoded relative path
- All diagnostic output (progress counter from F10-S1, warnings) must go to `process.stderr` when `--sarif` is active — the stdout purity guarantee must be verified in a test that captures both stdout and stderr separately
- `--sarif --enforce` must use the same exit-code logic as `--json --enforce` — no copy-pasted special case

## Behavioral / Interaction Rules
- **`--quiet --sarif` resolution (G-NEW-2):** `--quiet` suppresses SARIF output. When both flags are active, `check.js` must NOT write to stdout. SARIF consumers in CI must not use `--quiet`. This is explicit and binding — not implementation-time.
- **Output routing:** When `args.sarif === true` and `args.quiet !== true`: write `formatSarifReport(groupedResults, lockfileUri)` to `process.stdout`, then newline. All stderr output (progress, warnings, any non-SARIF messages) is unchanged.
- **`--sarif --enforce`:** SARIF document is always written to stdout before the process exits. Exit 1 if any package is blocked; exit 0 if all admitted. This mirrors `--json --enforce` behavior.
- **`--json --sarif` mutual exclusion:** Already enforced in `args.js` (F10-S4). `check.js` must not re-implement this gate — trust the already-parsed args.
- **No terminal output when `--sarif` is active:** The terminal formatter (`terminal.js`) is not called when `--sarif` is set. The SARIF branch is independent of the terminal branch.

## Acceptance Criteria
- [ ] `check.js` imports `formatSarifReport` from `../output/sarif.js` and calls it when `args.sarif === true`
- [ ] `lockfileUri` passed to `formatSarifReport` is the lockfile path relative to `projectRoot`, computed via F09's `paths.js`
- [ ] `trustlock check --sarif` emits valid SARIF 2.1.0 JSON on stdout; exit 0 when all admitted
- [ ] `trustlock check --sarif --enforce` with blocked packages: valid SARIF on stdout, exit 1
- [ ] `trustlock check --sarif --enforce` with all admitted: valid SARIF on stdout, exit 0
- [ ] `trustlock check --quiet --sarif`: no SARIF written to stdout; exit code unaffected (G-NEW-2 resolved: `--quiet` suppresses SARIF)
- [ ] `trustlock check --json --sarif`: exits with `Cannot use --json and --sarif together.` (enforced by args.js; test confirms `check.js` never reaches formatter)
- [ ] stdout contains only SARIF JSON when `--sarif` active; stderr contains diagnostic output (progress, warnings) — verified by test capturing both streams
- [ ] `args.js` is NOT modified in this story (all flag additions were F10-S4's)
- [ ] Integration test: fixture project with one blocked package → `check --sarif` stdout parsed by `JSON.parse`; `runs[0].results.length >= 1`
- [ ] Integration test: fixture project with all admitted → `check --sarif` stdout parsed; `runs[0].results.length === 0`

## Task Breakdown
1. In `check.js`, add SARIF output branch after policy evaluation: `if (args.sarif && !args.quiet) { process.stdout.write(formatSarifReport(groupedResults, lockfileUri) + '\n'); }`
2. Compute `lockfileUri` using `paths.js:getRelativePath(resolvedLockfile, projectRoot)` — reuse the same resolved path already available in `check.js`
3. Import `formatSarifReport` from `../output/sarif.js` at the top of `check.js`
4. Write integration tests: blocked fixture, all-admitted fixture, `--quiet` suppression, `--enforce` exit codes
5. Verify stdout/stderr separation: test helper captures both streams; asserts no SARIF fragments on stderr

## Verification
```
node --experimental-vm-modules node_modules/.bin/jest src/cli/commands/check.sarif.test.js
# Expected: all tests pass, no errors

# Manual smoke against test fixture:
cd test/fixtures/blocked-project
node ../../../src/cli/index.js check --sarif | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const doc = JSON.parse(chunks.join(''));
  console.assert(doc.version === '2.1.0', 'version');
  console.assert(doc.runs[0].results.length > 0, 'results present');
  console.log('PASS');
});
"

# --quiet suppression:
node ../../../src/cli/index.js check --sarif --quiet
# Expected: no stdout output; exit 0
```

## Edge Cases to Handle
- `--sarif` + `--enforce` + all admitted: valid SARIF emitted, exit 0
- `--sarif` + `--enforce` + any blocked: valid SARIF emitted, exit 1
- `--quiet` + `--sarif`: no stdout output (--quiet takes precedence, per G-NEW-2 resolution)
- `--json` + `--sarif`: already rejected by args.js; check.js never reaches formatter; test confirms
- All packages admitted (no delta): check exits early with "No dependency changes" before reaching formatter — SARIF is not emitted (correct: no results to format)

## Dependencies
- Depends on: F13-S1 (sarif.js formatter must exist); task-063 (F10-S4 — `--sarif` flag and mutex in args.js must be present); task-059 (F09-S1 — `paths.js` must export `getRelativePath` or equivalent)
- Blocked by: F13-S1 must land first

## Effort
S — thin wiring layer; formatter and flag parsing are pre-built; main work is integration tests and stdout/stderr verification

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P2

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

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
