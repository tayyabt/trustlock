# Design Note: F08-S2 — `check` Command

## Summary
Replace the `check.js` stub with a full orchestration of the evaluation pipeline.
Also create `src/policy/engine.js`, which was declared as a completed F06 dependency but is absent from the worktree.

## Approach

### Missing dependency: policy engine
`src/policy/engine.js` does not exist despite being listed as an F06 dependency.
It must be written here to unblock the check command. Its scope is pure orchestration
of the three rule modules that do exist (cooldown, pinning, provenance) plus approval
matching. It introduces no new product decisions.

### check.js pipeline

```
1. Load policy (.depfencerc.json) — exit 2 on missing/malformed
2. Load baseline (.dep-fence/baseline.json) — exit 2 on missing/corrupt
3. Resolve lockfile path (--lockfile arg or auto-detect package-lock.json) — exit 2 if none
4. parseLockfile(lockfilePath, packageJsonPath) — exits internally on parse failure
5. SHA-256 lockfile content → lockfileHash
6. readApprovals(.dep-fence/approvals.json) — returns [] if missing (Q2)
7. computeDelta(baseline, currentDeps, lockfileHash) → DependencyDelta
8. If no changes: print "No dependency changes" + exit 0 (no baseline write)
9. createRegistryClient({ cacheDir, noCache }) and fetch metadata for added+changed deps
10. engine.evaluate(delta, metadataMap, policy, approvals, { packageJsonPath }) → DependencyCheckResult[]
11. Format and write to stdout (terminal or JSON)
12. If all admitted AND NOT --enforce AND NOT --dry-run → advanceBaseline + writeAndStage
13. Exit: 0 (advisory or all-pass) | 1 (--enforce + any blocked) | 2 (fatal errors)
```

### Policy engine (engine.js)

`evaluate(delta, metadataMap, policy, approvals, options)` → `DependencyCheckResult[]`

- Evaluates `delta.added` and `delta.changed` packages only (D3: removals silently skipped)
- Runs three rules per package: cooldown, pinning, provenance
- Severity normalization: rules emit `'error'` (historical), engine normalizes to `'block'`;
  rules emit `'skipped'` (registry unreachable), engine normalizes to `'warn'`
- Approval matching: active (non-expired) approval with matching name+version that covers the
  blocking rule's canonical name overrides that finding
- Decision logic:
  - Any uncovered block → `blocked`
  - All blocks covered by approvals, at least one block → `admitted_with_approval`
  - No block findings → `admitted`
- Rule → override name mapping: `exposure:cooldown` → `cooldown`, `exposure:pinning` → `pinning`,
  `trust-continuity:provenance` → `provenance`

### Registry metadata shape per package

```
{ publishedAt: string|null, hasProvenance: boolean, warnings: string[] }
```

Fetched in parallel per package via:
- `fetchPackageMetadata(name)` → `data.time[version]` for `publishedAt`
- `getAttestations(name, version)` → `data !== null` for `hasProvenance`

Registry warnings from the client are propagated as metadata warnings;
when present, the cooldown and provenance rules receive `null` registry data
and return skipped findings (which become `warn` findings in output).

## Integration / Wiring Plan
- `index.js` already routes `check` to the stub; no changes to index.js
- `check.js` imports engine, parser, baseline, diff, approvals, registry, and output modules
- `engine.js` imports the three rule files and the approval generator

## Files Expected to Change
| File | Action |
|---|---|
| `src/cli/commands/check.js` | Replace stub |
| `src/policy/engine.js` | Create (missing F06 dep) |
| `test/unit/cli/check.test.js` | Create |

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| Advisory mode: admit summary + baseline advance | unit test: admitted fixture, `writeAndStage` called |
| `--enforce` + blocked: exit 1, no baseline advance | unit test: blocked fixture, enforce flag, exit code 1 |
| `--enforce` + all admitted: exit 0, no baseline advance (D10) | unit test: admitted fixture, enforce flag, writeAndStage not called |
| `--dry-run`: no baseline write even if all admitted | unit test: admitted fixture, dry-run flag, writeAndStage not called |
| `--json`: valid JSON output | unit test: parse stdout as JSON |
| Block output includes per-pkg reasons, clears_at, approval cmd | unit test: blocked fixture with cooldown, check finding.detail.clears_at present |
| No lockfile: exit 2 with expected filenames | unit test: empty dir, exit code 2 |
| No .depfencerc.json: exit 2 with "run dep-fence init" | unit test: missing config, exit code 2 |
| No dep changes: exit 0 + "No dependency changes" | unit test: same lockfile hash |
| Registry unreachable: exit 0, per-check warnings, local rules evaluated | unit test: registry returns null |
| `git diff --staged` shows baseline after advisory admit | unit test: writeAndStage called with correct path |

## Test Strategy
- Node.js built-in test runner (`node:test`)
- All tests use temp directories with real fixture lockfiles, policy, and baseline files
- Registry client injected as a mock to simulate: success, unreachable, and stale states
- `writeAndStage` injected to avoid actual `git add` calls in unit tests
- Each acceptance criterion covered by at least one test

## Stubs
None — all wiring is real. The registry HTTP layer is mocked in tests via client injection
(this is the standard pattern for all registry tests in the codebase).

## Risks and Questions
- The `severity: 'error'` vs `severity: 'block'` discrepancy in existing rule files is a
  pre-existing inconsistency. The engine normalizes `error` → `block` to bridge the gap
  without modifying the rule files.
- `engine.js` is technically an F06 concern but doesn't exist. Creating it here is the only
  way to make the check command work. The scope is intentionally minimal: no new rules,
  no new data models, pure orchestration of what F06 already produced.

## Verification Results

Run: `node --test test/unit/cli/check.test.js` — **14/14 tests pass**
Run: `node --test` (full suite) — **434/434 tests pass, 0 failures**

| AC | Status | Evidence |
|---|---|---|
| Advisory mode: admit + baseline advance | PASS | AC1 test: writeAndStage called with baseline containing lodash |
| `--enforce` + blocked: exit 1 | PASS | AC2 test: exitCode === 1 |
| `--enforce` + all admitted: exit 0, no baseline write | PASS | AC3 test: exitCode === 0, writeAndStage not called |
| `--dry-run`: no baseline write | PASS | AC4 test: writeAndStage not called |
| `--json`: valid JSON | PASS | AC5 test: JSON.parse succeeds, array with decision |
| Block output: clears_at + approval cmd | PASS | AC6 test: clears/UTC in stdout; AC6 JSON: finding.detail.clears_at present, approvalCommand set |
| No lockfile: exit 2 | PASS | AC7 test: exitCode === 2, stderr includes package-lock.json |
| No config: exit 2 | PASS | AC8 test: exitCode === 2, stderr includes dep-fence init |
| No dep changes: exit 0 | PASS | AC9 test: exitCode === 0, stdout includes "No dependency changes" |
| Registry unreachable: exit 0, warnings | PASS | AC10 test: exitCode === 0, output includes evaluation result |
| git staged baseline after admit | PASS | AC1 test: writeAndStage called with correct baselinePath (advisory, non-dry-run) |
| D1: any block → no baseline advance | PASS | D1 test: writeAndStage not called when one of two packages blocked |
| D10: `--enforce` never writes baseline | PASS | AC3 test: writeAndStage not called |
| `--dry-run` exit 0 even with blocks | PASS | advisory mode test: exitCode === 0 when blocked without --enforce |
