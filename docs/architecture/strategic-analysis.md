# Strategic Analysis: trustlock v0.1

## Product Thesis

trustlock is a dependency admission controller — not a scanner, not a vulnerability database. It makes binary admit/block decisions on dependency changes based on trust continuity, release age, install-time behavior, and declared policy. It runs as a Git pre-commit hook (advisory) and CI check (enforced).

The core value: close the gap between "a package was published" and "a team installs it" by requiring that dependency changes pass a declared trust policy before they enter the codebase.

## Hard Problems (Ranked)

### 1. Zero Runtime Dependencies

**Why it's hard:** The product thesis demands that a supply chain security tool not itself be a supply chain risk. Zero runtime dependencies means no CLI framework, no HTTP client library, no semver library, no color library.

**Why generic solutions fail:** Standard Node.js CLI tooling (commander, yargs, chalk, got, semver) all add transitive dependencies.

**Chosen approach:** Pure Node.js built-ins. `node:https` for HTTP, `node:util.parseArgs` for CLI args (Node 18.3+), manual ANSI codes for color, hand-rolled semver subset. For v0.1/npm-only, the semver subset is small — compare exact versions, detect range operators in package.json, parse version strings. Full range resolution is unnecessary because lockfiles already resolve to exact versions.

**Why it wins:** Truly zero deps. Dogfoods the product thesis. The code investment is modest for the v0.1 scope.

### 2. Baseline Advancement Atomicity

**Why it's hard:** D1 (all-or-nothing advance) + D2 (approval valid in same commit) + D10 (CI never advances) creates a specific contract: the pre-commit hook must read working-tree files, evaluate all changes atomically, and write + auto-stage the baseline only if everything passes.

**Why generic solutions fail:** Most tools operate on committed state or don't have an atomic advance concept. The combination of working-tree reads + conditional write + auto-staging is unusual for a Git hook.

**Chosen approach:** On full admission in advisory mode, write the updated baseline and `git add` it so it becomes part of the commit. Document that the hook modifies the staging area. CI (`--enforce`) never writes.

**Why it wins:** Only approach that maintains baseline integrity. The hook already modifies process state (exit code); auto-staging is a natural extension.

### 3. Registry Reliability and Graceful Degradation

**Why it's hard:** Some rules (cooldown, provenance) need live registry data. Others (pinning, source type, diff) are local-only. Mixed online/offline behavior with different degradation per rule is unusual.

**Chosen approach:** Cache-first with staleness markers. Fresh cache (within TTL) → use directly. Stale cache → attempt refresh; if fails, use stale data with warning annotation. No cache + no network → "skipped" warning. CI never blocks on registry outages.

**Why it wins:** Matches the spec's offline behavior (section 7.3). Developers get best-available data. CI doesn't break on npm outages.

### 4. Lockfile Parser Extensibility

**Why it's hard:** npm lockfile v1, v2, v3 have significantly different structures. v0.2 adds pnpm and yarn. The common dependency model must normalize across all formats.

**Chosen approach:** Router pattern with format-specific parsers. `parser.js` detects format, delegates to `npm.js` (handles v1/v2/v3 internally). Each parser returns `ResolvedDependency[]`. Unknown formats fail hard (exit 2) per Q1 resolution.

**Why it wins:** Clean separation. Each parser is self-contained. New ecosystems are new files, not modifications.

## Scope Boundaries

### Ships in v0.1
- npm lockfile parsing (v1, v2, v3)
- All 7 policy rules (trust-continuity:provenance, exposure:cooldown, exposure:pinning, execution:scripts, execution:sources, delta:new-dependency, delta:transitive-surprise)
- Baseline management with all-or-nothing advancement
- Approval workflow (create, validate, skip expired, manual cleanup only)
- Registry client with caching and offline degradation
- CLI: init, check, approve, audit, clean-approvals, install-hook
- Terminal + JSON output
- Zero runtime dependencies

### Does not ship
- pnpm/yarn parsers, publisher change detection, SARIF, profiles, monorepo (v0.2)
- Python/Cargo ecosystems (v0.3+)
- Trust intelligence API (v0.5+)
- Malware detection, CVE tracking, license compliance (never)

## Critical Path
1. Lockfile parser → common dependency model
2. Baseline manager → create, read, diff
3. Registry client → metadata fetch, provenance check, caching
4. Policy engine → rules → admit/block decisions
5. Approval store → create, validate
6. CLI commands → wire everything
7. Output formatters → terminal + JSON
8. Hook integration

## Minimum Viable Increment
Lockfile parser → baseline diff → policy engine → terminal output. This is the core evaluation pipeline that all later work must preserve.

## Resolved Open Questions

- **Q1 (unknown lockfile version):** Fail hard, exit 2. No best-effort parsing.
- **Q2 (approval cleanup trigger):** Manual only via `clean-approvals`. `check` skips expired approvals but never deletes them.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Spec: 2026-04-07-trustlock-full-spec
