# Story: F15-S1 — policy/inherit.js: extends resolution, fetch, cache, and deep-merge

## Parent
F15: Policy Config Load Order & Org Policy Inheritance

## Description
Create `src/policy/inherit.js`, the module that owns all `extends` resolution logic: detecting URL vs. local path, fetching remote policy with 1-hour cache at `.trustlock/.cache/org-policy.json`, reading local paths relative to `.trustlockrc.json`, deep-merging the fetched base policy with the repo config (scalar/array/object semantics), detecting and warning on chained `extends`, and enforcing numeric floor rules (repo value must be ≥ base value). This module is the leaf dependency — `loader.js` (F15-S2) will call it.

## Scope
**In scope:**
- `src/policy/inherit.js` (new) — all extends resolution, fetch, cache, merge, floor enforcement
- `.trustlock/.cache/org-policy.json` (written at runtime by inherit.js, not a source file)
- Tests for all failure modes, merge semantics, and cache behavior

**Not in scope:**
- `src/policy/loader.js` — that is F15-S2
- `--profile` overlay — that is F15-S2's responsibility (calls F14's `applyProfileOverlay`)
- Any CLI command modifications — F15-S2
- `src/registry/cache.js` — org policy cache is standalone (C6); must not route through registry cache

## Entry Points
- Route / page / screen: `src/policy/inherit.js` — a library module, not a command
- Trigger / navigation path: Called by `loader.js` (F15-S2) during `loadPolicy(args)` when repo config contains an `extends` key
- Starting surface: `.trustlockrc.json` with `"extends": "<url-or-path>"` key present

## Wiring / Integration Points
- Caller-side ownership: `loader.js` (F15-S2) is the caller. It does not exist yet — the seam must be kept explicit. `inherit.js` exports `resolveExtends(extendsValue, configFilePath, cacheDir)` → `Promise<PolicyObject>` where `PolicyObject` is the fetched/parsed base policy (pre-merge). `loader.js` (S2) merges the returned `PolicyObject` over the repo config using the semantics this story also implements.
- Callee-side ownership: `inherit.js` owns fetch, cache read/write, local path read, chained-extends detection, deep-merge semantics, and floor enforcement. All six failure mode exits (unreachable+cache, unreachable+no-cache, non-JSON parse error, chain ignored, local path not found, floor violation) are owned here.
- Caller-side conditional rule: Caller (`loader.js`) does not exist yet — export `resolveExtends` as a named export with its documented contract. Do not block on S2 being absent.
- Callee-side conditional rule: F14's `builtin-profiles.js` already exists (Sprint 3). Floor enforcement in this story is independent of profile logic — no import of F14 required here.
- Boundary / contract check: `resolveExtends` must be unit-testable in isolation with a mock HTTP server (no real network calls in tests). Cache path is passed in as a parameter so tests can use a temp directory.
- Files / modules to connect:
  - `src/policy/inherit.js` imports `node:https`, `node:fs/promises`, `node:path`, `node:url`
  - `src/policy/inherit.js` does NOT import `src/registry/cache.js` (C6)
- Deferred integration: `loader.js` wiring is deferred to F15-S2. This story only defines and exports the contract.

## Not Allowed To Stub
- Cache file read and write: must use real `fs/promises` operations (readFile/writeFile on the JSON cache path)
- HTTP fetch: must use `node:https` with a mock server in tests (not a jest spy that skips the fetch logic)
- Deep-merge implementation: scalar, array-union, and object-deep-merge must all be fully implemented — not hardcoded for a single test case
- Floor enforcement logic: must produce the exact exit message — `Policy error: repo config sets {field}={repo_value}, below org minimum of {base_value}. Repos may only tighten org policy.`
- chained-extends warning: `Warning: chained extends in org policy is not supported. Ignoring.` must write to stderr

## Behavioral / Interaction Rules
- **URL detection:** if `extends` value starts with `https://` or `http://`, treat as remote URL. All other values are local paths.
- **Local path resolution:** resolve relative to the directory containing `.trustlockrc.json` (use `node:path.resolve(path.dirname(configFilePath), extendsValue)`).
- **Remote cache TTL:** 1 hour (3600 seconds). Compare `Date.now()` against `fetched_at` timestamp in cache JSON. If < 1 hour elapsed, skip fetch and return cached policy.
- **Cache stale on remote unreachable:** if fetch fails AND cache exists (regardless of TTL), use stale cache and emit `Warning: could not reach policy URL, using cached copy from {fetched_at}.` to stderr.
- **No cache on remote unreachable:** reject with `Error: could not fetch org policy from {url} and no cached copy exists.` (CLI surfaces this as exit 2).
- **Cache format:** `{ "fetched_at": "<ISO timestamp>", "policy": { ...PolicyObject } }`. Cache is written as indented JSON.
- **Non-JSON response from URL:** reject with a parse error message that names the URL.
- **Local path not found:** reject with `Error: extends path not found: {resolvedPath}`.
- **Chained extends (fetched policy has `extends` key):** strip the `extends` key from the fetched policy, emit warning to stderr, proceed with remaining keys.
- **Array union semantics:** for arrays (`scripts.allowlist`, `ignore_packages`, `required_for`, etc.) — result is the union of base and repo arrays. Repo cannot remove entries added by base.
- **Object deep-merge:** nested objects (`provenance`, `scripts`, `sources`, `pinning`, `approvals`) — repo keys override base keys; base keys not overridden fall through.
- **Scalar override:** numeric, boolean, string fields — repo wins unless floor violated.
- **Floor check:** for every numeric field where `repo_value < base_value`, immediately reject with the required `Policy error:` message.
- **No caching for local paths:** local `extends` is read on every call; no cache file is written.

## Acceptance Criteria
- [ ] `src/policy/inherit.js` exists and exports `resolveExtends(extendsValue, configFilePath, cacheDir)` as a named async function.
- [ ] `src/policy/inherit.js` does NOT import any module from `src/registry/`. Verified by grep: `grep -r "src/registry" src/policy/inherit.js` → no output.
- [ ] Local `extends` path: file read relative to `.trustlockrc.json` directory; no cache file written. Test with a temp dir.
- [ ] Remote `extends` + cache fresh (<1h): cached policy returned, no HTTP call made. Test: mock server that asserts no incoming request.
- [ ] Remote `extends` + cache stale (>1h) + server reachable: fresh fetch performed, cache refreshed with new `fetched_at`.
- [ ] Remote `extends` + cache stale + server unreachable: stale cache used, stderr warning includes `fetched_at` timestamp.
- [ ] Remote `extends` + no cache + server unreachable: process exits with error message containing the URL.
- [ ] Scalar merge: repo value (`cooldown_hours: 96`) wins over base (`cooldown_hours: 72`); merged result has `96`.
- [ ] Floor enforcement: repo `cooldown_hours=24` below base `cooldown_hours=72` → exits with `Policy error: repo config sets cooldown_hours=24, below org minimum of 72. Repos may only tighten org policy.`
- [ ] Array union: org `scripts.allowlist: ["build"]` + repo `scripts.allowlist: ["test"]` → merged `["build", "test"]`. Repo cannot drop `"build"`.
- [ ] Object deep-merge: org `provenance: { required_for: ["*"] }` + repo `provenance: { block_on_publisher_change: false }` → merged `{ required_for: ["*"], block_on_publisher_change: false }`.
- [ ] Chained `extends` in fetched policy: fetched policy's `extends` key is stripped; warning written to stderr.
- [ ] Non-JSON response from URL: process exits with a parse error that names the URL.
- [ ] Local path not found: process exits with `Error: extends path not found: <path>`.

## Task Breakdown
1. Create `src/policy/inherit.js` with URL/local path detection
2. Implement local path read (relative to configFilePath's directory) with `fs.readFile`
3. Implement remote fetch via `node:https` with cache read/write at `cacheDir/org-policy.json`
4. Implement 1-hour TTL check and stale-cache fallback on network failure
5. Implement JSON parse with error on malformed response
6. Implement chained-extends detection: strip `extends` key from fetched policy + stderr warning
7. Implement deep-merge: `mergePolicy(base, repo)` — scalar override with floor check, array union, object deep-merge
8. Implement floor enforcement at merge step with exact error message format
9. Write unit tests covering all 12 edge cases from the feature brief, using a mock HTTP server (e.g., `http.createServer` in test setup)

## Verification
```bash
node --experimental-vm-modules node_modules/.bin/jest src/policy/inherit.test.js --verbose
# Expected: all tests pass covering local path, URL fetch, cache TTL, stale fallback,
# no-cache error, scalar/array/object merge, floor enforcement, chained extends,
# non-JSON error, local path not found

grep -r "src/registry" src/policy/inherit.js
# Expected: no output (C6 compliance)
```

## Edge Cases to Handle
- `extends` URL with expired cache (>1h) and server unreachable → stale cache + warning (not error)
- `extends` URL returns valid JSON that itself contains `extends` key → strip + warn, proceed
- Repo `scripts.allowlist` tries to remove an org entry → union means org entry is kept regardless
- `--profile` overlay is NOT applied here — that is loader.js's responsibility
- All-zero config (no `extends` key in repo config) → `resolveExtends` should not be called; if called with empty/null, return null or empty to signal no-op (loader.js checks for presence before calling)

## Dependencies
- Depends on: F06 (policy engine — base policy model to extend), F09 (paths.js — configFilePath passed in by caller), F14 (builtin-profiles.js — NOT imported here; floor check is a standalone operation)
- Blocked by: none (ADR-005 is already written in task-045)

## Effort
M — new module with substantial logic (fetch + cache + merge + floor enforcement) but no new architecture patterns; ADR-005 fully specifies the behavior.

## Metadata
- Agent: pm
- Date: 2026-04-11
- Sprint: 4
- Priority: P0

---

## Run Log

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
