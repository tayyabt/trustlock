# Code Review: task-064 — pnpm lockfile parser (F11-S1)

## Summary
Clean, complete implementation of the pnpm-lock.yaml parser (v5/v6/v9) with a correct line-by-line YAML state machine, workspace importer filtering, and a fully-wired format-detection router extension. All 9 acceptance criteria pass. No stubs. No registry imports.

## Verdict
Approved

## Findings

### No blocking findings.

### Observation: `.endsWith('.yaml')` in parser.js is intentionally broader than pnpm-lock.yaml
- **Severity:** suggestion
- **Finding:** `detectFormat` and `parseLockfile` in `parser.js` (lines 60, 106) match `filename.endsWith('.yaml')` rather than `filename === 'pnpm-lock.yaml'` alone. Any `.yaml` file passed via `--lockfile` override is treated as a pnpm lockfile.
- **Proposed Judgment:** No change needed. The design note explicitly calls this out as supporting the `--lockfile <any>.yaml` override case (feature brief edge case 10). yarn.lock is not YAML, so the broad match is safe for the v0.2 target set. Worth documenting as a module pitfall so future work (e.g. if a non-pnpm YAML format ever appears) doesn't get surprised.
- **Reference:** Design note §Integration/Wiring; ADR-004 §Decision point 4; F11 feature brief edge case 10

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (n/a — no user-facing workflow changes)
- [x] Architecture compliance (ADR-001 zero-dep: hand-rolled YAML parser ✓; ADR-004 router pattern ✓; pnpm branch before JSON.parse ✓)
- [x] Design compliance (n/a — CLI-only, no UI)
- [x] Behavioral / interaction rule compliance (lockfileVersion field is authoritative; no structural heuristics; exit 2 for unsupported versions; workspace filtering: no match → `[]`)
- [x] Integration completeness (parser.js → pnpm.js wiring complete; `_parseLockfileVersion` re-exported for detectFormat use; npm path unchanged)
- [x] Pitfall avoidance (scoped v5 key `/@scope/name/version` correctly uses lastSlash; scoped v6 key `/@scope/name@version` correctly uses lastAt; v9 single-quoted keys parsed correctly; snapshots section ignored)
- [x] Convention compliance (ES modules, camelCase, pure functions, errors to stderr, process.exit(2))
- [x] Test coverage (33 tests across all 9 ACs; inline content tests for unit isolation; integration tests through parseLockfile router)
- [x] Code quality & documentation (no dead code; design note accurately reflects implementation; no changelog entry needed at story level)

## Acceptance Criteria Judgment
- AC1: `parseLockfile(pnpm-v5.yaml, null)` plain package name/version/integrity → **PASS** — lodash: name=lodash, version=4.17.21, correct integrity hash; test: `parsePnpm — v5 plain packages`
- AC2: `parseLockfile(pnpm-v5.yaml, null)` scoped package key-path decoding → **PASS** — @babel/core: name=@babel/core, version=7.24.0 decoded from `/@babel/core/7.24.0:` key; test: `parsePnpm — v5 scoped packages`
- AC3: `parseLockfile(pnpm-v9.yaml, null)` name:/version: field reads → **PASS** — lodash and @babel/core read from explicit fields, not key path; test: `parsePnpm — v9 packages via explicit fields`
- AC4: hasBin/requiresBuild → hasInstallScripts mapping → **PASS** — hasBin:true→true, requiresBuild:true→true, neither→null; tests: `parsePnpm — hasInstallScripts mapping (AC4)` (4 tests including inline)
- AC5: Workspace filtering → **PASS** — `packages/backend`→[express,jest], `packages/frontend`→[react], `packages/nonexistent`→[], `.`→[shared-lib]; integration test via parseLockfile also passes; tests: `parsePnpm — workspace filtering (AC5)` + `parseLockfile — pnpm workspace filtering integration (AC5)`
- AC6: Unknown lockfileVersion exits 2 → **PASS** — version 99 exits 2 with "Unsupported pnpm lockfile version 99. trustlock supports v5, v6, v9."; null also exits 2; test: `parsePnpm — unsupported lockfileVersion (AC6)`
- AC7: npm parsing unchanged → **PASS** — `parseLockfile(package-lock.json, package.json)` returns correct lodash entry with directDependency:true, isDev:false; parser.test.js npm tests all pass; test: `parseLockfile — npm parsing unchanged (AC7)`
- AC8: No registry/ imports → **PASS** — pnpm.js only imports from `./models.js`; grep of actual import statements confirms; verified by reviewer
- AC9: `node --input-type=module -e "import './src/lockfile/pnpm.js'"` exits 0 → **PASS** — verified by reviewer

## Deferred Verification
- none

## Regression Risk
- Risk level: low
- Why: The pnpm branch in parser.js fires exclusively on `.yaml` filenames before the JSON.parse path, so the npm branch is structurally isolated. All existing npm tests pass unchanged (16/16 in parser.test.js, npm.test.js passes per developer verification). pnpm.js has no shared state with the npm parser. The `_parseLockfileVersion` export from pnpm.js is additive and does not modify any existing export.

## Integration / Boundary Judgment
- Boundary: `parser.js` → `pnpm.js` (caller/callee seam, ADR-004 router contract)
- Judgment: complete
- Notes: `parseLockfile` passes `(content, projectRoot)` to `parsePnpm`; `detectFormat` re-uses `_parseLockfileVersion` from pnpm.js (no duplication); the `parsePnpm` return type is `ResolvedDependency[]` matching the ADR-004 common model contract; `resolved: null` is set for pnpm packages (pnpm does not expose direct tarball URLs), consistent with ADR-004's "set to null if unavailable" policy.

## Test Results
- Command run: `node --test test/lockfile/pnpm.test.js`
- Result: 33 tests, 33 pass, 0 fail

- Command run: `node --test test/lockfile/parser.test.js`
- Result: 16 tests, 16 pass, 0 fail

- Command run: `node --input-type=module -e "import './src/lockfile/pnpm.js'"`
- Result: exits 0

- Command run: `.burnish/check-no-stubs.sh`
- Result: check-no-stubs: OK

## Context Updates Made
- File: `context/modules/lockfile/pitfalls.md` (created)
  Snippet: `- parser.js routes ALL .yaml filenames to the pnpm parser (not just pnpm-lock.yaml) — this is intentional to support --lockfile override, but means any future non-pnpm YAML lockfile format would need the detection logic expanded to distinguish by content, not just extension. Impact: new YAML-based lockfile formats in v0.3+ would silently route to pnpm parser. Fix: add content-based disambiguation (e.g. check for yarn or other marker fields) before the version dispatch. Files: src/lockfile/parser.js:60,106`

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-064
- Branch: burnish/task-064-implement-pnpm-lockfile-parser
