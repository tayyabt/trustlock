# Review Handoff: task-020 — F03-S02 npm Registry & Attestations HTTP Adapters

## Status
Ready for review

## Summary
Implemented two raw HTTP adapter modules plus an internal shared HTTP helper:

- `src/registry/http.js` — `httpGetJson` core helper (streaming body collection, error classification, timeout, 50 MB size guard)
- `src/registry/npm-registry.js` — `fetchFullMetadata(name)`, `fetchVersionMetadata(name, version)`
- `src/registry/provenance.js` — `fetchAttestations(name, version)` (returns `null` on 404)

28 unit tests: 20 in `test/registry/npm-registry.test.js`, 8 in `test/registry/provenance.test.js`. All pass.

## Verification

```
node --test test/registry/npm-registry.test.js
# tests 20  pass 20  fail 0  duration_ms ~107

node --test test/registry/provenance.test.js
# tests 8   pass 8   fail 0  duration_ms ~97
```

## Design Note
`docs/design-notes/F03-S02-approach.md`

## Notable Decisions
1. `src/registry/http.js` added as internal shared helper (not in story scope list) to avoid duplicating ~60 lines between the two adapters. Documented in design note.
2. `_https` dependency injection option used for unit testing (no `mock.module()` dependency — works on Node ≥ 18.3).
3. 50 MB size guard prevents OOM on pathological responses.
4. `fetchAttestations` catches `REGISTRY_NOT_FOUND` and returns `null` — 404 is normal for packages without attestations.

## Acceptance Criteria
All 10 ACs: PASS (see design note Verification Results section)
