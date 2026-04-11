# Story: F15-S2 — policy/loader.js: async entry point and command wiring

## Parent
F15: Policy Config Load Order & Org Policy Inheritance

## Description
Create `src/policy/loader.js`, the async `loadPolicy(args)` entry point that owns the full ADR-005 three-step merge sequence: call `inherit.js` (F15-S1) to resolve `extends` base, merge with repo config, then apply the `--profile` overlay via F14's exported `applyProfileOverlay`. Wire all CLI commands (`check.js`, `audit.js`, `approve.js`, `init.js`) to `await loadPolicy()` before any rule evaluation or policy-dependent logic begins. Explicitly carve out `cross-audit.js` per C-NEW-4 — it must NOT call `loadPolicy()`.

## Scope
**In scope:**
- `src/policy/loader.js` (new) — async `loadPolicy(args)`, three-step ADR-005 merge, floor check at each step
- `src/cli/commands/check.js` (modify) — await `loadPolicy(args)` before delta computation
- `src/cli/commands/audit.js` (modify, single-project only) — await `loadPolicy(args)` at top of handler
- `src/cli/commands/approve.js` (modify) — await `loadPolicy(args)` to resolve merged policy for validation
- `src/cli/commands/init.js` (modify) — await `loadPolicy(args)` before baseline creation
- Tests for loader's merge sequence, error propagation, and profile composition

**Not in scope:**
- `src/policy/inherit.js` — implemented in F15-S1; this story imports it as-is
- `src/policy/builtin-profiles.js` and `applyProfileOverlay` — implemented in F14; imported here
- `src/cli/commands/cross-audit.js` — must NOT be modified (C-NEW-4: no `loadPolicy()` call for cross-audit)
- `src/cli/args.js` — unchanged by this story; `--profile` flag already added by F14

## Entry Points
- Route / page / screen: `src/policy/loader.js` — module entry point, not a command
- Trigger / navigation path: Each CLI command imports and calls `loadPolicy(args)` at the top of its handler function before any policy-dependent work begins
- Starting surface: `trustlock check`, `trustlock audit` (single-project), `trustlock approve`, `trustlock init` — all four commands reach `loadPolicy()` on every invocation

## Wiring / Integration Points
- Caller-side ownership: This story owns the caller wiring: modifying `check.js`, `audit.js`, `approve.js`, and `init.js` to `await loadPolicy(args)` and consume the returned merged `PolicyConfig` object.
- Callee-side ownership: This story owns the callee: `loader.js` is a new module. It imports `resolveExtends` from F15-S1 (exists after S1 ships) and `applyProfileOverlay` from F14's `builtin-profiles.js` (exists from Sprint 3). Both callees exist — wire to them now.
- Caller-side conditional rule: All four commands exist (check.js, audit.js, approve.js, init.js). Wire each to `loadPolicy(args)` now. Do NOT wire `cross-audit.js` (C-NEW-4 carve-out).
- Callee-side conditional rule: `inherit.js` exists after F15-S1; must be listed as a task dependency. `applyProfileOverlay` from F14 already exists — import and call in step 4 of the merge sequence.
- Boundary / contract check: After this story, running `trustlock check` with a repo that has `extends` in `.trustlockrc.json` must load, merge, and apply the org policy. Tests must verify the full three-step sequence returns a correct merged `PolicyConfig`.
- Files / modules to connect:
  - `src/policy/loader.js` ← imports `resolveExtends` from `./inherit.js`
  - `src/policy/loader.js` ← imports `applyProfileOverlay` from `./builtin-profiles.js` (F14)
  - `src/cli/commands/check.js` ← calls `loadPolicy(args)` at top, replaces direct `loadPolicy(configPath)` call (if any existed from F06/F14)
  - `src/cli/commands/audit.js` ← calls `loadPolicy(args)` at top
  - `src/cli/commands/approve.js` ← calls `loadPolicy(args)` at top
  - `src/cli/commands/init.js` ← calls `loadPolicy(args)` at top
- Deferred integration: `cross-audit.js` is explicitly excluded. That command reads `.trustlockrc.json` directly via `fs.readFile` (D6, C-NEW-4). No follow-up wiring is needed — this is a permanent carve-out, not a deferral.

## Not Allowed To Stub
- `resolveExtends` call in step 2 of loader: must be a real import from `./inherit.js` (S1 must be marked as a dependency)
- `applyProfileOverlay` call in step 4: must be a real import from `./builtin-profiles.js` (F14's named export)
- Command wiring in check.js, audit.js, approve.js, init.js: all four must actually call `await loadPolicy(args)` — no placeholder comments or TODO stubs
- The merged `PolicyConfig` returned by `loadPolicy` must be the actual config used for rule evaluation in each command — not a parallel copy

## Behavioral / Interaction Rules
- **Merge sequence (ADR-005):**
  1. Parse `.trustlockrc.json` (already done by commands; pass result into loader, or loader reads it — pick one pattern and apply consistently)
  2. If `extends` key present: call `resolveExtends(extendsValue, configFilePath, cacheDir)` from `inherit.js` → returns base policy; merge repo over base (scalar/array/object semantics, floor checks) — `inherit.js` owns this merge and floor check
  3. Apply `--profile` overlay: call `applyProfileOverlay(mergedConfig, profileName, profiles, isBuiltin)` from F14. Built-in `relaxed` bypasses floor; user-defined profiles floor-check against merged (extends+repo) config.
  4. Return merged `PolicyConfig`.
- **No `extends` key:** skip step 2 entirely; `loadPolicy` resolves with the repo config + profile overlay applied.
- **Error propagation:** if `resolveExtends` rejects or `applyProfileOverlay` throws, `loadPolicy` must rethrow — CLI commands catch at top level and exit 2.
- **C-NEW-4 carve-out:** `cross-audit.js` reads `.trustlockrc.json` directly via `fs.readFile`. `loadPolicy()` is called only from `check.js`, `audit.js` (single-project), `approve.js`, and `init.js`. This carve-out is permanent and must be documented in `loader.js` file header comment.
- **`loadPolicy` signature:** `loadPolicy({ configPath, cacheDir, profile })` — all values derived from resolved paths (F09 paths.js) and parsed args. Commands extract the needed values before calling.
- **Idempotent on no-`extends`:** calling `loadPolicy` on a repo without `extends` must be equivalent to the previous synchronous config load — same returned shape, same floor check for profile (if any).

## Acceptance Criteria
- [ ] `src/policy/loader.js` exists and exports `loadPolicy({ configPath, cacheDir, profile })` as a named async function.
- [ ] `loadPolicy` calls `resolveExtends` from `./inherit.js` when the repo config contains an `extends` key; skips it when absent.
- [ ] `loadPolicy` calls `applyProfileOverlay` from `./builtin-profiles.js` when `--profile` is passed; skips when absent.
- [ ] `check.js` awaits `loadPolicy(args)` before any delta computation. Old direct config read replaced.
- [ ] `audit.js` (single-project) awaits `loadPolicy(args)` at top of handler.
- [ ] `approve.js` awaits `loadPolicy(args)` at top of handler.
- [ ] `init.js` awaits `loadPolicy(args)` before baseline creation.
- [ ] `cross-audit.js` is NOT modified. Verified: `grep -n "loadPolicy" src/cli/commands/cross-audit.js` → no output.
- [ ] `loader.js` file header documents the C-NEW-4 carve-out: lists the four commands that call `loadPolicy` and explicitly names `cross-audit.js` as the exception.
- [ ] Integration test: repo with `extends` URL → `loadPolicy` returns merged config with org values floor-enforced and profile overlay applied.
- [ ] Integration test: `loadPolicy` rejects on remote unreachable + no cache → CLI command exits 2 with the error message from `inherit.js`.
- [ ] Integration test: repo without `extends` + `--profile strict` → `loadPolicy` applies profile overlay over flat repo config; returns correct merged config.
- [ ] F14 composition test: `--profile strict` applied after `extends` merge; profile floor check runs against the merged (extends+repo) config, not just the repo config alone.
- [ ] C-NEW-4 test: a directory with a malformed `extends` URL in `.trustlockrc.json` does not cause an error when `audit --compare` runs (because `cross-audit.js` never calls `loadPolicy`).

## Task Breakdown
1. Create `src/policy/loader.js` with `loadPolicy({ configPath, cacheDir, profile })` skeleton
2. Implement step 2: detect `extends` key, call `resolveExtends`, receive base policy from inherit.js
3. Implement step 3 (repo merge over base): pass merged config up from `inherit.js` (inherit.js already owns the deep-merge and floor check in S1); receive merged result
4. Implement step 4: call `applyProfileOverlay(mergedConfig, profile, profiles, isBuiltin)` from F14's builtin-profiles.js; handle built-in vs user-defined profile floor bypass
5. Add file header comment documenting the four commands that call `loadPolicy` and the C-NEW-4 cross-audit carve-out
6. Modify `check.js`: add `await loadPolicy(args)` before delta computation, remove any prior direct config load that `loadPolicy` supersedes
7. Modify `audit.js` (single-project handler): add `await loadPolicy(args)` at top
8. Modify `approve.js`: add `await loadPolicy(args)` at top, consume merged config
9. Modify `init.js`: add `await loadPolicy(args)` before baseline creation
10. Write loader integration tests: full three-step sequence, profile+extends composition, C-NEW-4 cross-audit isolation test

## Verification
```bash
node --experimental-vm-modules node_modules/.bin/jest src/policy/loader.test.js --verbose
# Expected: all loader integration tests pass

grep -n "loadPolicy" src/cli/commands/cross-audit.js
# Expected: no output (C-NEW-4 compliance)

grep -n "await loadPolicy" src/cli/commands/check.js src/cli/commands/audit.js src/cli/commands/approve.js src/cli/commands/init.js
# Expected: one match per file showing loadPolicy is called in each command

node --experimental-vm-modules node_modules/.bin/jest --verbose
# Expected: full test suite passes; no regressions in existing command tests
```

## Edge Cases to Handle
- `loadPolicy` called with `extends` but `inherit.js`'s `resolveExtends` rejects: error propagates out of `loadPolicy`, CLI exits 2 — no silent swallow
- `--profile` passed + `extends` present: profile floor check must run against merged (extends+repo) config, not just repo config (per ADR-005 step 4)
- `--profile relaxed` (built-in): floor bypass applies; user-defined `relaxed` profile overrides the built-in entirely (F14's `applyProfileOverlay` handles this distinction — loader just delegates)
- `init.js` with `extends` that points to a URL (first run, no cache): if remote unreachable, `init` exits 2 before writing any `.trustlock/` files
- `audit.js` with `--compare` flag: this is `cross-audit.js`, not the single-project `audit.js`. Single-project `audit.js` DOES call `loadPolicy`; `cross-audit.js` does NOT. The story must not conflate the two.

## Dependencies
- Depends on: F15-S1 (inherit.js must ship first), F14 (applyProfileOverlay exported from builtin-profiles.js), F09 (paths.js for configPath/cacheDir resolution)
- Blocked by: F15-S1 task (loader cannot be wired until inherit.js exists)

## Effort
M — loader itself is straightforward composition; command wiring is mechanical but requires careful handling of the cross-audit carve-out and verification that all four commands use the merged config.

## Metadata
- Agent: pm
- Date: 2026-04-11
- Sprint: 4
- Priority: P1

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
