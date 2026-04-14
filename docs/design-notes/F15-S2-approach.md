# Design Note: F15-S2 — policy/loader.js async entry point and command wiring

## Summary

Create `src/policy/loader.js` as the new async policy entry point that owns the three-step ADR-005 merge sequence. Wire `check.js`, `audit.js`, `approve.js`, and `init.js` to `await loadPolicy(args)` before any policy-dependent work. Explicitly exclude `cross-audit.js` (C-NEW-4 permanent carve-out).

## Approach

`loadPolicy({ configPath, cacheDir, profile })` performs three sequential steps:

1. **Read repo config** — reads and parses `.trustlockrc.json` directly (not via `config.js`). Throws `exitCode: 2` on missing or malformed file.
2. **Extends merge** — if `rawRepo.extends` is present, calls `resolveExtends` + `mergePolicy` from `inherit.js` (F15-S1). The merged result contains all fields from both base and repo.
3. **Normalization** — applies `config.js`-style defaults for known PolicyConfig fields that are missing. Preserves unknown pass-through fields (`require_reason`, `max_expiry_days`, `extends` stripped) so `approve.js` can read approval-specific config from the merged result.
4. **Profile overlay** — if `profile != null`, calls `applyProfileOverlay` from `builtin-profiles.js`. Resolves user-defined before built-in. Throws `exitCode: 2` on profile not found. Returns `result.config` (warnings are not returned from `loadPolicy`; callers inspect the config directly).

`config.js` is **not changed** — it remains in use by existing unit tests. `loader.js` is the new async path for all CLI commands.

### `check.js` specifics

The current `// 1b. Apply profile overlay (F14-S2)` block is removed. `loadPolicy({ configPath, cacheDir, profile: profileName })` handles both load and overlay. The `hasProvenanceAllWarning` flag is computed by inspecting the returned config directly:

```js
const hasProvenanceAllWarning =
  Array.isArray(policy.provenance?.required_for) &&
  policy.provenance.required_for.includes('*');
```

Imports of `applyProfileOverlay` and `isBuiltinProfile` from `builtin-profiles.js` are removed from `check.js`; the profile-not-found error is now thrown from `loadPolicy` and caught in the existing `check.js` catch block.

### `approve.js` specifics

The private `loadApprovalConfig` function is removed. `loadPolicy({ configPath, cacheDir, profile: null })` is called instead. The merged config passes through `require_reason` and `max_expiry_days` from the raw JSON (preserved by normalization). Callers use `policy.require_reason ?? true` and `policy.max_expiry_days ?? 30` as defaults for missing fields.

### `init.js` specifics

`loadPolicy` is called after the scaffold is written and before baseline creation, to validate the merged policy (e.g. catch any `extends` floor violations introduced by a pre-existing `.trustlockrc.json` template). The result is not used for baseline construction (init writes a known default policy).

Wait — `init.js` WRITES `.trustlockrc.json` with `DEFAULT_POLICY`/`STRICT_POLICY` before calling `loadPolicy`. The call is a validation checkpoint that ensures any `extends` key in the written config would be caught before the lockfile parsing and registry calls begin.

## Integration / Wiring Plan

| File | Change |
|---|---|
| `src/policy/loader.js` | NEW — exports `loadPolicy({ configPath, cacheDir, profile })` |
| `src/cli/commands/check.js` | Replace `config.js` import, update call, remove 1b block, update `hasProvenanceAllWarning` check |
| `src/cli/commands/audit.js` | Replace `config.js` import, update call to `loadPolicy({ configPath, cacheDir, profile: null })` |
| `src/cli/commands/approve.js` | Remove `loadApprovalConfig`, add `loadPolicy` call, use `policy.require_reason ?? true` and `policy.max_expiry_days ?? 30` |
| `src/cli/commands/init.js` | Add `loadPolicy` call after scaffold creation, before baseline build |
| `src/cli/commands/cross-audit.js` | NOT MODIFIED (C-NEW-4 permanent carve-out) |
| `test/policy/loader.test.js` | NEW — integration tests for all ACs |

## Exact Files Expected to Change

- `src/policy/loader.js` (new)
- `src/cli/commands/check.js` (modify)
- `src/cli/commands/audit.js` (modify)
- `src/cli/commands/approve.js` (modify)
- `src/cli/commands/init.js` (modify)
- `test/policy/loader.test.js` (new)

## Acceptance Criteria → Verification Mapping

| AC | Verification |
|---|---|
| `loader.js` exists, exports `loadPolicy({ configPath, cacheDir, profile })` | `node --test test/policy/loader.test.js` |
| `loadPolicy` calls `resolveExtends` when `extends` present; skips when absent | loader.test: `extends` present vs absent |
| `loadPolicy` calls `applyProfileOverlay` when `--profile` passed; skips when absent | loader.test: profile present vs absent |
| `check.js` awaits `loadPolicy(args)` before delta | `grep -n "await loadPolicy" src/cli/commands/check.js` |
| `audit.js` awaits `loadPolicy(args)` | `grep -n "await loadPolicy" src/cli/commands/audit.js` |
| `approve.js` awaits `loadPolicy(args)` | `grep -n "await loadPolicy" src/cli/commands/approve.js` |
| `init.js` awaits `loadPolicy(args)` before baseline | `grep -n "await loadPolicy" src/cli/commands/init.js` |
| `cross-audit.js` NOT modified | `grep -n "loadPolicy" src/cli/commands/cross-audit.js` → no output |
| Header comment documents C-NEW-4 | inspect `loader.js` file header |
| Integration: extends URL → merged config | loader.test: mock HTTP server |
| Integration: remote unreachable + no cache → exit 2 | loader.test: simulate unreachable |
| Integration: no extends + `--profile strict` → correct merged config | loader.test |
| F14 composition: `--profile strict` after extends merge | loader.test |
| C-NEW-4: malformed extends in cross-audit doesn't error | loader.test (mock cross-audit invocation) |

## Test Strategy

All tests use `node:test` (not Jest). Tests live in `test/policy/loader.test.js`. Integration tests use real file I/O with `mkdtemp` temp directories and a mock `node:http` server for remote `extends`. `resolveExtends` and `mergePolicy` are tested in `inherit.test.js` (F15-S1) — `loader.test.js` tests the full `loadPolicy` composition.

## Stubs

None. Both callees (`inherit.js`, `builtin-profiles.js`) exist. All four commands are wired for real.

## Risks and Questions

- `approve.js` currently extracts only `require_reason` and `max_expiry_days` from the config. By switching to `loadPolicy`, those fields need to survive the normalization passthrough. They do — `normalizePolicyConfig` uses `{ ...raw }` spread then applies defaults on top, preserving unknown fields.
- `check.js` loses the `applyProfileOverlay` import — existing F14 tests may need to be checked for regression. The existing `test/integration/cli-e2e.test.js` will catch any regression.

## Verification Results

| AC | Status | Evidence |
|---|---|---|
| `loader.js` exports `loadPolicy` | PASS | `node --test test/policy/loader.test.js` — 19/19 pass |
| resolveExtends wiring | PASS | loader.test: "extends URL → merged config" + "skips resolveExtends when absent" |
| applyProfileOverlay wiring | PASS | loader.test: "applies built-in strict/relaxed profile", "user-defined profile" |
| check.js wired | PASS | `grep -n "await loadPolicy" src/cli/commands/check.js` → line 81 |
| audit.js wired | PASS | `grep -n "await loadPolicy" src/cli/commands/audit.js` → line 55 |
| approve.js wired | PASS | `grep -n "await loadPolicy" src/cli/commands/approve.js` → line 109 |
| init.js wired | PASS | `grep -n "await loadPolicy" src/cli/commands/init.js` → line 151 |
| cross-audit.js NOT modified | PASS | `grep -n "loadPolicy" src/cli/commands/cross-audit.js` → no output |
| Header comment | PASS | loader.js file header documents 4 commands + C-NEW-4 carve-out |
| Integration: extends URL | PASS | loader.test: "AC: extends URL → loadPolicy returns merged config" |
| Integration: remote unreachable + no cache | PASS | loader.test: "AC: remote unreachable + no cache → loadPolicy rejects with exitCode 2" |
| Integration: no-extends + profile | PASS | loader.test: "applies built-in strict profile: cooldown_hours = 168" |
| F14 composition | PASS | loader.test: "AC: extends URL + --profile strict → profile floor check runs against merged (extends+repo) config" |
| C-NEW-4 test | PASS | loader.test: "C-NEW-4: cross-audit.js does not import loadPolicy" |
| No regressions | PASS | `node --test test/policy/loader.test.js test/integration/cli-e2e.test.js` → 30/30 pass |
