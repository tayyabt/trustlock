# Story: F14-S2 — --profile CLI Flag and check.js Integration

## Parent
F14: Policy Profiles

## Description
Adds `--profile <name>` to `src/cli/args.js` (building on F10-modified args.js that already carries `--quiet`, `--sarif`, and the `--json`/`--sarif` mutex) and wires `src/cli/commands/check.js` to resolve the named profile, call `applyProfileOverlay` from F14-S1, and emit the mandatory ecosystem warning when `provenance.required_for: ["*"]` is in effect. Handles unknown profile name error, user-defined floor violations, and the built-in `relaxed` exception.

## Scope
**In scope:**
- `src/cli/args.js`: add `--profile <name>` string flag (building on F10-S4 version)
- `src/cli/commands/check.js`: profile resolution and `applyProfileOverlay` call after policy config load; unknown-profile error; `required_for: ["*"]` warning emission before results
- Integration and E2E tests covering the full CLI → policy overlay path

**Not in scope:**
- `src/policy/builtin-profiles.js` — created in F14-S1; this story only imports it
- `src/policy/loader.js` — Sprint 4 (F15); F14-S2 calls `applyProfileOverlay` directly from `check.js`; `loader.js` will replace this call in Sprint 4 without breaking the exported contract
- `--quiet`, `--sarif`, `--json`/`--sarif` mutex — owned by F10-S4 (task-063); must not be re-added or modified here
- Output formatting — `check.js` delegates to the output module; this story only triggers the warning string at the correct place in the output sequence

## Entry Points
- Route / page / screen: `trustlock check --profile <name>`
- Trigger / navigation path: Developer runs `trustlock check --profile strict` (or `relaxed`, or a user-defined name) from the repo root or via pre-commit hook
- Starting surface: Existing `check` command handler in `src/cli/commands/check.js`

## Wiring / Integration Points
- Caller-side ownership: This story owns the caller wiring — `check.js` imports `applyProfileOverlay`, `isBuiltinProfile`, and `BUILTIN_PROFILES` from `src/policy/builtin-profiles.js` and calls them after `loadPolicy`/config load
- Callee-side ownership: `builtin-profiles.js` (F14-S1) is the callee; it already exists when this story executes
- Caller-side conditional rule: The callee (`builtin-profiles.js`) already exists (F14-S1). Wire to it now — no deferred seam.
- Callee-side conditional rule: N/A — callee is real; no stub.
- Boundary / contract check: Integration test passes `--profile strict` end-to-end via `trustlock check`; verifies that the overlaid cooldown_hours is active in rule evaluation (not just that args parsed)
- Files / modules to connect:
  - `src/cli/args.js` ← add `--profile` string option
  - `src/cli/commands/check.js` ← import from `src/policy/builtin-profiles.js`; call `applyProfileOverlay` after config load; emit warning before results if signaled
- Deferred integration, if any: `loader.js` (F15, Sprint 4) will import `applyProfileOverlay` and call it at step 4 of the ADR-005 merge sequence. `check.js` in Sprint 4 will stop calling it directly and instead receive the overlaid config from `loadPolicy`. That migration is F15's responsibility — this story does NOT anticipate it.

## Not Allowed To Stub
- `args.js` `--profile` flag must be real and parsed via `node:util.parseArgs` — no manual `process.argv` slicing
- `check.js` must actually call `applyProfileOverlay` with the correct `isBuiltin` flag — not a future TODO
- The unknown-profile error path (`Profile "myprofile" not found in .trustlockrc.json or built-in profiles.`) must be a real exit-2 error — not a console.warn
- The `required_for: ["*"]` warning must appear before results in both terminal and JSON `warnings[]` array — not suppressed, not a TODO
- The floor enforcement error (thrown by `applyProfileOverlay`) must propagate as an exit-2 error via the CLI's existing uncaught-error handler — not silently swallowed

## Behavioral / Interaction Rules
- In `check.js`, after loading the base policy config (step 2a of the check flow), if `args.profile` is present:
  1. Look up `config.profiles?.[profileName]` (user-defined) and determine `isBuiltin` via `isBuiltinProfile(profileName)`
  2. If `profilesMap[profileName]` is absent AND `isBuiltinProfile(profileName)` is false: exit 2 with `Profile "${profileName}" not found in .trustlockrc.json or built-in profiles.`
  3. Call `applyProfileOverlay(mergedConfig, profileName, config.profiles ?? {}, isBuiltinProfile(profileName))`
  4. If `applyProfileOverlay` throws (floor violation): the CLI's top-level error handler catches it and exits 2 with the error message — no special catch needed in `check.js`
  5. If the return value signals `provenance.required_for: ["*"]` is in effect: enqueue the mandatory ecosystem warning — emit it before the results block in both terminal and JSON (`warnings[]` array). Not suppressible (no `--quiet` bypass, no condition).
- The mandatory ecosystem warning text: `Warning: ~85-90% of npm packages have no provenance. All packages are required to have provenance under the active profile.` (or equivalent specified text — developer must confirm exact wording against F14 brief)
- No `--profile` flag: base config used directly; `applyProfileOverlay` not called; no profile-related output
- `--profile relaxed` (built-in): `isBuiltin = true`; `applyProfileOverlay` skips floor checks; permitted to lower cooldown below base
- User-defined profile named `relaxed` in `.trustlockrc.json`: `isBuiltin = false`; floor enforcement applies — no exception
- C-NEW-5: `args.js` in this story adds only `--profile`. It does NOT re-add `--quiet`, `--sarif`, or the mutex. Those are already present from F10-S4.

## Acceptance Criteria
- [ ] `trustlock check --profile strict`: `cooldown_hours=168` in effect; packages that would pass base cooldown (e.g., 72h) are blocked when under 168h; `provenance.required_for: ["*"]` mandatory warning emitted before results in terminal output and in JSON `warnings[]`
- [ ] `trustlock check --profile relaxed`: `cooldown_hours=24` in effect; packages admitted at 24h that would be blocked at base cooldown; no floor enforcement error (built-in exception, C11)
- [ ] `trustlock check --profile myprofile` where `myprofile` is defined in `.trustlockrc.json`: user-defined overlay applied
- [ ] `trustlock check --profile unknown`: exits 2 with `Profile "unknown" not found in .trustlockrc.json or built-in profiles.`
- [ ] User-defined profile lowering `cooldown_hours` below base: exits 2 with `Profile "<name>" sets cooldown_hours=N, below base config minimum of M. Profiles can only tighten policy, not loosen it.` (C11)
- [ ] Built-in `relaxed` lowering `cooldown_hours` below base config: no error (C11 exception)
- [ ] User-defined profile named `relaxed`: floor enforcement applies (not treated as built-in)
- [ ] `required_for: ["*"]` in any active profile: mandatory warning appears before results in terminal; appears in `warnings[]` in `--json` output; not suppressible by `--quiet`
- [ ] No `--profile` flag: no profile-related output; base config used directly
- [ ] `args.js` adds only `--profile` in this story; `--quiet`, `--sarif`, and `--json`/`--sarif` mutex are NOT re-added (already present from F10-S4) — confirmed by git diff against F10-S4 base
- [ ] (C-NEW-2) `check.js` calls `applyProfileOverlay` using only its public exported signature; no inline re-implementation of overlay or floor logic
- [ ] Integration test: `node src/cli/index.js check --profile strict` against a fixture lockfile with packages under 168h cooldown → exits with blocked status and mandatory warning in output
- [ ] All tests pass: `node --test test/cli/check-profile.test.js` (or equivalent integration test file)

## Task Breakdown
1. Add `--profile` string option to `src/cli/args.js` using `node:util.parseArgs` (after `--sarif` entry from F10-S4)
2. In `check.js`, after policy config load: add profile resolution block — call `isBuiltinProfile`, check user-defined `config.profiles`, handle not-found error exit
3. Call `applyProfileOverlay(mergedConfig, profileName, config.profiles ?? {}, isBuiltinProfile(profileName))`; assign result as the active config; propagate floor-violation throws to top-level error handler
4. Read the return value from `applyProfileOverlay`; if `required_for: ["*"]` warning is signaled: enqueue mandatory ecosystem warning for pre-results emission in both terminal and JSON output paths
5. Write integration tests: strict profile E2E, relaxed profile E2E, user-defined profile, unknown profile error, floor violation error, required_for warning in terminal and JSON, no-profile baseline behavior

## Verification
```
node --test test/cli/check-profile.test.js
# Expected: all integration tests pass

node src/cli/index.js check --profile strict
# Expected: mandatory ecosystem warning before results; stricter cooldown applied

node src/cli/index.js check --profile unknown
# Expected: exit 2, "Profile "unknown" not found in .trustlockrc.json or built-in profiles."

node src/cli/index.js check --profile relaxed --json
# Expected: exit 0 (or 1 if blocked for other reasons); no floor error; JSON output has schema_version: 2

grep -n "profile" src/cli/args.js
# Expected: --profile entry present; no re-addition of --quiet or --sarif
```

## Edge Cases to Handle
- `profiles` key absent from `.trustlockrc.json`: treat as empty object; built-in profiles still available
- User-defined `relaxed` in `.trustlockrc.json`: `isBuiltinProfile("relaxed")` returns `true` but `config.profiles.relaxed` exists → user-defined wins; `isBuiltin = false` → floor enforcement applies. Logic: check `profilesMap[name]` first; if present, treat as user-defined (`isBuiltin = false`) regardless of name
- Profile with `required_for: ["*"]` active: warning must appear even when output is `--json`; it goes into `warnings[]`
- `--profile` combined with `--enforce`: overlay is applied; floor enforcement errors still exit 2; `required_for` warning still appears before results; `--enforce` exit-1 behavior is unchanged
- `--profile strict` with a package that already has provenance: no double-warning; just the mandatory pre-results warning from the profile; individual package result is admitted

## Dependencies
- Depends on: F14-S1 (builtin-profiles module — `applyProfileOverlay` must be importable)
- Depends on: task-059 (F09-S1 — paths.js; `check.js` uses `projectRoot`/`gitRoot` resolution)
- Depends on: task-063 (F10-S4 — args.js already has `--quiet`, `--sarif`, mutex; F14-S2 must not conflict)
- Blocked by: none external

## Effort
M — caller wiring in check.js is moderate; args.js change is small; integration tests cover 6+ cases

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
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
