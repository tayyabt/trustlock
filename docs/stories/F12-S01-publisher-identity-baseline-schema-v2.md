# Story: F12-S01 — Publisher Identity + Baseline Schema v2

## Parent
F12: Publisher Identity + Baseline Schema v2

## Description
Introduces the `trust-continuity:publisher` rule by adding `publisherAccount` extraction to the registry layer, creating `publisher.js` for comparison and block/warn decisions, and upgrading `baseline/manager.js` to schema v2 with lazy per-package migration. These three files ship as a single atomic unit per constraint C2 and ADR-006.

## Scope
**In scope:**
- `src/registry/npm-registry.js` — extract `_npmUser.name` from existing `GET /{name}/{version}` response; return as `publisherAccount` in the version metadata object
- `src/registry/publisher.js` (new) — wrap publisher extraction and comparison logic; call cache-first fetch from `registry/client.js`; emit warning vs. block decision
- `src/baseline/manager.js` — add `publisherAccount: string | null` to every `TrustProfile` object; detect schema_version on read; write schema_version 2 on every baseline advance; implement lazy migration for changed packages during `check`

**Not in scope:**
- Output formatting (block output with `⚠` marker is owned by F10's output contract; this story produces the `publisher-change` block signal only)
- `src/cli/args.js` — no new flags added
- `src/policy/` — policy rule evaluation that calls `publisher.js` is wired in the existing check flow; `publisher.js` exposes the result and the check flow consumes it
- Any bulk migration job or explicit migration command
- pnpm/yarn parser changes (publisher.js logic applies transparently via the same npm registry endpoint)

## Entry Points
- Trigger: `trustlock check` — step 5a of the check flow fetches registry metadata for each changed/added package; publisher comparison runs before rule output
- Starting surface: `src/baseline/manager.js:readBaseline()` — on read, detects schema_version; on `advanceBaseline()`, writes schema_version 2 with `publisherAccount` populated or `null`

## Wiring / Integration Points
- Caller-side ownership: `src/policy/` (check flow step 5b) — already calls registry metadata fetch; must additionally call `publisher.js:comparePublisher(oldEntry, newVersionMetadata, config)` for each package in `delta.changed` and incorporate the returned block/warn signal into the `CheckResult`
- Callee-side ownership: `src/registry/publisher.js` — new module; owns publisher comparison logic, null-handling, and block/warn decision; called by the check flow
- Caller-side conditional rule: The policy check flow already exists. This story wires the call to `publisher.js` from within the check flow's per-package evaluation loop. The call site is inside the existing loop at step 5b — wire it now.
- Callee-side conditional rule: `registry/client.js` already exists and provides `fetchVersionMetadata(name, version)` (cache-first). `publisher.js` calls it directly; no change to `client.js` interface required.
- Boundary / contract check: `publisher.js:comparePublisher` must return `{ blocked: boolean, warning: string | null, newPublisherAccount: string | null }`. The check flow reads `blocked` and `warning`; baseline manager reads `newPublisherAccount` to update the profile on advance.
- Files / modules to connect:
  - `src/registry/npm-registry.js` → returns `publisherAccount` in version metadata
  - `src/registry/publisher.js` → calls `client.js:fetchVersionMetadata`; exposes `comparePublisher`
  - `src/baseline/manager.js` → reads/writes `publisherAccount` on all TrustProfile objects
  - `src/policy/check.js` (or equivalent check orchestrator) → calls `publisher.js:comparePublisher` per changed package; passes result to output formatter
- Deferred integration: The `⚠` elevated marker in the BLOCKED output section is owned by F10's output module. This story produces the `publisher-change` rule signal only. F10 must already be in the check result contract for this to render correctly. If F10 has not yet landed, the block signal is still recorded but the `⚠` rendering is deferred to F10.

## Not Allowed To Stub
- `npm-registry.js` must extract and return a real `publisherAccount` field from the existing version fetch response — not a hardcoded or placeholder value
- `publisher.js:comparePublisher` must implement real null-handling (D15: null old publisher → warn, never block), real equality comparison, and real `block_on_publisher_change` config respect
- `manager.js:advanceBaseline` must write schema_version 2 with `publisherAccount` populated for all packages that had a publisher fetch, and `null` for all others — not a passthrough of the old entry
- The lazy migration fetch (old-version publisher for changed packages) must use the existing cache-first path from `registry/client.js` — not a direct HTTP call bypassing cache
- The call from the check flow to `publisher.js:comparePublisher` must be real, not a TODO comment

## Behavioral / Interaction Rules
- Block condition: `block_on_publisher_change: true` (default) AND both old and new publishers are non-null AND they differ → `CheckResult` includes `publisher-change` rule as blocking
- Warn condition: old publisher is `null` (v1 legacy entry or prior fetch failure) → emit stderr warning `Could not compare publisher — no prior record for this package`; no block; record new publisher
- Warn condition: `block_on_publisher_change: false` → rule fires, records publisher change, emits warning, does not block
- Warn condition: `_npmUser.name` absent from registry response → treat as `null`; no block; warning
- Warn condition: registry fetch for old version fails (network error) → treat as `null`; warn `Warning: Could not fetch publisher for {package}@{old_version} — registry unreachable. Publisher comparison skipped.`; do not block
- No additional HTTP call per package: `_npmUser.name` is extracted from the same `GET /{name}/{version}` response already fetched for provenance and cooldown metadata
- `block_on_publisher_change` key absent from config: defaults to `true`
- Unchanged packages in the baseline: written with `publisherAccount: null` on the next advance if they were not changed in that run; no migration triggered
- Changed package with known publisher (already migrated, `publisherAccount !== null`): compare directly; block if different and config requires it

## Acceptance Criteria
- [ ] `npm-registry.js` extracts `_npmUser.name` from the existing version fetch response and returns it as `publisherAccount` in the version metadata object; absent field returns `null`
- [ ] `baseline/manager.js:readBaseline()` reads schema_version 1 and 2 baselines without error; schema_version 1 entries return with `publisherAccount: undefined` (treated as `null` by publisher.js)
- [ ] `baseline/manager.js:advanceBaseline()` writes all TrustProfile entries in schema_version 2 format with `publisherAccount` set correctly; `schema_version` field in the file is `2`
- [ ] For a changed package with a v1 baseline entry (`publisherAccount` null/absent): old-version publisher is fetched (cache-first) before rule evaluation per ADR-006
- [ ] Publisher change (both known, differ, `block_on_publisher_change: true`): `CheckResult` includes `publisher-change` as a blocking rule
- [ ] Old publisher null (legacy entry or prior fetch failure): stderr warning emitted; no block; new publisher recorded in baseline on advance
- [ ] `block_on_publisher_change: false` in policy config: change recorded, warning emitted, no block
- [ ] Registry fetch for old-version publisher fails: warning emitted, `publisherAccount: null` recorded, no block
- [ ] `publisher.js`, `manager.js`, and `npm-registry.js` changes ship as a single story — no partial merge
- [ ] No additional HTTP call per package beyond the existing `GET /{name}/{version}`; verified by checking that `publisher.js` calls `client.js:fetchVersionMetadata` and does not call `node:https` directly
- [ ] `block_on_publisher_change` absent from config: defaults to `true`; test verifies the default behavior
- [ ] Unchanged packages written with `publisherAccount: null` on next baseline advance (not migrated eagerly)
- [ ] Edge case 6 (publisher reverts to original): rule fires again (new publisher != current baseline publisher); block or warn per config
- [ ] C2 constraint satisfied: `src/registry/publisher.js`, `src/registry/npm-registry.js`, and `src/baseline/manager.js` all land in the same commit/PR

## Task Breakdown
1. Modify `src/registry/npm-registry.js`: extract `_npmUser.name` from version response object; add `publisherAccount: data._npmUser?.name ?? null` to the returned metadata object
2. Create `src/registry/publisher.js`: export `comparePublisher(oldProfile, newVersionMeta, config)` — implement null-handling (warn only), equality comparison, `block_on_publisher_change` config read, block/warn/record return contract
3. Modify `src/baseline/manager.js`: (a) `readBaseline` — detect schema_version, accept v1 entries without `publisherAccount`; (b) `advanceBaseline` — write all entries in v2 format with `publisherAccount` populated from the check run result or `null`; (c) add `schema_version: 2` to written file
4. Implement lazy migration in check flow: for each package in `delta.changed` where baseline entry has `publisherAccount === null`, call `client.js:fetchVersionMetadata(name, oldVersion)` to get old publisher before calling `comparePublisher`
5. Wire check flow (`src/policy/check.js` or orchestrator): call `publisher.js:comparePublisher` for each changed package; incorporate `blocked` and `warning` into `CheckResult`
6. Write unit tests for `publisher.js`: all null combinations, block/warn scenarios, `block_on_publisher_change` true/false, registry fetch failure
7. Write unit tests for `manager.js` schema v2: v1 read, v2 write, mixed advance run
8. Write integration test: v1 baseline file → check run with one changed package → baseline written as v2; publisher fetched; result includes correct block/warn

## Verification
```bash
node --experimental-vm-modules node_modules/.bin/jest src/registry/publisher.test.js
# Expected: all null-handling, block/warn, and config-respect cases pass

node --experimental-vm-modules node_modules/.bin/jest src/baseline/manager.test.js
# Expected: schema v1 read, v2 write, mixed advance all pass

node --experimental-vm-modules node_modules/.bin/jest --testPathPattern="publisher|manager|npm-registry"
# Expected: all tests pass, no errors

# Verify no direct HTTP in publisher.js:
grep -n "node:https\|require('https')\|require(\"https\")" src/registry/publisher.js
# Expected: no output (publisher.js must not call https directly)

# Verify publisherAccount field extraction:
grep -n "publisherAccount\|_npmUser" src/registry/npm-registry.js
# Expected: lines showing _npmUser?.name extraction and publisherAccount in returned object

# Verify schema_version 2 on write:
grep -n "schema_version" src/baseline/manager.js
# Expected: lines showing schema_version read (v1/v2) and write (2)
```

## Edge Cases to Handle
- EC1: Package where `_npmUser.name` absent → `publisherAccount: null`; warn; no block
- EC2: `block_on_publisher_change: false` → record change, warn, no block
- EC3: Registry fetch for old-version fails → warn, record null, no block
- EC4: Publisher reverts to original account → rule fires; block per config
- EC5: v1 baseline entry for unchanged package → `publisherAccount: null` written on advance; no fetch triggered
- EC6: v1 baseline entry for changed package → old-version fetch before rule evaluation (ADR-006)
- EC7: `block_on_publisher_change` absent from config → defaults to `true`
- EC8: Both old and new publishers null → emit warning; no block
- EC9: pnpm/yarn packages → same `publisher.js` logic; npm registry endpoint is the same

## Dependencies
- Depends on: F09 (paths.js — utils layer prerequisite for all Sprint 3 stories), F03 (registry client — `fetchVersionMetadata` already exists), F04 (baseline manager — base implementation exists; this story extends it)
- Blocked by: ADR-006 (written, task-045 — prerequisite satisfied)

## Effort
L — Spans two modules (registry + baseline), introduces a new module (`publisher.js`), adds schema migration logic, and wires the comparison into the check flow with null-handling and multiple edge cases.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: 1

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
