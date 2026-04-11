# Changelog

## [0.3.0] — 2026-04-11

Sprint 4: Python ecosystem support, org policy inheritance, and cross-project audit.

### Added

**Policy config inheritance (F15)**
- `extends` key in `.trustlockrc.json`: resolves a base policy from a remote URL or local path and deep-merges it with the repo config
- Remote URL fetch with 1-hour cache at `.trustlock/.cache/org-policy.json`; stale cache used with warning if remote is unreachable
- Deep-merge semantics: scalar fields (repo wins), array fields (union — repos cannot remove org entries), nested objects (repo keys override; base keys fall through)
- Floor enforcement: repo values may only be equal to or stricter than the org base; relaxing a numeric threshold exits 2 with an exact error message
- Chained `extends` in the fetched policy is stripped with a stderr warning
- `src/policy/inherit.js`: `resolveExtends(extendsValue, configFilePath, cacheDir)` and `mergePolicy(base, repo)`
- `src/policy/loader.js`: `loadPolicy({ configPath, cacheDir, profile })` — three-step ADR-005 merge entry point wired to all policy-using commands (`check`, `audit`, `approve`, `init`)
- `cross-audit.js` explicitly does not call `loadPolicy()` — it reads `.trustlockrc.json` directly for `scripts.allowlist` only (C-NEW-4)

**Python ecosystem (F16)**
- `requirements.txt` parser: exact pins, URL requirements, pip-compile `# via` annotations, hash lines, unpinned ranges; PEP 508 name normalization
- `uv.lock` parser: hand-rolled TOML subset; handles `[[package]]`, inline key-value, `source.type` dispatch (`registry`, `path`, `git`)
- `ecosystem: 'npm' | 'pypi'` discriminant field on `ResolvedDependency`; all existing npm/pnpm/yarn parsers updated to set `ecosystem: 'npm'`
- PyPI registry adapter (`src/registry/pypi.js`): fetches `https://pypi.org/pypi/{name}/{version}/json`; extracts publisher identity from `urls[].uploader` with fallback to `info.maintainer_email`; earliest publish date across all release file entries; attestation check via PyPI Simple API
- Cache key namespace: `pypi/{name}/{version}` — non-colliding with npm cache keys
- `registry/client.js` dispatches to `pypi.js` for `ecosystem: 'pypi'` entries; defaults to npm path for absent/unknown `ecosystem`
- `source.path` entries in `uv.lock` set `source: 'file'` and are passed through to the policy engine for exclusion (C12)

**Cross-project audit (F17)**
- `trustlock audit --compare <dir1> <dir2> ...`: reads lockfiles from multiple project directories and produces a unified report
- Three comparison passes: version drift (same package at different versions across directories), provenance inconsistency (same package where provenance state differs), allowlist inconsistency (different `scripts.allowlist` entries)
- Clean-section confirmations: "No version drift detected. ✓" etc. when no issues found
- Always exits 0 (informational); exits 2 only for fatal errors (fewer than two directories, directory not found)
- `source.path` entries from `uv.lock` excluded from all comparison passes (C12)
- Does not call `loadPolicy()`; reads `.trustlockrc.json` via `fs.readFile` for `scripts.allowlist` only

---

## [0.2.0] — 2026-04-10

Sprint 3: multi-lockfile support, output redesign, publisher identity, SARIF output, and policy profiles.

### Added

**Monorepo root resolution (F09)**
- `--project-dir <path>` flag: explicit project root override on all commands
- Auto-detection of monorepo root via nearest `.trustlockrc.json` up the directory tree
- `src/utils/paths.js` and `src/utils/git.js`: shared path and git utilities consumed by all commands

**Output/UX redesign (F10)**
- Terminal formatter redesign: grouped output by admission status (blocked → admitted-with-approval → new packages → admitted); per-group header with count
- TTY-aware progress counter (`src/utils/progress.js`): shows live `Checking N/M packages…` on TTY; suppressed when stdout is piped or `--quiet` is set
- JSON output schema v2 (`schema_version: 2`): structured `grouped` shape with `blocked`, `admitted_with_approval`, `new_packages`, `admitted` arrays
- New flags on `check`: `--sarif` (SARIF 2.1.0 output), `--quiet` (suppress progress output)
- `--json` and `--sarif` are mutually exclusive; combining them exits 2

**pnpm and yarn lockfile parsers (F11)**
- `pnpm-lock.yaml` parser (`src/lockfile/pnpm.js`): v5, v6, v9 format support
- `yarn.lock` parser (`src/lockfile/yarn.js`): classic (v1) and berry (v2/v3) support; install-scripts null contract (yarn does not expose scripts in the lockfile)
- Parser router extended: detection order is `package-lock.json` → `pnpm-lock.yaml` → `yarn.lock`

**Publisher identity + baseline schema v2 (F12)**
- Registry metadata fetch now extracts `publisherAccount` from npm `dist-tags` / maintainer metadata
- Baseline schema v2: stores `publisherAccount` per entry; detects publisher changes between baseline and current lockfile
- Publisher-change signal available to policy engine for downstream rules

**SARIF 2.1.0 output (F13)**
- `src/output/sarif.js`: formats blocked packages as SARIF 2.1.0 results with driver rules for all trustlock policy rules
- `--sarif` flag on `check`: emits SARIF JSON to stdout; compatible with GitHub Advanced Security code scanning
- Only blocked packages produce SARIF results; admitted packages produce zero results

**Policy profiles (F14)**
- `src/policy/builtin-profiles.js`: `strict` and `relaxed` built-in profiles
- `--profile <name>` flag on `check` and `audit`; profile overlay applied after policy load
- `strict` profile: 168h cooldown, `provenance.required_for: ["*"]`
- `relaxed` profile: 24h cooldown, `block_on_regression: false`, `block_on_publisher_change: false`
- Built-in profile `relaxed` bypasses floor check; user-defined profiles floor-check against the merged config

### Fixed

- **BUG-001** (task-041): `trustlock check` now generates approval commands with short rule names (`cooldown`, `provenance`, `scripts`, etc.) instead of full category-prefixed IDs (`exposure:cooldown`, `trust:provenance`, `execution:scripts`). Copy-pasting generated commands now works correctly.

---

## [0.1.0] — 2026-04-09

Initial release of trustlock — a dependency admission controller for npm projects.

### Added

**Policy engine**
- `cooldown` rule: blocks packages published within a configurable window (default: 72h) to protect against brief-window supply chain attacks
- `provenance` rule: blocks packages that lack SLSA attestations when required in policy
- `pinning` rule: blocks packages whose `package.json` entry uses a floating semver range
- `scripts` rule: blocks packages with install-time scripts (`preinstall`/`postinstall`/`install`) unless explicitly allowlisted
- `sources` rule: blocks packages from non-registry sources (git URL, local path, HTTP tarball) unless explicitly allowed
- `new-dep` rule: flags first-time dependency additions for review
- `transitive` rule: warns when a single upgrade introduces an unexpectedly large transitive dependency count
- All-or-nothing baseline advance (D1): if any package is blocked, no packages advance the baseline
- Approval integration: valid, non-expired, rule-scoped approvals convert a blocked package to `admitted_with_approval`

**CLI commands**
- `trustlock init`: initialize trustlock in a project — creates `.trustlockrc.json`, baseline, approvals store, cache directory, and `.gitignore`; supports `--strict` and `--no-baseline`
- `trustlock check`: evaluate dependency delta against policy; advisory (exit 0) and enforce (`--enforce`, exit 1) modes; supports `--json`, `--dry-run`, `--lockfile`, `--no-cache`
- `trustlock approve`: write a scoped, time-limited approval for a blocked package; supports `--override`, `--reason`, `--expires`, `--as`
- `trustlock audit`: scan the full dependency tree for trust posture; prints provenance coverage, install-script packages, source breakdown, age distribution
- `trustlock clean-approvals`: remove expired approval entries from `.trustlock/approvals.json`
- `trustlock install-hook`: install `trustlock check` as a Git pre-commit hook; supports `--force`

**Lockfile support**
- npm lockfile v1, v2, v3 (`package-lock.json`)
- Format detection and parser router with hard-fail on unknown versions (Q1)

**Registry integration**
- npm registry metadata fetch (`https://registry.npmjs.org/<pkg>/<ver>`)
- npm provenance attestation fetch (`https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`)
- File-based cache with configurable TTL; gitignored (D8)
- Graceful degradation when registry is unreachable (offline operation)

**Baseline management**
- Baseline create and read from `.trustlock/baseline.json`
- Delta computation (added, changed, removed packages)
- Auto-stage baseline on admission: `git add .trustlock/baseline.json` (ADR-002)
- Baseline is never advanced in `--enforce` mode or with `--dry-run` (D10)

**Approval store**
- Scoped approvals: each entry names specific rule(s), not wildcards (D9)
- Mandatory reason by default (`require_reason: true`)
- Configurable expiry capped at `max_expiry_days` (default: 30 days)
- Approver identity from `git config user.name` or `--as` (D7)
- Expired approvals are skipped at check time but never auto-deleted (Q2)

**Output formatting**
- Terminal formatter: color-coded admit/block results, per-finding detail, generated approval commands
- JSON formatter: machine-readable array output with `decision`, `findings`, and `approvalCommand` per package

**Documentation and examples**
- `README.md`: project overview, installation, quick-start workflows
- `OVERVIEW.md`: product overview, design rationale, trust signal table
- `USAGE.md`: full command reference, all flags, exit codes, error messages
- `POLICY-REFERENCE.md`: complete `.trustlockrc.json` field reference
- `ARCHITECTURE.md`: module map, layering rules, data flows, data formats
- `examples/configs/production.trustlockrc.json`: strict production policy
- `examples/configs/relaxed.trustlockrc.json`: permissive greenfield policy with annotations
- `examples/ci/github-actions.yml`: GitHub Actions integration
- `examples/ci/lefthook.yml`: Lefthook integration
- `examples/ci/husky/.husky/pre-commit`: Husky pre-commit hook

### Known issues

- **BUG-001:** `trustlock check` generates approval commands using full rule IDs (e.g. `--override 'execution:scripts'`) while `trustlock approve` only accepts short rule names (e.g. `--override scripts`). Copy-pasting the generated command produces `Error: 'execution:scripts' is not a valid rule name.` Workaround: replace the category prefix manually (e.g. `execution:scripts` → `scripts`, `exposure:cooldown` → `cooldown`, `trust:provenance` → `provenance`). **Fixed in v0.2.0.**
