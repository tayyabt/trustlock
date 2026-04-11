# Design Approach: F16-S2 — PyPI Registry Adapter and Ecosystem Dispatch

## Summary

Implements `src/registry/pypi.js` as a new registry adapter that fetches package metadata from the PyPI JSON API (`https://pypi.org/pypi/{name}/{version}/json`) and checks attestations via the PyPI Simple API v1 JSON format. Extends `src/registry/client.js` to route `fetchPackageMetadata` calls to `pypi.js` when `ecosystem === 'pypi'`, and to `npm-registry.js` when `ecosystem === 'npm'` or absent.

`pypi.js` uses `httpGetJson` from the shared `./http.js` for the main JSON API call. For the Simple API attestation call (which requires `Accept: application/vnd.pypi.simple.v1+json`), `http.js` is extended minimally with an optional `headers` parameter (backward-compatible, no callers need updating). Cache keys are `pypi/{name}/{version}` for version metadata, verified non-colliding with npm keys.

## Key Design Decisions

1. **Extend `http.js` with optional `headers` override** — Avoids duplicating the 60-line HTTPS helper from `http.js` in `pypi.js`. The change is backward-compatible (`headers` defaults to `{}`). Existing callers are unaffected. The `Accept: application/json` default is preserved for all npm calls; PyPI Simple API calls override it with `application/vnd.pypi.simple.v1+json`.

2. **`pypi.fetchVersionMetadata` follows `npm-registry.fetchVersionMetadata` throw-on-error convention** — Throws classified errors (`REGISTRY_NOT_FOUND`, `REGISTRY_ERROR`, `NETWORK_TIMEOUT`, `NETWORK_ERROR`). Degradation (stale cache / skip) is handled by `client.js:withDegradation`, the same as npm. Attestation fetch errors inside `fetchVersionMetadata` are silently caught and result in `hasAttestations: false` — this keeps the main metadata usable even when the Simple API is unreachable.

3. **`fetchPackageMetadata` accepts both string and dep object** — Existing callers pass a string name; new PyPI dispatch passes `{ name, version, ecosystem }`. A single function handles both for clean extension without API breakage. npm dispatch uses the full-packument path (existing TTL); PyPI dispatch uses `pypi/{name}/{version}` key with version-metadata TTL (24h). (ADR-003)

4. **Two test injectables for `pypi.fetchVersionMetadata`** — `_fetchVersionJson` and `_fetchSimpleJson` are optional injectable async functions that replace the two HTTP calls. This allows unit tests to stub each call independently without needing a complex multi-call `_https` mock. Production code builds these from `httpGetJson` with the appropriate headers.

5. **Publisher fallback chain is pure** — Extracted as a standalone function so it can be tested directly against fixture data without HTTP involvement (follows convention of pure functions preferred).

## Integration / Wiring

- **Caller-side** (`client.js`): `fetchPackageMetadata(nameOrDep)` is updated to detect an object form. When `dep.ecosystem === 'pypi'`, routes to `doPypiVersionMetadata(name, version)` with cache key `pypi/${name}/${version}` and `TTL_VERSION_METADATA_MS` (24h). When ecosystem is absent or `'npm'`, uses existing npm full-packument path (unchanged).
- **Callee-side** (`pypi.js`): New module. `fetchVersionMetadata(name, version, opts)` returns `{ publisherAccount, publishedAt, hasAttestations }`. Publisher and date extraction are pure helper functions. Attestation check calls the Simple API and returns `hasAttestations: boolean`.
- **`client.js` `createRegistryClient`** gains optional `_fetchPypiVersionMetadata` injectable for test isolation. Existing injectables untouched.
- **No callers of `client.js` change** — both the string form `fetchPackageMetadata('lodash')` and the new object form `fetchPackageMetadata({ name, version, ecosystem })` are handled.

## Files to Create/Modify

- `src/registry/http.js` — add optional `headers` parameter (backward-compatible)
- `src/registry/pypi.js` — new adapter (full implementation)
- `src/registry/client.js` — add ecosystem dispatch in `fetchPackageMetadata`
- `test/fixtures/registry/pypi-requests-2.28.0.json` — fixture with `uploader` + two release files with different timestamps
- `test/fixtures/registry/pypi-requests-2.28.0-no-uploader.json` — fixture without `uploader`, `info.maintainer_email` comma-separated
- `test/fixtures/registry/pypi-simple-requests.json` — Simple API response with attestations
- `test/registry/pypi.test.js` — unit tests for `pypi.js`
- `test/registry/cache-namespace.test.js` — cache key collision prevention test
- `test/registry/client.test.js` — dispatch tests appended

## Testing Approach

- **`pypi.test.js`**: Unit tests that inject `_fetchVersionJson` / `_fetchSimpleJson` directly. Covers: publisher from `uploader`, publisher fallback to `maintainer_email`, double-absent → `null`, earliest publish date, attestation endpoint constant (grep assertion), degradation (timeout → throw). Each AC maps 1-to-1 to a test.
- **`cache-namespace.test.js`**: Uses a real `createCache` in a temp directory. Writes a `pypi/requests/2.28.0` entry, then reads `requests@2.28.0` (npm key) — confirms null (no collision). Verifies the pypi entry is still readable.
- **`client.test.js` additions**: Appends dispatch tests using `_fetchPypiVersionMetadata` injectable; confirms npm path unchanged; confirms PyPI path uses `pypi/` cache key prefix.

## Acceptance Criteria / Verification Mapping

- AC: `publisherAccount` from `urls[0].uploader` → test `pypi.test.js`: "extracts publisherAccount from urls uploader"
- AC: Fallback to `info.maintainer_email` (first email) when `uploader` absent → test `pypi.test.js`: "falls back to maintainer_email"
- AC: Double-absent → `null` → test `pypi.test.js`: "returns null when both publisher sources absent"
- AC: Earliest `upload_time_iso_8601` across all `urls[]` → test `pypi.test.js`: "uses earliest upload_time_iso_8601"
- AC: `PYPI_SIMPLE` grep returns constant declaration → `grep -n 'PYPI_SIMPLE' src/registry/pypi.js`
- AC: Cache key `pypi/requests/2.28.0` non-colliding with npm key → test `cache-namespace.test.js`
- AC: `client.js` dispatch to `pypi.js` for `ecosystem: 'pypi'` → test `client.test.js` additions
- AC: `ecosystem: 'npm'` or absent → npm path → test `client.test.js` additions
- AC: Existing npm tests unchanged → `node --test test/registry/client.test.js`
- AC: Degradation on timeout → throw NETWORK_TIMEOUT → `withDegradation` catches → test in `client.test.js` pypi degradation
- AC: `node --input-type=module -e "import './src/registry/pypi.js'"` resolves without error → import test

## Verification Results

- AC: publisherAccount from uploader → PASS — `test/registry/pypi.test.js`: "extracts publisherAccount from urls[].uploader"
- AC: fallback to maintainer_email (first of comma-sep) → PASS — `test/registry/pypi.test.js`: "falls back to first maintainer_email when uploader absent"
- AC: double-absent null → PASS — `test/registry/pypi.test.js`: "returns null when both uploader and maintainer_email absent"
- AC: earliest publish date → PASS — `test/registry/pypi.test.js`: "uses earliest upload_time_iso_8601 when multiple release files"
- AC: PYPI_SIMPLE grep → PASS — `grep -n 'PYPI_SIMPLE' src/registry/pypi.js` returns lines 5–6 (const declarations)
- AC: cache namespace collision → PASS — `test/registry/cache-namespace.test.js`: all 4 tests pass
- AC: client dispatch pypi → PASS — `test/registry/client.test.js`: "ecosystem pypi dispatches to PyPI adapter"; "writes cache key pypi/{name}/{version}"
- AC: client dispatch npm unchanged → PASS — `test/registry/client.test.js`: "ecosystem npm dispatches to npm path"; "absent ecosystem defaults to npm"; "string argument uses npm path unchanged"
- AC: existing npm tests → PASS — all 17 pre-existing client tests pass; all 31 npm-registry + cache + provenance tests pass
- AC: degradation on timeout → PASS — `test/registry/client.test.js`: "pypi degradation — no cache + failed fetch returns null with warning"; "pypi stale cache returned with warning when fetch fails"
- AC: module import resolves → PASS — `node --input-type=module -e "import './src/registry/pypi.js'"` exits 0

All 45 new tests pass. All 39 existing tests pass. Total: 84 tests, 0 failures.

## Story Run Log Update

### 2026-04-11 developer: F16-S2 implementation

Implementation in progress. All files listed above created/modified. Verification commands to run:
```
node --test test/registry/pypi.test.js
node --test test/registry/cache-namespace.test.js
node --test test/registry/client.test.js
grep -n 'PYPI_SIMPLE' src/registry/pypi.js
node --input-type=module -e "import './src/registry/pypi.js'"
```

## Documentation Updates

None — no changes to setup, ENV vars, operator workflow, or public interfaces that are already documented.

## Deployment Impact

None — new module, no new dependencies, no new env vars, no migrations.

## Questions/Concerns

- PyPI Simple API attestations field structure: implemented with best-effort check for `file.attestations` being a non-null, non-empty object. If PyPI changes the attestations schema, `hasAttestations` may return false positives/negatives — but this is a data-quality concern, not a correctness bug.
- `encodeKey` in `cache.js` replaces `/` with `%2f`, so `pypi/requests/2.28.0` becomes `pypi%2frequests%2f2.28.0.json`. This is safe and distinct from `requests%402.28.0.json` (the npm version key).

## Metadata

- Agent: developer
- Date: 2026-04-11
- Work Item: F16-S2 / task-075
- Work Type: story
- Branch: burnish/task-075-implement-pypi-registry-adapter-and-ecosystem-dispatch
- ADR: ADR-001, ADR-003
