# Review Artifact: task-016 — ResolvedDependency Model and Validation

## Outcome
Implementation complete. All acceptance criteria pass. Ready for review.

## What Was Built
- `src/lockfile/models.js` — `ResolvedDependency` plain-object model, `SOURCE_TYPES` constants (registry, git, file, url), and `validateDependency()` validation function.
- `test/lockfile/models.test.js` — 16 unit tests covering all acceptance criteria.

## Acceptance Criteria Summary
| AC | Status |
|---|---|
| `validateDependency()` returns a validated ResolvedDependency | PASS |
| All 8 fields present with correct types | PASS |
| Throws on missing `name` | PASS |
| Throws on missing `version` | PASS |
| Throws on missing `sourceType` | PASS |
| Throws on invalid `sourceType` value | PASS |
| `hasInstallScripts: null` accepted | PASS |
| SOURCE_TYPES constants exported | PASS |
| All four source types accepted | PASS |
| `node --test test/lockfile/models.test.js` passes | PASS (16/16) |

## Verification Command
```
node --test test/lockfile/models.test.js
# tests 16 | pass 16 | fail 0
```

## Stubs
None.

## Notes
- `hasInstallScripts: undefined` is treated identically to `null` — coerced to `null` on the returned object. This correctly handles v1/v2 lockfiles where the field is absent.
- `isDev` and `directDependency` are always boolean via `!!` coercion.
- `resolved` and `integrity` accept `null` or `undefined`, both stored as `null`.

## Metadata
- Agent: developer
- Date: 2026-04-08
- Task: task-016
- Branch: burnish/task-016-implement-resolveddependency-model-and-validation
