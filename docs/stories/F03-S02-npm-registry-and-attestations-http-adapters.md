# Story: F03-S02 — npm Registry & Attestations HTTP Adapters

## Parent
F03: Registry Client & Caching

## Description
Implement the raw HTTP adapters for the npm registry API (`src/registry/npm-registry.js`) and the npm attestations API (`src/registry/provenance.js`). These adapters handle URL construction, `node:https` GET requests, JSON response parsing, and error classification. They are the data-fetching layer that the client facade (S03) wraps with caching and degradation.

## Scope
**In scope:**
- `src/registry/npm-registry.js` — `fetchFullMetadata(name)`, `fetchVersionMetadata(name, version)` using `node:https`
- `src/registry/provenance.js` — `fetchAttestations(name, version)` using `node:https`
- `test/registry/npm-registry.test.js` — unit tests with mocked HTTP
- `test/registry/provenance.test.js` — unit tests with mocked HTTP

**Not in scope:**
- Cache logic (S01)
- Degradation hierarchy or concurrency (S03)
- Policy evaluation

## Entry Points
- Route / page / screen: N/A (internal HTTP adapters, no UI)
- Trigger / navigation path: Imported by `client.js` (F03-S03) for raw registry fetches
- Starting surface: `src/registry/npm-registry.js` and `src/registry/provenance.js` are new files created by this story

## Wiring / Integration Points
- Caller-side ownership: `client.js` (F03-S03) will import the fetch functions. Caller does not exist yet — seam is the exported function signatures.
- Callee-side ownership: This story owns the HTTP request construction and response parsing. `fetchFullMetadata(name)` returns the full packument JSON. `fetchVersionMetadata(name, version)` returns version-specific JSON. `fetchAttestations(name, version)` returns attestation JSON or `null`.
- Caller-side conditional rule: Caller (`client.js`) does not exist yet. The exported contracts are: `fetchFullMetadata(name) → object`, `fetchVersionMetadata(name, version) → object`, `fetchAttestations(name, version) → object | null`. F03-S03 will wire to these.
- Callee-side conditional rule: No callers exist yet. Exports must be stable for S03 integration.
- Boundary / contract check: Unit tests verify correct URL construction, JSON parsing, and error classification using mocked HTTP responses.
- Files / modules to connect: `src/registry/npm-registry.js` (new), `src/registry/provenance.js` (new)
- Deferred integration, if any: Cache wrapping and degradation deferred to F03-S03.

## Not Allowed To Stub
- URL construction for scoped packages — `@scope/name` must be URL-encoded as `@scope%2fname` in the registry URL
- HTTP error classification — 404, 429, 5xx, timeout, and DNS failure must each produce a classifiable error (not a generic throw)
- JSON response parsing — must parse the full response body and return structured data
- `fetchAttestations` returning `null` for packages with no attestations — must handle 404 as "no attestation" not as an error

## Behavioral / Interaction Rules
- All three fetch functions return a result or throw a classified error — they do not handle degradation (that's S03's job)
- Errors must carry a `code` property for classification: `REGISTRY_NOT_FOUND`, `REGISTRY_RATE_LIMITED`, `REGISTRY_ERROR`, `NETWORK_TIMEOUT`, `NETWORK_ERROR`
- Exception: `fetchAttestations` returns `null` (not throw) for HTTP 404, since missing attestations is a normal state

## Acceptance Criteria
- [ ] `npm-registry.js` exports `fetchFullMetadata(name)` that GETs `https://registry.npmjs.org/<name>` and returns parsed JSON
- [ ] `npm-registry.js` exports `fetchVersionMetadata(name, version)` that GETs `https://registry.npmjs.org/<name>/<version>` and returns parsed JSON
- [ ] Scoped packages are URL-encoded correctly: `@scope/name` → `https://registry.npmjs.org/@scope%2fname`
- [ ] `provenance.js` exports `fetchAttestations(name, version)` that GETs the npm attestations endpoint and returns parsed JSON
- [ ] `fetchAttestations` returns `null` (not throw) when the attestations endpoint returns 404
- [ ] HTTP errors carry a `code` property: `REGISTRY_NOT_FOUND` (404), `REGISTRY_RATE_LIMITED` (429), `REGISTRY_ERROR` (5xx), `NETWORK_TIMEOUT`, `NETWORK_ERROR`
- [ ] Request timeout is configurable with a sensible default (30 seconds)
- [ ] Very large responses (e.g., lodash packument) are handled without OOM — stream JSON parsing or size-bounded buffer
- [ ] `node --test test/registry/npm-registry.test.js` passes
- [ ] `node --test test/registry/provenance.test.js` passes

## Task Breakdown
1. Create `src/registry/npm-registry.js` with `fetchFullMetadata(name)` and `fetchVersionMetadata(name, version)` using `node:https.get`
2. Implement URL construction with scoped package encoding (`@scope%2fname`)
3. Implement JSON response parsing with streaming/chunked body collection
4. Implement error classification: map HTTP status codes and network errors to typed error codes
5. Create `src/registry/provenance.js` with `fetchAttestations(name, version)` — 404 returns `null`
6. Write `test/registry/npm-registry.test.js` with mocked HTTP: success, 404, 429, 5xx, timeout, scoped package URL
7. Write `test/registry/provenance.test.js` with mocked HTTP: success, 404 → null, network error

## Verification
```
node --test test/registry/npm-registry.test.js
# Expected: all tests pass, no errors

node --test test/registry/provenance.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Scoped package names in URLs — `@scope/name` must be URL-encoded as `@scope%2fname` (feature brief edge case #7)
- HTTP 404 for a package — classified error, not crash (feature brief edge case #1)
- HTTP 429 rate limiting — classified error for caller to handle (feature brief edge case #2)
- Network timeout — classified error, not hang (feature brief edge case #3)
- DNS resolution failure — classified error, not hang (feature brief edge case #4)
- Package with no attestations — `fetchAttestations` returns `null` cleanly (feature brief edge case #8)
- Very large package metadata (e.g., lodash) — handle without OOM (feature brief edge case #9)

## Dependencies
- Depends on: F01 (shared utilities — project structure must exist)
- Blocked by: none

## Effort
M — Two HTTP adapters, URL encoding, error classification, large-response handling, comprehensive mocked tests

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
