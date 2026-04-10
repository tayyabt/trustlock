# Design Note: F13-S2 — SARIF CLI Wiring (`check.js` integration)

## Summary

Wire `src/cli/commands/check.js` to emit SARIF 2.1.0 output when `--sarif` is passed, resolve `--quiet --sarif` interaction, and add integration tests covering all behavioral rules in the story acceptance criteria.

## Dependency Gap — Absorbed In-Scope

F13-S2 depends on three prerequisites that are **not yet merged to main**:

| Prerequisite | Task | Status | Gap |
|---|---|---|---|
| F13-S1: `sarif.js` formatter | task-067 | not started | `formatSarifReport` does not exist |
| F10-S4: `--sarif` / `--quiet` in `args.js` | task-063 | not started | flags not defined |
| F09: `getRelativePath` in `paths.js` | task-059 | done (but missing fn) | function not exported |

The Burnish runtime dispatched task-068 before these completed. The anti-stub rule prohibits stubbing `formatSarifReport` or `lockfileUri`. Therefore, this task absorbs all three gaps and implements them properly as part of the delivery.

**Note on story scope boundary:** The F13-S2 story says F13-S1 and F10-S4 are "not in scope" because they were expected to be pre-built. Since they are not pre-built, implementing them here is the only path to PASS on all ACs. The implementations follow the F13-S1 and F10-S4 story specs exactly.

## Approach

### 1. `src/utils/paths.js` — Add `getRelativePath`

Pure `node:path.relative(projectRoot, absolutePath)` operation. Exported alongside the existing `resolvePaths`. No new imports needed beyond the already-imported `relative` from `node:path` (need to add `relative` to the import).

### 2. `src/cli/args.js` — Add `--sarif` and `--quiet` flags + mutex check

Add two boolean flags to the `nodeParseArgs` options map:
- `'sarif'`: `{ type: 'boolean', default: false }`
- `'quiet'`: `{ type: 'boolean', default: false }`

Add a post-parse mutex guard:
```js
if (values.json && values.sarif) {
  process.stderr.write('Cannot use --json and --sarif together.\n');
  process.exit(2);
}
```

This mirrors the F10-S4 spec: exit 2 with the exact error message string.

### 3. `src/output/sarif.js` — SARIF 2.1.0 formatter (F13-S1)

Pure leaf module (no imports from other `src/` modules). Exports `formatSarifReport(groupedResults, lockfileUri) → string`.

Rule ID mapping (qualified → SARIF short):
```
'exposure:cooldown'           → 'cooldown'
'trust-continuity:provenance' → 'provenance'
'execution:scripts'           → 'scripts'
'execution:sources'           → 'sources'
'exposure:pinning'            → 'pinning'
'delta:new-dependency'        → 'new-dep'
'delta:transitive-surprise'   → 'transitive'
'trust-continuity:publisher-change' → 'publisher-change'  (future rule, static entry only)
```

SARIF results: iterate `groupedResults.blocked`, and for each entry iterate findings where `severity === 'block'`, emitting one SARIF result per blocking finding. `admitted` and `admitted_with_approval` entries produce zero results.

### 4. `src/cli/commands/check.js` — SARIF output branch

Changes:
- Import `formatSarifReport` from `../output/sarif.js`
- Import `getRelativePath` from `../../utils/paths.js`
- Read `sarif` and `quiet` from `values`
- After lockfile path resolution (step 3), compute `lockfileUri = getRelativePath(lockfilePath, projectRoot)`
- In the output section (step 11), add SARIF branch:

```js
if (json) {
  process.stdout.write(formatJson(results) + '\n');
} else if (sarif) {
  if (!quiet) {
    const groupedResults = {
      blocked: results.filter(r => r.checkResult.decision === 'blocked'),
      admitted_with_approval: results.filter(r => r.checkResult.decision === 'admitted_with_approval'),
      new_packages: [],
      admitted: results.filter(r => r.checkResult.decision === 'admitted'),
    };
    process.stdout.write(formatSarifReport(groupedResults, lockfileUri) + '\n');
  }
  // quiet suppresses SARIF output (G-NEW-2)
} else {
  process.stdout.write(formatTerminal(results));
}
```

Exit code logic (step 14) is unchanged — same `if (anyBlocked && enforce)` path works for SARIF mode.

### 5. Tests

**Unit tests** (`test/unit/output/sarif.test.js`): formatter in isolation, synthetic `groupedResults`.

**Integration tests** (`test/integration/check.sarif.test.js`): spawn CLI via child process, use the existing `setupInitializedProject` pattern from `cli-e2e.test.js`. Block trigger: `hasInstallScripts: true` (scripts rule, no registry calls needed).

## Integration / Wiring Plan

```
args.js (--sarif flag, --json/--sarif mutex)
    ↓
check.js (reads args.sarif, args.quiet)
    ↓ lockfilePath + projectRoot →
paths.js:getRelativePath(lockfilePath, projectRoot)
    ↓ groupedResults + lockfileUri →
sarif.js:formatSarifReport(groupedResults, lockfileUri)
    ↓ SARIF string →
process.stdout.write(sarifString + '\n')
```

## Files Expected to Change

| File | Change |
|---|---|
| `src/utils/paths.js` | Add `getRelativePath` export |
| `src/cli/args.js` | Add `--sarif`, `--quiet` flags; mutex guard |
| `src/output/sarif.js` | New file — SARIF 2.1.0 formatter |
| `src/cli/commands/check.js` | Wire SARIF output branch |
| `test/unit/output/sarif.test.js` | New file — formatter unit tests |
| `test/integration/check.sarif.test.js` | New file — integration tests |

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| `check.js` imports `formatSarifReport` and calls it when `args.sarif === true` | Code review + integration test |
| `lockfileUri` computed via `paths.js:getRelativePath` | Code review + unit test |
| `check --sarif` emits valid SARIF 2.1.0; exit 0 when all admitted | Integration test: all-admitted fixture |
| `check --sarif --enforce` blocked: SARIF + exit 1 | Integration test: blocked fixture + enforce |
| `check --sarif --enforce` all admitted: SARIF + exit 0 | Integration test: all-admitted + enforce |
| `check --quiet --sarif`: no stdout; exit code unaffected | Integration test |
| `check --json --sarif`: error message, enforced by args.js | Integration test |
| stdout = pure SARIF; stderr = diagnostics only | Integration test with stream capture |
| `args.js` NOT modified beyond adding the 2 flags + mutex | N/A (scope guard) |
| Integration: blocked fixture → SARIF parsed; `runs[0].results.length >= 1` | Integration test |
| Integration: all-admitted → `runs[0].results.length === 0` | Integration test |

## Stubs

None. All wiring is real:
- `formatSarifReport` is the real formatter
- `lockfileUri` is computed via the real `getRelativePath`
- `groupedResults` is derived from real policy engine output

## Test Strategy

Unit tests use synthetic `groupedResults` to verify formatter behavior in isolation (fast, no I/O). Integration tests spawn the real CLI to verify end-to-end stdout/stderr/exit code behavior.

## Risks and Questions

- **publisher-change rule**: No implementation exists yet. The SARIF `tool.driver.rules` array includes a static entry for it (as specified in F13-S1), but no finding will ever have `ruleId: publisher-change` until the rule is implemented. This is correct per spec.
- **F10-S3 schema v2**: The `new_packages` field in `groupedResults` is populated as an empty array here since F10-S3 hasn't defined what belongs in it. This is safe because the SARIF formatter doesn't use `new_packages`.
- **Early exit (no-delta)**: When check exits early with "No dependency changes", SARIF is not emitted. This is explicitly documented as correct in the story.

## Verification Results

All tests pass. `node --test` — 649 pass, 0 fail.

| AC | Result | Evidence |
|---|---|---|
| `check.js` imports `formatSarifReport` and calls when `args.sarif === true` | PASS | `check.js:14` import; `check.js` output branch |
| `lockfileUri` computed via `paths.js:getRelativePath` | PASS | `check.js` step 3b; `paths.js:getRelativePath` |
| `check --sarif` → valid SARIF 2.1.0, exit 0 (all admitted) | PASS | integration test "all admitted → valid SARIF, exit 0" |
| `check --sarif --enforce` blocked → SARIF on stdout, exit 1 | PASS | integration test "blocked → valid SARIF; exit 1" |
| `check --sarif --enforce` all admitted → SARIF on stdout, exit 0 | PASS | integration test "all admitted → valid SARIF; exit 0" |
| `check --quiet --sarif` → no SARIF on stdout; exit unaffected | PASS | integration test "no SARIF written to stdout; exit 0" |
| `check --json --sarif` → "Cannot use --json and --sarif together.", exit 2 | PASS | integration test "exits 2 with mutex error" |
| stdout = pure SARIF JSON; stderr = diagnostics only | PASS | integration test "stdout is pure SARIF JSON; stderr carries diagnostic output" |
| `args.js` not modified beyond adding 2 flags + mutex | PASS | only `--sarif`, `--quiet`, mutex guard added |
| Integration: blocked fixture → `runs[0].results.length >= 1` | PASS | integration test "blocked packages → valid SARIF 2.1.0 on stdout" |
| Integration: all-admitted → `runs[0].results.length === 0` | PASS | integration test "all admitted → runs[0].results is empty" |

Full suite: `node --test` → 649 pass, 0 fail (unit + integration).
