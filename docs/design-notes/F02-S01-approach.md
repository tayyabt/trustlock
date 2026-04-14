# Design Approach: F02-S01 — ResolvedDependency Model and Validation

## Summary
Create the `ResolvedDependency` common data model in `src/lockfile/models.js`. This is the contract between all lockfile parsers and downstream consumers (baseline manager, policy engine). The module ships source-type constants and a `validateDependency()` function that coerces and validates a plain object into a well-typed `ResolvedDependency`, throwing descriptive errors on invalid input.

No UI, no external I/O. Pure JavaScript functions. Must ship before lockfile parsers (F02-S02/S03) and delta computation (F04).

## Key Design Decisions
1. **Plain objects, not classes** (global conventions): `ResolvedDependency` is a plain JS object. `validateDependency()` returns a new plain object, not a class instance.
2. **Strict field validation**: Missing required fields (`name`, `version`, `sourceType`) and invalid `sourceType` values throw with descriptive messages.
3. **Nullable fields are explicit**: `resolved`, `integrity`, and `hasInstallScripts` accept `null` and `undefined` (coerced to `null`). This reflects real lockfile gaps in v1/v2.
4. **Boolean coercion**: `isDev` and `directDependency` are always coerced to booleans via `!!`.
5. **Source type constants**: Exported as `SOURCE_TYPES` object so parsers reference constants, not raw strings.
6. **Zero dependencies**: Pure Node.js — no imports needed.

## Design Compliance
N/A — no UI or design preview applicable.

## Integration / Wiring
- **Caller-side**: Lockfile parsers (`src/lockfile/npm.js`, future pnpm.js/yarn.js) import `validateDependency` and `SOURCE_TYPES`. Callers do not exist yet — seam is the exported function signature.
- **Callee-side**: This story owns the model definition. `validateDependency(dep)` is the boundary.
- **Deferred**: Parser integration deferred to F02-S03.
- **Boundary check**: Unit tests verify valid objects pass, invalid objects throw.

## Files Expected to Change
- `src/lockfile/models.js` — new file
- `test/lockfile/models.test.js` — new file

## Acceptance Criteria / Verification Mapping
| AC | Verification |
|---|---|
| `validateDependency()` returns a `ResolvedDependency` object | Unit test: valid input passes without throw |
| All 8 fields present with correct types | Unit test: asserts each field on returned object |
| Throws on missing `name`, `version`, `sourceType` | Unit tests: missing-field error cases |
| Throws on invalid `sourceType` value | Unit test: invalid sourceType error case |
| `hasInstallScripts: null` accepted | Unit test: null value passes |
| Source type constants exported | Unit test: imports `SOURCE_TYPES` and checks all 4 values |
| All 4 source types accepted | Unit tests: registry, git, file, url all pass |
| `node --test test/lockfile/models.test.js` passes | Run command, observe 0 failures |

## Test Strategy
Single test file `test/lockfile/models.test.js` using `node:test` + `node:assert/strict`. Tests:
1. Valid dependency with all fields returns correct object
2. Missing `name` throws
3. Missing `version` throws
4. Missing `sourceType` throws
5. Invalid `sourceType` throws with descriptive message
6. `hasInstallScripts: null` is valid
7. All four source types pass validation
8. SOURCE_TYPES constants are exported correctly

## Risks and Questions
- None. Scope is clear, no external dependencies, no async behavior.

## Stubs
None. All code is real and functional.

## Verification Results
- AC: `validateDependency()` returns validated ResolvedDependency — PASS (test: "returns a valid ResolvedDependency for a fully-populated input")
- AC: All 8 fields correct — PASS (asserted name, version, resolved, integrity, isDev, hasInstallScripts, sourceType, directDependency)
- AC: Throws on missing `name` — PASS (test: "throws a descriptive error when name is missing")
- AC: Throws on missing `version` — PASS (test: "throws a descriptive error when version is missing")
- AC: Throws on missing `sourceType` — PASS (test: "throws a descriptive error when sourceType is missing")
- AC: Throws on invalid sourceType — PASS (test: "throws a descriptive error for an invalid sourceType value")
- AC: null hasInstallScripts accepted — PASS (tests: "accepts hasInstallScripts: null", "accepts hasInstallScripts: undefined")
- AC: SOURCE_TYPES exported — PASS (test: "exports all four source type constants")
- AC: All 4 source types accepted — PASS (4 tests: registry, git, file, url)
- AC: `node --test test/lockfile/models.test.js` passes — PASS (16 tests, 2 suites, 0 failures)

## Environment Setup Blocker
Prerequisite Key: none
ENV_SETUP Task: none

## Documentation Updates
None — no existing docs require changes for a new internal module.

## Metadata
- Agent: developer
- Date: 2026-04-08
- Work Item: F02-S01
- Work Type: story
- Branch: burnish/task-016-implement-resolveddependency-model-and-validation
- ADR: ADR-001 (zero runtime dependencies), ADR-004 (lockfile parser architecture)
