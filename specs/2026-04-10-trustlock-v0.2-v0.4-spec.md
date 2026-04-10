# trustlock: v0.2–v0.3 Specification

**Version:** 2.0
**Date:** 2026-04-10
**Author:** Tayyab Tariq
**Status:** Draft
**Builds on:** `specs/2026-04-07-trustlock-full-spec.md` (v0.1 implementation)


## 1. v0.1 Feedback Carried Forward

These are bugs and UX gaps discovered during v0.1 usage. They are resolved in v0.2 before new feature work begins.

### 1.1 Monorepo Support (Bug)

**Observed failure:** Running `trustlock init` from a monorepo sub-package directory (e.g. `backend/` or `frontend/`) fails because trustlock assumes the lockfile, `.trustlockrc.json`, and `.git/` all live in the same directory. In a monorepo the `.git/` root is two or more levels up.

**Root cause:** The tool conflates two distinct concepts:
- **Project root** — the directory where `package-lock.json` and `.trustlockrc.json` live (where you run trustlock).
- **Git root** — the directory containing `.git/`, found by walking up from project root.

**Fix:** Decouple path resolution. All commands resolve two roots at startup:

```
projectRoot  ← cwd (or explicit --project-dir)
gitRoot      ← walk up from projectRoot until .git/ is found, or error
```

If `.git/` is not found after walking up to the filesystem root, exit with: `Error: not a git repository (or any parent directory)`.

All reads of `package-lock.json`, `.trustlockrc.json`, `.trustlock/baseline.json`, and `.trustlock/approvals.json` use `projectRoot`. All git operations (staging baseline after admission, reading previous commit) use `gitRoot`.

**Affected commands:** `init`, `check`, `approve`, `audit`, `install-hook`.

**New flag (all commands):** `--project-dir <path>` — override project root explicitly. Useful in CI where the working directory may not be the package root.

**`install-hook` behaviour in monorepos:** The hook must be installed in `gitRoot/.git/hooks/pre-commit`, not `projectRoot`. The installed hook should call `trustlock check --project-dir <relative-path-from-gitRoot-to-projectRoot>` so the hook works regardless of which directory git runs it from.

### 1.2 Progress Feedback on `trustlock init` (UX Bug)

**Observed failure:** `trustlock init` on a 188-package lockfile takes roughly 60 seconds with no terminal output. The user cannot distinguish "working" from "hung."

**Root cause:** The init command fetches registry metadata for every package in the lockfile to build the baseline. No progress is emitted during this phase.

**Fix:** Add a progress counter to the registry fetch phase, hand-rolled with ANSI (zero-dependency constraint applies). Output goes to `process.stderr` so it doesn't contaminate `--json` stdout.

**TTY detection:** Behaviour differs based on `process.stderr.isTTY`:

- **Interactive terminal (`isTTY: true`):** Overwrite the same line using `\r`:
  ```
  [  1/188] Fetching registry metadata...
  [ 12/188] Fetching registry metadata...
  [188/188] Fetching registry metadata...
  ```
  The counter updates on every resolved fetch. On completion, print a newline then proceed to summary.

- **Non-TTY / CI (`isTTY: false`):** Emit a new line every 10% increment (every ~19 packages for 188 total):
  ```
  [  19/188] Fetching registry metadata...
  [  38/188] Fetching registry metadata...
  ...
  [188/188] Fetching registry metadata... done
  ```
  This produces readable CI logs without carriage-return noise.

**Also applies to `trustlock check`** when it must fetch metadata for a large set of dependencies (e.g. first run after bulk upgrade, or `--no-cache`). Same counter, same stderr channel, same TTY detection.

### 1.3 SLSA Provenance Context in Audit Output

**Observed feedback:** The `trustlock audit` output reported "11% SLSA provenance" with no explanation. Users interpreted this as a problem score rather than an ecosystem baseline. 11% means ~21 of 188 packages have cryptographically signed build provenance — this is normal and expected for the current npm ecosystem.

This is addressed as part of the full output redesign in Section 2 of this document. The key principles:
- Never present provenance coverage as a health score or a percentage grade.
- Frame it as "regression watch" — a list of packages trustlock is actively protecting.
- Include a fixed contextual note: SLSA provenance adoption on npm is approximately 10–15% of the ecosystem as of 2025; this figure reflects ecosystem adoption, not package quality.


## 2. Output and UX Redesign

The v0.1 terminal output was data-oriented — it mirrored the internal data model. This section redesigns the output around user jobs: what the user needs to know and what they need to do next.

### 2.1 Design Principles

1. **Action first.** Blocked packages and the commands to unblock them appear before everything else. Admitted packages are secondary.
2. **One-line diagnosis.** Each blocked package gets one line explaining why it's blocked, in plain language, not rule identifiers.
3. **Ready-to-run commands.** Every block produces an `approve` command the user can copy-paste directly. The command includes all overrides needed for that package — not one command per finding.
4. **Quiet on success.** When everything is admitted, output is minimal. The absence of noise is the signal.
5. **Provenance is a watch list, not a score.** Audit output shows which specific packages are under regression protection, not an aggregate percentage.
6. **Timing signals.** For cooldown blocks, always show the exact timestamp when the cooldown clears — never just the age.

### 2.2 `trustlock check` Output

#### Summary line

Always the first line of output:

```
3 packages changed  ·  2 blocked  ·  1 admitted  ·  1.8s
```

Fields: total changed, blocked count, admitted count, wall time. If nothing changed:

```
No dependency changes since last baseline.
```

Exit 0, no further output.

#### Blocked section

Appears immediately after the summary line if any packages are blocked. Each entry:

```
  BLOCKED
  ──────────────────────────────────────────────────────────────
  axios 1.14.0 → 1.14.1                         cooldown · provenance
    Published 2h ago — policy requires 72h. Clears Thu Apr 10 02:21 UTC.
    Provenance present in 1.14.0, absent in 1.14.1.
    ▶  trustlock approve axios@1.14.1 --override cooldown,provenance --reason "..." --expires 7d

  lodash 4.17.20 → 4.17.21                       scripts
    Adds postinstall script — not in scripts allowlist.
    ▶  trustlock approve lodash@4.17.21 --override scripts --reason "..." --expires 7d
```

Rules:
- Package line: `name old → new` left-aligned, rule names right-aligned on the same line.
- If multiple rules fire, all appear comma-separated in the rule column and all are included in the single `--override` flag of the approve command.
- Diagnosis line: plain English, no jargon, one line per rule that fired.
- Approve command: always present, always copy-pasteable. The `--reason` placeholder is literally `"..."` — the user fills it in.
- Cooldown blocks always include the exact clear timestamp, in the user's local timezone if determinable from `TZ`, otherwise UTC.

#### Publisher change — elevated treatment

Publisher changes appear in the blocked section but with additional visual weight, since they are higher-signal than cooldown or scripts:

```
  react 18.2.0 → 18.3.0                         publisher-change ⚠
    Publisher changed: fb → react-team
    Verify the change is legitimate before approving.
    ▶  trustlock approve react@18.3.0 --override publisher-change --reason "..." --expires 7d
```

The `⚠` marker and "Verify" line are hardcoded for this rule. No other rule gets this treatment.

#### New packages section

New packages (first appearance, not a version bump) are shown in a separate section below blocked:

```
  NEW PACKAGES
  ──────────────────────────────────────────────────────────────
  uuid 9.0.0                                     admitted
    Published 8 months ago · no install scripts · no provenance

  some-pkg 1.0.0                                 blocked  cooldown · scripts
    Published 1h ago (clears Fri Apr 11 14:00 UTC) · has postinstall script
    ▶  trustlock approve some-pkg@1.0.0 --override cooldown,scripts --reason "..." --expires 7d
```

New packages are shown whether admitted or blocked. This section exists to surface new additions explicitly — a version bump and a first-time addition are different risk events and should be distinguished visually.

#### Admitted section

Appears last. Kept intentionally minimal:

```
  ADMITTED
  ──────────────────────────────────────────────────────────────
  express 4.18.1 → 4.18.2
  helmet  7.1.0  → 7.2.0
```

No per-package detail. If everything was admitted with no new packages, the admitted section collapses to the summary line only:

```
2 packages changed  ·  2 admitted  ·  0.9s
Baseline advanced.
```

#### Baseline status footer

Always the last line:

```
Baseline advanced.
```
or
```
Baseline not advanced — 2 packages blocked.
```

#### Admitted with approval

If packages are admitted because a valid approval exists:

```
  ADMITTED WITH APPROVAL
  ──────────────────────────────────────────────────────────────
  axios 1.14.1                                   cooldown approved
    Approved by tayyab · expires Apr 14 · "Verified safe by team review"
```

These appear between BLOCKED and ADMITTED sections.

### 2.3 `trustlock check --enforce` Output

In enforce mode the output is identical. The only difference is exit code 1 on any block. No additional output is added. CI log readability comes from the existing structure.

### 2.4 `trustlock audit` Output

The audit command is redesigned around what trustlock is actively protecting, not aggregate statistics.

```
trustlock audit

  188 packages  ·  npm  ·  package-lock.json v3


  REGRESSION WATCH  ·  21 packages
  ──────────────────────────────────────────────────────────────
  These packages currently have SLSA provenance. If a future version
  drops provenance, trustlock will block the upgrade.

  @angular/core    esbuild          typescript       @babel/core
  eslint           prettier         vite             vitest
  ... (21 total, --provenance to list all)

  Most npm packages have no provenance — this is normal. The 10–15%
  that do are typically published by large organizations or
  security-conscious maintainers. Regression protection applies
  only to packages that currently have it.


  INSTALL SCRIPTS  ·  4 packages
  ──────────────────────────────────────────────────────────────
  All packages with install scripts are allowlisted. ✓

  esbuild ✓    sharp ✓    bcrypt ✓    canvas ✓

  If an unallowlisted package with install scripts is added in the
  future, trustlock will block it.


  AGE SNAPSHOT
  ──────────────────────────────────────────────────────────────
  Youngest:   ms@2.1.3          published 3 days ago
  Oldest:     inherits@2.0.4    published 6 years ago
  Median age: 2.1 years

  The cooldown rule (72h) applies to new and changed packages only,
  not to packages already in the baseline.


  PINNING
  ──────────────────────────────────────────────────────────────
  12 of 188 packages use version ranges in package.json.
  Policy requires exact pinning for production dependencies.
  Run trustlock audit --pinning for the full list.


  NON-REGISTRY SOURCES
  ──────────────────────────────────────────────────────────────
  All packages resolve from the npm registry. ✓
```

Rules:
- Each section answers: "is there anything to be aware of here?" If clean, say so with ✓ and one sentence.
- The provenance section always includes the contextual note about ecosystem adoption. It is not optional — it is part of the section.
- "Regression watch" is the fixed term for provenance coverage. It is never called "provenance score" or "provenance coverage percentage" in terminal output.
- The `--provenance` flag on audit prints the full list of packages under regression watch.
- If install scripts exist but some are NOT allowlisted, the section changes to show a warning and the list of unallowlisted packages.

#### Audit with unallowlisted install scripts:

```
  INSTALL SCRIPTS  ·  5 packages
  ──────────────────────────────────────────────────────────────
  1 package has install scripts and is NOT in the allowlist:

  some-native-pkg ✗ not allowlisted

  trustlock check will block this package until it is added to the
  scripts.allowlist in .trustlockrc.json or approved.

  esbuild ✓    sharp ✓    bcrypt ✓    canvas ✓
```

### 2.5 `trustlock approve` Confirmation Output

```
✓  Approval recorded

   Package:   axios@1.14.1
   Overrides: cooldown, provenance
   Reason:    "Verified safe by team review"
   Approved:  tayyab
   Expires:   Sun Apr 17 2026 10:30 UTC  (7 days)

   .trustlock/approvals.json updated. Commit this file.
```

Rules:
- Expiry shown as an absolute date+time, not a relative duration. The user should know exactly when re-approval is needed.
- The "Commit this file" reminder is always printed. It's a frequent miss.

### 2.6 JSON Output Structure

The JSON output structure changes to match the terminal groupings. This replaces the flat `results[]` array from v0.1.

```javascript
{
  "schema_version": 2,
  "summary": {
    "total_changed": 3,
    "blocked": 2,
    "admitted": 1,
    "admitted_with_approval": 0,
    "new_packages": 1,
    "baseline_advanced": false,
    "elapsed_ms": 1842
  },
  "blocked": [
    {
      "package": "axios",
      "version": "1.14.1",
      "previous_version": "1.14.0",
      "is_new": false,
      "findings": [
        {
          "rule": "cooldown",
          "message": "Published 2h ago — policy requires 72h",
          "clears_at": "2026-04-10T02:21:00Z"
        },
        {
          "rule": "provenance",
          "message": "Provenance present in 1.14.0, absent in 1.14.1"
        }
      ],
      "approve_command": "trustlock approve axios@1.14.1 --override cooldown,provenance --reason \"...\" --expires 7d"
    }
  ],
  "admitted_with_approval": [],
  "admitted": [
    {
      "package": "express",
      "version": "4.18.2",
      "previous_version": "4.18.1",
      "is_new": false
    }
  ],
  "new_packages": [
    {
      "package": "uuid",
      "version": "9.0.0",
      "decision": "admitted",
      "signals": {
        "age_days": 243,
        "has_provenance": false,
        "has_install_scripts": false,
        "source": "registry"
      }
    }
  ]
}
```

The `approve_command` field is always present on blocked entries, even in JSON mode. It is the single command needed to approve all findings on that package — not one command per finding.

### 2.7 `--quiet` Flag

`trustlock check --quiet` suppresses all output. Only the exit code communicates the result. For scripting use cases where output is not needed.

`trustlock check --quiet --enforce` exits 0 or 1 with no output. This is the minimal CI integration form.


## 3. Phase 2: v0.2 — Multi-Format + Monorepo

### 3.1 Scope

Resolve all v0.1 feedback items (section 1) and implement the output redesign (section 2) before adding new features. Then: pnpm and yarn lockfile support, publisher identity change detection, SARIF output, and policy profiles.

### 3.2 Lockfile Parsers

#### pnpm-lock.yaml

Support pnpm lockfile versions v5 (pnpm 6.x), v6 (pnpm 7.x–8.x), and v9 (pnpm 9.x).

The pnpm format uses a YAML structure. Since the zero-dependency constraint forbids a YAML library, implement a purpose-built line-by-line YAML parser scoped to the pnpm lockfile schema only. The parser does not need to be a general YAML parser. The YAML constructs actually emitted by pnpm are:

- Block mappings (key-colon-space-value)
- Block sequences (dash-space-value)
- Quoted strings (single and double)
- Multi-level indentation (2-space indent per level)
- Inline values on the same line as the key

pnpm does not emit YAML anchors, aliases, multi-line strings, or flow-style collections. The parser does not need to handle these.

**Key fields to extract per package:**
- `name` — inferred from the key path (e.g. `/axios/1.14.1`) in v5/v6, explicit `name:` field in v9
- `version` — from key path or explicit `version:` field (v9)
- `resolution.integrity` — sha512 hash
- `hasBin`, `requiresBuild` — maps to `hasInstallScripts`
- `dev: true` — dev dependency flag

**Scoped packages:** pnpm encodes scoped packages as `/@scope/name/version` in v5/v6 and `@scope/name@version` in v9. Both must be handled.

**Workspaces:** In a pnpm monorepo, `pnpm-lock.yaml` is always at the git root. The `importers` section lists each workspace package. When invoked from `packages/backend/`, match the current `projectRoot` against importer keys (which are relative paths from git root) and read only that importer's dependencies.

#### yarn.lock

Support yarn classic (v1) and yarn berry (v2+, identified by the `__metadata` block at the top of the file).

**yarn classic (v1):**
- Custom format (not YAML, not JSON). Line-by-line parsing.
- Key structure: one or more `"package@range":` specifiers on a header line (comma-separated), followed by indented `version:`, `resolved:`, `integrity:`, `dependencies:` fields.
- Multiple version specifiers mapping to the same block are all aliases for the same resolved version — parse once, register under all specifier keys.

**yarn berry (v2+):**
- Same custom format but with `__metadata` block at top.
- `languageName: node` marks npm packages. `languageName: unknown` marks workspace packages — exclude these from admission checks.
- `resolution:` field format: `package@npm:1.2.3`.
- `checksum:` replaces `integrity:`. Berry uses a different hash format (SHA-512 with a custom encoding). Store as-is; use for identity, not verification.

**Dev vs production classification:** yarn.lock does not encode this. Cross-reference with `package.json` `dependencies` and `devDependencies` to classify direct dependencies. Transitive dependencies (not in `package.json` directly) are classified as the same type as their closest direct ancestor.

**Install scripts:** In yarn v1, check for `postinstall` or `install` keys within the `scripts` block of the resolved package entry (not always present). In berry, check `dependenciesMeta[pkg].built: true`. If neither is determinable from the lockfile, fall back to the registry API.

### 3.3 Publisher Identity Change Detection

**Rule name:** `trust-continuity:publisher`

This rule was deferred from v0.1. It requires storing the publishing npm account in the baseline and comparing it on each version change.

**Registry API:** `GET https://registry.npmjs.org/{name}/{version}` — check `_npmUser.name` field.

**Baseline schema v2:** Add `publisherAccount: string | null` to the Trust Profile object. `null` means unknown (v1 baseline entry not yet migrated).

**Migration from v1 baseline:**

Packages that are changing in the current check run require special handling:
1. Fetch `_npmUser.name` for the *baseline version* (old version).
2. Fetch `_npmUser.name` for the *new version*.
3. Store baseline version's publisher in the migrated baseline entry.
4. Compare old publisher against new publisher.

If they differ, flag as publisher change.

Packages that are NOT changing in the current run keep `publisherAccount: null` until they next change. When `publisherAccount` is null and a package changes version, the null is treated as "no prior publisher on record" — emit a warning (`Could not compare publisher — no prior record for this package`) but do not block. The new publisher is recorded for future comparisons.

This means the first time a v1-baseline package upgrades, it cannot block on publisher change — only warn. This is the correct tradeoff: blocking on a null comparison would produce false positives for every package the first time it upgrades post-migration.

**Decision:** Block if `provenance.block_on_publisher_change: true` (default: true) and both old and new publisher are known and differ.

**Output:** Both publisher accounts are named in the output (see §2.2 elevated treatment for publisher-change blocks).

### 3.4 SARIF Output

**Flag:** `trustlock check --sarif`

Outputs a SARIF 2.1.0 JSON document to stdout. Intended for GitHub Advanced Security integration (upload via `actions/upload-sarif`).

**SARIF structure:**
- `runs[0].tool.driver.name`: `"trustlock"`
- `runs[0].tool.driver.rules`: One entry per policy rule — `cooldown`, `provenance`, `scripts`, `sources`, `pinning`, `new-dep`, `transitive`, `publisher-change`.
- `runs[0].results`: One entry per blocked finding. Admitted packages produce no results. Packages admitted with valid approvals produce no results.
- Each result: `ruleId`, `level: "error"`, `message.text`, `locations[0].physicalLocation.artifactLocation.uri` (lockfile path relative to project root), `locations[0].physicalLocation.region.startLine: 1`.

`--sarif` is orthogonal to `--enforce`. Both can be used together: SARIF goes to stdout, exit code reflects enforce mode.

### 3.5 Policy Profiles

**Config key:** `profiles` object in `.trustlockrc.json`.

A profile is a named overlay that overrides specific config values. Profiles are selected with `trustlock check --profile <name>`.

```javascript
"profiles": {
  "strict": {
    "cooldown_hours": 168,
    "provenance": { "required_for": ["*"] }
  },
  "ci": {
    "cooldown_hours": 0,
    "scripts": { "block_unknown": false }
  }
}
```

**Merge semantics:** Profile values are shallow-merged over the base config. Nested objects (`provenance`, `scripts`, `sources`) are merged one level deep — profile keys override base keys, unspecified keys fall through to base.

**`required_for: ["*"]` warning:** When this is active, trustlock emits a warning before results:

```
Warning: provenance required for all packages (profile: strict).
~85–90% of npm packages have no provenance. Most upgrades will be blocked
until provenance is established or packages are individually approved.
```

This warning appears in terminal output and in the JSON `warnings[]` array. It is not suppressible — a team using this setting should understand what it does.

**Built-in profiles:** trustlock ships two built-in named profiles (`strict`, `relaxed`) that can be referenced without defining them in `.trustlockrc.json`. User-defined profiles with the same names override the built-ins.

**Profile floor enforcement:** A profile cannot lower numeric floors below the base config. If the base config has `cooldown_hours: 72` and a profile sets `cooldown_hours: 24`, trustlock exits with: `Profile "ci" sets cooldown_hours=24, below base config minimum of 72. Profiles can only tighten policy, not loosen it.`

The one exception is the `relaxed` built-in profile: it is explicitly permitted to lower defaults. User-defined profiles may not lower base config values.

### 3.6 Monorepo: --lockfile and --project-dir

`--project-dir <path>` sets the project root. `--lockfile <path>` overrides the lockfile path within that context. The two flags are independent:

- `--project-dir` changes where trustlock looks for `.trustlockrc.json`, `.trustlock/`, and the lockfile.
- `--lockfile` overrides just the lockfile path, resolved relative to `projectRoot`.

Example for CI in a monorepo:
```bash
trustlock check --project-dir packages/backend
# Uses packages/backend/package-lock.json, packages/backend/.trustlockrc.json
# Stages baseline to packages/backend/.trustlock/baseline.json
# Git operations use the root .git/
```

Workspace auto-detection (reading `package.json` `workspaces` field) is deferred to v0.3.


## 4. Phase 3: v0.3 — Python Ecosystem

### 4.1 Scope

Extend trustlock to Python projects using pip, pip-compile, and uv. Add policy inheritance for org-level configuration.

### 4.2 Python Lockfile Parsers

#### requirements.txt (pinned)

Support pip requirements files with exact version pins (`package==1.2.3`). Line-by-line parsing; no external library.

**Fields extracted:**
- Package name, normalised per PEP 508 (case-insensitive, hyphens and underscores equivalent, e.g. `Pillow` and `pillow` are the same package).
- Exact version string.
- Hash lines (`--hash=sha256:...`) if present — stored as integrity equivalent.
- URL requirements (`package @ https://...`) classified as `source: url`.

**Pinning rule for Python:** A requirement is "unpinned" if it uses `>=`, `<=`, `!=`, `~=`, `>`, `<`, or no version specifier at all. Only `==` with a complete version string is considered pinned. Unpinned requirements are flagged under the `pinning` rule.

#### pip-compile output

pip-compile generates annotated requirements files with comment headers identifying which direct dependency caused each transitive requirement (e.g. `# via flask`). Use the same parser as requirements.txt. The `via` annotations feed the `delta:transitive-surprise` rule to attribute transitive additions to their direct dependency cause.

#### uv.lock

uv's lockfile is TOML-based. Implement a purpose-built line-by-line TOML parser scoped to the uv lockfile schema. The TOML constructs emitted by uv.lock are: `[[package]]` array-of-tables headers, inline key-value pairs, inline tables `{ key = "value" }`, quoted strings, and arrays. uv.lock does not emit dotted keys, multi-line strings, or datetime values. The parser does not need to handle these.

**Key sections per package:**
- `[[package]]` blocks with `name`, `version`, `source`.
- `source.registry` — npm registry equivalent.
- `source.git` — maps to `source: git`.
- `source.path` — local path dependency, treated as first-party (excluded from checks, not flagged).

### 4.3 PyPI Registry Adapter

**Base URL:** `https://pypi.org/pypi/{name}/{version}/json`

**Fields used:**
- `urls[].uploader` — the PyPI account that performed the upload. This is the Python equivalent of npm's `_npmUser.name` (the actual uploader, not the declared author metadata). Fall back to `info.maintainer_email` if `uploader` is absent from all release file objects.
- `urls[].upload_time_iso_8601` — publish date for the cooldown rule. Use the earliest upload time across all release files for the version.
- `info.requires_dist` — dependency list for transitive tracking.

**Provenance on PyPI:** PyPI introduced attestation support in 2024 (PEP 740). The correct way to check for attestations is through the PyPI Simple API with the `application/vnd.pypi.simple.v1+json` Accept header — attestations are included in the file metadata there. Do not hardcode a specific attestations endpoint URL; verify the current PyPI API documentation at implementation time. Treat PyPI attestations as equivalent to npm SLSA provenance for the `trust-continuity:provenance` rule.

**Ecosystem note for audit output:** PyPI provenance adoption is even lower than npm. Apply the same "regression watch" framing from §2.4. Never present low provenance coverage as a failure.

### 4.4 Policy Inheritance

**Use case:** An org wants to declare a base policy that all repositories must extend. Individual repos can tighten policy but cannot weaken it below the org baseline.

**Mechanism:** `.trustlockrc.json` can declare an `extends` key pointing to a local path or URL:

```javascript
{ "extends": "https://your-org.internal/trustlock-policy.json", "cooldown_hours": 96 }
```
```javascript
{ "extends": "../../org-policy/.trustlockrc.json" }
```

**Merge semantics:**
- Scalar values: repo config wins. Floor enforcement applies (repo cannot lower a numeric floor below the base value).
- Array values (`required_for`, `allowlist`, `ignore_packages`): union of base and repo arrays. A repo cannot remove a package from the org's `ignore_packages` list, but it can add packages.
- Object values: deep merge, same rules apply recursively.

**Floor enforcement:** trustlock compares each numeric field in the merged config against the base. If a repo value is lower than the org floor, exit with: `Policy error: repo config sets cooldown_hours=24, below org minimum of 72. Repos may only tighten org policy.`

**Remote fetch:** The `extends` URL is fetched at runtime and cached for 1 hour in `.trustlock/.cache/org-policy.json`. Behaviour on failure:
- Remote unreachable, cached copy exists → use cached copy, emit a stderr warning: `Warning: could not reach policy URL, using cached copy from <timestamp>`.
- Remote unreachable, no cache → exit with: `Error: could not fetch org policy from <url> and no cached copy exists.`

**Security note:** The policy URL is trusted configuration — it has the same trust level as `.trustlockrc.json` itself. Teams using remote `extends` should treat the policy URL as code: review changes, prefer a content-addressed URL, do not point to a `latest` endpoint that changes without review.

**Chains:** `extends` in the org policy is not supported. Only one level of inheritance. If the fetched policy contains an `extends` key, it is ignored with a warning.

### 4.5 Cross-Project Audit

`trustlock audit --compare <dir1> <dir2> ...` reads lockfiles from multiple project directories and produces a unified report.

**What it reports:**
- Packages present in multiple projects at different versions (version drift).
- Packages where provenance status differs across projects (same package name, different versions — some with provenance, some without).
- Packages allowlisted in one project's scripts allowlist but absent from another's (allowlist inconsistency).

**What it reads:** The lockfile from each directory's `projectRoot`. It does not read or modify baselines or approvals.

**Exit code:** Always 0. Informational only.


## 5. Architecture Changes

### 5.1 New Files in v0.2

```
src/
  lockfile/
    pnpm.js          # pnpm-lock.yaml parser (v5, v6, v9)
    yarn.js          # yarn.lock parser (classic v1 and berry v2+)
  registry/
    publisher.js     # Publisher identity fetch and comparison
  output/
    sarif.js         # SARIF 2.1.0 formatter
  utils/
    paths.js         # projectRoot / gitRoot resolution
    progress.js      # TTY-aware progress counter for stderr
```

### 5.2 Modified Files in v0.2

- `src/utils/git.js` — accept explicit `gitRoot` parameter; remove assumption that gitRoot equals cwd.
- `src/cli/commands/init.js` — integrate `paths.js`, integrate `progress.js`.
- `src/cli/commands/check.js` — add `--sarif`, `--profile`, `--project-dir`, `--quiet` flags; integrate progress counter; implement new output structure.
- `src/cli/commands/audit.js` — implement redesigned audit output (§2.4).
- `src/cli/commands/approve.js` — implement redesigned confirmation output (§2.5).
- `src/cli/args.js` — add new flags across all commands.
- `src/baseline/manager.js` — add schema v2 with `publisherAccount`; add v1→v2 migration logic.
- `src/output/terminal.js` — implement new grouped output structure.
- `src/output/json.js` — implement new grouped JSON schema (schema_version: 2).

### 5.3 New Files in v0.3

```
src/
  lockfile/
    requirements.js  # pip requirements.txt and pip-compile parser
    uv.js            # uv.lock parser
  registry/
    pypi.js          # PyPI JSON API adapter
  policy/
    inherit.js       # Policy inheritance and floor enforcement
  cli/
    commands/
      cross-audit.js # trustlock audit --compare
```


## 6. Testing Strategy Additions

### 6.1 v0.2 Tests

**Monorepo integration tests:**
- `trustlock init` from a subdirectory with `.git` two levels up — verify `.trustlock/` written to projectRoot, not gitRoot.
- `trustlock check` from monorepo sub-package — baseline staged to git index using gitRoot.
- `trustlock install-hook` — hook written to `gitRoot/.git/hooks/pre-commit` with correct `--project-dir` value.
- No `.git` anywhere in tree — verify error message.

**Progress counter tests:**
- isTTY true: verify `\r` used, single line rewritten.
- isTTY false: verify newlines emitted at ~10% intervals.
- Output goes to stderr, not stdout — verify `--json` stdout is clean.

**Output format tests:**
- Blocked package: verify summary line counts, blocked section, approve command format.
- Multiple rules on one package: verify all overrides combined in single `--override` flag.
- Publisher change: verify `⚠` marker and "Verify" line present.
- All admitted: verify minimal output and "Baseline advanced." footer.
- `--quiet`: verify no stdout/stderr output, only exit code.

**Parser tests:**
- pnpm v5, v6, v9 fixtures: scoped packages, workspace packages (excluded from checks).
- yarn classic: multi-specifier header line → single resolved entry.
- yarn berry: `languageName: unknown` workspace packages excluded.

**Publisher change tests:**
- Fixture: package where `_npmUser.name` changes between baseline version and new version.
- v1 baseline migration: `publisherAccount` null → fetch baseline version publisher → compare.
- Null publisherAccount on first upgrade: warn but do not block.

**Profile tests:**
- `required_for: ["*"]` warning displayed before results.
- Profile attempting to lower numeric floor → error exit.
- Built-in `relaxed` profile can lower defaults.

**SARIF tests:**
- Valid SARIF 2.1.0 schema output for a blocked run.
- Approved packages produce no SARIF results.
- `--sarif` and `--enforce` together: SARIF on stdout, exit 1 on block.

### 6.2 v0.3 Tests

**Python parser tests:**
- requirements.txt: exact pins, ranges (flagged), URL requirements (source: url), PEP 508 name normalization.
- pip-compile: `# via` annotation parsed for transitive attribution.
- uv.lock: registry and git sources, `source.path` entries excluded from checks.

**PyPI adapter tests:**
- `urls[].uploader` extracted as publisher identity.
- `uploader` absent: fall back to `info.maintainer_email`.
- Publish date from earliest `upload_time_iso_8601` across file objects.

**Policy inheritance tests:**
- Local `extends` path resolved relative to `.trustlockrc.json` location.
- Remote `extends` with mock HTTP server: merge semantics verified.
- Floor enforcement: repo lower than org minimum → error with specific message.
- Remote unreachable, cache present → use cache, warn.
- Remote unreachable, no cache → error exit.
- Chained `extends` in fetched policy → ignored with warning.
- Array union: repo `allowlist` additions merged with org `allowlist`.


## 7. Out of Scope for v0.2–v0.3

- **Cargo / crates.io** — deferred to v0.4.
- **`trustlock diff` command** — deferred to v0.4.
- **`trustlock why` command** — deferred to v0.4.
- **CycloneDX SBOM generation** — deferred to v0.4.
- **Shell completions and man page** — deferred to v0.4.
- **Hosted trust intelligence API** — deferred to v0.5+.
- **GitHub App / PR bot** — not in scope for CLI-first phases.
- **Automatic allowlist curation** — the default scripts allowlist remains static.
- **Go modules (go.sum)** — deferred to v0.5+.
- **`.npmrc` / private registry support** — trustlock currently only queries the public npm registry. Private registry support requires authentication handling and is deferred.
- **Workspace auto-detection** from `package.json` `workspaces` field — deferred to v0.3 (was listed in v0.2 original spec, pushed out to reduce scope).
