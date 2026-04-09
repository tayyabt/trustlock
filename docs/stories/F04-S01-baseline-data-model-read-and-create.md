# Story: F04-S01 — Baseline data model, read, and create

## Parent
F04: Baseline Management

## Description
Define the Baseline and TrustProfile data structures, implement createBaseline() to build an initial baseline from parsed lockfile dependencies, and implement readBaseline() to load and validate the persisted baseline file. This is the foundation for all other baseline operations.

## Scope
**In scope:**
- `src/baseline/manager.js` — Baseline/TrustProfile data structures, createBaseline(), readBaseline(), validation logic
- `test/baseline/manager.test.js` — unit tests for create, read, and validation

**Not in scope:**
- Delta computation (F04-S02)
- Baseline advancement and auto-staging (F04-S03)
- Policy evaluation
- Registry fetching

## Entry Points
- Route / page / screen: N/A — internal data layer module
- Trigger / navigation path: Called programmatically by CLI init command (F08, future)
- Starting surface: `src/baseline/manager.js` — importable module

## Wiring / Integration Points
- Caller-side ownership: CLI init command (F08) will call `createBaseline()` and write the result. Caller does not exist yet — keep the seam explicit. Expected contract: `createBaseline(dependencies: ResolvedDependency[], lockfileHash: string) => Baseline`.
- Callee-side ownership: This story owns the full `manager.js` module including data structure definitions, `createBaseline()`, and `readBaseline()`.
- Caller-side conditional rule: No caller exists yet. Export functions as named exports from `src/baseline/manager.js` so future callers import directly.
- Callee-side conditional rule: Imports `ResolvedDependency` model from `src/lockfile/models.js` (F02-S01, already exists). Wire to it now.
- Boundary / contract check: Unit tests verify createBaseline produces valid Baseline objects and readBaseline round-trips correctly.
- Files / modules to connect: `src/baseline/manager.js` imports from `src/lockfile/models.js`
- Deferred integration, if any: CLI init command wiring (F08) — deferred to sprint 2.

## Not Allowed To Stub
- `createBaseline()` must produce real `TrustProfile` entries with all fields (name, version, admittedAt, provenanceStatus, hasInstallScripts, sourceType)
- `readBaseline()` must perform real JSON parsing and schema validation
- Validation must produce real error messages with exit code 2 for corrupted/invalid files

## Behavioral / Interaction Rules
- `schema_version` is hardcoded to `1` for v0.1
- `lockfile_hash` is SHA-256 of raw lockfile content, computed by the caller and passed in
- Baseline packages are keyed by package name for O(1) lookup
- `readBaseline()` returns a structured error (not throws) for missing file, corrupted JSON, and schema_version mismatch — the caller decides the exit code
- `provenanceStatus` in TrustProfile accepts: `"verified"`, `"unverified"`, `"unknown"` (when registry data is unavailable at init time, the caller passes `"unknown"`)

## Acceptance Criteria
- [ ] `createBaseline(dependencies, lockfileHash)` returns a `Baseline` object with `schema_version: 1`, `created_at` timestamp, `lockfile_hash`, and a `packages` map keyed by package name
- [ ] Each package entry in `packages` is a `TrustProfile` with fields: `name`, `version`, `admittedAt`, `provenanceStatus`, `hasInstallScripts`, `sourceType`
- [ ] `readBaseline(baselinePath)` loads `.trustlock/baseline.json`, parses JSON, validates schema_version, and returns the Baseline object
- [ ] `readBaseline()` returns `{ error: "not_initialized" }` when the file does not exist
- [ ] `readBaseline()` returns `{ error: "corrupted" }` when the file contains invalid JSON
- [ ] `readBaseline()` returns `{ error: "unsupported_schema", version: N }` when schema_version is not 1
- [ ] Unit tests cover: valid create, valid read round-trip, missing file, corrupted file, wrong schema_version, empty dependency list

## Task Breakdown
1. Create `src/baseline/manager.js` with Baseline and TrustProfile structure definitions
2. Implement `createBaseline(dependencies, lockfileHash)` — maps ResolvedDependency[] to TrustProfile entries, builds Baseline object
3. Implement `readBaseline(baselinePath)` — reads file, parses JSON, validates schema, returns Baseline or structured error
4. Write unit tests in `test/baseline/manager.test.js` covering all acceptance criteria

## Verification
```
node --test test/baseline/manager.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Empty dependency list — createBaseline returns valid Baseline with empty packages map
- Baseline file missing — readBaseline returns `{ error: "not_initialized" }`, not a crash
- Baseline file corrupted (invalid JSON) — readBaseline returns `{ error: "corrupted" }`
- schema_version mismatch — readBaseline returns `{ error: "unsupported_schema", version: N }`
- First run after init — baseline exists but packages map reflects full lockfile

## Dependencies
- Depends on: F02-S01 (ResolvedDependency model in `src/lockfile/models.js`)
- Blocked by: none

## Effort
M — standard data model + read/write + validation with error paths

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
