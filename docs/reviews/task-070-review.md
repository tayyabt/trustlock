# Review Handoff: task-070 — --profile CLI Flag and check.js Integration

## Status
Ready for review.

## Summary
Implements F14-S2: adds `--profile <name>` to `args.js` and wires `check.js` to resolve the profile, call `applyProfileOverlay` from `builtin-profiles.js`, and emit the mandatory ecosystem warning when `provenance.required_for: ["*"]` is active.

## Files Changed
- `src/policy/builtin-profiles.js` — new; callee from F14-S1 (copied from task-069 worktree, not yet merged)
- `src/cli/args.js` — `--profile` string flag added after `--sarif`
- `src/cli/commands/check.js` — profile resolution block after policy load; mandatory warning emission before results; `PROVENANCE_ALL_WARNING` constant
- `src/policy/config.js` — `profiles` key preserved in `loadPolicy` return value
- `src/output/json.js` — `formatCheckResults` extended to include `warnings[]` when non-empty
- `test/cli/check-profile.test.js` — new; 15 integration-style tests
- `test/unit/cli/args.test.js` — updated guard test (was: `--profile throws`; now: `parses --profile string flag`)

## Verification
```
node --test test/cli/check-profile.test.js test/unit/cli/check.test.js test/unit/cli/args.test.js test/policy/config.test.js
# Result: 54 tests pass, 0 fail
```

All 13 story acceptance criteria pass. The pre-existing failures in `test/output/json.test.js` are stale schema_version 1 tests unrelated to this task (confirmed via git stash comparison).

## Acceptance Criteria Summary
- `--profile strict`: cooldown=168h, packages under 168h blocked, mandatory warning emitted → PASS
- `--profile relaxed` (built-in): no floor error, cooldown=24h effective → PASS
- `--profile myprofile` (user-defined): overlay applied → PASS
- `--profile unknown`: exit 2 with exact message → PASS
- Floor violation (user-defined lowering cooldown): exit 2 with exact message → PASS
- Built-in relaxed below base: no error (C11 exception) → PASS
- User-defined `relaxed`: floor enforcement applies → PASS
- `required_for: ["*"]` warning in terminal and JSON `warnings[]` → PASS
- `--quiet` does not suppress mandatory warning → PASS
- No `--profile`: base config, no warning → PASS
- args.js adds only `--profile`; no re-addition of `--quiet`/`--sarif` → PASS
- C-NEW-2: `applyProfileOverlay` called via public API only → PASS
- Integration test suite: `node --test test/cli/check-profile.test.js` → 15/15 PASS

## Design Note
`docs/design-notes/F14-S2-approach.md`
