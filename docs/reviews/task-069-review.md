# Code Review: task-069 — Policy Built-in Profiles Module (F14-S1)

## Summary
`src/policy/builtin-profiles.js` is a correct, complete implementation of the callee-side profile overlay module. All 13 acceptance criteria pass; 28 unit tests pass; no stubs; zero cross-layer imports; ADR-005 and ADR-001 compliant.

## Verdict
Approved

## Findings

### Observation: profile overlay uses shallow override for arrays; ADR-005 general "arrays union" applies only to the extends→repo merge
- **Severity:** suggestion (informational — not a defect)
- **Finding:** ADR-005's merge semantics section lists "Arrays: union of all layers" as a general rule, but Step 4 of the same ADR says "Apply profile keys as shallow-override on merged config." The story spec (line 45 of F14-S1) explicitly says "shallow override for scalar and array fields" for the profile overlay. The implementation correctly uses shallow override for arrays (e.g., `provenance.required_for` is replaced, not unioned). This is correct per the story spec, but F14-S2 and F15 reviewers should be aware that arrays set by earlier layers (extends/repo) can be replaced by a profile overlay.
- **Proposed Judgment:** No change required. Document the distinction in future profile-related stories so reviewers don't mistakenly expect union semantics in the profile overlay step.
- **Reference:** ADR-005 Step 4 ("shallow-override on merged config"); F14-S1 story line 45; `src/policy/builtin-profiles.js:154–165`

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — not workflow-required per feature brief)
- [x] Architecture compliance (ADR-005 two-pass sequential merge, ADR-001 zero runtime deps)
- [x] Design compliance (N/A — CLI-only, no UI)
- [x] Behavioral / interaction rule compliance (user-defined-first resolution, C11 built-in exception, floor-check-before-merge ordering, `{ config, warnings }` return shape)
- [x] Integration completeness (callee-side complete; caller-side deferred to F14-S2/F15 as specified)
- [x] Pitfall avoidance (N/A — no module pitfalls file; no known pitfalls to check)
- [x] Convention compliance (ESM exports, `node:test`, file at `test/policy/` per project conventions)
- [x] Test coverage (28 tests; all 13 ACs have dedicated tests; edge cases: undefined profilesMap, same-name user override, multiple violations throw on first, both specific and `*` in required_for)
- [x] Code quality & documentation (no dead code; design note complete; no docs/changelog updates required per story scope)

## Acceptance Criteria Judgment
- AC: Exports BUILTIN_PROFILES, isBuiltinProfile, applyProfileOverlay → PASS — `node -e "import('./src/policy/builtin-profiles.js').then(m => console.log(Object.keys(m)))"` → `[ 'BUILTIN_PROFILES', 'applyProfileOverlay', 'isBuiltinProfile' ]`
- AC: BUILTIN_PROFILES.strict: cooldown_hours=168, provenance.required_for=["*"] → PASS — test `BUILTIN_PROFILES: exports strict profile with correct values`; values match ADR-005 constants exactly
- AC: BUILTIN_PROFILES.relaxed: cooldown_hours=24, block_on_regression=false, block_on_publisher_change=false → PASS — test `BUILTIN_PROFILES: exports relaxed profile with correct values`; values match ADR-005 constants exactly
- AC: Floor throw for user-defined lowering cooldown_hours — exact message → PASS — test `user-defined profile lowering cooldown_hours throws with exact message`; exact message format verified with `===`
- AC: isBuiltin=true with cooldown below base: no throw (C11) → PASS — test `relaxed built-in with cooldown below base does NOT throw (C11)`; `isBuiltin` guard correctly skips `checkFloors`
- AC: User-defined `relaxed` in profilesMap: floor applies (not skipped) → PASS — test `user-defined "relaxed" lowering cooldown below base throws`; `profilesMap` lookup wins over built-ins; `isBuiltin=false` path applies
- AC: provenance.required_for: ["*"] returns provenance-all warning → PASS — tests for built-in strict, user-defined strict_custom, and nested override; warning present in `result.warnings`
- AC: Nested provenance merge: profile keys override, absent keys fall through → PASS — test `nested provenance merge — profile keys override, absent keys fall through`
- AC: Nested scripts merge: same one-level deep merge semantics → PASS — test `nested scripts merge — profile keys override, absent keys fall through`
- AC: isBuiltinProfile("strict")=true; isBuiltinProfile("myprofile")=false → PASS — 4 isBuiltinProfile tests; uses `Object.prototype.hasOwnProperty.call` (prototype-safe)
- AC: No cross-layer imports (registry, lockfile, cli, baseline) → PASS — `grep` exits 1 (no matches); module has no imports at all
- AC: C-NEW-2 callable from synthetic check.js stub → PASS — test `C-NEW-2 — callable with synthetic mergedConfig`; function signature `(mergedConfig, profileName, profilesMap, isBuiltin)` is stable
- AC: All unit tests pass → PASS — `node --test test/policy/builtin-profiles.test.js` → 28 pass, 0 fail

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: Pure new module; no existing code modified; zero internal imports; no side effects. Regressions are scoped to the module itself. The only integration risk is that F14-S2 (caller wiring) must use the stable `{ config, warnings }` return shape — this is documented in the design note and the review.

## Integration / Boundary Judgment
- Boundary: Callee-side seam — `applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin)` exported contract
- Judgment: complete
- Notes: All three exports (`BUILTIN_PROFILES`, `isBuiltinProfile`, `applyProfileOverlay`) are present and stable. The `{ config, warnings }` return shape is always consistent (no conditional return types). F14-S2 caller wiring and F15 `loader.js` integration are correctly deferred. No caller-side changes are needed to adopt this module.

## Test Results
- Command run: `node --test test/policy/builtin-profiles.test.js`
- Result: 28 pass, 0 fail (94ms)

## Context Updates Made
No context updates needed. No module guidance or pitfalls files exist for the policy module. The array-override vs. array-union distinction (observation above) is recorded in this review for F14-S2 and F15 reviewer awareness.

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-069
- Branch: burnish/task-069-implement-policy-built-in-profiles-module
- Artifacts reviewed: docs/stories/F14-S1-builtin-profiles-module.md, docs/feature-briefs/F14-policy-profiles.md, docs/design-notes/F14-S1-approach.md, src/policy/builtin-profiles.js, test/policy/builtin-profiles.test.js, docs/adrs/ADR-005-policy-config-load-order-and-floor-enforcement.md, docs/adrs/ADR-001-zero-runtime-dependencies.md
