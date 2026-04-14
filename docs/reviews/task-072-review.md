# Code Review: task-072 — policy/inherit.js: extends resolution, fetch, cache, and deep-merge

## Summary

Clean, complete implementation of `src/policy/inherit.js`. All 14 acceptance criteria verified by direct test execution (25/25 pass). No stubs, no registry imports, ADR-001 and ADR-005 fully honored.

## Verdict

Approved

## Findings

No blocking findings.

### Observation: `mergePolicy` exported but story only requires `resolveExtends` in AC1
- **Severity:** suggestion
- **Finding:** `mergePolicy` is also exported from `src/policy/inherit.js:297`. The story's AC1 only requires `resolveExtends` to be the named export. Exporting `mergePolicy` is correct and intentional — the design note explains `loader.js` (F15-S2) will call both; the separation also makes `mergePolicy` independently testable.
- **Proposed Judgment:** No change needed. The design note justifies the two-export pattern, and `mergePolicy` is directly tested in 12 of the 25 test cases.
- **Reference:** Design note §Key Design Decisions #1; story §Wiring.

### Observation: Test runner discrepancy between story and implementation
- **Severity:** suggestion
- **Finding:** Story §Verification specifies `node_modules/.bin/jest` but jest is not installed. Developer correctly used `node --test` and documented the deviation in the design note §Questions/Concerns.
- **Proposed Judgment:** No change needed. The deviation is acknowledged and appropriate. A future story should update the verification template if the project standardizes on `node --test`.
- **Reference:** Design note §Questions/Concerns; global conventions §Testing.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — N/A (library module, no CLI workflows owned)
- [x] Architecture compliance (ADR-001: zero runtime deps; ADR-005: Option 1 two-pass merge; C6: no registry import)
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (URL detection, TTL, stale fallback, chained-extends, floor messages — all match spec exactly)
- [x] Integration completeness (named exports match F15-S2 contract; `mergePolicy` pure + independently testable; loader.js wiring explicitly deferred)
- [x] Pitfall avoidance — no module pitfalls file exists yet; no pitfalls introduced
- [x] Convention compliance (kebab-case file, camelCase functions, `node:` prefixed imports, ESM, error+exitCode pattern)
- [x] Test coverage (25 tests, all ACs mapped in design note §AC/Verification Mapping)
- [x] Code quality & documentation (no dead code; design note complete and honest)

## Acceptance Criteria Judgment

- AC1: `resolveExtends` exported as named async function → PASS — `export async function resolveExtends` at `src/policy/inherit.js:222`
- AC2: No `src/registry` import → PASS — `grep -r "src/registry" src/policy/inherit.js` exits 1 (no output); verified by test `inherit.js does not import from src/registry/`
- AC3: Local path read relative to `configFilePath`; no cache written → PASS — `resolveLocalPath` uses `resolve(dirname(configFilePath), ...)` at line 96; "does not write cache file for local path" test verifies via `stat()` rejection
- AC4: Fresh cache (<1h) → no HTTP call → PASS — `requestCount=0` assertion in "fresh cache" test; TTL branch at `inherit.js:151-158`
- AC5: Stale cache + reachable → cache refreshed → PASS — "stale+reachable" test verifies `requestCount=1` and new `fetched_at`
- AC6: Stale cache + unreachable → stale used + stderr warning with timestamp → PASS — "stale+unreachable" test checks `stderr.includes(staleTimestamp)`
- AC7: No cache + unreachable → error with URL → PASS — error message includes URL and "no cached copy exists" (`inherit.js:175-180`)
- AC8: Scalar merge: repo wins (`cooldown_hours: 96` over `72`) → PASS — `mergePolicy` test "scalar override: repo value wins"
- AC9: Floor enforcement exact message → PASS — `mergePolicy` test "scalar numeric floor: repo below base throws with exact message" asserts exact string match
- AC10: Array union `["build"] + ["test"] → ["build","test"]`; org entry preserved → PASS — "array union: entries from both" and "array union: repo cannot remove base entries" tests
- AC11: Object deep-merge (`provenance` keys) → PASS — "object deep-merge: base keys not in repo fall through" test
- AC12: Chained extends stripped + stderr warning → PASS — both local ("strips chained extends from local policy") and remote ("chained extends in remote policy") variants pass; cached policy also verified to lack `extends` key
- AC13: Non-JSON response → parse error with URL → PASS — "non-JSON response" test; error thrown at `inherit.js:185-190`
- AC14: Local path not found → error with path → PASS — "throws with path in message when local file not found" test; error thrown at `inherit.js:102-105`

## Deferred Verification

- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: `inherit.js` is a new standalone module with no imports from existing source modules. It introduces no changes to existing files. 25 new tests cover all behavioral paths; 34 pre-existing failures are in unrelated modules (output/terminal color tests, args.js F10-S4 tests) and remain unchanged.

## Integration / Boundary Judgment
- Boundary: `inherit.js` (callee) → `loader.js` (caller, F15-S2, deferred)
- Judgment: complete for this story's owned side
- Notes: `resolveExtends(extendsValue, configFilePath, cacheDir)` and `mergePolicy(base, repo)` are exported with their full contracts. The design note explicitly notes loader.js wiring is deferred to S2. No stub or placeholder on the callee side. The seam is clean.

## Test Results
- Command run: `node --test test/policy/inherit.test.js`
- Result: 25/25 PASS — 0 failures, 0 skipped

## Context Updates Made

No context updates needed. No module guidance or pitfalls files exist for the `policy` module yet; no reusable traps discovered that weren't already covered by ADR-005.

## Metadata
- Agent: reviewer
- Date: 2026-04-11
- Task: task-072
- Branch: burnish/task-072-implement-policy-inherit-js-extends-resolution-fetch-cache-and-deep-merge
- Artifacts reviewed: story F15-S1-inherit-extends-fetch-cache-merge.md, feature-brief F15-policy-config-load-order.md, ADR-005, ADR-001, design-note F15-S1-approach.md, src/policy/inherit.js, test/policy/inherit.test.js, context/global/conventions.md, context/global/architecture.md
