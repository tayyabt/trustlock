# Story: F02-S03 — npm Lockfile Parser (v1, v2, v3)

## Parent
F02: Lockfile Parsing (npm)

## Description
Implement the npm lockfile parser in `src/lockfile/npm.js` handling v1, v2, and v3 lockfile formats. Each version has a different structure: v1 uses nested `dependencies`, v2 has both `packages` and `dependencies` (prefer `packages`), v3 has `packages` only. The parser returns `ResolvedDependency[]` via the model from F02-S01, with source type classification and direct dependency detection by cross-referencing package.json.

## Scope
**In scope:**
- `src/lockfile/npm.js` — v1, v2, v3 parsing logic, source type classification, direct dependency detection
- `test/lockfile/npm.test.js` — unit tests per version with fixture lockfiles
- `test/fixtures/lockfiles/` — hand-crafted fixture lockfiles for v1, v2, v3 covering edge cases
- Integration test: `parseLockfile()` end-to-end through router and npm parser

**Not in scope:**
- Format detection logic (owned by F02-S02)
- Model definition (owned by F02-S01)
- Registry fetching for missing `hasInstallScripts` (registry module's job)
- pnpm/yarn parsing (v0.2)

## Entry Points
- Route / page / screen: N/A (internal module, no UI)
- Trigger / navigation path: Called by `parser.js:parseLockfile()` after format detection routes to npm
- Starting surface: `src/lockfile/npm.js` is a new file created by this story

## Wiring / Integration Points
- Caller-side ownership: `parser.js` (F02-S02) already has the router structure. This story wires the npm parser into the router's dispatch — `parseLockfile()` must call `parseNpm()` when format is "npm".
- Callee-side ownership: This story owns `parseNpm(content, packageJsonContent, version)` which returns `ResolvedDependency[]` using `validateDependency()` from models.js.
- Caller-side conditional rule: The router (parser.js) exists from F02-S02. Wire `parseNpm` into it now — the import and dispatch must be real, not a placeholder.
- Callee-side conditional rule: The router already exists. Wire the callee to the caller now.
- Boundary / contract check: Integration test calls `parseLockfile()` with real fixture lockfiles and verifies `ResolvedDependency[]` output including all fields.
- Files / modules to connect: `src/lockfile/parser.js` (import npm.js) ↔ `src/lockfile/npm.js` (import models.js)
- Deferred integration, if any: none — this completes the F02 feature.

## Not Allowed To Stub
- v1 parsing — must handle nested `dependencies` tree and flatten correctly
- v2 parsing — must prefer `packages` map over backward-compat `dependencies`
- v3 parsing — must use `packages` map and extract `hasInstallScripts`
- Source type classification — must classify based on `resolved` URL: `git+`/`github:` → "git", `file:` → "file", `https://registry.npmjs.org` or similar → "registry", other URLs → "url"
- Direct dependency detection — must cross-reference `package.json` `dependencies` and `devDependencies` to set `directDependency` and `isDev` flags
- Router wiring — `parser.js` must import and call `npm.js`; no dead import or placeholder dispatch

## Behavioral / Interaction Rules
- `hasInstallScripts` is populated from v3 lockfiles (`hasInstallScripts` field in `packages` entries) and set to `null` for v1/v2 (signals to policy engine that registry fetch is needed)
- `isDev` flag is set by cross-referencing package.json `devDependencies`; packages listed only in `devDependencies` get `isDev: true`
- Empty lockfile (no dependencies) returns empty array, does not crash

## Acceptance Criteria
- [ ] `parseNpm()` correctly parses v1 fixture lockfile into `ResolvedDependency[]` with flattened nested dependencies
- [ ] `parseNpm()` correctly parses v2 fixture lockfile preferring `packages` map over `dependencies`
- [ ] `parseNpm()` correctly parses v3 fixture lockfile extracting `hasInstallScripts` from package entries
- [ ] `hasInstallScripts` is `null` for v1 and v2 parsed dependencies
- [ ] Source type correctly classified: registry deps → "registry", `git+`/`github:` → "git", `file:` → "file", other URLs → "url"
- [ ] `directDependency` flag correctly set by cross-referencing package.json `dependencies` and `devDependencies`
- [ ] `isDev` flag correctly set for devDependency-only packages
- [ ] Scoped packages (`@scope/name`) parsed correctly across all three versions
- [ ] Git-resolved and file-resolved dependencies parsed correctly with appropriate source types
- [ ] Dependencies with no `resolved` field handled gracefully (resolved set to null)
- [ ] Empty lockfile (no dependencies key or empty dependencies) returns empty array
- [ ] Integration test: `parseLockfile("test/fixtures/lockfiles/v3.json", "test/fixtures/lockfiles/package.json")` returns correct `ResolvedDependency[]`
- [ ] `node --test test/lockfile/npm.test.js` passes

## Task Breakdown
1. Create fixture lockfiles in `test/fixtures/lockfiles/`: `v1.json`, `v2.json`, `v3.json`, `package.json` — covering scoped packages, git deps, file deps, devDependencies
2. Create `src/lockfile/npm.js` with internal v1, v2, v3 parsing functions
3. Implement source type classification logic based on `resolved` URL patterns
4. Implement direct dependency detection by reading package.json `dependencies` and `devDependencies`
5. Wire `npm.js` into `parser.js` router dispatch
6. Write `test/lockfile/npm.test.js` with per-version unit tests and edge case coverage
7. Write integration test through `parseLockfile()` with fixture lockfiles

## Verification
```
node --test test/lockfile/npm.test.js
# Expected: all tests pass, no errors

node --test test/lockfile/parser.test.js
# Expected: all tests still pass (router integration)

node --test test/lockfile/
# Expected: all lockfile module tests pass
```

## Edge Cases to Handle
- npm lockfile v1 nested `dependencies` tree — must flatten correctly, handling nested `node_modules/@scope/name` paths
- npm lockfile v2 dual structure — must prefer `packages` map, ignore backward-compat `dependencies`
- Scoped packages (`@scope/name`) — key format includes `node_modules/` prefix in v2/v3 `packages` map
- Git-resolved dependencies — `resolved` starts with `git+` or `github:`
- File-resolved dependencies — `resolved` starts with `file:`
- Packages with no `resolved` field (rare v1 edge case) — set `resolved` to null
- Empty lockfile (no dependencies) — return empty array
- Lockfile with only devDependencies — `isDev` must be true for all, `directDependency` true for top-level

## Dependencies
- Depends on: F02-S01 (model definition), F02-S02 (parser router)
- Blocked by: none

## Effort
M — Three version-specific parsing paths, fixture creation, source type classification, direct dependency cross-reference

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
