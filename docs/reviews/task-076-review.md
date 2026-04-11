# Code Review: task-076 — F17-S1 Cross-Project Audit Command (`trustlock audit --compare`)

## Summary
Complete, well-structured implementation of the cross-project audit command. All 14 acceptance criteria pass with real test evidence; no stubs, no policy-engine coupling, and no baseline writes.

## Verdict
Approved

## Findings

### Observation: `_parsePnpmVersion` is a private-prefixed export
- **Severity:** suggestion
- **Finding:** `cross-audit.js:21` imports `_parseLockfileVersion as _parsePnpmVersion` from `../../lockfile/pnpm.js`. The underscore prefix signals a semi-private API.
- **Proposed Judgment:** The usage is pragmatic — it avoids the `process.exit(2)` inside `parseLockfile` for unsupported pnpm versions while still delegating actual parsing to the router. It is well-documented in the design note (Key Decision 2). No change needed; future pnpm refactors should be aware of this coupling.
- **Reference:** Design note §Key Design Decisions #2; ADR-004 §Consequences

### Observation: Inline ANSI helpers vs. `terminal.js`
- **Severity:** suggestion
- **Finding:** `cross-audit.js:38–59` duplicates ANSI constants already present in `src/output/terminal.js`. `terminal.js` does not export individual color helpers (it exports formatted report renderers), so reuse is not straightforward.
- **Proposed Judgment:** Pattern is intentional and explicitly documented in the design note as "inline ANSI helpers matching `src/output/terminal.js` conventions". `terminal.js` itself notes "no imports from other src/ modules" for ADR-001 consistency. Acceptable.
- **Reference:** ADR-001; `src/output/terminal.js` header

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — workflow coverage not required per feature brief; confirmed
- [x] Architecture compliance (ADR-001: zero runtime deps, inline ANSI; ADR-004: router-pattern parser delegation)
- [x] Design compliance — CLI-only; no UI/preview artifacts required
- [x] Behavioral / interaction rule compliance (exit codes, error messages, clean-section confirmations, source.path exclusion all verified)
- [x] Integration completeness (args.js --compare flag, index.js dispatch branch, cross-audit.js callee-side — all wiring owned and complete)
- [x] Pitfall avoidance — no module pitfalls registered for `cli`
- [x] Convention compliance (naming, error handling, imports, file structure match existing commands)
- [x] Test coverage (all 14 ACs have tests; pure-function unit tests + fixture-based integration tests)
- [x] Code quality & documentation (no dead code; design note complete; no env vars or interfaces changed)

## Acceptance Criteria Judgment
- AC1: three report sections in stdout → PASS — integration test `AC1+AC5+AC12` verifies VERSION DRIFT, PROVENANCE INCONSISTENCY, ALLOWLIST INCONSISTENCY headers
- AC2: no `loadPolicy` import → PASS — `grep -r 'loadPolicy' src/cli/commands/cross-audit.js` → no matches; integration test also asserts this
- AC3: `.trustlockrc.json` via `fs.readFile`, `scripts.allowlist` only → PASS — code review + AC13 integration test with malformed `extends`
- AC4: no baseline modification → PASS — `grep -r 'writeAndStage\|writeBaseline' src/cli/commands/cross-audit.js` → no matches; integration test asserts same
- AC5: exit code 0 on success → PASS — integration tests assert `exitCode === 0` for success and drift-found cases
- AC6: fewer than 2 dirs → error + exit 2 → PASS — integration tests for 0 and 1 directory
- AC7: directory not found → error + exit 2 → PASS — integration test with nonexistent path
- AC8: no lockfile dir → warning + skip + run continues → PASS — integration test verifies warning on stderr and report on stdout
- AC9: npm + pnpm multi-format → PASS — two integration tests with real npm+pnpm fixture directories
- AC10: `source.path` entries excluded → PASS — unit tests for `filterSourcePathEntries` (npm `file:` kept, bare-path uv.lock-style excluded)
- AC11: packages in only one dir not in drift → PASS — unit test + integration test with `only-frontend`/`only-backend` packages
- AC12: clean sections show confirmation → PASS — integration test checks "No version drift detected", "No provenance inconsistencies", "No allowlist inconsistencies"
- AC13: malformed `extends` no network call → PASS — integration test with `https://bad-url-that-should-not-be-fetched.invalid`; run completes without error
- AC14: absolute and relative paths accepted → PASS — two integration tests; relative paths use `_cwd` injection

## Deferred Verification
- none

## Regression Risk
- Risk level: low
- Why: New command isolated in `cross-audit.js`; no modification to `audit.js`. The only changes to shared files are additive: one `--compare` boolean flag in `args.js` and one dispatch branch in `index.js`. The mutual-exclusion check in `args.js` and all existing command dispatch paths are untouched. Integration tests verified the npm+pnpm parser paths in isolation from the rest of the audit command.

## Integration / Boundary Judgment
- Boundary: `src/cli/index.js` → `src/cli/commands/cross-audit.js`; `cross-audit.js` → `src/lockfile/parser.js`; `cross-audit.js` → `src/baseline/manager.js`
- Judgment: complete
- Notes: All three seams verified. `index.js` branches on `args.values['compare']` before falling through to the normal handler map. `parseLockfile` called per directory via the format-detection router. `readBaseline` called per directory with a `.trustlock/baseline.json` path; absent baseline returns an error-shaped object and provenance defaults to `unknown` (excluded from inconsistency reporting). No deferred wiring.

## Test Results
- Command run: `node --test src/cli/commands/__tests__/cross-audit.test.js`
- Result: 24 pass, 0 fail
- Command run: `node --test test/integration/cross-audit.test.js`
- Result: 17 pass, 0 fail
- Command run: `.burnish/check-no-stubs.sh`
- Result: OK

## Context Updates Made
No context updates needed. No module guidance or pitfalls registered for the `cli` module. The `_parseLockfileVersion` coupling observation is documented in this review; if it becomes a recurring pattern across future commands, module pitfalls should be added at that time.

## Metadata
- Agent: reviewer
- Date: 2026-04-11
- Task: task-076
- Branch: burnish/task-076-implement-cross-project-audit-command-trustlock-audit-compare
- Artifacts cited: docs/stories/F17-S1-cross-project-audit-command.md, docs/feature-briefs/F17-cross-project-audit.md, docs/design-notes/F17-S1-approach.md, docs/adrs/ADR-001-zero-runtime-dependencies.md, docs/adrs/ADR-004-lockfile-parser-architecture.md
