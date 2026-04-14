# ADR-005: Policy Config Load Order and Floor Enforcement

## Status
Accepted

## Supersedes
N/A

## Context
The v0.2–v0.3 spec introduces two policy overlay mechanisms: `extends` (remote or local base policy) and profiles (named in-run overlays via `--profile <name>`). The spec also introduces floor enforcement — repos cannot lower numeric floors below the org base, and user-defined profiles cannot lower numeric floors below the local base config. The data model (ADR-001 through ADR-004) and existing system-overview define a single flat `PolicyConfig` loaded from `.trustlockrc.json`. No existing ADR covers how multiple config layers are merged, in what order floors are checked, or how async resolution (remote URL fetch for `extends`) integrates into the synchronous policy load.

## Options Considered

### Option 1: Two-pass sequential merge with eager floor checks
- **Description:** Load in strict order: (1) fetch and parse the `extends` base (remote or local), (2) merge repo `.trustlockrc.json` over the base with floor checks, (3) apply the `--profile` overlay with floor checks. Each step checks floors against the prior merged result. Async operations (URL fetch) are resolved before any merge step begins.
- **Pros:** Explicit, auditable, easy to test each merge step in isolation. Floors are checked at the point of introduction, not retrospectively. Error messages can name the specific value and the floor it violates.
- **Cons:** Three-pass implementation is slightly more code than a single recursive merge. Remote fetch must complete before any policy is available.

### Option 2: Collect all layers then merge and check once
- **Description:** Load all three sources independently (base, repo, profile), then merge in a single pass with floor checks at the end.
- **Pros:** Simpler merge code.
- **Cons:** Floor error messages cannot name which layer introduced the violation. Cannot check floors incrementally (a profile that is valid against the repo but invalid against the base would pass the first check). Harder to reason about merge semantics when layers disagree.

### Option 3: Schema-driven merge with annotated config objects
- **Description:** Each config field is annotated with its origin layer. A schema definition drives merge and floor enforcement.
- **Pros:** Fully general, composable.
- **Cons:** Over-engineered for three fixed layers. Adds a schema DSL with no reuse value.

## Decision
Option 1: Two-pass sequential merge with eager floor checks.

**Canonical merge order:**
```
extends_base  →  repo_config  →  profile_overlay
```

**Step-by-step load sequence (in `src/policy/loader.js`):**

1. **Parse repo `.trustlockrc.json`.** If it contains an `extends` key, proceed to step 2; otherwise skip.
2. **Resolve base policy.** If `extends` is a URL, fetch it (with 1-hour cache at `.trustlock/.cache/org-policy.json`). If it is a local path, read it relative to `.trustlockrc.json`. Parse the result as a flat policy object. If the fetched policy itself contains an `extends` key, ignore it with a `stderr` warning: `Warning: chained extends in org policy is not supported — ignoring.`
3. **Merge repo over base.** Apply scalar-override, array-union, and object-deep-merge rules (see below). Check floors after merge: for every numeric field where `repo_value < base_value`, exit with: `Policy error: repo config sets {field}={repo_value}, below org minimum of {base_value}. Repos may only tighten org policy.`
4. **Apply profile overlay.** If `--profile <name>` was passed, locate the profile in the merged config's `profiles` object (checking user-defined first, then built-ins). Apply profile keys as shallow-override on merged config. For built-in `relaxed` profile only: skip floor checks — it is explicitly permitted to lower defaults. For all user-defined profiles: check floors against the already-merged (extends+repo) config. Exit with: `Profile "{name}" sets {field}={profile_value}, below base config minimum of {merged_value}. Profiles can only tighten policy, not loosen it.`

**Merge semantics:**
- **Scalar (number, boolean, string):** Later layer wins.
- **Arrays (`required_for`, `allowlist`, `ignore_packages`):** Union of all layers. A later layer cannot remove entries added by an earlier layer.
- **Nested objects (`provenance`, `scripts`, `sources`, `pinning`, `approvals`):** One-level deep merge — profile/repo keys override base keys; keys not present in later layers fall through to the base.
- **`profiles` object:** Union of keys; user-defined keys with the same name as built-ins override built-ins entirely.

**Built-in profiles:**
- `strict`: `cooldown_hours: 168`, `provenance.required_for: ["*"]`
- `relaxed`: `cooldown_hours: 24`, `provenance.block_on_regression: false`, `provenance.block_on_publisher_change: false`

These are defined as constants in `src/policy/builtin-profiles.js`. A user-defined profile with the same name as a built-in replaces it entirely.

**Async resolution:**
The `extends` URL fetch is the only async operation in policy load. `policy/loader.js` exports an async `loadPolicy(args)` function. The CLI commands (`check`, `audit`, etc.) await this before any rule evaluation begins. If the fetch fails and no cache exists, `loadPolicy` rejects with a user-facing error that the CLI surfaces and exits on.

**Cache for remote `extends`:**
Managed by `src/policy/inherit.js` independently from `src/registry/cache.js`. The org policy cache is a single JSON file (`.trustlock/.cache/org-policy.json`) with a `fetched_at` timestamp field. This is not a registry artifact and must not route through the registry cache layer. On failure with stale cache: use cached copy, emit `stderr` warning: `Warning: could not reach policy URL, using cached copy from {fetched_at}.`

## Consequences
- **Implementation:** New `src/policy/loader.js` (async, owns the three-step merge), `src/policy/inherit.js` (URL fetch + cache), `src/policy/builtin-profiles.js` (built-in profile constants). Floor enforcement logic lives in `loader.js`, called at steps 3 and 4.
- **Testing:** Test each merge step in isolation. Integration tests must cover: remote `extends` with cached copy; floor enforcement at each step; profile overlay with built-in `relaxed` bypassing floors; user-defined `relaxed` override; chained `extends` ignored with warning; both steps raising floor errors (verify the error message names the correct layer).
- **Operations:** Policy errors are fatal and exit before any lockfile work begins. Clear error messages are required.
- **Future:** A fourth layer (e.g., per-workspace overrides) can be inserted between extends_base and repo_config without breaking the floor enforcement contract.

## Module Structure
- `src/policy/loader.js` — async `loadPolicy(args)`, three-step merge, floor checks
- `src/policy/inherit.js` — `extends` URL/local fetch, cache management
- `src/policy/builtin-profiles.js` — built-in `strict` and `relaxed` profile constants
- `src/cli/commands/check.js` — awaits `loadPolicy` before evaluation begins

## Metadata
- Agent: architect
- Date: 2026-04-10
- Feature: policy-inheritance-and-profiles
