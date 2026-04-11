# Review Artifact: task-066 — Publisher Identity + Baseline Schema v2

## Status
Ready for review

## Summary

Implemented the `trust-continuity:publisher` rule as an atomic unit (F12-S01, C2):

1. **`src/registry/npm-registry.js`** — `fetchVersionMetadata` now extracts `_npmUser.name` and returns it as `publisherAccount` in the response object. Absent or missing `_npmUser.name` yields `null`.

2. **`src/registry/publisher.js`** (new) — Pure `comparePublisher(oldEntry, newVersionMeta, config)` function. Implements null-handling (D15: null old publisher → warn never block), equality comparison, and `block_on_publisher_change` config respect (default `true`). Returns `{ blocked, warning, newPublisherAccount }`.

3. **`src/baseline/manager.js`** — Schema v2 support: `readBaseline` now accepts both v1 and v2; `advanceBaseline` always writes `schema_version: 2` with `publisherAccount` per TrustProfile entry, populated from a new `publisherAccounts` parameter.

4. **`src/policy/engine.js`** — Rule 8 (`trust-continuity:publisher`) added to the per-package evaluation loop. Runs only for changed packages (`previousProfile !== null`). Skips when `oldPublisherFetchFailed` flag is set (warning already emitted by check.js). Emits `comparePublisher` warnings to stderr.

5. **`src/cli/commands/check.js`** — Step 9 now also calls `client.getVersionMetadata` for all evaluated packages to get `newPublisherAccount`. Step 9b performs lazy migration: for changed packages with null baseline publisher, fetches old-version metadata via `client.getVersionMetadata` and stores the result as `effectiveOldPublisherAccount`. Registry failures emit the ADR-006 specified warning and set `oldPublisherFetchFailed: true`. Step 14 builds `publisherAccounts` map and passes it to `advanceBaseline`.

## Test Coverage

All acceptance criteria covered:

| AC | Test | Result |
|----|------|--------|
| npm-registry.js extracts publisherAccount | `test/registry/npm-registry.test.js` | PASS |
| readBaseline accepts v1 and v2 | `test/baseline/manager.test.js` | PASS |
| advanceBaseline writes v2 with publisherAccount | `test/baseline/manager.test.js` | PASS |
| v1 changed package → old-version fetch | `test/integration/publisher-schema-migration.test.js` | PASS |
| Publisher change → publisher-change block | `test/registry/publisher.test.js`, integration | PASS |
| Old publisher null → warn only | `test/registry/publisher.test.js`, integration | PASS |
| block_on_publisher_change: false → warn only | `test/registry/publisher.test.js`, integration | PASS |
| Registry fetch fails → warn, no block | `test/integration/publisher-schema-migration.test.js` | PASS |
| Single atomic unit (C2) | All files in one PR | PASS |
| No direct https in publisher.js | `grep -n "node:https\|require('https')" src/registry/publisher.js` → no output | PASS |
| block_on_publisher_change absent → defaults true | `test/registry/publisher.test.js` | PASS |
| Unchanged packages → publisherAccount: null | `test/baseline/manager.test.js` | PASS |
| Publisher reverts → rule fires again | `test/registry/publisher.test.js` | PASS |

**Total**: 95 tests, 0 failures in touched scope.

## Files Changed

### Source
- `src/registry/npm-registry.js` — publisherAccount extraction
- `src/registry/publisher.js` (new) — comparePublisher
- `src/baseline/manager.js` — schema v2 read/write
- `src/policy/engine.js` — rule 8: trust-continuity:publisher
- `src/cli/commands/check.js` — publisher fetch + advance wiring

### Tests
- `test/registry/publisher.test.js` (new) — 14 tests
- `test/baseline/manager.test.js` — updated for v2 schema (24 tests total)
- `test/registry/npm-registry.test.js` — updated fetchVersionMetadata tests (22 tests total)
- `test/integration/publisher-schema-migration.test.js` (new) — 5 integration tests

### Design artifacts
- `docs/design-notes/F12-S01-approach.md`
- `docs/reviews/task-066-review.md` (this file)

## Notes for Reviewer

- `createBaseline` (used by `init`) still writes `schema_version: 1`. This is intentional — `init` doesn't have publisher info and the first `check` run promotes the baseline to v2. If `init` should write v2, that's a separate story scope.
- Pre-existing output test failures (`test/output/terminal.test.js`, `test/output/json.test.js`) are not caused by this PR (confirmed by stash check).
- The `oldPublisherFetchFailed` sentinel approach prevents double-warning when check.js already emits the "registry unreachable" warning for old-version fetch failures.
- `block_on_publisher_change` is placed under `config.provenance` to be consistent with existing provenance-related config structure.
