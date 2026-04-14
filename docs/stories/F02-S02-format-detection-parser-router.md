# Story: F02-S02 — Format Detection and Parser Router

## Parent
F02: Lockfile Parsing (npm)

## Description
Implement the lockfile format detection and parser router in `src/lockfile/parser.js` per ADR-004. The router auto-detects lockfile format by filename and schema version, delegates to format-specific parsers, and fails hard (exit 2) on unrecognized versions.

## Scope
**In scope:**
- `src/lockfile/parser.js` — `detectFormat(lockfilePath)`, `parseLockfile(lockfilePath, packageJsonPath)` router
- `test/lockfile/parser.test.js` — unit tests for format detection and router dispatch
- Fail-hard behavior on unknown lockfile versions (exit 2)

**Not in scope:**
- Actual npm parsing logic (F02-S03)
- pnpm/yarn detection branches (v0.2)
- Registry fetching or policy evaluation

## Entry Points
- Route / page / screen: N/A (internal module, no UI)
- Trigger / navigation path: Called by CLI commands (`init`, `check`, `audit`, `approve`) via `parseLockfile()`
- Starting surface: `src/lockfile/parser.js` is a new file created by this story

## Wiring / Integration Points
- Caller-side ownership: CLI commands will call `parseLockfile(lockfilePath, packageJsonPath)`. CLI does not exist yet (F08). The exported contract is the function signature.
- Callee-side ownership: This story owns format detection and router dispatch. `parseLockfile()` reads the lockfile, calls `detectFormat()`, then delegates to the appropriate parser module. `detectFormat()` returns `{ format: "npm", version: N }`.
- Caller-side conditional rule: CLI callers do not exist yet. Seam is `parseLockfile(lockfilePath, packageJsonPath) → ResolvedDependency[]`.
- Callee-side conditional rule: The npm parser (`npm.js`) does not exist yet. The router must import and call the parser when it exists (F02-S03). For this story, the router structure and detection logic are testable via `detectFormat()` and by verifying the fail-hard path.
- Boundary / contract check: Tests verify `detectFormat()` returns correct format/version for npm lockfiles v1/v2/v3, and that unknown versions trigger exit 2.
- Files / modules to connect: `src/lockfile/parser.js` (new) → imports `src/lockfile/models.js` (F02-S01) → will import `src/lockfile/npm.js` (F02-S03)
- Deferred integration, if any: `parseLockfile()` end-to-end through npm.js deferred to F02-S03. pnpm/yarn branches deferred to v0.2.

## Not Allowed To Stub
- `detectFormat()` — must read the actual lockfile, parse `lockfileVersion`, and return real results
- Fail-hard on unknown versions — must call `process.exit(2)` with descriptive error message "Unsupported npm lockfile version X. trustlock supports v1, v2, v3."
- File reading — must use `node:fs/promises` to read the lockfile, not a stub

## Behavioral / Interaction Rules
- Detection precedence per ADR-004: `package-lock.json` > `pnpm-lock.yaml` > `yarn.lock` (only npm matters for v0.1)
- `--lockfile <path>` override is accepted by the router (path passed in, not auto-detected)

## Acceptance Criteria
- [ ] `detectFormat(lockfilePath)` returns `{ format: "npm", version: 1 }` for v1 lockfiles, `{ format: "npm", version: 2 }` for v2, `{ format: "npm", version: 3 }` for v3
- [ ] Unknown lockfile version (e.g., `lockfileVersion: 4`) causes `process.exit(2)` with message "Unsupported npm lockfile version 4. trustlock supports v1, v2, v3."
- [ ] `parseLockfile(lockfilePath, packageJsonPath)` reads the lockfile, detects format, and delegates to the npm parser
- [ ] Missing lockfile causes `process.exit(2)` with descriptive error
- [ ] Router imports and calls the npm parser module (wired end-to-end in F02-S03)
- [ ] `node --test test/lockfile/parser.test.js` passes

## Task Breakdown
1. Create `src/lockfile/parser.js` with `detectFormat()` that reads lockfile and returns format/version
2. Implement `parseLockfile()` router that delegates to format-specific parser based on detection result
3. Implement fail-hard exit 2 for unknown versions with descriptive error message
4. Write `test/lockfile/parser.test.js` with tests for format detection (v1, v2, v3, unknown), missing lockfile, and router dispatch

## Verification
```
node --test test/lockfile/parser.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Unknown lockfile version (e.g., v4) — exit 2 with descriptive message
- Missing `lockfileVersion` field — treat as unrecognized, exit 2
- Missing lockfile at path — exit 2 with "Lockfile not found" error
- Non-JSON lockfile content — exit 2 with parse error

## Dependencies
- Depends on: F02-S01 (model definition must exist for import)
- Blocked by: none

## Effort
S — Router logic is thin; main work is detection and error handling

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
