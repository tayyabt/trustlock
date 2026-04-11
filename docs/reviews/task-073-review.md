# Review: task-073 — F15-S2 policy/loader.js async entry point and command wiring

## Status
Ready for review.

## Summary
Implements `src/policy/loader.js` — the ADR-005 three-step async policy merge entry point. All four CLI commands (`check.js`, `audit.js`, `approve.js`, `init.js`) now `await loadPolicy(args)` before any policy-dependent work. `cross-audit.js` is permanently exempt (C-NEW-4).

## What Was Built

### New Files
- `src/policy/loader.js` — exports `loadPolicy({ configPath, cacheDir, profile })`. Three-step merge: (1) parse `.trustlockrc.json`, (2) if `extends` key present: `resolveExtends` + `mergePolicy` from `inherit.js`, (3) `applyProfileOverlay` from `builtin-profiles.js`. Normalizes with defaults; preserves pass-through fields (`require_reason`, `max_expiry_days`). File header documents C-NEW-4 carve-out.
- `test/policy/loader.test.js` — 19 tests covering all story acceptance criteria.

### Modified Files
- `src/cli/commands/check.js` — imports from `loader.js`; call updated to `{ configPath, cacheDir, profile: profileName }`; manual profile-overlay block removed; `hasProvenanceAllWarning` now derived from merged config directly.
- `src/cli/commands/audit.js` — imports from `loader.js`; call updated to `{ configPath, cacheDir, profile: null }`.
- `src/cli/commands/approve.js` — `loadApprovalConfig` removed; `loadPolicy` from `loader.js` replaces it; approval-specific fields extracted via `policy.require_reason ?? true` / `policy.max_expiry_days ?? 30`.
- `src/cli/commands/init.js` — `loadPolicy` called after scaffold creation and before baseline build to validate the merged policy.

## Verification
```
node --test test/policy/loader.test.js test/integration/cli-e2e.test.js
# 30/30 tests pass

grep -n "loadPolicy" src/cli/commands/cross-audit.js
# (no output — C-NEW-4 compliance)

grep -n "await loadPolicy" src/cli/commands/check.js src/cli/commands/audit.js src/cli/commands/approve.js src/cli/commands/init.js
# check.js:81, audit.js:55, approve.js:109, init.js:151
```

All 14 acceptance criteria: PASS. No regressions in full test suite (pre-existing unrelated failures unchanged).

## Notable Decisions
- `mergeNested` in `loader.js` uses `{ ...defaults, ...override }` semantics (not `config.js`'s key-filtering approach) to preserve unknown nested fields from org policy (e.g. `block_on_publisher_change`).
- `approve.js` approval-specific fields (`require_reason`, `max_expiry_days`) pass through `normalizePolicyConfig` via `{ ...raw }` spread before defaults are applied on top.
- `check.js`'s `hasProvenanceAllWarning` is now derived by inspecting `policy.provenance.required_for.includes('*')` — equivalent to the previous `overlayResult.warnings.includes('provenance-all')` signal.
