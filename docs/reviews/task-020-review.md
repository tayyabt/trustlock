# Code Review: task-020 — F03-S02 npm Registry & Attestations HTTP Adapters

## Summary
Clean implementation of the two HTTP adapter modules and their shared helper. All 10 acceptance criteria are concretely verified, no stubs or deferred paths exist, and both test suites pass with 28 tests total.

## Verdict
Approved

## Findings

### Duplicate `encodePackageName` helper
- **Severity:** suggestion
- **Finding:** `encodePackageName` is defined identically in both `src/registry/npm-registry.js:12-14` and `src/registry/provenance.js:12-14`. The two adapters are intentionally thin, so this duplication is acceptable for now, but S03 or a future third adapter would create a third copy.
- **Proposed Judgment:** No change required for this story. If a third registry adapter is added, consolidate into `src/registry/http.js` or a shared utility at that point.
- **Reference:** global_conventions — "Don't create helpers for one-time operations." Deferred to the appropriate story.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — no UI/workflow)
- [x] Architecture compliance (follows ADR-001 zero-deps, ADR-003 adapter layer boundary)
- [x] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (all error classification rules and null-on-404 rule honored)
- [x] Integration completeness (exported signatures match story contract; S03 seam documented)
- [x] Pitfall avoidance (scoped package encoding: tested; size guard: tested)
- [x] Convention compliance (ESM, kebab-case files, UPPER_SNAKE_CASE constants, zero runtime deps)
- [x] Test coverage (every AC has a dedicated test; edge cases: multi-chunk, 51 MB body, ENOTFOUND, ECONNREFUSED, timeout)
- [x] Code quality & documentation (no dead code; design note complete with verification results)

## Acceptance Criteria Judgment
- AC: `fetchFullMetadata` GETs `https://registry.npmjs.org/<name>` and returns parsed JSON → PASS — `fetchFullMetadata constructs correct URL path` test; `capturedOptions().path === '/express'`
- AC: `fetchVersionMetadata` GETs `https://registry.npmjs.org/<name>/<version>` and returns parsed JSON → PASS — `fetchVersionMetadata constructs correct URL path` test; path `'/express/4.18.2'`
- AC: Scoped packages URL-encoded `@scope%2fname` → PASS — `@babel/core` → `/@babel%2fcore` and `@babel/core` + `7.24.0` → `/@babel%2fcore/7.24.0` tested in both files
- AC: `fetchAttestations` GETs npm attestations endpoint → PASS — path `/-/npm/v1/attestations/sigstore@1.9.0` asserted; scoped path `/-/npm/v1/attestations/@sigstore%2fbundle@2.3.2` also tested
- AC: `fetchAttestations` returns `null` (not throw) for 404 → PASS — `result === null` asserted directly
- AC: HTTP errors carry `code` property: REGISTRY_NOT_FOUND (404), REGISTRY_RATE_LIMITED (429), REGISTRY_ERROR (5xx) → PASS — 404/429/500/503 tested in npm-registry; 404/429/500 tested in provenance; NETWORK_TIMEOUT and NETWORK_ERROR verified for ENOTFOUND and ECONNREFUSED
- AC: Request timeout configurable with 30s default → PASS — `timeoutMs = 30_000` at `http.js:43`; custom `timeoutMs` passed in timeout tests; `NETWORK_TIMEOUT` code verified
- AC: Very large responses handled without OOM → PASS — 51 MB single chunk throws `REGISTRY_ERROR`; `Buffer.concat` used (not string concat); 50 MB ceiling enforced before chunk is appended
- AC: `node --test test/registry/npm-registry.test.js` passes → PASS — 20 tests, 0 fail, ~103ms
- AC: `node --test test/registry/provenance.test.js` passes → PASS — 8 tests, 0 fail, ~96ms

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: All adapters are new files with no existing callers. The exported signatures are stable contracts for S03. Error classification logic is covered by 8 dedicated error tests per function. The size guard and settled-promise double-rejection guard both have explicit test coverage.

## Integration / Boundary Judgment
- Boundary: Callee-side — `fetchFullMetadata`, `fetchVersionMetadata`, `fetchAttestations` exported from new files
- Judgment: complete
- Notes: Signatures match the story contract (`→ Promise<object>` / `→ Promise<object | null>`). Caller (`client.js`, F03-S03) does not yet exist; seam is documented in design note. Error codes (`REGISTRY_NOT_FOUND`, `REGISTRY_RATE_LIMITED`, `REGISTRY_ERROR`, `NETWORK_TIMEOUT`, `NETWORK_ERROR`) are documented for S03 degradation logic to consume.

## Test Results
- Command run: `node --test test/registry/npm-registry.test.js`
- Result: all pass — 20 tests, 0 fail, ~103ms
- Command run: `node --test test/registry/provenance.test.js`
- Result: all pass — 8 tests, 0 fail, ~96ms

## Context Updates Made
File: `context/modules/registry/guidance.md`
Snippet: Added `_https` dependency-injection testing pattern guidance for S03 and future registry adapters.

File: `context/modules/registry/pitfalls.md`
Snippet: Added pitfall about settled-promise guard for double-rejection in async HTTP handlers.

## Artifacts Referenced
- Story: `docs/stories/F03-S02-npm-registry-and-attestations-http-adapters.md`
- Feature brief: `docs/feature-briefs/F03-registry-client.md`
- Design note: `docs/design-notes/F03-S02-approach.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- ADR-003: `docs/adrs/ADR-003-registry-caching-and-offline-behavior.md`
- Global conventions: `context/global/conventions.md`
- Module guidance: `context/modules/registry/guidance.md`
- Module pitfalls: `context/modules/registry/pitfalls.md`

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-020
- Branch: burnish/task-020-implement-npm-registry-and-attestations-http-adapters
