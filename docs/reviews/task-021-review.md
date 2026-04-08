# Review Handoff: task-021 — Registry Client Facade (F03-S03)

## Status
Ready for review.

## What Was Built
`src/registry/client.js` — `createRegistryClient({ cacheDir, noCache })` factory returning `{ fetchPackageMetadata, getVersionMetadata, getAttestations }`.

Key implementation details:
- **Degradation hierarchy** (ADR-003): fresh cache → stale cache with `"stale registry data"` warning → null with `"skipped: registry unreachable"` warning. Never throws.
- **Concurrency limiter**: semaphore capping at 10 in-flight HTTP requests, shared across all three methods on a single client instance.
- **`noCache: true`**: skips cache reads, still writes successful fetches.
- **Attestation null round-trip**: `getAttestations` wraps fetch results in `{ _value }` before caching so that a `null` (no-attestation) response survives the JSON file cache without being coerced to `{}`.
- **Dependency injection** via `_cache`, `_fetchFullMetadata`, `_fetchVersionMetadata`, `_fetchAttestations` options — tests inject mocks; production uses real modules.

## Verification
- `node --test test/registry/client.test.js` → **17/17 PASS**
- Full registry suite (cache + npm-registry + provenance + client) → **56/56 PASS**

## Files Delivered
- `src/registry/client.js` (new)
- `test/registry/client.test.js` (new)
- `docs/design-notes/F03-S03-approach.md` (new)

## Deferred Wiring
- Caller side (policy engine F06, CLI commands F08) not yet wired — contract is the exported factory and method signatures.

## No Stubs
All integrations are real: `createCache`, `fetchFullMetadata`, `fetchVersionMetadata`, `fetchAttestations` are imported and called directly. Injection hooks are for test isolation only.
