# Review Artifact: task-069 — Policy Built-in Profiles Module (F14-S1)

## Status
Ready for review

## Summary
Implemented `src/policy/builtin-profiles.js` with the built-in profile constants (`strict`, `relaxed`) per ADR-005, and the `applyProfileOverlay` function with one-level nested object merge, floor enforcement for user-defined profiles, and `provenance-all` warning signal. 28 unit tests written; all pass.

## Delivery
- **Source**: `src/policy/builtin-profiles.js` (new)
- **Tests**: `test/policy/builtin-profiles.test.js` (new, 28 tests)
- **Design Note**: `docs/design-notes/F14-S1-approach.md`

## Acceptance Criteria Results
All 13 acceptance criteria: **PASS**

| AC | Result |
|---|---|
| Exports BUILTIN_PROFILES, isBuiltinProfile, applyProfileOverlay | PASS |
| BUILTIN_PROFILES.strict: cooldown_hours=168, provenance.required_for=["*"] | PASS |
| BUILTIN_PROFILES.relaxed: cooldown_hours=24, block_on_regression=false, block_on_publisher_change=false | PASS |
| User-defined profile lowering cooldown_hours: throws exact message | PASS |
| isBuiltin=true with cooldown below base: no throw (C11) | PASS |
| User-defined `relaxed` in profilesMap: floor applies (not skipped) | PASS |
| provenance.required_for: ["*"]: returns provenance-all warning | PASS |
| Nested provenance merge: profile keys override, absent keys fall through | PASS |
| Nested scripts merge: same one-level deep merge semantics | PASS |
| isBuiltinProfile("strict")=true; isBuiltinProfile("myprofile")=false | PASS |
| No cross-layer imports (registry, lockfile, cli, baseline) | PASS |
| C-NEW-2: callable from synthetic check.js stub | PASS |
| All unit tests pass: 28/28 | PASS |

## Verification Commands Run
```
node --test test/policy/builtin-profiles.test.js
# 28 pass, 0 fail

grep -r "require.*registry|import.*registry|..." src/policy/builtin-profiles.js
# exit 1 (no output — clean)

node -e "import('./src/policy/builtin-profiles.js').then(m => console.log(Object.keys(m)))"
# [ 'BUILTIN_PROFILES', 'applyProfileOverlay', 'isBuiltinProfile' ]

.burnish/check-no-stubs.sh
# check-no-stubs: OK
```

## Deferred Wiring
- `check.js` caller wiring: deferred to F14-S2 (as specified)
- `loader.js` caller wiring: deferred to F15 / Sprint 4 (as specified)
- The export contract (`applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin)`) is stable and requires no modification for either caller.

## Notes for Reviewer
- Return type is always `{ config, warnings }` — `warnings` is `["provenance-all"]` when result has `provenance.required_for` containing `"*"`, otherwise `[]`. F14-S2 should check `result.warnings.includes("provenance-all")`.
- Test file placed at `test/policy/builtin-profiles.test.js` per project conventions (story AC says "or equivalent").
- `transitive` is not in the NESTED_OBJECT_KEYS list (not named in the story spec for one-level deep merge); it is shallowly overridden if a profile specifies it.
