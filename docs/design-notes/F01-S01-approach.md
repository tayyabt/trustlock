# Design Approach: F01-S01 Project Skeleton and Test Harness

## Summary
Create the foundational project skeleton for trustlock: package.json with bin entry, ES module entry point with shebang, directory structure, and a working test harness using Node.js built-in test runner. This is the base layer every other feature builds on.

The entry point prints the package version and exits 0. Real command routing is deferred to F08.

## Key Design Decisions
1. **Zero dependencies enforced from day one**: package.json has no `dependencies` field (ADR-001). Dev dependencies are also omitted since the built-in test runner is sufficient.
2. **ES modules throughout**: `"type": "module"` in package.json. All imports use `import` syntax.
3. **Node >= 18.3**: Required for `node:util.parseArgs` (ADR-001). Set in `engines` field.
4. **Entry point prints version**: `src/index.js` reads version from package.json and prints it. This is real behavior, not a stub. F08 will replace the body with command routing.
5. **Built-in test runner**: `node --test` discovers `test/*.test.js` files. No external test framework needed.

## Design Compliance
N/A — no UI, no design preview applicable.

## Integration / Wiring
- **Caller-side**: `package.json` `bin.trustlock` points to `src/index.js`
- **Callee-side**: `src/index.js` is the entry point. Prints version and exits.
- **Deferred**: Real command routing deferred to F08. The seam is the body of `src/index.js`.
- **Boundary check**: `node src/index.js` exits 0; `node -e "import('./src/index.js')"` succeeds.

## Files to Create/Modify
- `package.json` — project metadata, bin entry, type, engines, test script
- `src/index.js` — bin entry point with shebang, version print
- `src/utils/.gitkeep` — placeholder for utils directory
- `test/fixtures/.gitkeep` — placeholder for fixtures directory
- `test/smoke.test.js` — smoke test validating module import and package.json fields

## Testing Approach
One smoke test file using `node:test` and `node:assert/strict`:
- Test that `src/index.js` is importable as an ES module
- Test that package.json has correct `type`, `engines`, `bin`, and zero dependencies

## Acceptance Criteria / Verification Mapping
- AC: package.json fields -> Verification: test assertion + manual `node -e` check
- AC: src/index.js shebang and ES module -> Verification: test import + `node -e "import('./src/index.js')"`
- AC: ES module validation -> Verification: `node -e "import('./src/index.js')"`
- AC: node --test runs tests -> Verification: `node --test` execution
- AC: directory structure -> Verification: `ls` inspection

## Verification Results
- AC: package.json has bin, type, engines, zero deps -> PASS — `node -e "const pkg = ..."` prints OK; test assertions pass (5/5)
- AC: src/index.js has shebang and is valid ES module -> PASS — file starts with `#!/usr/bin/env node`, `chmod +x` applied, `node src/index.js` exits 0
- AC: `node -e "import('./src/index.js')"` succeeds -> PASS — prints `trustlock v0.1.0`, no errors
- AC: `node --test` discovers and runs tests -> PASS — 5 tests, 1 suite, 0 failures
- AC: directory structure exists (src/utils/, test/, test/fixtures/) -> PASS — all three directories confirmed

## Story Run Log Update
### 2026-04-08 Developer: Implementation
- Created project skeleton per F01-S01 spec
- `node -e "import('./src/index.js')"` -> PASS (prints `trustlock v0.1.0`)
- `node --test` -> PASS (5 tests, 0 failures)
- `node src/index.js` -> PASS (exit 0)
- package.json field validation -> PASS
- Directory structure verified -> PASS
- All 5 acceptance criteria satisfied

## Documentation Updates
None — this is the initial skeleton; no existing docs to update.

## Deployment Impact
None — initial project creation, no migrations or env vars.

## Environment Setup Blocker
Prerequisite Key: none
ENV_SETUP Task: none

## Questions/Concerns
None — scope is clear and minimal.

## Stubs
None. All code is real and functional.

## Metadata
- Agent: developer
- Date: 2026-04-08
- Work Item: F01-S01
- Work Type: story
- Branch: burnish/task-013-implement-project-skeleton-and-test-harness
- ADR: ADR-001 (zero runtime dependencies)
- Design Preview: N/A
- Design Notes Source: N/A
