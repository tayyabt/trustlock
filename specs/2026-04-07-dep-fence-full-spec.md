# dep-fence: Full Technical Specification

**Version:** 1.0
**Date:** 2026-04-07
**Author:** Tayyab Tariq
**Status:** Ready for implementation


## 1. Product Overview

dep-fence is a dependency admission controller for Git-based projects. It evaluates trust signals on dependency changes and blocks commits or builds when changes violate the team's declared policy.

It's not a scanner, not a vulnerability database, not a malware detector. It decides whether a dependency change is admissible based on trust continuity, release age, install-time behavior, and declared policy.

It runs in two places: as a Git pre-commit hook (local, advisory) and as a CI check (enforced, blocking).


## 2. Core Concepts

### 2.1 Admission Control Model

Every dependency change is evaluated as an admission decision: admit or block. The decision is based on the team's policy file (`.depfencerc.json`), the current state of the lockfile, the previous trusted baseline, and metadata from the package registry.

### 2.2 Trust Baseline

The trust baseline is the last known-good state of the dependency tree. It's stored as `.dep-fence/baseline.json` and contains:

- Package name and version for every resolved dependency
- Provenance status at time of admission (had provenance: yes/no, publisher identity)
- Install script status at time of admission
- Publish date at time of admission

The baseline only advances when changes pass policy or are explicitly approved. It does NOT automatically advance on every commit. This means a `--no-verify` bypass doesn't silently become the new trusted state.

### 2.3 Approvals

Approvals are recorded in `.dep-fence/approvals.json`. Each approval is:

- Scoped to a specific package and version
- Scoped to specific policy overrides (e.g., only cooldown, not provenance)
- Timestamped with an expiry
- Attributed to a person
- Requires a reason string

Approvals are committed to Git and go through code review.

### 2.4 Policy

Policy is declared in `.depfencerc.json`. It specifies:

- Which rules are enforced
- What thresholds apply (cooldown hours, etc.)
- Which packages have special treatment (allowlists, required provenance)
- What source types are permitted

Policy produces decisions, not findings. Every rule resolves to admit or block.


## 3. Architecture

```
dep-fence/
├── src/
│   ├── cli/
│   │   ├── index.js              # Main entry point, command router
│   │   ├── commands/
│   │   │   ├── init.js            # dep-fence init
│   │   │   ├── check.js           # dep-fence check [--enforce]
│   │   │   ├── approve.js         # dep-fence approve <pkg>@<ver>
│   │   │   ├── audit.js           # dep-fence audit
│   │   │   ├── clean.js           # dep-fence clean-approvals
│   │   │   └── install-hook.js    # dep-fence install-hook
│   │   └── args.js               # Argument parser
│   ├── policy/
│   │   ├── engine.js              # Core policy evaluation
│   │   ├── config.js              # .depfencerc.json loader and defaults
│   │   ├── rules/
│   │   │   ├── trust-continuity.js  # Provenance regression, publisher change
│   │   │   ├── exposure.js          # Cooldown, version pinning
│   │   │   ├── execution.js         # Install scripts, source type restrictions
│   │   │   └── delta.js             # Dependency tree diff, transitive surprises
│   │   └── decision.js            # Admit/block decision with reasons
│   ├── lockfile/
│   │   ├── parser.js              # Router to format-specific parsers
│   │   ├── npm.js                 # package-lock.json v1, v2, v3
│   │   ├── pnpm.js               # pnpm-lock.yaml (v0.2)
│   │   ├── yarn.js               # yarn.lock v1 and v2+ (v0.2)
│   │   └── models.js             # Common dependency model
│   ├── registry/
│   │   ├── client.js              # HTTP client with caching
│   │   ├── npm-registry.js        # npm registry API adapter
│   │   ├── provenance.js          # npm attestations API
│   │   └── cache.js               # Local file cache for registry data
│   ├── baseline/
│   │   ├── manager.js             # Read/write/advance baseline
│   │   └── diff.js                # Compute delta between baseline and current
│   ├── approvals/
│   │   ├── store.js               # Read/write approvals.json
│   │   ├── validator.js           # Check approval validity (expiry, scope)
│   │   └── generator.js           # Generate approval commands for output
│   ├── output/
│   │   ├── terminal.js            # Human-readable terminal output
│   │   ├── json.js                # Machine-readable JSON output
│   │   └── sarif.js               # SARIF format for CI integration (v0.2)
│   └── utils/
│       ├── git.js                 # Git operations (previous commit, hook install)
│       ├── semver.js              # Semver range detection
│       └── time.js                # Timestamp parsing, age calculation
├── test/
│   ├── fixtures/
│   │   ├── lockfiles/             # Sample lockfiles (npm v1, v2, v3, pnpm, yarn)
│   │   ├── policies/             # Sample policy configs
│   │   ├── approvals/            # Sample approval files
│   │   └── registry-responses/   # Mocked registry API responses
│   ├── unit/
│   │   ├── policy-engine.test.js
│   │   ├── trust-continuity.test.js
│   │   ├── exposure.test.js
│   │   ├── execution.test.js
│   │   ├── delta.test.js
│   │   ├── approvals.test.js
│   │   ├── baseline.test.js
│   │   └── lockfile-parsers.test.js
│   └── integration/
│       ├── init.test.js
│       ├── check-admit.test.js
│       ├── check-block.test.js
│       ├── approve-flow.test.js
│       └── ci-enforce.test.js
├── examples/
│   ├── depfencerc-production.json
│   ├── depfencerc-relaxed.json
│   ├── lefthook.yml
│   ├── husky-pre-commit
│   └── github-actions.yml
├── docs/
│   ├── USAGE.md                   # How-to guide
│   ├── POLICY-REFERENCE.md        # Full policy schema documentation
│   └── ARCHITECTURE.md            # Design decisions and rationale
├── package.json
├── LICENSE
├── README.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```


## 4. Data Models

### 4.1 Resolved Dependency (common model across lockfile formats)

```javascript
{
  name: "axios",                    // Package name (scoped names supported)
  version: "1.14.1",               // Resolved version
  resolved: "https://registry...", // Download URL
  integrity: "sha512-...",         // Integrity hash
  isDev: false,                    // Dev dependency flag
  hasInstallScripts: false,        // From lockfile metadata or registry
  source: "registry",             // "registry" | "git" | "file" | "url"
  directDependency: true,         // Listed in package.json or transitive
}
```

### 4.2 Trust Profile (per-package, stored in baseline)

```javascript
{
  name: "axios",
  version: "1.14.0",
  admittedAt: "2026-03-15T10:00:00Z",
  provenance: {
    hasAttestation: true,
    buildSystem: "github-actions",
    sourceRepo: "https://github.com/axios/axios",
    publisherAccount: "jasonsaayman"
  },
  installScripts: [],
  source: "registry"
}
```

### 4.3 Policy Config (.depfencerc.json)

```javascript
{
  // Exposure control
  cooldown_hours: 72,                // Minimum age for any version
  pinning: {
    production: "exact",             // "exact" | "range" | "any"
    dev: "range"                     // "exact" | "range" | "any"
  },

  // Trust continuity
  provenance: {
    required_for: [],                // Package names that MUST have provenance
    block_on_regression: true,       // Block if provenance disappears
    block_on_publisher_change: true  // Block if publisher account changes
  },

  // Execution surface
  scripts: {
    block_unknown: true,             // Block install scripts not in allowlist
    allowlist: [                     // Packages allowed to have install scripts
      "esbuild", "sharp", "bcrypt", "better-sqlite3",
      "fsevents", "node-gyp", "canvas", "puppeteer",
      "sqlite3", "@swc/core", "electron"
    ]
  },

  // Source restrictions
  sources: {
    allow_git: false,                // Allow git:// or github: dependencies
    allow_http: false,               // Allow http:// dependencies
    allow_file: false                // Allow file: dependencies
  },

  // Approval defaults
  approvals: {
    default_expiry_days: 7,          // Default TTL for approvals
    max_expiry_days: 30,             // Maximum TTL allowed
    require_reason: true             // Reason string is mandatory
  },

  // Package-level overrides
  ignore_packages: [],               // Skip these entirely
  
  // Profiles (v0.2)
  profiles: {}
}
```

### 4.4 Approval Entry

```javascript
{
  package: "axios",
  version: "1.14.1",
  overrides: ["cooldown", "provenance"],  // Which rules this bypasses
  reason: "Verified against GitHub commit abc1234",
  approved_by: "tayyab",
  approved_at: "2026-04-07T10:30:00Z",
  expires: "2026-04-14T10:30:00Z"
}
```

### 4.5 Check Result (per-dependency)

```javascript
{
  package: "axios",
  version: "1.14.1",
  previousVersion: "1.14.0",         // null if new dependency
  decision: "blocked",               // "admitted" | "admitted_with_approval" | "blocked"
  findings: [
    {
      rule: "cooldown",
      severity: "error",
      message: "Published 2 hours ago (policy: 72h minimum)",
      detail: {
        published_at: "2026-03-31T00:21:00Z",
        age_hours: 2,
        required_hours: 72,
        clears_at: "2026-04-03T00:21:00Z"
      }
    },
    {
      rule: "trust-continuity:provenance",
      severity: "error",
      message: "Previous version had SLSA provenance, this version does not",
      detail: {
        previous_provenance: { hasAttestation: true, buildSystem: "github-actions" },
        current_provenance: { hasAttestation: false }
      }
    }
  ],
  approval: null,                     // Populated if admitted_with_approval
  approvalCommand: "dep-fence approve axios@1.14.1 --override cooldown,provenance --reason \"...\" --expires 7d"
}
```

### 4.6 Baseline File (.dep-fence/baseline.json)

```javascript
{
  schema_version: 1,
  created_at: "2026-04-07T10:00:00Z",
  updated_at: "2026-04-07T14:30:00Z",
  lockfile_hash: "sha256:abc123...",
  packages: {
    "axios": { /* Trust Profile */ },
    "express": { /* Trust Profile */ },
    // ...
  }
}
```


## 5. Commands

### 5.1 dep-fence init

**Purpose:** Initialize dep-fence in a project.

**Behavior:**
1. Check for lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock). Fail if none found.
2. Create `.depfencerc.json` with defaults.
3. Create `.dep-fence/` directory.
4. Create `.dep-fence/approvals.json` (empty array).
5. Parse current lockfile and build initial baseline.
6. Write `.dep-fence/baseline.json`.
7. Print summary: number of packages baselined, detected lockfile format, next steps.

**Flags:**
- `--trust-current` (default behavior): Trust everything in the current lockfile.
- `--strict`: Create policy with provenance required for top 100 npm packages.
- `--no-baseline`: Skip baseline creation (useful if you want to run audit first).

### 5.2 dep-fence check

**Purpose:** Evaluate dependency changes against policy.

**Behavior:**
1. Load policy from `.depfencerc.json`.
2. Load baseline from `.dep-fence/baseline.json`.
3. Load approvals from `.dep-fence/approvals.json`.
4. Parse current lockfile.
5. Compute delta between baseline and current lockfile.
6. If no changes, print "No dependency changes" and exit 0.
7. For each changed/added/removed dependency:
   a. Fetch registry metadata (with caching).
   b. Evaluate all applicable policy rules.
   c. Check for valid approvals.
   d. Produce admission decision.
8. Print results.
9. If any dependencies are blocked and `--enforce` is set, exit 1.
10. If all admitted, update baseline to include newly admitted packages.

**Flags:**
- `--enforce`: Exit 1 on any block (CI mode).
- `--json`: Output JSON instead of terminal format.
- `--sarif`: Output SARIF format (v0.2).
- `--lockfile <path>`: Specify lockfile path (default: auto-detect).
- `--profile <name>`: Use a named profile from config (v0.2).
- `--dry-run`: Evaluate but don't update baseline.
- `--no-cache`: Skip registry cache, fetch fresh.

**Exit codes:**
- 0: All changes admitted (or no changes).
- 1: One or more changes blocked (only with `--enforce`).
- 2: Fatal error (config missing, lockfile parse failure, etc.).

### 5.3 dep-fence approve

**Purpose:** Record an approval for a blocked dependency.

**Behavior:**
1. Parse package@version from arguments.
2. Validate the package exists in the current lockfile.
3. Validate `--override` values are valid rule names.
4. Calculate expiry from `--expires` (duration string like "7d", "24h", "30d").
5. Enforce max expiry from config.
6. Get approver identity (from git config user.name, or `--as` flag).
7. Write entry to `.dep-fence/approvals.json`.
8. Print confirmation with expiry date.

**Arguments:**
- `<package>@<version>`: Required.
- `--override <rules>`: Comma-separated list of rules to override (cooldown, provenance, scripts, source, pinning).
- `--reason <text>`: Required (unless config sets require_reason: false).
- `--expires <duration>`: Default from config (e.g., "7d").
- `--as <name>`: Override approver name.

**Example:**
```bash
dep-fence approve axios@1.14.1 \
  --override cooldown,provenance \
  --reason "Verified source against commit abc1234. Hotfix for #432." \
  --expires 7d
```

### 5.4 dep-fence audit

**Purpose:** Evaluate the entire current lockfile against policy, without blocking.

**Behavior:**
1. Load policy.
2. Parse current lockfile (all packages, not just changes).
3. For each package, evaluate policy rules.
4. Print summary report:
   - Total packages
   - Packages with provenance (count and percentage)
   - Packages with install scripts (with names)
   - Packages using non-registry sources
   - Version pinning compliance
   - Age distribution (youngest, oldest, median)
5. Print suggested policy adjustments.

**Flags:**
- `--json`: Machine-readable output.
- `--lockfile <path>`: Specify lockfile.

This command never blocks or modifies anything. It's informational only.

### 5.5 dep-fence clean-approvals

**Purpose:** Remove expired approvals from the approvals file.

**Behavior:**
1. Load `.dep-fence/approvals.json`.
2. Filter out entries where `expires` is in the past.
3. Write back the filtered list.
4. Print count of removed and remaining approvals.

### 5.6 dep-fence install-hook

**Purpose:** Install the Git pre-commit hook directly (for teams not using lefthook/Husky).

**Behavior:**
1. Check if `.git/hooks/pre-commit` exists.
2. If it exists, append dep-fence check to it (after existing content).
3. If it doesn't exist, create it with dep-fence check.
4. Make it executable.
5. Print confirmation.

**Flags:**
- `--force`: Overwrite existing hook instead of appending.


## 6. Policy Rules (Detailed)

### 6.1 trust-continuity:provenance

**Trigger:** Package was in baseline with provenance attestation. New version lacks provenance.

**Registry API:** `GET https://registry.npmjs.org/-/npm/v1/attestations/{name}@{version}`

**Logic:**
1. Fetch attestations for current version.
2. If attestations exist and include SLSA provenance predicate, mark as "has provenance."
3. Compare against baseline. If baseline shows provenance and current doesn't, this is a provenance dropout.
4. If package is in `provenance.required_for` and lacks provenance, block regardless of baseline.

**Decision:** Block if `provenance.block_on_regression` is true and regression detected.

### 6.2 trust-continuity:publisher

**Trigger:** The npm account that published this version differs from the account in baseline.

**Registry API:** `GET https://registry.npmjs.org/{name}/{version}` (check `_npmUser` field)

**Logic:**
1. Fetch version metadata.
2. Extract `_npmUser.name`.
3. Compare against baseline's `publisherAccount`.
4. If different, flag as publisher change.

**Decision:** Block if `provenance.block_on_publisher_change` is true.

**Note:** Publisher changes can be legitimate (maintainer rotation, org account changes). This is a high-signal finding that should be reviewed, not necessarily a sign of compromise. The approval workflow handles this.

### 6.3 exposure:cooldown

**Trigger:** Package version was published less than `cooldown_hours` ago.

**Registry API:** `GET https://registry.npmjs.org/{name}` (check `time` object for version publish dates)

**Logic:**
1. Fetch full package metadata (includes `time` object with publish dates per version).
2. Look up publish date for the resolved version.
3. Calculate age in hours.
4. Compare against `cooldown_hours`.

**Decision:** Block if age < cooldown_hours.

**Output includes:** Exact timestamp when cooldown clears, so the developer knows when to retry.

### 6.4 exposure:pinning

**Trigger:** Package.json uses a semver range for a dependency where policy requires exact pinning.

**Logic:**
1. Read package.json.
2. For each dependency in `dependencies` (production), check if the version string contains `^`, `~`, `*`, `>`, `<`, `=`, `||`, `x`, or space characters.
3. Exempt URLs, file: paths, git: references.
4. Apply same check to `devDependencies` if config says `pinning.dev: "exact"`.

**Decision:** Block if range detected and policy requires exact.

**Note:** This check reads package.json, not the lockfile. The lockfile always resolves to exact versions. The risk is that a floating range in package.json means the NEXT `npm install` could resolve to a different (potentially compromised) version.

### 6.5 execution:scripts

**Trigger:** A dependency has preinstall, install, or postinstall lifecycle scripts.

**Sources:**
1. Lockfile metadata: `hasInstallScripts: true` (npm lockfile v3).
2. Registry API: `GET https://registry.npmjs.org/{name}/{version}` (check `scripts` field).

**Logic:**
1. Check lockfile first (fastest, no network).
2. If lockfile doesn't have `hasInstallScripts` field (v1/v2), fetch from registry.
3. Check if package name is in `scripts.allowlist`.
4. If allowlisted, emit warning but admit.
5. If not allowlisted, block.

**Decision:** Block if `scripts.block_unknown` is true and package has scripts not in allowlist.

### 6.6 execution:sources

**Trigger:** A dependency resolves to a non-registry source (git, http, file).

**Logic:**
1. Check `resolved` URL in lockfile.
2. Classify as registry, git, http, or file.
3. Compare against `sources.allow_git`, `sources.allow_http`, `sources.allow_file`.

**Decision:** Block if source type is disallowed.

### 6.7 delta:new-dependency

**Trigger:** A package exists in the current lockfile but not in the baseline.

**Logic:**
1. Compute set difference: current packages minus baseline packages.
2. For each new package, report with its trust signals (age, provenance, scripts, source).

**Decision:** Informational (warning), not blocking. New dependencies are surfaced for review but admitted if they pass all other rules. They're added to the baseline once admitted.

### 6.8 delta:transitive-surprise

**Trigger:** A direct dependency upgrade introduces an unexpectedly large number of new transitive dependencies.

**Logic:**
1. For each version change in a direct dependency, count how many new transitive dependencies it introduces.
2. If count exceeds a threshold (default: 5), flag it.

**Decision:** Warning, not blocking. Informational signal for reviewers.

**Note:** This is a heuristic. A major version upgrade legitimately adds transitive deps. But a patch upgrade that pulls in 5 new packages is unusual and worth noting.


## 7. Registry Client

### 7.1 Caching

Registry responses are cached locally in `.dep-fence/.cache/` as JSON files. Cache key is `{package}@{version}` for version-specific data and `{package}` for full package metadata.

**Cache TTL:**
- Version metadata: 24 hours (immutable once published)
- Full package metadata (includes `time` object): 1 hour
- Attestations: 1 hour

**Cache invalidation:** `dep-fence check --no-cache` bypasses cache entirely.

### 7.2 Rate Limiting

Registry calls are batched with concurrency limit of 10 parallel requests. For large lockfiles (1000+ packages), only changed packages and their transitive deps are fetched from registry. Unchanged baseline packages use cached data.

### 7.3 Offline Behavior

If the registry is unreachable:
- Pinning, diff, and source-type checks work fully (local data only).
- Cooldown, provenance, and publisher checks emit warnings ("could not verify, registry unreachable") but do NOT block.
- `--enforce` mode in CI: registry-dependent checks that can't complete are treated as warnings, not errors. This prevents CI from breaking due to npm registry outages.


## 8. Implementation Phases

### Phase 1: v0.1 (Core MVP)

**Scope:** npm only, core checks, approval workflow, terminal output.

**Deliverables:**
- CLI commands: init, check, approve, audit, clean-approvals, install-hook
- Lockfile parser: npm package-lock.json v1, v2, v3
- Policy engine with all rules from section 6
- Baseline management (create, read, advance)
- Approvals (create, validate, clean)
- Registry client with caching (npm registry + attestations API)
- Terminal reporter (human-readable, colored output)
- JSON reporter
- Git hook integration (raw, lefthook, Husky examples)
- Unit tests with mock registry data
- Integration tests for all CLI commands
- README, USAGE.md, POLICY-REFERENCE.md
- npm package ready to publish
- Example configs and CI workflows

**Not in scope:** pnpm/yarn parsers, SARIF, profiles, publisher change detection (requires tracking _npmUser across versions which needs the full package metadata fetch), cross-ecosystem support.

**Estimated size:** ~2,000-2,500 lines of source, ~1,500 lines of tests, ~1,000 lines of docs.

### Phase 2: v0.2 (Multi-Format + Better Signals)

**Scope:** Additional lockfile formats, publisher change detection, SARIF output, profiles.

**Deliverables:**
- Lockfile parser: pnpm-lock.yaml (v5, v6, v9)
- Lockfile parser: yarn.lock (classic v1 and berry v2+)
- Publisher identity change detection (trust-continuity:publisher rule)
- Baseline schema v2 (includes publisher identity)
- SARIF output format for CI integration
- Policy profiles (strict, relaxed, custom)
- `--profile` flag on check command
- Monorepo support: `--lockfile` can be specified multiple times, or auto-detected via workspaces config
- Improved transitive dependency tracking (identify which direct dep caused each transitive addition)

**Estimated size:** ~1,500 additional lines of source, ~1,000 lines of tests.

### Phase 3: v0.3 (Python Ecosystem)

**Scope:** pip/uv support, policy inheritance.

**Deliverables:**
- Lockfile parser: pip requirements.txt (pinned), pip-compile output, uv.lock
- Registry client adapter: PyPI JSON API
- PyPI provenance checks (if available, PyPI has been working on attestation support)
- Policy inheritance: org-level `.depfencerc.json` that repos extend
- `dep-fence audit` improvements: compare across projects, identify shared vulnerable deps

**Estimated size:** ~1,500 additional lines of source, ~800 lines of tests.

### Phase 4: v0.4 (Polish + Ecosystem)

**Scope:** Cargo support, better UX, community features.

**Deliverables:**
- Lockfile parser: Cargo.lock
- Registry client adapter: crates.io API
- `dep-fence diff` command: show dependency delta between any two commits (not just baseline vs current)
- `dep-fence why <package>`: show why a package is in the tree (which direct dep pulls it in)
- CycloneDX SBOM generation as a side effect of check
- Bash/Zsh completions
- Man page

### Phase 5: Future (Trust Intelligence Service)

**Scope:** Optional hosted backend for pre-computed trust data.

**Deliverables:**
- Trust intelligence API: pre-computed trust profiles for all npm/PyPI/crates.io packages
- Cross-project correlation (detect when a publisher's multiple packages all change simultaneously)
- Maintained curated allowlists
- Historical trust timeline per package
- CLI integration: `dep-fence check --trust-api <url>` uses the API instead of direct registry queries
- Compliance report generation (SOC 2, NIST SSDF, NIS2)

This phase is the monetization path. The CLI remains free. The API is the paid product.


## 9. Testing Strategy

### 9.1 Unit Tests

Every policy rule has unit tests with:
- A "should admit" case (clean package, passes all checks)
- A "should block" case (violates the specific rule)
- An "should admit with approval" case (violation + valid approval)
- An "expired approval" case (violation + expired approval = block)
- Edge cases specific to the rule (scoped packages, missing registry data, etc.)

### 9.2 Integration Tests

End-to-end tests that:
1. Create a temp directory with a package.json and lockfile.
2. Run `dep-fence init`.
3. Modify the lockfile (simulating `npm install`).
4. Run `dep-fence check` and assert output and exit code.
5. Run `dep-fence approve` and assert approval file written.
6. Run `dep-fence check` again and assert admission with approval.

### 9.3 Fixture Data

All registry API responses are mocked from fixtures stored in `test/fixtures/registry-responses/`. This allows tests to run without network access and ensures deterministic results.

Fixtures include:
- A package with provenance (normal case)
- A package where provenance drops between versions (Axios-style)
- A package with install scripts
- A package published 1 hour ago
- A package with a publisher change between versions
- A scoped package (@scope/name)
- A package resolved from git URL


## 10. Non-Goals

Things dep-fence explicitly does NOT do:

- **Malware detection.** dep-fence doesn't analyze package code. Use Socket for that.
- **CVE tracking.** dep-fence doesn't check vulnerability databases. Use npm audit or Snyk for that.
- **License compliance.** dep-fence doesn't check package licenses. Use license-checker for that.
- **Dependency recommendations.** dep-fence doesn't suggest alternatives to risky packages.
- **Registry mirroring or proxying.** dep-fence doesn't sit between you and the registry. It evaluates after resolution.
- **Blockchain or cryptographic package verification beyond SLSA.** dep-fence uses the provenance infrastructure npm already provides.


## 11. Design Decisions and Rationale

### 11.1 Why Git hooks, not a package manager plugin?

Package manager plugins are tied to one package manager. Git hooks work regardless of whether the team uses npm, pnpm, or Yarn. They also work without modifying the team's existing package manager configuration.

### 11.2 Why a separate baseline file instead of using the lockfile hash?

The lockfile changes on every `npm install`. The baseline represents the last ADMITTED state, which might be several commits behind if someone bypassed the hook. Tracking them separately ensures the trust boundary is explicit.

### 11.3 Why JSON for approvals instead of YAML or TOML?

JSON is universally parseable with zero dependencies in Node.js. YAML requires a parser dependency. TOML is less familiar to JavaScript developers. The approvals file is simple enough that JSON readability isn't a problem.

### 11.4 Why lefthook over Husky as the recommended hook manager?

Husky is an npm package, which adds a supply chain dependency to a supply chain security tool. lefthook is a standalone Go binary with no package manager dependency. That's a better story for a tool whose entire purpose is reducing supply chain risk.

### 11.5 Why not require provenance for all packages?

Most npm packages don't have provenance. Requiring it for all packages would block most real-world upgrades. The useful signal is provenance REGRESSION (had it, lost it), not provenance ABSENCE. Teams can optionally require provenance for critical packages via the `provenance.required_for` list.

### 11.6 Why default cooldown of 72 hours instead of 7 days?

72 hours is long enough that all major 2025-2026 attacks would have been caught (all were detected within 24-48 hours). 7 days is safer but creates more friction for legitimate upgrades. Teams can configure either way.

### 11.7 Why expire approvals?

Without expiry, approvals accumulate indefinitely. A team approves a cooldown bypass for a hotfix, then forgets about it. Six months later, the same package gets compromised and the stale approval lets the bad version through. Expiry forces teams to make fresh decisions.
