# Review Handoff: task-075 — PyPI Registry Adapter and Ecosystem Dispatch

## Status

Ready for review. All acceptance criteria PASS.

## Summary

Implemented `src/registry/pypi.js` as a new registry adapter for the PyPI JSON API, and extended `src/registry/client.js` to route `fetchPackageMetadata` calls based on `dep.ecosystem`. Both sides of the dispatch boundary land in this task.

## What Was Implemented

### `src/registry/pypi.js` (new)
- `PYPI_JSON_API` and `PYPI_SIMPLE_API` named constants at the top of the file (C7 compliant)
- `fetchVersionMetadata(name, version, opts)` — fetches `PYPI_JSON_API/{name}/{version}/json`, extracts `publisherAccount` (from `urls[].uploader` → `info.maintainer_email` first email → `null`), `publishedAt` (earliest `upload_time_iso_8601` across `urls[]`), and `hasAttestations` (Simple API check)
- Attestation check via `PYPI_SIMPLE_API/{name}/` with `Accept: application/vnd.pypi.simple.v1+json`; silently returns `false` on error so main metadata is always usable
- Throws classified errors (`REGISTRY_NOT_FOUND`, `NETWORK_TIMEOUT`, etc.) so `client.js:withDegradation` applies ADR-003 hierarchy
- `_fetchVersionJson` / `_fetchSimpleJson` injectables for clean test isolation

### `src/registry/http.js` (modified)
- Added optional `headers` parameter (backward-compatible; defaults to `{}`); allows `pypi.js` to override the `Accept` header for the Simple API call without duplicating the HTTPS helper

### `src/registry/client.js` (modified)
- `fetchPackageMetadata` now accepts both a string `name` (backward compat) and a dep object `{ name, version, ecosystem }`
- `ecosystem === 'pypi'` → routes to `doFetchPypiVersionMetadata(name, version)`, cache key `pypi/{name}/{version}`, TTL 24h
- `ecosystem === 'npm'` or absent → existing npm full-packument path unchanged
- `_fetchPypiVersionMetadata` injectable for test isolation

## Files Delivered

| File | Status |
|---|---|
| `src/registry/pypi.js` | new |
| `src/registry/client.js` | modified |
| `src/registry/http.js` | modified (minor, backward-compat) |
| `test/registry/pypi.test.js` | new — 16 tests |
| `test/registry/cache-namespace.test.js` | new — 4 tests |
| `test/registry/client.test.js` | modified — 8 new dispatch tests |
| `test/fixtures/registry/pypi-requests-2.28.0.json` | new |
| `test/fixtures/registry/pypi-requests-2.28.0-no-uploader.json` | new |
| `test/fixtures/registry/pypi-simple-requests.json` | new |
| `docs/design-notes/F16-S2-approach.md` | new |

## Verification Summary

```
node --test test/registry/pypi.test.js          → 16 pass, 0 fail
node --test test/registry/cache-namespace.test.js → 4 pass, 0 fail
node --test test/registry/client.test.js         → 25 pass, 0 fail (17 existing + 8 new)
grep -n 'PYPI_SIMPLE' src/registry/pypi.js       → lines 5–6 (const declarations)
node --input-type=module -e "import './src/registry/pypi.js'" → exits 0
```

Existing tests: `npm-registry.test.js` (14 pass), `provenance.test.js` (8 pass), `cache.test.js` (11 pass) — all unchanged.

## Acceptance Criteria Outcome

| AC | Result |
|---|---|
| `publisherAccount` from `urls[0].uploader` | PASS |
| Fallback to `info.maintainer_email` (first email) | PASS |
| Double-absent → `null` | PASS |
| Earliest `upload_time_iso_8601` | PASS |
| `grep -n 'PYPI_SIMPLE' src/registry/pypi.js` returns constant declaration | PASS |
| Cache key `pypi/requests/2.28.0` non-colliding with npm key | PASS |
| `client.js` dispatch to `pypi.js` for `ecosystem: 'pypi'` | PASS |
| `ecosystem: 'npm'` or absent → npm path | PASS |
| Existing npm tests unchanged | PASS |
| ADR-003 degradation on timeout | PASS |
| `node --input-type=module` import resolves | PASS |

## Design Note

`docs/design-notes/F16-S2-approach.md`

## Metadata

- Agent: developer
- Date: 2026-04-11
- Task: task-075
- Branch: burnish/task-075-implement-pypi-registry-adapter-and-ecosystem-dispatch
