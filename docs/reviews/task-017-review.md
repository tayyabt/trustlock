# Code Review: task-017 — Implement Format Detection and Parser Router

## Summary
Implementation satisfies all acceptance criteria. `detectFormat()` and `parseLockfile()` are correct, the npm.js seam stub is explicitly sanctioned by the story spec, and 15 unit tests cover every required case. Design note is accurate and honest.

## Verdict
Approved

## Findings

No blocking findings.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — N/A (data-layer module, no user interaction)
- [x] Architecture compliance (follows ADR-004 router pattern, ADR-001 zero runtime deps)
- [ ] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (fail-hard exit 2, correct detection precedence)
- [x] Integration completeness (caller/callee seam documented and wired; end-to-end deferred to F02-S03 per story spec)
- [x] Pitfall avoidance (process.exit mock pattern correct; no false-pass risk)
- [x] Convention compliance (ES modules, camelCase, node:fs/promises only)
- [x] Test coverage (all ACs have tests; edge cases: missing file, bad JSON, unrecognized filename, missing lockfileVersion)
- [x] Code quality & documentation (design note accurate, stubs documented, no dead code)

## Acceptance Criteria Judgment
- AC: `detectFormat()` returns `{ format: "npm", version: 1 }` for v1 → **PASS** — test: "returns { format: 'npm', version: 1 } for lockfileVersion 1"
- AC: `detectFormat()` returns `{ format: "npm", version: 2 }` for v2 → **PASS** — test: "returns { format: 'npm', version: 2 } for lockfileVersion 2"
- AC: `detectFormat()` returns `{ format: "npm", version: 3 }` for v3 → **PASS** — test: "returns { format: 'npm', version: 3 } for lockfileVersion 3"
- AC: Unknown lockfile version (e.g., v4) → exit 2 with message "Unsupported npm lockfile version 4. trustlock supports v1, v2, v3." → **PASS** — test: "exit 2 for lockfileVersion 4 with exact error message"; both sub-strings asserted
- AC: `parseLockfile()` reads lockfile, detects format, delegates to npm parser → **PASS** — tests: v1/v2/v3 dispatch suite; stub parseNpm returns `[]`, confirmed array returned
- AC: Missing lockfile → exit 2 with descriptive error → **PASS** — tests: detectFormat and parseLockfile both cover `/nonexistent/` path; message "Lockfile not found" asserted
- AC: Router imports and calls the npm parser module (wired end-to-end in F02-S03) → **PASS (seam in place)** — `parser.js:11` imports `parseNpm` from `./npm.js`; npm.js is a documented seam stub per story spec "Not in scope: Actual npm parsing logic (F02-S03)"
- AC: `node --test test/lockfile/parser.test.js` passes → **PASS** — independently verified: 15 pass, 0 fail

## Deferred Verification
- AC: Router imports and calls npm parser (end-to-end) → Missing check: full `parseLockfile()` returning populated `ResolvedDependency[]` — Reason: npm.js implementation deferred to F02-S03 per story spec — Residual risk: low; import seam is real and wired, stub returns correct type (`[]`)

## Regression Risk
- Risk level: low
- Why: Pure detection logic with no shared mutable state. Fail-hard behavior is exercised by 6 dedicated tests. Adding F02-S03 replaces the stub without touching detection logic.

## Integration / Boundary Judgment
- Boundary: `parseLockfile(lockfilePath, packageJsonPath) → ResolvedDependency[]` (called by CLI commands F08)
- Judgment: complete for this story's scope
- Notes: Caller (CLI) doesn't exist yet (F08). Callee (npm.js) is a documented seam stub for F02-S03. Export contract is the seam per story spec. The private `_detectFromParsed()` helper correctly avoids double file reads in `parseLockfile()`.

## Test Results
- Command run: `node --test test/lockfile/parser.test.js`
- Result: 15 pass, 0 fail (independently verified by reviewer)

## Context Updates Made
- `context/modules/lockfile/pitfalls.md` — added pitfall #5: `process.exit` in async node:test functions must throw to prevent suite abort; mock must be restored in `afterEach`
- `context/modules/lockfile/guidance.md` — added "Router Implementation Pattern" section: documents `_detectFromParsed()` private helper pattern to avoid double file reads; documents that version-check logic and exit-2 behavior must live in the helper, not duplicated in `parseLockfile()`

## Artifacts Referenced
- Story: `docs/stories/F02-S02-format-detection-parser-router.md`
- Feature brief: `docs/feature-briefs/F02-lockfile-parsing.md`
- Design note: `docs/design-notes/F02-S02-approach.md`
- ADR-004: `docs/adrs/ADR-004-lockfile-parser-architecture.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- Global conventions: `context/global/conventions.md`
- Global architecture: `context/global/architecture.md`

## Reviewer Metadata
- Agent: reviewer-code
- Date: 2026-04-08
- Task: task-017
