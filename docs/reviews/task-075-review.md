# Code Review: task-075 — PyPI Registry Adapter and Ecosystem Dispatch

## Summary

Clean, well-scoped implementation of the PyPI registry adapter and ecosystem dispatch. All 11 acceptance criteria are concretely verified by passing tests. Architecture, ADR, and convention compliance confirmed. No stubs, no hardcoded URLs, no runtime dependencies introduced.

## Verdict

Approved

## Findings

No blocking findings.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — not required (data-layer story, no user-facing flows)
- [x] Architecture compliance (ADR-001: node:https only via http.js; ADR-003: cache-first, degradation hierarchy applied)
- [x] Design compliance — no UI work; not applicable
- [x] Behavioral / interaction rule compliance — publisher fallback chain, earliest-date scan, comma-split, silent attestation error all match story spec
- [x] Integration completeness — both sides of dispatch boundary land in this task; caller (`client.js`) and callee (`pypi.js`) wired correctly; string-form backward compat preserved
- [x] Pitfall avoidance — no module pitfalls file exists yet; no known pitfalls unaddressed
- [x] Convention compliance — kebab-case filenames, camelCase functions, UPPER_SNAKE_CASE constants, pure helper functions, ESM exports
- [x] Test coverage — every AC has a 1:1 test; edge cases (empty urls[], single entry, double-absent publisher, Simple API failure) all covered
- [x] Code quality & documentation — design note accurate and complete; no dead code; no docs updates required (no new env vars, no operator changes)

## Acceptance Criteria Judgment

- AC: `publisherAccount` from `urls[0].uploader` → **PASS** — `pypi.test.js`: "extracts publisherAccount from urls[].uploader" (fixture `pypi-requests-2.28.0.json`, uploader = "ken-reitz")
- AC: Fallback to `info.maintainer_email` (first email) when uploader absent → **PASS** — `pypi.test.js`: "falls back to first maintainer_email when uploader absent" (fixture `pypi-requests-2.28.0-no-uploader.json`, comma-sep email, returns first)
- AC: Double-absent → `null` → **PASS** — `pypi.test.js`: "returns null when both uploader and maintainer_email absent"
- AC: Earliest `upload_time_iso_8601` across all `urls[]` → **PASS** — `pypi.test.js`: "uses earliest upload_time_iso_8601 when multiple release files" (whl at 15:14:30, tar.gz at 15:12:00 → returns 15:12:00)
- AC: `PYPI_SIMPLE` constant greppable at top of `pypi.js` → **PASS** — `grep -n 'PYPI_SIMPLE' src/registry/pypi.js` returns lines 5–6 (`const PYPI_SIMPLE_API` and `const PYPI_SIMPLE_ACCEPT`); no hardcoded URL in fetch call
- AC: Cache key `pypi/requests/2.28.0` non-colliding with npm key → **PASS** — `cache-namespace.test.js`: all 4 tests confirm `pypi/requests/2.28.0` is distinct from `requests`, `requests@2.28.0`, and `attestations:requests@2.28.0`
- AC: `client.js` dispatch to `pypi.js` for `ecosystem: 'pypi'` → **PASS** — `client.test.js`: "ecosystem 'pypi' dispatches to PyPI adapter"; "writes cache key pypi/{name}/{version}"
- AC: `ecosystem: 'npm'` or absent → npm path → **PASS** — `client.test.js`: "ecosystem 'npm' dispatches to npm path"; "absent ecosystem defaults to npm path"; "string argument uses npm path unchanged"
- AC: Existing npm tests unchanged → **PASS** — `client.test.js` 17 pre-existing tests pass; `npm-registry.test.js` (14 pass), `cache.test.js` (11 pass), `provenance.test.js` (8 pass) — all 50 pre-existing tests pass
- AC: ADR-003 degradation on timeout → **PASS** — `client.test.js`: "pypi degradation — no cache + failed fetch returns null with warning"; "pypi stale cache returned with warning when fetch fails"
- AC: `node --input-type=module -e "import './src/registry/pypi.js'"` resolves → **PASS** — exits 0

## Deferred Verification

none

## Regression Risk

- Risk level: low
- Why: `http.js` change is purely additive (`headers` param with `{}` default, merged after `Accept: 'application/json'`). Existing npm and attestation callers pass no `headers` arg — zero behaviour change. The `client.js` dispatch is guarded by `ecosystem === 'pypi'` so all pre-existing npm paths are structurally unchanged. 50 pre-existing tests confirmed green.

## Integration / Boundary Judgment

- Boundary: `client.js` → `pypi.js` dispatch; `pypi.js` → `http.js` shared helper
- Judgment: complete
- Notes: Both sides of the dispatch boundary land in this task per story spec. `_fetchPypiVersionMetadata` injectable confirmed working in `client.test.js`. `pypi.js` return shape (`{ publisherAccount, publishedAt, hasAttestations }`) matches what the story requires for downstream policy rules. Cache key `pypi/${name}/${version}` verified non-colliding via real `createCache` in temp dir.

## Test Results

- `node --test test/registry/pypi.test.js` → 16 pass, 0 fail
- `node --test test/registry/cache-namespace.test.js` → 4 pass, 0 fail
- `node --test test/registry/client.test.js` → 25 pass, 0 fail (17 existing + 8 new)
- `node --test test/registry/npm-registry.test.js test/registry/cache.test.js test/registry/provenance.test.js` → 39 pass, 0 fail (all pre-existing)
- `grep -n 'PYPI_SIMPLE' src/registry/pypi.js` → lines 5–6 confirmed
- `node --input-type=module -e "import './src/registry/pypi.js'"` → exits 0

## Context Updates Made

No context updates needed. No module guidance or pitfalls files exist for the `registry` module scope yet. No reusable traps or unexpected patterns emerged from this review that warrant a new context entry — the injectable pattern (`_fetchVersionJson`/`_fetchSimpleJson`) and the `withDegradation` wrapper are already established patterns. The `encodeKey` `/` → `%2f` behavior (noted in the design note) is a cache.js internal — well understood and verified by the collision tests.

## Metadata

- Agent: reviewer
- Date: 2026-04-11
- Task: task-075
- Branch: burnish/task-075-implement-pypi-registry-adapter-and-ecosystem-dispatch
- Artifacts: docs/stories/F16-S2-pypi-registry-adapter.md, docs/design-notes/F16-S2-approach.md, docs/feature-briefs/F16-python-ecosystem.md, docs/adrs/ADR-001-zero-runtime-dependencies.md, docs/adrs/ADR-003-registry-caching-and-offline-behavior.md, context/global/conventions.md
