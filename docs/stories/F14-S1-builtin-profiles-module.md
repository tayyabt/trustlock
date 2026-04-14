# Story: F14-S1 — Policy Built-in Profiles Module

## Parent
F14: Policy Profiles

## Description
Creates `src/policy/builtin-profiles.js` with the built-in profile constants (`strict`, `relaxed`) and the exported pure function `applyProfileOverlay` that applies a named profile overlay onto a merged policy config with floor enforcement. This is the callee-side policy layer that `check.js` (Sprint 3) and `loader.js` (Sprint 4) both import — it must be callable by either without modification.

## Scope
**In scope:**
- `src/policy/builtin-profiles.js` (new): built-in profile constants and overlay/enforcement logic
- Unit tests for all profile merge, floor enforcement, and warning signal cases

**Not in scope:**
- `src/cli/args.js` — `--profile` flag is wired in F14-S2
- `src/cli/commands/check.js` — caller wiring is in F14-S2
- `src/policy/loader.js` — Sprint 4 (F15); this story exports the contract F15 will import
- Any network or filesystem interaction

## Entry Points
- Route / page / screen: Policy module — no CLI entry; invoked by command handlers
- Trigger / navigation path: Called at policy-load time in `check.js` when `--profile <name>` is present
- Starting surface: N/A — pure module, no route

## Wiring / Integration Points
- Caller-side ownership: F14-S2 owns the caller wiring (`check.js` calls `applyProfileOverlay`); NOT this story
- Callee-side ownership: This story owns the full callee: `builtin-profiles.js` exports `BUILTIN_PROFILES`, `isBuiltinProfile(name)`, and `applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin)`
- Caller-side conditional rule: The caller (`check.js`) does not exist yet for this story — keep the seam explicit. The exported contract must be stable so F14-S2 can wire it without modification.
- Callee-side conditional rule: The callee is new. Export exactly the named function signature required by C-NEW-2.
- Boundary / contract check: Unit tests call `applyProfileOverlay` directly with synthetic `mergedConfig` and `profilesMap` — no CLI or filesystem involved
- Files / modules to connect: `builtin-profiles.js` stands alone; it imports nothing from other modules
- Deferred integration, if any: `check.js` caller wiring is deferred to F14-S2. `loader.js` caller wiring is deferred to F15 (Sprint 4).

## Not Allowed To Stub
- `applyProfileOverlay` must be a real, complete implementation — not a shell or partial stub
- Floor enforcement logic (comparison of numeric profile values against `mergedConfig`) must be real and throw the exact required error message
- Nested object one-level merge (profile keys override base; unspecified keys fall through) must be real
- `required_for: ["*"]` detection and warning signal must be real — not a comment or TODO
- `BUILTIN_PROFILES` constants (`strict`, `relaxed`) with the exact ADR-005 values must be real exports

## Behavioral / Interaction Rules
- `applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin)`:
  - Resolves the profile from `profilesMap[profileName]` (user-defined) first, then `BUILTIN_PROFILES[profileName]` — user-defined wins
  - Applies shallow override for scalar and array fields; one-level deep merge for nested objects (`provenance`, `scripts`, `sources`, `pinning`, `approvals`)
  - For `isBuiltin = false`: for every numeric field where `profileValue < mergedConfig[field]`, throws with: `Profile "${profileName}" sets ${field}=${profileValue}, below base config minimum of ${mergedConfig[field]}. Profiles can only tighten policy, not loosen it.`
  - For `isBuiltin = true` (only the built-in `relaxed` profile invokes this): skips floor checks entirely
  - If the merged overlay includes `provenance.required_for: ["*"]`, returns a result that signals a mandatory ecosystem warning (via a returned `{ config, warnings: ["provenance-all"] }` shape or equivalent named signal — must be consistent with how F14-S2 reads it)
  - Returns the overlaid config (or a named result object if the warning signal is co-returned)
- `isBuiltinProfile(name)`: returns `true` if `name` is a key in `BUILTIN_PROFILES`, `false` otherwise
- A user-defined profile with the same name as a built-in overrides the built-in entirely — `applyProfileOverlay` achieves this by checking `profilesMap` first before falling back to `BUILTIN_PROFILES`
- `BUILTIN_PROFILES` constants per ADR-005: `strict = { cooldown_hours: 168, provenance: { required_for: ["*"] } }`, `relaxed = { cooldown_hours: 24, provenance: { block_on_regression: false, block_on_publisher_change: false } }`

## Acceptance Criteria
- [ ] `builtin-profiles.js` exports `BUILTIN_PROFILES`, `isBuiltinProfile`, and `applyProfileOverlay` as named exports
- [ ] `BUILTIN_PROFILES.strict`: `cooldown_hours: 168`, `provenance.required_for: ["*"]`
- [ ] `BUILTIN_PROFILES.relaxed`: `cooldown_hours: 24`, `provenance.block_on_regression: false`, `provenance.block_on_publisher_change: false`
- [ ] `applyProfileOverlay` with user-defined profile lowering `cooldown_hours` below `mergedConfig.cooldown_hours`: throws `Profile "myprofile" sets cooldown_hours=N, below base config minimum of M. Profiles can only tighten policy, not loosen it.`
- [ ] `applyProfileOverlay` with `isBuiltin = true` and `cooldown_hours` below base: no throw (relaxed exception, C11)
- [ ] User-defined profile named `relaxed` in `profilesMap`: `applyProfileOverlay` uses the user-defined version; floor enforcement applies (not skipped)
- [ ] Profile with `provenance.required_for: ["*"]`: result signals the mandatory ecosystem warning (structure must be readable by F14-S2)
- [ ] Nested `provenance` merge: profile keys override base; keys absent from profile fall through to base
- [ ] Nested `scripts` merge: same one-level deep merge semantics
- [ ] `isBuiltinProfile("strict")` → `true`; `isBuiltinProfile("myprofile")` → `false`
- [ ] `applyProfileOverlay` imports nothing from `src/registry/`, `src/lockfile/`, `src/cli/`, or `src/baseline/` — confirmed by grep
- [ ] (C-NEW-2) Profile overlay and floor enforcement are callable from a synthetic `check.js` stub in tests and would be callable from `loader.js` (Sprint 4) using the same import and call signature
- [ ] All unit tests pass: `node --test src/policy/builtin-profiles.test.js` (or equivalent)

## Task Breakdown
1. Create `src/policy/builtin-profiles.js` with `BUILTIN_PROFILES` constant (strict and relaxed values per ADR-005)
2. Implement `isBuiltinProfile(name)` named export
3. Implement `applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin)` with: user-defined-first profile resolution, one-level nested object merge, scalar/array shallow override, floor enforcement for non-builtin profiles, and `required_for: ["*"]` warning signal
4. Write unit tests covering: strict overlay, relaxed overlay (built-in, no floor error), user-defined relaxed (floor applies), unknown profile resolution (profilesMap miss + builtins miss → returns undefined, caller handles not-found), floor enforcement error message format, nested provenance and scripts merge, `required_for: ["*"]` warning signal

## Verification
```
node --test src/policy/builtin-profiles.test.js
# Expected: all tests pass

grep -r "require.*registry\|import.*registry\|require.*lockfile\|import.*lockfile\|require.*cli\|import.*cli\|require.*baseline\|import.*baseline" src/policy/builtin-profiles.js
# Expected: no output (no cross-layer imports)

node -e "import('./src/policy/builtin-profiles.js').then(m => { console.log(Object.keys(m)); })"
# Expected: [ 'BUILTIN_PROFILES', 'isBuiltinProfile', 'applyProfileOverlay' ] (or superset)
```

## Edge Cases to Handle
- User-defined profile with same name as built-in (`strict`, `relaxed`): user-defined wins; floor enforcement applies
- Profile lowers a nested numeric field (e.g., `provenance.max_age_days` if present) — floor check must cover nested numeric fields if the policy schema includes them
- `profilesMap` is undefined (no `profiles` key in config): treat as empty object, fall back to built-ins only
- Multiple numeric floor violations in one profile: throw on the first one detected (consistent behavior)
- Profile with `provenance.required_for: ["*"]` merged on top of base that already has `required_for: ["npm:pkg"]`: union semantics; `["*"]` triggers the warning regardless of other values

## Dependencies
- Depends on: none (pure module, no upstream story dependencies)
- Blocked by: none

## Effort
M — new module with non-trivial merge semantics and floor enforcement; all edge cases are unit-testable

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P0

---

## Run Log

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
