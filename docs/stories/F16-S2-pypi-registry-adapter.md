# Story: F16-S2 — PyPI registry adapter and ecosystem dispatch

## Parent
F16: Python Ecosystem: Parsers + PyPI Adapter

## Description
Implement `src/registry/pypi.js` as a new registry adapter that fetches package metadata from the PyPI JSON API, and extend `src/registry/client.js` to route fetches to `pypi.js` or `npm-registry.js` based on the `ecosystem` discriminant field added in F16-S1. This closes the full Python supply-chain data path: parsed lockfile entries with `ecosystem: 'pypi'` now resolve to real PyPI metadata for all trust rule evaluation.

## Scope
**In scope:**
- `src/registry/pypi.js` — new adapter; fetches `https://pypi.org/pypi/{name}/{version}/json`; extracts publisher identity, publish date, and attestation data; PyPI Simple API call for attestations; all API endpoints defined as named constants (C7)
- `src/registry/client.js` — add `ecosystem`-based dispatch: `ecosystem: 'pypi'` → `pypi.js`; `ecosystem: 'npm'` (default/absent) → existing `npm-registry.js` path; no other callers change
- Cache key namespace: `pypi/{name}/{version}` for version metadata; `pypi/{name}/{version}.attestations` for attestation data; verified non-colliding with npm cache keys (C-NEW-3 (c))
- Unit tests for `pypi.js` against fixture JSON responses
- Integration test confirming cache key namespace collision prevention

**Not in scope:**
- `src/lockfile/` changes — `ecosystem` field is already set by F16-S1
- Policy rule changes — existing cooldown, provenance, pinning, publisher-change rules apply to Python packages without modification; this story supplies the data they need
- PyPI Simple API HTML format — only `application/vnd.pypi.simple.v1+json` JSON form is in scope
- Full PyPI package search or upload APIs — metadata fetch and attestation check only

## Entry Points
- Route / page / screen: No user-facing entry point; this is a data-layer story
- Trigger / navigation path: Policy engine step 5a in `trustlock check` — `registry/client.js:fetchPackageMetadata(dep)` is called for each changed `ResolvedDependency`; `pypi.js` is invoked when `dep.ecosystem === 'pypi'`
- Starting surface: `src/registry/client.js:fetchPackageMetadata(name, version, options)` — exists; this story adds the ecosystem dispatch branch

## Wiring / Integration Points
- Caller-side ownership: `src/registry/client.js` owns dispatch. This story adds the `ecosystem` switch: `if (dep.ecosystem === 'pypi') → pypi.fetchVersionMetadata(name, version, options)`. All callers of `client.js` already pass `ResolvedDependency` (or equivalent) — no callers need to change.
- Callee-side ownership: `src/registry/pypi.js` is new; this story owns its full implementation. It satisfies the same interface contract as `npm-registry.js:getVersionMetadata` so `client.js` can call either without additional branching.
- Caller-side conditional rule: `client.js` already exists. Wire it to `pypi.js` now — the dispatch branch is the deliverable of this story.
- Callee-side conditional rule: `pypi.js` is new. It must match the metadata shape returned by `npm-registry.js:getVersionMetadata` so downstream consumers (policy engine, baseline manager) see a uniform object regardless of ecosystem.
- Boundary / contract check: Integration test stubs the PyPI HTTP endpoint and calls `client.fetchPackageMetadata({ name: 'requests', version: '2.28.0', ecosystem: 'pypi' })` — verifies the return shape includes `publisherAccount`, `publishedAt`, `hasAttestations`, and that the correct cache key (`pypi/requests/2.28.0`) was written.
- Files / modules to connect: `src/registry/client.js` → `src/registry/pypi.js`; shared `src/registry/cache.js` (no changes needed — namespaced key is sufficient)
- Deferred integration, if any: none — both sides land in this story

## Not Allowed To Stub
- `pypi.js` publisher identity: `urls[].uploader` field from the PyPI version JSON; fallback to `info.maintainer_email` if `uploader` is absent; if both absent, `null` (per feature brief edge case 6)
- `pypi.js` publish date: earliest `upload_time_iso_8601` value across all `urls[]` entries for the requested version; do not use `info.version` upload time; must scan all release file entries (edge case 9)
- `pypi.js` attestation check: call PyPI Simple API (`application/vnd.pypi.simple.v1+json` Accept header) at the endpoint defined by the named constant; do not hardcode the URL string in a fetch call (C7); the named constant must be at the top of `pypi.js` and must be greppable
- Cache key namespace: `pypi/{name}/{version}` for version metadata; verified with a test that stores a PyPI entry and confirms `npm/{name}/{version}` (or the npm equivalent) is a different key (C-NEW-3 (c))
- `client.js` ecosystem dispatch: the routing logic must read `dep.ecosystem` (or equivalent); it must NOT hardcode package-name heuristics or filename patterns to infer ecosystem
- ADR-003 cache-first path applies to PyPI calls identically: fresh cache → use directly; stale → use with warning; no cache + no network → skip with warning; `--no-cache` bypasses for both ecosystems

## Behavioral / Interaction Rules
- `pypi.js` uses `node:https` for HTTP — no external dependencies (ADR-001)
- `pypi.js` errors (HTTP 4xx/5xx, network timeout, malformed JSON) are caught and trigger the same degradation hierarchy as `npm-registry.js` — never thrown to caller
- PyPI `info.maintainer_email` may contain multiple comma-separated emails; take the first one only as the fallback identity
- Cache writes for PyPI use the same atomic write pattern as the npm cache (write to temp file, rename per ADR-003)
- `client.js` dispatch: when `ecosystem` is absent or `undefined`, default to npm path (backward compat with any callers that predate the `ecosystem` field — should not exist after F16-S1, but defensive)

## Acceptance Criteria
- [ ] `pypi.js:fetchVersionMetadata('requests', '2.28.0')` against a stubbed PyPI JSON response returns `publisherAccount` from `urls[0].uploader`.
- [ ] Fallback: when `urls[].uploader` is absent, `publisherAccount` is set from `info.maintainer_email` (first email if comma-separated).
- [ ] Double-absent case: when both `urls[].uploader` and `info.maintainer_email` are absent, `publisherAccount` is `null`.
- [ ] Publish date: earliest `upload_time_iso_8601` across all `urls[]` entries is used; test fixture includes two release files with different upload times.
- [ ] PyPI attestation endpoint is defined as a named constant at the top of `pypi.js`; `grep -n 'PYPI_SIMPLE' src/registry/pypi.js` returns the constant declaration line; no string literal URL appears in the attestation fetch call (C7).
- [ ] Cache key `pypi/requests/2.28.0` is written after a successful fetch; `npm/requests/2.28.0` (or equivalent npm cache key) is a distinct key — fetching `requests@2.28.0` as npm does not overwrite the pypi cache entry (C-NEW-3 (c)).
- [ ] `client.js` dispatch: calling `fetchPackageMetadata({ name: 'requests', version: '2.28.0', ecosystem: 'pypi' })` invokes `pypi.js`; calling the same with `ecosystem: 'npm'` (or absent) invokes `npm-registry.js`; confirmed via test spy or separate fixture stubs.
- [ ] Existing npm registry integration tests are unchanged: `fetchPackageMetadata({ name: 'lodash', version: '4.17.21', ecosystem: 'npm' })` returns the same result as before this story.
- [ ] ADR-003 degradation: when PyPI HTTP call fails with no cache, the return value carries a degradation annotation rather than throwing; test stubs the HTTP client to simulate timeout.
- [ ] `node --input-type=module -e "import './src/registry/pypi.js'"` resolves without error.
- [ ] C-NEW-3 (b): `registry/client.js` dispatches to `pypi.js` for `ecosystem: 'pypi'` entries — confirmed in test.

## Task Breakdown
1. Create `test/fixtures/registry/pypi-requests-2.28.0.json` — realistic PyPI version JSON with `urls[]` containing `uploader` and `upload_time_iso_8601` fields; include two release files with different upload times
2. Create `test/fixtures/registry/pypi-requests-2.28.0-no-uploader.json` — same fixture but `urls[].uploader` absent; `info.maintainer_email` present
3. Create `src/registry/pypi.js` — define `PYPI_JSON_API` and `PYPI_SIMPLE_API` constants; implement `fetchVersionMetadata(name, version, options)` matching the `npm-registry.js` return shape; implement publisher fallback chain; implement publish-date earliest-scan; implement attestation check via Simple API
4. Extend `src/registry/client.js` — add `ecosystem` dispatch: read `dep.ecosystem` (or `options.ecosystem`); route to `pypi.js` for `'pypi'`; existing npm path unchanged; document the default fallback
5. Write unit tests for `pypi.js` in `test/registry/pypi.test.js` covering publisher identity, fallback, publish date earliest, attestation endpoint constant (grep assertion), degradation
6. Write integration test for cache key collision in `test/registry/cache-namespace.test.js` — store a pypi entry and confirm the npm cache key is distinct
7. Write dispatch test in `test/registry/client.test.js` — confirm ecosystem routing with spy/stub; confirm existing npm path unchanged

## Verification
```
node --test test/registry/pypi.test.js
# Expected: all tests pass, no errors

node --test test/registry/cache-namespace.test.js
# Expected: pypi and npm cache keys verified distinct

node --test test/registry/client.test.js
# Expected: ecosystem dispatch tests pass; existing npm tests pass

grep -n 'PYPI_SIMPLE' src/registry/pypi.js
# Expected: at least one line showing the named constant declaration
```

## Edge Cases to Handle
- `urls[].uploader` absent — fall back to `info.maintainer_email`; both absent → `null`
- `info.maintainer_email` comma-separated — use first email only
- Multiple `urls[]` entries with different `upload_time_iso_8601` — use earliest (sort ascending, take first)
- PyPI HTTP 404 — package not found; degrade gracefully (no cache write; return degraded result)
- PyPI network timeout — degrade to stale cache if available; no-cache warning if no cache (ADR-003 hierarchy)
- Cache key namespace: `pypi/{name}/{version}` — name and version as-is from the normalized `ResolvedDependency`; do not double-encode

## Dependencies
- Depends on: F16-S1 (task created below) — `ecosystem: 'pypi'` field must be present on `ResolvedDependency` before `client.js` dispatch can be wired
- Blocked by: F16-S1

## Effort
M — new adapter with named constants, publisher fallback chain, earliest-date scan, cache namespace; dispatch wiring in client.js is small but precise; cache collision test requires careful setup.

## Metadata
- Agent: pm
- Date: 2026-04-11
- Sprint: 4
- Priority: P2

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
