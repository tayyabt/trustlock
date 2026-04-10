# Feature: [F15] Policy Config Load Order & Org Policy Inheritance

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Introduces org-level policy inheritance via the `extends` key in `.trustlockrc.json`. Repos declare a local path or URL pointing to an org policy JSON; trustlock fetches, caches, and deep-merges it with the repo config, then applies any `--profile` overlay. Floor enforcement ensures repos cannot weaken the org floor. Remote `extends` is cached 1 hour in `.trustlock/.cache/org-policy.json` (separate from registry cache — C6). ADR-005 is the prerequisite.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: required
- Workflow Rationale: Org policy inheritance introduces a new admin/configuration flow with network dependencies, cache behavior, and multiple failure modes (remote unreachable + cache, remote unreachable + no cache, chains). The tech lead publishing and repo consuming `extends` is a new pattern not covered by any existing workflow doc. This is an admin/settings flow per the skill marking criteria — it changes how policy is authored and what errors a developer may encounter at runtime.
- Target Sprint: 4
- Sprint Rationale: v0.3 work. ADR-005 was written in task-045 and is already available (C8). `policy/loader.js` must ship before any other v0.3 policy story. F16 (Python) and F17 (cross-audit) are independent of this feature; however, the policy loader is the sequencing anchor for any future policy-touching Sprint 4 story.

## Description

`src/policy/inherit.js` fetches the `extends` URL (or resolves the local path relative to `.trustlockrc.json` location), parses the JSON, and merges it with the repo config. Merge semantics per spec §4.4: scalar values — repo wins, floor enforced; array values — union (repo cannot remove org entries); object values — deep merge, same rules recursively.

`src/policy/loader.js` is a new async entry point that all commands await before proceeding. Load order: fetch `extends` base → deep merge with repo config → apply `--profile` overlay → floor check at each step. If `extends` is absent, `loadPolicy` resolves with the repo config directly. The org policy cache is a standalone JSON file at `.trustlock/.cache/org-policy.json`; it does NOT use `src/registry/cache.js` (C6).

Failure modes: remote unreachable + cached copy exists → use cache, emit stderr warning. Remote unreachable + no cache → exit with error. Chains (`extends` in the fetched policy) → ignored with stderr warning.

Floor enforcement at the `extends` layer: if repo config sets any numeric value below the org floor, exit with `Policy error: repo config sets <key>=<N>, below org minimum of <M>. Repos may only tighten org policy.`

## User-Facing Behavior

- Repo with `{ "extends": "https://org.internal/trustlock-policy.json" }` — trustlock fetches the URL at every `check` run (cache-first, 1-hour TTL).
- Repo with `{ "extends": "../../org-policy/.trustlockrc.json" }` — local path resolved relative to `.trustlockrc.json`; no network call.
- Remote unreachable, cache present — cached policy used; stderr warning printed (`Warning: could not reach policy URL, using cached copy from <timestamp>`).
- Remote unreachable, no cache — exit with `Error: could not fetch org policy from <url> and no cached copy exists.`
- Repo config value below org floor — exit with `Policy error: repo config sets cooldown_hours=24, below org minimum of 72. Repos may only tighten org policy.`
- `extends` in the fetched org policy — ignored; stderr warning `Warning: chained extends in org policy is not supported. Ignoring.`
- Array union: repo `scripts.allowlist` additions merged with org `scripts.allowlist`; repo cannot remove org entries.

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- org-policy-setup: tech lead publishes org policy JSON at a URL; individual repos add `extends` key to `.trustlockrc.json` and verify that trustlock loads the org policy correctly and enforces floors

## Edge Cases
1. `extends` is a local path: resolved relative to `.trustlockrc.json` location; no caching.
2. `extends` is a URL: cached at `.trustlock/.cache/org-policy.json`; 1-hour TTL.
3. Remote unreachable + cache present: use cache, emit warning to stderr.
4. Remote unreachable + no cache: hard error exit.
5. Cache expired (>1h) + remote reachable: refresh cache.
6. Cache expired (>1h) + remote unreachable: use stale cache, emit warning.
7. `extends` URL returns non-JSON or malformed JSON: hard error exit with parse error.
8. Fetched org policy contains `extends` key: ignore it, emit warning.
9. Repo `cooldown_hours` lower than org `cooldown_hours`: error exit with specific message.
10. Repo adds packages to org `scripts.allowlist`: union applied; org entries preserved.
11. Repo attempts to remove an org `ignore_packages` entry: array union means org entry is kept regardless.
12. `--profile` overlay applied after `extends` merge: profile floor check runs against the merged config (org + repo combined).

## Acceptance Criteria
- [ ] Local `extends` path resolved relative to `.trustlockrc.json` location; no caching.
- [ ] Remote `extends`: mock HTTP server; merge semantics verified (scalar: repo wins + floor; array: union; object: deep merge).
- [ ] Remote unreachable + cache: cached policy used, stderr warning emitted.
- [ ] Remote unreachable + no cache: error exit with correct message.
- [ ] Repo config floor violation: error exit with `Policy error: repo config sets <key>=<N>, below org minimum of <M>.`
- [ ] `extends` in fetched org policy: ignored with stderr warning.
- [ ] Array union: `scripts.allowlist` in repo merged with org entries; org entries cannot be removed.
- [ ] Org policy cache at `.trustlock/.cache/org-policy.json`; NOT using `src/registry/cache.js` (C6).
- [ ] All commands `await loadPolicy()` before any delta computation.
- [ ] `--profile` overlay applied after `extends` + repo merge; profile floor check runs against merged config.

## Dependencies
- F06 (policy engine — base policy load to extend)
- F09 (paths.js — `.trustlockrc.json` location for relative `extends` paths)
- F14 (policy profiles — floor enforcement in loader must compose with profile overlay)
- ADR-005 (policy config load order — prerequisite, already written in task-045; C8)

## Layering
- `src/policy/inherit.js` (new — extends fetch + cache + merge) → `src/policy/loader.js` (new async entry point — load order: extends → repo → profile) → all commands await `loadPolicy()`

## Module Scope
- policy, cli

## Complexity Assessment
- Modules affected: policy/inherit.js (new), policy/loader.js (new), all command files (await loadPolicy), cli/args.js (unchanged)
- New patterns introduced: yes — async policy load with remote fetch + cache; deep merge with floor enforcement at each layer
- Architecture review needed: no (ADR-005 covers the design)
- Design review needed: no

## PM Assumptions (if any)
- Only one level of `extends` inheritance is supported. Chained `extends` is not supported and ignored with warning.
- The policy URL is trusted at the same level as `.trustlockrc.json` itself. trustlock does not validate the origin or sign the policy. Teams must manage URL access control externally.
- Cache TTL is 1 hour. This is a hard-coded product decision from the spec; not configurable.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §4.4, §5.3
- Sprint: 4
