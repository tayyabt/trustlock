# Code Review: task-066 — Publisher Identity + Baseline Schema v2

## Summary
Implementation is complete, correct, and well-tested. All 13 acceptance criteria pass with live test execution. The atomic-unit constraint (C2, ADR-006) is honored and no stubs, TODOs, or placeholder logic remain in any critical path.

## Verdict
Approved

## Findings
None. No blocking, warning, or suggestion-level findings.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually — all 13 pass)
- [x] Workflow completeness / blocked-state guidance — not required (feature brief: Workflow Coverage: not required)
- [x] Architecture compliance — follows ADR-006 (lazy migration), ADR-003 (cache-first fetch), ADR-001 (no runtime dependencies; publisher.js is pure)
- [x] Design compliance — no UI; CLI-only feature; N/A
- [x] Behavioral / interaction rule compliance — all D15 null-publisher cases, EC1–EC9, and all block/warn/no-action paths match the story
- [x] Integration completeness — caller/callee contract honored: check.js populates metadataMap with `newPublisherAccount`, `effectiveOldPublisherAccount`, `oldPublisherFetchFailed`; engine.js consumes them; advanceBaseline receives `publisherAccounts` map
- [x] Pitfall avoidance — no module pitfall files for registry/baseline yet; no known pitfalls violated
- [x] Convention compliance — ESM exports, optional-chaining null-safe extraction, `??` defaults, atomic-rename write pattern retained
- [x] Test coverage — all ACs have explicit tests; edge cases EC4/EC7/EC8/EC9 covered; regression (publisher reverts) covered
- [x] Code quality & documentation — design note includes verification results, no dead code, ADR-006 remains authoritative

## Acceptance Criteria Judgment
- AC1: `npm-registry.js` extracts `_npmUser.name` as `publisherAccount` → **PASS** — `npm-registry.js:57`; `npm-registry.test.js` lines 232–246 verify present and absent cases
- AC2: `readBaseline` reads v1 and v2 without error → **PASS** — `manager.js:104`; v1 round-trip and v2 read tests both pass
- AC3: `advanceBaseline` writes schema_version 2 with correct `publisherAccount` → **PASS** — `manager.js:141,170`; `WRITE_SCHEMA_VERSION = 2` constant enforced
- AC4: v1 changed package → old-version fetch before rule evaluation (ADR-006) → **PASS** — `check.js:237–263` (step 9b); integration test "publisher-change rule fires and blocks" exercises this path with `effectiveOldPublisherAccount`
- AC5: Publisher change (both known, differ, block=true) → blocking publisher-change rule → **PASS** — `engine.js:134–162`; integration test confirms `severity: block` and `decision: blocked`
- AC6: Old publisher null → stderr warning, no block, new publisher recorded → **PASS** — `publisher.js:37–43`; `publisher.test.js` + integration test confirm warn-only path
- AC7: `block_on_publisher_change: false` → warn only, no block → **PASS** — `publisher.js:63–67`; both unit and integration tests confirm
- AC8: Registry fetch for old version fails → warning emitted, null recorded, no block → **PASS** — `check.js:252–258`; `oldPublisherFetchFailed: true` sentinel; engine skips rule (`engine.js:134`); integration test verifies
- AC9: `publisher.js`, `manager.js`, `npm-registry.js` ship as single atomic unit (C2) → **PASS** — all five source files in same PR/branch
- AC10: No direct `node:https` in `publisher.js` → **PASS** — `publisher.js` is a pure function with no I/O; `check-no-stubs.sh` clean
- AC11: `block_on_publisher_change` absent from config → defaults to `true` → **PASS** — `publisher.js:34` (`?? true`); four tests cover null/undefined/missing-key variants
- AC12: Unchanged packages → `publisherAccount: null` on next advance → **PASS** — `manager.js:149–151` (`publisherAccount: oldProfile.publisherAccount ?? null`); `manager.test.js` covers v1 unchanged entry and mixed advance
- AC13: EC4 publisher reverts to original → rule fires again → **PASS** — `publisher.test.js` "regression scenario" test; current baseline publisher is `bob`; new publisher is `alice`; blocked = true

## Deferred Verification
none

## Regression Risk
- Risk level: **low**
- Why: All 7 pre-existing rules are untouched; rule 8 is gated on `previousProfile !== null` (changed packages only) and `!oldPublisherFetchFailed`. The `advanceBaseline` signature change is backward-compatible (`publisherAccounts = {}` default). The `readBaseline` schema check now accepts 1 or 2 (previously 1 only) — no regression for existing v1 baselines. The `normalizeSeverity` path for `trust-continuity:publisher` follows the same `error → block` normalization as other rules. Pre-existing `test/output/` failures confirmed unrelated by developer stash check.

## Integration / Boundary Judgment
- Boundary: `check.js → engine.js` (publisher metadata in metadataMap); `engine.js → publisher.js` (`comparePublisher` call); `check.js → manager.js` (`publisherAccounts` param on `advanceBaseline`)
- Judgment: **complete**
- Notes: check.js populates three new keys in metadataMap entries (`newPublisherAccount`, `effectiveOldPublisherAccount`, `oldPublisherFetchFailed`). engine.js reads them at `meta.*` — consistent shape. The `publisher-change` finding uses `severity: 'error'` (normalized to `'block'`), matching the existing convention for other blocking rules. Cache-entry fallback (`versionData?.publisherAccount ?? versionData?._npmUser?.name ?? null`) correctly handles old cached entries that predate this PR.

## Test Results
- `node --test test/registry/publisher.test.js` → **14 pass, 0 fail**
- `node --test test/baseline/manager.test.js` → **24 pass, 0 fail**
- `node --test test/registry/npm-registry.test.js` → **22 pass, 0 fail**
- `node --test test/integration/publisher-schema-migration.test.js` → **5 pass, 0 fail**
- Total directly-touched scope: **65 tests, 0 failures**

## Context Updates Made
No context updates needed. ADR-006 is the authoritative reference for the lazy migration strategy. The `oldPublisherFetchFailed` sentinel pattern (emit warning in check.js, skip engine rule) is documented in the design note and is self-evident from the code.

## Metadata
- Agent: reviewer
- Date: 2026-04-11
- Task: task-066
- Branch: burnish/task-066-implement-publisher-identity-baseline-schema-v2
- Artifacts reviewed: F12-S01-publisher-identity-baseline-schema-v2.md, F12-publisher-identity-baseline-v2.md, F12-S01-approach.md, ADR-006-baseline-schema-migration-strategy.md, context/global/architecture.md, context/global/conventions.md
