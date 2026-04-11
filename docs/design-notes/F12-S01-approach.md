# Design Approach: task-066 — Publisher Identity + Baseline Schema v2

## Summary

Implements the `trust-continuity:publisher` rule end-to-end as an atomic unit (C2, ADR-006):
1. `npm-registry.js` extracts `_npmUser.name` and surfaces it as `publisherAccount` in the version metadata object.
2. `src/registry/publisher.js` (new) provides `comparePublisher(oldEntry, newVersionMeta, config)` — a pure comparison function that implements null-handling, equality comparison, and `block_on_publisher_change` config respect.
3. `src/baseline/manager.js` is upgraded to schema v2: `readBaseline` accepts both v1 and v2; `advanceBaseline` always writes v2 with `publisherAccount` per entry and a `publisherAccounts` injection parameter.
4. `src/policy/engine.js` adds rule 8 (`trust-continuity:publisher`) — called only for changed packages, using publisher data pre-fetched and stored in the registry data map.
5. `src/cli/commands/check.js` fetches version metadata for all evaluated packages (new version) and for v1 changed packages also fetches the old version to migrate publisher info, populating `newPublisherAccount` / `effectiveOldPublisherAccount` / `oldPublisherFetchFailed` in the metadata map. Builds `publisherAccounts` map and passes it to `advanceBaseline`.

## Key Design Decisions

1. **Publisher data fetched in check.js, consumed by engine.js via metadataMap enrichment**: The registry client lives in check.js (step 9). Rather than pass a client reference into the engine, publisher fetching (both new-version and old-version migration) is done in step 9 alongside the existing metadata fetches. The engine receives the resolved values via the existing metadata map. This keeps the engine a pure rule evaluator with no I/O.

2. **Old-version fetch failure uses sentinel `oldPublisherFetchFailed = true`**: When old-version fetch fails in check.js, the specific ADR-006 warning is emitted to stderr immediately and a `oldPublisherFetchFailed` flag is stored in the metadata map. The engine skips `comparePublisher` for this package (warning already emitted). This prevents double-warning (one from check.js, one from comparePublisher's null-old-publisher path).

3. **`advanceBaseline` extended with `publisherAccounts = {}` parameter**: Rather than change `ResolvedDependency`, a separate map is passed to `advanceBaseline`. Changed/added packages get their publisher from this map; unchanged packages keep their old `publisherAccount` (already migrated) or receive `null`. Always writes `schema_version: 2`.

4. **`readBaseline` accepts schema_version 1 and 2**: Previously it rejected anything other than 1. Now accepts 1 or 2; anything else is still `unsupported_schema`.

5. **`comparePublisher` is a pure function**: No I/O, no side effects. Takes `(oldEntry, newVersionMeta, config)`, reads `publisherAccount` from both, applies config defaults (`block_on_publisher_change` defaults to `true` per ADR-006).

6. **`block_on_publisher_change` lives under `config.provenance`**: Consistent with where the provenance rule config already lives. Config key: `provenance.block_on_publisher_change`.

## Integration / Wiring

- **npm-registry.js → fetchVersionMetadata**: Returns `publisherAccount: data._npmUser?.name ?? null` in the response object. Callers that previously used the raw `_npmUser` field directly are unaffected (field still present).
- **check.js step 9**: Fetches `client.getVersionMetadata(name, version)` for ALL packages in `depsToEvaluate`. For changed packages where `baseline.packages[name]?.publisherAccount == null`, also fetches old-version metadata. Adds `newPublisherAccount`, `effectiveOldPublisherAccount`, `oldPublisherFetchFailed` to metadataMap entries.
- **engine.js rule 8**: Imports `comparePublisher` from `../registry/publisher.js`. Runs only for changed packages (`previousProfile !== null`). Skips if `oldPublisherFetchFailed`. Emits `publisherResult.warning` to stderr. Adds `trust-continuity:publisher` blocking finding when `publisherResult.blocked`.
- **check.js step 14 (baseline advance)**: Builds `publisherAccounts` from metadataMap, passes to `advanceBaseline`. `advanceBaseline` writes v2 format.
- **Deferred**: Output module (`⚠` elevated marker in BLOCKED section) is F10's responsibility. This story emits the block signal; the marker rendering is already in F10 or will be wired there.

## Files to Create/Modify

- `src/registry/npm-registry.js` — Add `publisherAccount` extraction to `fetchVersionMetadata` return
- `src/registry/publisher.js` (new) — `comparePublisher` pure function
- `src/baseline/manager.js` — Schema v2 read/write, `publisherAccounts` param on `advanceBaseline`
- `src/policy/engine.js` — Rule 8: trust-continuity:publisher
- `src/cli/commands/check.js` — Publisher data fetch in step 9, `publisherAccounts` map built and passed to advance
- `test/registry/publisher.test.js` (new) — All AC cases for publisher comparison
- `test/baseline/manager.test.js` — Updated for v2 schema: v1 read, v2 write, v2 advance
- `test/registry/npm-registry.test.js` — Updated `fetchVersionMetadata` test to expect `publisherAccount` field

## Testing Approach

- **Unit: `test/registry/publisher.test.js`** — Covers comparePublisher: all null combinations (EC8), block (both known, differ, block=true), warn-only (differ, block=false), same publisher (no action), `block_on_publisher_change` absent (defaults true), new publisher null.
- **Unit: `test/baseline/manager.test.js`** — Adds: v1 read passes, v2 read passes, schema_version 3 still unsupported, advanceBaseline writes v2, publisherAccount populated from publisherAccounts map, unchanged packages get null if not in map.
- **Unit: `test/registry/npm-registry.test.js`** — Updated: `fetchVersionMetadata` result includes `publisherAccount: null` when `_npmUser` absent or has no `name`; adds test for `_npmUser.name` present.
- **Integration: `test/integration/publisher-schema-migration.test.js`** — v1 baseline file on disk, simulated check run via engine with mocked registry client, baseline advanced as v2, publisher comparison result verified.

## Acceptance Criteria / Verification Mapping

- AC1: npm-registry.js extracts `_npmUser.name` → Verification: `test/registry/npm-registry.test.js`, `grep publisherAccount src/registry/npm-registry.js`
- AC2: readBaseline reads v1 and v2 → Verification: `test/baseline/manager.test.js`
- AC3: advanceBaseline writes v2 with publisherAccount → Verification: `test/baseline/manager.test.js`
- AC4: v1 changed package → old-version fetch before rule evaluation → Verification: `test/integration/publisher-schema-migration.test.js`
- AC5: Publisher change + block=true → publisher-change blocking rule → Verification: `test/registry/publisher.test.js`, `test/integration/publisher-schema-migration.test.js`
- AC6: Old publisher null → warn only → Verification: `test/registry/publisher.test.js`
- AC7: block_on_publisher_change=false → warn only → Verification: `test/registry/publisher.test.js`
- AC8: Registry fetch fails → warn, null recorded → Verification: `test/integration/publisher-schema-migration.test.js`
- AC9: All three files ship as atomic unit (C2) → Verification: single commit
- AC10: No direct https in publisher.js → Verification: `grep -n "node:https\|require('https')" src/registry/publisher.js`
- AC11: block_on_publisher_change absent → defaults true → Verification: `test/registry/publisher.test.js`
- AC12: Unchanged packages → publisherAccount: null on advance → Verification: `test/baseline/manager.test.js`
- AC13: EC4 publisher reverts → rule fires again → Verification: `test/registry/publisher.test.js`

## Verification Results

- AC1: PASS — `grep -n "publisherAccount\|_npmUser" src/registry/npm-registry.js` shows extraction; `test/registry/npm-registry.test.js` tests `fetchVersionMetadata extracts _npmUser.name as publisherAccount` and `sets publisherAccount to null when _npmUser is absent`
- AC2: PASS — `test/baseline/manager.test.js` tests `readBaseline accepts schema_version 2 baseline without error`; v1 round-trip still passes; v1 entries have no `publisherAccount` field (treated as null by publisher.js)
- AC3: PASS — `test/baseline/manager.test.js` tests `advanceBaseline always writes schema_version 2`; `advanceBaseline writes publisherAccount for changed/new packages from publisherAccounts map`; confirmed `schema_version: 2` written
- AC4: PASS — `test/integration/publisher-schema-migration.test.js` tests `engine: publisher-change rule fires and blocks when old and new publishers differ (v1 baseline)` — uses `effectiveOldPublisherAccount` in metadataMap (populated by check.js step 9b) for v1 entries
- AC5: PASS — `test/registry/publisher.test.js` tests block scenario; `test/integration/publisher-schema-migration.test.js` tests block in engine; `trust-continuity:publisher` finding with `severity: error` produced
- AC6: PASS — `test/registry/publisher.test.js` tests null-old-publisher path; `test/integration/publisher-schema-migration.test.js` tests engine warns and admits; stderr warning `no prior record` emitted
- AC7: PASS — `test/registry/publisher.test.js` tests `warns but does not block when block_on_publisher_change is false`; `test/integration/publisher-schema-migration.test.js` tests engine path
- AC8: PASS — `test/integration/publisher-schema-migration.test.js` tests `engine: skips publisher rule and does not block when old-version fetch failed` with `oldPublisherFetchFailed: true` sentinel
- AC9: PASS — All three files (`npm-registry.js`, `publisher.js`, `manager.js`) modified in the same branch/PR
- AC10: PASS — `grep -n "node:https\|require('https')" src/registry/publisher.js` returns empty (exit 1); no direct https usage
- AC11: PASS — `test/registry/publisher.test.js` tests `defaults block_on_publisher_change to true when absent from config`
- AC12: PASS — `test/baseline/manager.test.js` tests `sets publisherAccount: null for unchanged v1 packages`; `handles mixed v1 and v2 entries`
- AC13: PASS — `test/registry/publisher.test.js` tests `blocks when publisher changes back to an earlier account (regression scenario)`

Commands run:
```
node --test test/registry/publisher.test.js            # 14 pass
node --test test/registry/npm-registry.test.js         # 22 pass
node --test test/baseline/manager.test.js              # 24 pass
node --test test/integration/publisher-schema-migration.test.js  # 5 pass
node --test test/unit/cli/check.test.js                # 14 pass
node --test test/policy/engine.test.js                 # 16 pass
```

Total touched-scope: 95 tests, 0 failures.
Pre-existing failures in test/output/ are unrelated to this story (confirmed by stash check).

## Documentation Updates

None — no new CLI flags, env vars, or setup steps. The schema v2 migration is documented in ADR-006 (already written).

## Deployment Impact

None — no new runtime dependencies, no new env vars, no infra changes. First `check` run on a v1 baseline produces a git diff on `.trustlock/baseline.json` (expected, documented in ADR-006).

## Questions/Concerns

- Old cache entries fetched before this PR won't have `publisherAccount` in their version metadata. `publisherAccount` extraction from `_npmUser.name` only happens for new fetches (uncached or TTL-expired). Within the 24-hour version metadata TTL, old cached entries will have `_npmUser` but not `publisherAccount`. The fallback `data?._npmUser?.name ?? null` is used wherever publisher account is read from raw version metadata.
- `comparePublisher` does not handle the case where both old and new publishers are null simultaneously — it returns the "no prior record" warning (same as old-null path). This matches EC8 behavior.
