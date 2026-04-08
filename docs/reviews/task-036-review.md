# Review: task-036 — `approve` Command (F08-S3)

## Status
Ready for review

## Summary
Implemented `src/cli/commands/approve.js` as a full replacement for the F08-S1 stub. The command orchestrates argument parsing, pre-flight validation, lockfile lookup, approver identity resolution, and atomic approval file append.

## What Was Done

- **`src/cli/commands/approve.js`**: Full implementation. Replaces 2-line stub.
  - Parses `<pkg>@<ver>` (including scoped packages like `@scope/name@1.0.0`)
  - Pre-validates all inputs with story-specified error messages before calling store
  - Rejects (not caps) `--expires` exceeding `max_expiry_days`
  - Reads `require_reason` and `max_expiry_days` from raw `.depfencerc.json` (not in PolicyConfig model)
  - Wires to `parseLockfile`, `writeApproval`, `getGitUserName`, `VALID_RULE_NAMES`, `parseDuration`
  - No stubs; all wiring is to real implemented modules (F01, F02, F05)

- **`test/unit/cli/approve.test.js`**: 14 unit tests covering all 8 ACs plus edge cases.

## Acceptance Criteria

| AC | Status |
|---|---|
| AC1: happy path writes valid entry to approvals.json | PASS |
| AC2: entry shape — all 7 required fields present | PASS |
| AC3: `--as <name>` overrides git config for approver | PASS |
| AC4: package not in lockfile → exit 2 + specific error | PASS |
| AC5: invalid override → exit 2 + lists valid rule names | PASS |
| AC6: `--expires` exceeding max → exit 2 + shows configured max | PASS |
| AC7: missing reason when require_reason:true → exit 2 | PASS |
| AC8: append to existing approvals (not overwrite) | PASS |

## Test Run
```
node --test test/unit/cli/approve.test.js
# 14 pass, 0 fail
```

## Design Note
`docs/design-notes/F08-S3-approach.md`

## Key Decisions for Reviewer

1. **Error messages use actual VALID_RULE_NAMES** (from `models.js`): `provenance, cooldown, pinning, scripts, sources, new-dep, transitive`. The story listed a stale set of rule names from planning; the implementation uses the authoritative model.

2. **Expiry is rejected (not capped)**: `createApproval` in models.js caps silently. The story explicitly says "reject with specific error message (do not silently cap)". The command pre-validates before calling `writeApproval`.

3. **`require_reason` defaults to true, `max_expiry_days` defaults to 30** when absent from `.depfencerc.json`. These fields are not in the `PolicyConfig` model returned by `loadPolicy()`.
