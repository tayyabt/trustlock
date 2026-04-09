# Story: F01-S01 — Project Skeleton and Test Harness

## Parent
F01: Project Scaffolding & Shared Utilities

## Description
Create the project skeleton with package.json, bin entry point, directory structure, and test harness. This is the foundation that every other story and feature builds on — nothing can ship without this landing first.

## Scope
**In scope:**
- `package.json` with bin, type, engines, and zero dependencies
- `src/index.js` bin entry point stub with shebang
- Directory structure: `src/utils/`, `test/`, `test/fixtures/`
- Test harness configuration using Node.js built-in test runner
- ES module validation

**Not in scope:**
- Utility module implementations (semver, time, git) — those are F01-S02 and F01-S03
- CLI argument parsing — that is F08
- Any runtime behavior beyond the entry point stub

## Entry Points
- Route / page / screen: `trustlock` CLI binary (stub only)
- Trigger / navigation path: `npx trustlock` or `node src/index.js`
- Starting surface: Terminal — user invokes the CLI

## Wiring / Integration Points
- Caller-side ownership: `package.json` `bin` field points to `src/index.js`
- Callee-side ownership: `src/index.js` is the entry point stub — prints version and exits. Real command routing wired in F08.
- Caller-side conditional rule: The bin entry is wired now. No caller depends on this stub doing real work yet.
- Callee-side conditional rule: The entry point will be replaced by F08's command router. The seam is the default export of `src/index.js`.
- Boundary / contract check: `node src/index.js` runs without error; `node -e "import('./src/index.js')"` succeeds (ES module validation)
- Files / modules to connect: `package.json` -> `src/index.js`
- Deferred integration: Real command routing deferred to F08

## Not Allowed To Stub
- `package.json` must have real `bin`, `type`, `engines`, and empty `dependencies` — not placeholder values
- `src/index.js` must have a real shebang and be executable
- Test harness must actually run and report results (not just config files with no test)

## Behavioral / Interaction Rules
- `node src/index.js` must exit 0
- `engines.node` must be `>=18.3` (for `node:util.parseArgs` per ADR-001)
- `type` must be `module` (ES modules throughout)
- `dependencies` must be an empty object or absent (ADR-001: zero runtime deps)

## Acceptance Criteria
- [ ] `package.json` exists with `"bin": { "trustlock": "src/index.js" }`, `"type": "module"`, `"engines": { "node": ">=18.3" }`, zero `dependencies`
- [ ] `src/index.js` has `#!/usr/bin/env node` shebang and is valid ES module
- [ ] `node -e "import('./src/index.js')"` succeeds without error
- [ ] `node --test` discovers and runs at least one test file successfully
- [ ] Directory structure exists: `src/utils/`, `test/`, `test/fixtures/`

## Task Breakdown
1. Create `package.json` with name, version, bin, type, engines, scripts (test: `node --test`)
2. Create `src/index.js` with shebang, minimal ES module body
3. Create directory structure: `src/utils/`, `test/`, `test/fixtures/`
4. Create a smoke test (`test/smoke.test.js`) that imports `src/index.js` and validates it's a valid module
5. Verify `node --test` runs and passes

## Verification
```
node -e "import('./src/index.js')"
# Expected: exits 0, no errors

node --test
# Expected: 1 test file, all tests pass

node -e "const pkg = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.assert(pkg.type === 'module'); console.assert(pkg.engines.node === '>=18.3'); console.assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0); console.log('OK')"
# Expected: prints OK
```

## Edge Cases to Handle
- None specific to this story — edge cases are in the utility module stories

## Dependencies
- Depends on: none
- Blocked by: none

## Effort
S — Minimal code; directory creation, package.json, and a stub entry point.

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
