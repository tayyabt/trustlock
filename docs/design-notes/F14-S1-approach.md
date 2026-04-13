# Design Approach: task-069 — Policy Built-in Profiles Module (F14-S1)

## Summary
Creates `src/policy/builtin-profiles.js` — a pure, zero-dependency module that exports the built-in profile constants (`strict`, `relaxed`) and the `applyProfileOverlay` function that merges a named profile onto an already-merged policy config with floor enforcement. The module is callee-only in this story; caller wiring (`check.js`, `loader.js`) is deferred to F14-S2 and F15 respectively.

The implementation follows ADR-005's Option 1 (two-pass sequential merge with eager floor checks). `applyProfileOverlay` applies one-level deep merge for named nested objects (`provenance`, `scripts`, `sources`, `pinning`, `approvals`) and shallow override for scalars/arrays, then floor-checks all numeric fields against `mergedConfig` before returning. The return type is always `{ config, warnings }` for a stable, consistent contract F14-S2 can rely on without modification.

## Key Design Decisions
1. **Always return `{ config, warnings }` shape**: Both the warning-signal and non-signal paths return the same shape. F14-S2 checks `warnings.includes("provenance-all")`. This avoids conditional return types that force callers to branch on type.
2. **`undefined` return for not-found profile**: When neither `profilesMap` nor `BUILTIN_PROFILES` has the named profile, `applyProfileOverlay` returns `undefined`. The caller (F14-S2) owns the not-found error message per the feature brief.
3. **Floor check before overlay application**: Walk profile's numeric fields against `mergedConfig` before merging — throw on first violation. This matches ADR-005's "eager floor checks" semantics.
4. **Explicit `NESTED_OBJECT_KEYS` set**: Only `provenance`, `scripts`, `sources`, `pinning`, `approvals` get one-level deep merge per the story spec. `transitive` and other objects are shallow-overridden.
5. **`profilesMap ?? {}` null guard**: Callers that pass `undefined` (no `profiles` key in config) are handled without error.

## Design Compliance
No UI design preview. CLI-only feature, no design system components.

## Integration / Wiring
- **Callee-side (this story)**: `builtin-profiles.js` exports `BUILTIN_PROFILES`, `isBuiltinProfile`, and `applyProfileOverlay`. The module imports nothing from other trustlock modules — zero internal coupling.
- **Caller-side (deferred)**: F14-S2 owns `check.js` calling `applyProfileOverlay`. F15 owns `loader.js` integration. The export contract is stable: both callers use `import { applyProfileOverlay } from './builtin-profiles.js'` and call it with `(mergedConfig, profileName, profilesMap, isBuiltin)`.
- **Seam**: The deferred `check.js` and `loader.js` callers don't need any modification to `builtin-profiles.js` — it stands alone.

## Files to Create/Modify
- `src/policy/builtin-profiles.js` — new: BUILTIN_PROFILES constants, isBuiltinProfile, applyProfileOverlay
- `test/policy/builtin-profiles.test.js` — new: all AC unit tests (covers all 13 acceptance criteria)

## Testing Approach
Pure unit tests using `node:test`. All tests call `applyProfileOverlay` directly with synthetic `mergedConfig` and `profilesMap`. No CLI, no filesystem. Tests cover:
- BUILTIN_PROFILES shape (strict, relaxed exact values)
- isBuiltinProfile true/false
- Overlay application: strict, relaxed (built-in skips floor), user-defined relaxed (floor applies)
- Floor enforcement: throw on first numeric violation, exact error message
- isBuiltin=true: no throw even when value below base
- Nested one-level deep merge: provenance keys override, absent keys fall through; scripts same
- required_for: ["*"] warning signal
- Not-found profile returns undefined
- profilesMap undefined fallback

## Acceptance Criteria / Verification Mapping
- AC: exports BUILTIN_PROFILES, isBuiltinProfile, applyProfileOverlay → Verification: `node -e "import('./src/policy/builtin-profiles.js').then(m => console.log(Object.keys(m)))"`
- AC: BUILTIN_PROFILES.strict correct values → Verification: test `builtin-profiles.test.js`
- AC: BUILTIN_PROFILES.relaxed correct values → Verification: test `builtin-profiles.test.js`
- AC: floor throw for user-defined lowering cooldown_hours → Verification: test `builtin-profiles.test.js`
- AC: isBuiltin=true skips floor → Verification: test `builtin-profiles.test.js`
- AC: user-defined `relaxed` in profilesMap: floor applies → Verification: test `builtin-profiles.test.js`
- AC: required_for: ["*"] signals warning → Verification: test `builtin-profiles.test.js`
- AC: nested provenance merge → Verification: test `builtin-profiles.test.js`
- AC: nested scripts merge → Verification: test `builtin-profiles.test.js`
- AC: isBuiltinProfile("strict")=true, isBuiltinProfile("myprofile")=false → Verification: test `builtin-profiles.test.js`
- AC: no cross-layer imports → Verification: `grep -r "require.*registry\|import.*registry\|require.*lockfile\|import.*lockfile\|require.*cli\|import.*cli\|require.*baseline\|import.*baseline" src/policy/builtin-profiles.js` (expect no output)
- AC: C-NEW-2 callable from synthetic check.js stub → Verification: test `builtin-profiles.test.js` calls applyProfileOverlay directly
- AC: all unit tests pass → Verification: `node --test test/policy/builtin-profiles.test.js`

## Verification Results
- AC: exports BUILTIN_PROFILES, isBuiltinProfile, applyProfileOverlay → PASS — `node -e "import('./src/policy/builtin-profiles.js').then(m => console.log(Object.keys(m)))"` → `[ 'BUILTIN_PROFILES', 'applyProfileOverlay', 'isBuiltinProfile' ]`
- AC: BUILTIN_PROFILES.strict correct values → PASS — test `BUILTIN_PROFILES: exports strict profile with correct values`
- AC: BUILTIN_PROFILES.relaxed correct values → PASS — test `BUILTIN_PROFILES: exports relaxed profile with correct values`
- AC: floor throw for user-defined lowering cooldown_hours → PASS — test `user-defined profile lowering cooldown_hours throws with exact message`
- AC: isBuiltin=true skips floor → PASS — test `relaxed built-in with cooldown below base does NOT throw (C11)`
- AC: user-defined `relaxed` in profilesMap: floor applies → PASS — test `user-defined "relaxed" lowering cooldown below base throws (floor applies)`
- AC: required_for: ["*"] signals warning → PASS — tests `strict overlay with isBuiltin=true signals provenance-all warning` and `profile with provenance.required_for: ["*"] returns provenance-all warning`
- AC: nested provenance merge → PASS — test `nested provenance merge — profile keys override, absent keys fall through`
- AC: nested scripts merge → PASS — test `nested scripts merge — profile keys override, absent keys fall through`
- AC: isBuiltinProfile("strict")=true, isBuiltinProfile("myprofile")=false → PASS — tests `returns true for "strict"` and `returns false for unknown name`
- AC: no cross-layer imports → PASS — `grep ...` exits 1 (no output)
- AC: C-NEW-2 callable from synthetic check.js stub → PASS — test `C-NEW-2 — callable with synthetic mergedConfig`
- AC: all unit tests pass → PASS — `node --test test/policy/builtin-profiles.test.js` → 28 pass, 0 fail

## Story Run Log Update
### 2026-04-10 developer: Design note written
Design approach locked. Proceeding to implementation.

## Documentation Updates
None — no interface, setup, env var, or operator workflow changes.

## Deployment Impact
None — new pure module, no env vars, no dependencies, no migrations.

## Questions/Concerns
- The story says `node --test src/policy/builtin-profiles.test.js` but conventions put tests in `test/`. Using `test/policy/builtin-profiles.test.js` per conventions; AC says "(or equivalent)".
- `transitive` is not in the NESTED_OBJECT_KEYS list per the story spec (only provenance, scripts, sources, pinning, approvals). If a profile sets `transitive`, it is shallowly overridden.

## Metadata
- Agent: developer
- Date: 2026-04-10
- Work Item: task-069 / F14-S1
- Work Type: story
- Branch: burnish/task-069-implement-policy-built-in-profiles-module
- ADR: ADR-005
- Design Preview: N/A
