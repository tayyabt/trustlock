# Story: F02-S01 — ResolvedDependency Model and Validation

## Parent
F02: Lockfile Parsing (npm)

## Description
Define the common `ResolvedDependency` data model and validation function in `src/lockfile/models.js`. This model is the contract between the lockfile parsers and all downstream consumers (baseline, policy engine). Must ship first so F04 delta computation can begin without waiting for parser completion (constraint C1).

## Scope
**In scope:**
- `src/lockfile/models.js` — `ResolvedDependency` model definition, source type constants, `validateDependency()` function
- `test/lockfile/models.test.js` — unit tests for validation

**Not in scope:**
- Lockfile parsing logic (S02, S03)
- Format detection (S02)
- Registry fetching or policy evaluation

## Entry Points
- Route / page / screen: N/A (internal data model, no UI)
- Trigger / navigation path: Imported by lockfile parsers and downstream modules (baseline, policy)
- Starting surface: `src/lockfile/models.js` is a new file created by this story

## Wiring / Integration Points
- Caller-side ownership: Lockfile parsers (npm.js, future pnpm.js/yarn.js) will import `validateDependency()` and source type constants. Callers do not exist yet — seam is the exported function signature.
- Callee-side ownership: This story owns the model definition and validation. `validateDependency(dep)` accepts a plain object and returns a validated `ResolvedDependency` or throws.
- Caller-side conditional rule: Callers (npm.js) do not exist yet. The exported contract is: `validateDependency(obj) → ResolvedDependency`. Parser stories (F02-S03) will wire to this.
- Callee-side conditional rule: No callers exist yet. Exports must be stable for downstream F04/F06 consumption.
- Boundary / contract check: Unit tests verify that valid objects pass validation and invalid objects throw descriptive errors.
- Files / modules to connect: `src/lockfile/models.js` (new)
- Deferred integration, if any: Actual parser integration deferred to F02-S03.

## Not Allowed To Stub
- `ResolvedDependency` field definitions — all fields must be real with correct types and nullability
- `validateDependency()` — must perform real validation, not a pass-through
- Source type constants (`registry`, `git`, `file`, `url`) — must be the actual values used throughout the system

## Behavioral / Interaction Rules
none

## Acceptance Criteria
- [ ] `models.js` exports `validateDependency(dep)` that returns a validated `ResolvedDependency` object
- [ ] `ResolvedDependency` includes all fields: `name`, `version`, `resolved` (URL or null), `integrity` (hash or null), `isDev` (boolean), `hasInstallScripts` (boolean or null), `sourceType` ("registry" | "git" | "file" | "url"), `directDependency` (boolean)
- [ ] `validateDependency()` throws descriptive errors for missing required fields (`name`, `version`, `sourceType`) and invalid `sourceType` values
- [ ] `hasInstallScripts: null` is accepted as valid (signals v1/v2 lockfile where field is unavailable)
- [ ] Source type constants are exported for use by parsers
- [ ] Unit tests cover: valid dependency, missing name, missing version, invalid sourceType, null hasInstallScripts, all four source types
- [ ] `node --test test/lockfile/models.test.js` passes

## Task Breakdown
1. Create `src/lockfile/models.js` with `ResolvedDependency` field documentation, source type constants, and `validateDependency()` function
2. Write `test/lockfile/models.test.js` with unit tests covering valid objects, missing fields, invalid types, and null-allowed fields

## Verification
```
node --test test/lockfile/models.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- `hasInstallScripts: null` is valid (v1/v2 lockfiles don't provide this field)
- `resolved: null` is valid (rare in v1 lockfiles where resolved URL is missing)
- `integrity: null` is valid (git and file dependencies may lack integrity hashes)

## Dependencies
- Depends on: F01 (shared utilities — must exist for project structure)
- Blocked by: none

## Effort
S — Single module, well-defined fields from ADR-004 and data model docs

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

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
