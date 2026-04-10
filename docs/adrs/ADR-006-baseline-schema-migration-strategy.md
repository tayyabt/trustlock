# ADR-006: Baseline Schema Migration Strategy

## Status
Accepted

## Supersedes
N/A

## Context
The v0.1 baseline is schema_version 1. The v0.2 spec introduces schema_version 2, which adds `publisherAccount: string | null` to the `TrustProfile` object. This field enables the `trust-continuity:publisher` rule. Without it, publisher change detection cannot block or warn.

The migration is non-trivial: for packages that are *changing version* in the current check run, trustlock must fetch the publisher (`_npmUser.name`) for the *old* (baseline) version — not just the new version. This is a registry call for a version that has already been admitted, and its metadata may not be in the cache. For packages that are *not changing*, the migration sets `publisherAccount: null` (unknown) and defers the fetch to the next time that package changes.

Two questions this ADR must answer:
1. When does migration run, and is it blocking?
2. What happens when the registry is unreachable during migration (old version fetch fails)?

## Options Considered

### Option 1: Lazy migration — migrate on first change per package
- **Description:** When `check` runs and computes the delta, for each changed package whose baseline entry has schema_version 1 (no `publisherAccount`): fetch `_npmUser.name` for the old version, record it in the migrated baseline entry, then compare to the new version's publisher. Unchanged packages keep `publisherAccount: null` indefinitely until they next change. No explicit migration run.
- **Pros:** No migration overhead on packages that never change. No separate migration command or phase. Works naturally within the existing check flow.
- **Cons:** Publisher comparison for v1 entries is impossible on the first upgrade (can only warn, not block). This is the correct product tradeoff (D15 in the product review — null baseline: warn never block) but must be understood as a known limitation.

### Option 2: Eager one-time migration — upgrade all baseline entries at check time
- **Description:** The first time `check` runs with a schema_version 2 binary, detect schema_version 1, fetch publishers for all packages in the baseline, and write schema_version 2 before delta computation begins.
- **Pros:** Publisher data is populated immediately. Publisher comparison is available on the very first upgrade after migration.
- **Cons:** A baseline with 188 packages requires 188 registry fetches before any check work happens. Even with the cache, first-run latency is severe. More importantly: if any fetch fails (rate limit, network outage), the migration is incomplete and the baseline is in a partial state.

### Option 3: Background migration with explicit schema_version 1.5 intermediate
- **Description:** Introduce an intermediate schema to track migration state. Background migration runs across multiple check invocations.
- **Pros:** Avoids the latency spike of Option 2.
- **Cons:** Significant complexity. An intermediate schema that must be handled by the parser for the lifetime of the migration window. Not worth the complexity for a CLI tool.

## Decision
Option 1: Lazy migration — migrate on first change per package.

**Baseline schema detection:**
`src/baseline/manager.js` reads `schema_version` from the file. If `schema_version` is 1, the baseline is in legacy mode. The manager continues to read it correctly (schema_version 1 entries simply have no `publisherAccount` field).

**On baseline write (advance):**
When the baseline advances, all written entries use the schema_version 2 format. The `schema_version` field at the file level is updated to 2. This means: after the first successful check run with a schema_version 2 binary, the baseline file is written as schema_version 2. Entries that were not changed in that run are written with `publisherAccount: null`.

**Migration path for changed packages (during `check`):**
1. For each package in `delta.changed` where `previous.publisherAccount === null` (legacy):
   a. Attempt to fetch `_npmUser.name` for the *old version* (cache-first, per ADR-003).
   b. If fetch succeeds: record `publisherAccount` in the migrated baseline entry; compare old publisher to new publisher. If they differ and `block_on_publisher_change: true`: block and name both publishers in the output.
   c. If fetch fails (no cache, registry unreachable): emit stderr warning: `Warning: Could not fetch publisher for {package}@{old_version} — registry unreachable. Publisher comparison skipped.` Do NOT block. Record `publisherAccount: null` and move on.
2. For each package in `delta.changed` where `previous.publisherAccount !== null` (already migrated): compare directly. Block if different and policy requires it.

**Migration path for unchanged packages:**
No action. They remain in the baseline with `publisherAccount: null` until they next change.

**First-upgrade behavior (D15):**
When `publisherAccount` is null for the old version (whether because it's a legacy entry or because a prior registry fetch failed), trustlock emits a warning and never blocks. This is the correct product tradeoff: false positives on every first upgrade would be worse than one missed detection.

**Publisher fetch and existing registry infrastructure:**
`_npmUser.name` is available on `GET https://registry.npmjs.org/{name}/{version}` — the same endpoint used by the existing registry client for provenance and cooldown metadata. `src/registry/npm-registry.js` must be updated to extract `_npmUser.name` from the version response alongside the existing fields. No additional HTTP call is required. `src/registry/publisher.js` (named in the spec) wraps this extraction and comparison logic; it calls the existing cache-first fetch from `registry/client.js`.

## Consequences
- **Implementation:** `src/baseline/manager.js` — read schema_version, write as v2 on advance, translate all entries on write. `src/registry/publisher.js` — extract `_npmUser.name` from cached version metadata; handle null comparison; emit appropriate warning vs. block decision. `src/registry/npm-registry.js` — add `publisherAccount` field to the metadata object returned per version fetch.
- **Testing:** (1) Legacy baseline (schema_version 1) → first check with changed package → migrated entry written as v2, publisher compared, block or warn. (2) Publisher fetch fails during migration → warn, do not block, record null. (3) Unchanged packages → written with publisherAccount: null on next advance. (4) Already-migrated entry (publisherAccount known) → publisher change → block. (5) Already-migrated entry, publisher unchanged → no block, no warning.
- **Operations:** First check run on a repo with a schema_version 1 baseline rewrites the file as v2. This produces a git diff on `.trustlock/baseline.json`. Developers should expect this; it should be noted in the v0.2 release notes.
- **Future:** schema_version 3 (if needed) follows the same lazy migration pattern. The `schema_version` field is the canonical discriminant.

## Module Structure
- `src/baseline/manager.js` — schema_version detection, v1→v2 coercion on write
- `src/registry/publisher.js` — publisher extract, compare, warn/block decision
- `src/registry/npm-registry.js` — add `publisherAccount` to version metadata response

## Metadata
- Agent: architect
- Date: 2026-04-10
- Feature: publisher-identity-detection
