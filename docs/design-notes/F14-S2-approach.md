# Design Approach: F14-S2 — --profile CLI Flag and check.js Integration

## Summary
This story wires `--profile <name>` into the CLI and `check.js` command handler. It adds a string flag to `args.js`, applies the F14-S1 `applyProfileOverlay` function after policy load in `check.js`, handles unknown-profile and floor-violation errors, and emits the mandatory ecosystem warning when `provenance.required_for: ["*"]` is in effect.

F14-S1 (`builtin-profiles.js`) already exists in the task-069 worktree (marked complete). This story creates `src/policy/builtin-profiles.js` in this worktree and wires it as a caller-side caller from `check.js`.

## Key Design Decisions

1. **`builtin-profiles.js` copied from task-069**: The file exists in the task-069 worktree. This task creates it in the task-070 worktree, since branches haven't merged yet. The implementation is callee-owned (F14-S1); no logic was re-invented here.

2. **`loadPolicy` preserves `profiles` key**: The existing `config.js` loader silently drops unknown keys. Adding `profiles` passthrough allows `check.js` to access user-defined profiles without a separate file read. This is a non-breaking addition.

3. **Profile resolution in `check.js` (not deferred to `loader.js`)**: Per the story scope, `check.js` calls `applyProfileOverlay` directly in Sprint 3. F15 (`loader.js`) will absorb this call in Sprint 4. The seam is explicit: the F15 migration path is documented in-code.

4. **User-defined overrides built-in by name**: If `config.profiles.relaxed` exists, `isBuiltin = false` even if the name matches a built-in — per the story's edge-case table. Logic: check `config.profiles?.[profileName]` first; presence means user-defined regardless of name.

5. **Mandatory warning is not suppressible by `--quiet`**: For terminal mode, the warning is emitted BEFORE the `if (!quiet)` block. For JSON mode, the `warnings[]` array is included in the JSON output. For `--quiet --json`, the JSON itself is not output (--quiet behavior), but the warning is still in the JSON structure when output is enabled.

6. **`formatCheckResults` extended with optional `warnings[]`**: The JSON formatter already handles all JSON shaping. Passing `warnings` in the grouped object and extracting it in the formatter keeps the output format consistent. `warnings` is only included in JSON output when non-empty.

## Integration / Wiring
- **Caller-side**: `check.js` is the caller; it imports `applyProfileOverlay`, `isBuiltinProfile` from `src/policy/builtin-profiles.js` (F14-S1). The callee already exists.
- **Profile resolution order**: user-defined profile wins over built-in with the same name.
- **Floor violations**: `applyProfileOverlay` throws; the CLI's top-level error handler in `index.js` catches all uncaught async errors and exits 2. No special catch in `check.js`.
- **No-changes early-return path**: profile overlay is applied before the no-changes check, so even when there are no changes, the warning is emitted if `provenance.required_for: ["*"]` is active.
- **F15 seam**: `check.js` calls `applyProfileOverlay` directly for Sprint 3. In Sprint 4, `loadPolicy` (from `loader.js`) will own this and `check.js` will stop calling it. This is noted in a comment in `check.js`.

## Files to Create/Modify
- `src/policy/builtin-profiles.js` — Create (callee; F14-S1 implementation from task-069)
- `src/cli/args.js` — Add `--profile` string option (after `--sarif`)
- `src/cli/commands/check.js` — Import and call `applyProfileOverlay`; handle unknown-profile error; emit mandatory warning
- `src/policy/config.js` — Preserve `profiles` key in `loadPolicy` return value
- `src/output/json.js` — Extend `formatCheckResults` to include `warnings[]` when non-empty
- `test/cli/check-profile.test.js` — Integration-style tests (using `run()` injection pattern)

## Testing Approach
Integration-style unit tests using the `run()` function with injected registry client and `writeAndStage`. Tests cover all story acceptance criteria:
- Strict profile E2E (cooldown override, provenance-all warning in terminal and JSON)
- Relaxed profile E2E (built-in, no floor error, cooldown lowered)
- User-defined profile applied
- Unknown profile → exit 2
- Floor violation → exit 2
- Built-in relaxed lowering cooldown below base → no error
- User-defined `relaxed` → floor enforcement applies
- Mandatory warning in terminal and JSON `warnings[]`
- `--quiet` does not suppress the mandatory terminal warning
- No `--profile` flag → base config used, no warning

## Acceptance Criteria / Verification Mapping

- AC-strict-cooldown: `--profile strict` → cooldown_hours=168 in effect; packages under 168h blocked → Verification: `check-profile.test.js` test `strict profile: packages under 168h cooldown are blocked`
- AC-strict-warning: `--profile strict` → mandatory warning in terminal and JSON `warnings[]` → Verification: `check-profile.test.js` tests `strict profile: mandatory provenance-all warning in terminal` and `strict profile: mandatory warning in JSON warnings[]`
- AC-relaxed-builtin: `--profile relaxed` → cooldown=24h, no floor error → Verification: `check-profile.test.js` test `relaxed built-in profile: no floor error and cooldown=24`
- AC-user-defined: `--profile myprofile` (user-defined in .trustlockrc.json) → overlay applied → Verification: `check-profile.test.js` test `user-defined profile: overlay applied`
- AC-unknown: `--profile unknown` → exit 2 with exact message → Verification: `check-profile.test.js` test `unknown profile: exits 2 with error message`
- AC-floor-violation: user-defined profile lowering cooldown → exit 2 with exact message (C11) → Verification: `check-profile.test.js` test `floor violation: user-defined profile lowering cooldown exits 2`
- AC-builtin-relaxed-floor-exception: built-in relaxed below base → no error → Verification: `check-profile.test.js` test `relaxed built-in profile: no floor error and cooldown=24`
- AC-user-defined-relaxed: user-defined `relaxed` → floor enforcement applies → Verification: `check-profile.test.js` test `user-defined profile named "relaxed": floor enforcement applies`
- AC-required-for-warning: `required_for: ["*"]` → warning in JSON `warnings[]` → Verification: `check-profile.test.js` test `strict profile: mandatory warning in JSON warnings[]`
- AC-no-profile: no `--profile` flag → base config, no warning → Verification: `check-profile.test.js` test `no --profile flag: no profile-related output`
- AC-args-only-profile: `args.js` adds only `--profile`, no re-addition of other flags → Verification: `grep -n "profile" src/cli/args.js` + `git diff`
- AC-C-NEW-2: `check.js` calls `applyProfileOverlay` from `builtin-profiles.js` only → Verification: code inspection + grep
- AC-integration-test: `node --test test/cli/check-profile.test.js` → all pass → Verification: test run

## Verification Results

Command: `node --test test/cli/check-profile.test.js test/unit/cli/check.test.js test/unit/cli/args.test.js test/policy/config.test.js`
Result: 54 tests pass, 0 fail

- AC-strict-cooldown → PASS — `strict profile: packages under 168h but above 72h cooldown are blocked` ✔
- AC-strict-warning → PASS — `strict profile: mandatory provenance-all warning appears in terminal output` ✔
- AC-relaxed-builtin → PASS — `relaxed built-in profile: no floor error and cooldown effective at 24h` ✔; `relaxed built-in profile: packages under 24h cooldown are blocked` ✔
- AC-user-defined → PASS — `user-defined profile: overlay applied (tighter cooldown)` ✔
- AC-unknown → PASS — `unknown profile: exits 2 with exact error message` ✔
- AC-floor-violation → PASS — `floor violation: user-defined profile lowering cooldown exits 2 with exact message` ✔
- AC-builtin-relaxed-floor-exception → PASS — `relaxed built-in profile: no floor error and cooldown effective at 24h` ✔
- AC-user-defined-relaxed → PASS — `user-defined profile named "relaxed": floor enforcement applies` ✔
- AC-required-for-warning → PASS — `strict profile: mandatory warning appears in JSON warnings[]` ✔
- AC-no-profile → PASS — `no --profile flag: base config used, no mandatory warning in output` ✔
- AC-quiet-no-suppress → PASS — `--quiet does not suppress the mandatory provenance-all warning` ✔
- AC-args-only-profile → PASS — `grep -n "profile" src/cli/args.js` shows only the `--profile` entry at line 18; `--quiet`, `--sarif` not re-added; `parses --profile string flag (F14-S2)` ✔
- AC-C-NEW-2 → PASS — `C-NEW-2: applyProfileOverlay from builtin-profiles.js drives the overlay (strict end-to-end)` ✔; no inline re-implementation
- AC-integration-test → PASS — `node --test test/cli/check-profile.test.js` → 15/15 pass

Pre-existing test failures in `test/output/json.test.js` (stale schema_version 1 tests) confirmed not introduced by this task — verified via git stash comparison.

## Environment Setup Blocker
None — all verification is self-contained with injected mocks.

## Stubs
None — the callee (`builtin-profiles.js`) is real; `check.js` calls it for real.
