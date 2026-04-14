# Design Approach: F03-S02 npm Registry & Attestations HTTP Adapters

## Summary
Implement two raw HTTP adapters using `node:https`:
- `src/registry/npm-registry.js` — `fetchFullMetadata(name)` and `fetchVersionMetadata(name, version)`
- `src/registry/provenance.js` — `fetchAttestations(name, version)`

Both adapters handle URL construction, streaming response body collection, JSON parsing, and HTTP error classification. The adapters are intentionally thin — no caching, no degradation (those belong to S01 and S03). A small shared helper `src/registry/http.js` houses the core `httpGetJson` function to avoid duplication between the two adapters.

## Key Design Decisions

1. **Shared internal HTTP helper (`src/registry/http.js`)**: Both adapters need the same `httpGetJson` logic (timeout, error classification, chunked body collection). Rather than duplicating ~60 lines or exporting an internal from `npm-registry.js`, a small internal helper module is created. This file is not in the story scope list but is a necessary implementation detail; it is documented here. It exports only `httpGetJson` — callers outside the registry module have no reason to use it.

2. **Dependency injection via `_https` option**: Each exported function accepts an optional `{ _https }` option that replaces the real `node:https` module. This enables unit tests without `mock.module()` (which requires Node ≥ 22 and is above the `>=18.3` engine requirement). The underscore prefix signals "test-only injection."

3. **Size-bounded streaming**: Response chunks are accumulated with a 50 MB ceiling. If exceeded, the request is destroyed and a `REGISTRY_ERROR` is thrown. This protects against OOM on pathologically large responses while comfortably accommodating real packages (lodash packument ~1.5 MB). `Buffer.concat(chunks)` is used rather than string concatenation to avoid O(n²) allocations.

4. **Error classification**: HTTP errors carry a `code` property for the S03 degradation logic to consume: `REGISTRY_NOT_FOUND` (404), `REGISTRY_RATE_LIMITED` (429), `REGISTRY_ERROR` (5xx or parse failure), `NETWORK_TIMEOUT` (socket timeout), `NETWORK_ERROR` (DNS failure, connection refused, etc.).

5. **`fetchAttestations` null-on-404**: Missing attestations is a normal state for most packages. Catching `REGISTRY_NOT_FOUND` and returning `null` instead of throwing is done in `provenance.js` itself, not in the shared HTTP helper, so the helper stays generic.

6. **Scoped package URL encoding**: `@scope/name` → `@scope%2fname` using `name.replace('/', '%2f')`. Verified with `new URL(...)` that Node.js WHATWG URL parser preserves `%2f` in the pathname (does not decode it to `/`).

7. **Timeout implementation**: `req.setTimeout(ms, cb)` is used to detect inactivity. The callback creates a typed error (`NETWORK_TIMEOUT`) and passes it to `req.destroy(err)`. Node.js emits that exact error object via `req.on('error')`. The error handler checks against a `KNOWN_CODES` set to avoid overwriting the intended code.

## Integration / Wiring

**Callee-side (this story):** Creates `npm-registry.js` and `provenance.js` with stable exported signatures:
- `fetchFullMetadata(name, opts?) → Promise<object>`
- `fetchVersionMetadata(name, version, opts?) → Promise<object>`
- `fetchAttestations(name, version, opts?) → Promise<object | null>`

**Caller-side (deferred to F03-S03):** `client.js` will import these three functions. No caller exists yet — the seam is the exported signatures and error codes documented here. S03 is responsible for wrapping these with cache logic and the degradation hierarchy.

## Files to Create/Modify

- `src/registry/http.js` (new) — `httpGetJson` shared helper
- `src/registry/npm-registry.js` (new) — `fetchFullMetadata`, `fetchVersionMetadata`
- `src/registry/provenance.js` (new) — `fetchAttestations`
- `test/registry/npm-registry.test.js` (new) — unit tests with mocked HTTP
- `test/registry/provenance.test.js` (new) — unit tests with mocked HTTP

## Testing Approach

Unit tests use the `_https` dependency injection option. Each test creates a mock `https` object that simulates a specific response type (success, 404, 429, 5xx, timeout, network error). The mock uses `node:events` EventEmitter to simulate the `IncomingMessage` / `ClientRequest` interface. No real network calls are made.

Test coverage per acceptance criterion:
- AC1 (`fetchFullMetadata` URL + JSON): mock 200, verify `options.path` and parsed result
- AC2 (`fetchVersionMetadata` URL + JSON): mock 200, verify `options.path` and parsed result
- AC3 (scoped package URL encoding): `@scope/name` → path `/@scope%2fname`
- AC4 (`fetchAttestations` URL + JSON): mock 200, verify path and parsed result
- AC5 (`fetchAttestations` null on 404): mock 404, assert return value is `null`
- AC6 (HTTP error codes): mock 404/429/5xx, verify `err.code` property
- AC7 (configurable timeout): pass custom `timeoutMs`, trigger timeout, verify `NETWORK_TIMEOUT`
- AC8 (large response handling): simulate a response chunk exceeding 50 MB, verify `REGISTRY_ERROR`
- AC9/AC10 (test commands pass): covered by running `node --test`

## Acceptance Criteria / Verification Mapping

- AC: `fetchFullMetadata` GETs `https://registry.npmjs.org/<name>` → Verification: `node --test test/registry/npm-registry.test.js` (fetchFullMetadata success test)
- AC: `fetchVersionMetadata` GETs `https://registry.npmjs.org/<name>/<version>` → Verification: same test file
- AC: Scoped package URL encoded as `@scope%2fname` → Verification: scoped-package test in `npm-registry.test.js`
- AC: `fetchAttestations` GETs attestations endpoint → Verification: `node --test test/registry/provenance.test.js`
- AC: `fetchAttestations` returns `null` for 404 → Verification: provenance 404 test
- AC: HTTP errors carry `code` property → Verification: error classification tests in both test files
- AC: Request timeout configurable (30s default) → Verification: timeout test with custom `timeoutMs`
- AC: Large responses handled without OOM → Verification: size-limit test in `npm-registry.test.js`
- AC: `node --test test/registry/npm-registry.test.js` passes → Verification: run command
- AC: `node --test test/registry/provenance.test.js` passes → Verification: run command

## Stubs
None. All production paths are real. The `_https` injection is for testing only and documented here.

## Verification Results

- AC: `fetchFullMetadata` GETs `https://registry.npmjs.org/<name>` → PASS — `node --test test/registry/npm-registry.test.js` (20/20 pass)
- AC: `fetchVersionMetadata` GETs `https://registry.npmjs.org/<name>/<version>` → PASS — same run
- AC: Scoped package `@babel/core` encoded as `/@babel%2fcore` in path → PASS — same run
- AC: `fetchAttestations` GETs `/-/npm/v1/attestations/<name>@<version>` → PASS — `node --test test/registry/provenance.test.js` (8/8 pass)
- AC: `fetchAttestations` returns `null` for 404 → PASS — provenance 404 test
- AC: HTTP error codes: 404→REGISTRY_NOT_FOUND, 429→REGISTRY_RATE_LIMITED, 5xx→REGISTRY_ERROR → PASS — both test files
- AC: Timeout configurable with 30s default; custom `timeoutMs` → PASS — timeout tests in both files, code: `NETWORK_TIMEOUT`
- AC: Large response (51 MB chunk) throws REGISTRY_ERROR without OOM → PASS — size-limit test in npm-registry.test.js
- AC: `node --test test/registry/npm-registry.test.js` → PASS — 20 tests, 0 fail, 106ms
- AC: `node --test test/registry/provenance.test.js` → PASS — 8 tests, 0 fail, 96ms

## Documentation Updates
None — no interface, setup, env var, or operator workflow changes.

## Deployment Impact
None.

## Questions/Concerns
- The 50 MB size guard is a pragmatic choice. No packument approaches this, but it protects against edge cases.
- `fetchAttestations` URL format `/-/npm/v1/attestations/<name>@<version>` is npm's public API. No auth required per feature brief PM assumptions.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Work Item: F03-S02
- Work Type: story
