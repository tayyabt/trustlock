# Data Model: trustlock v0.1

## Entities

### ResolvedDependency

The common model produced by lockfile parsers. Represents one package as resolved in the lockfile.

```javascript
{
  name: "axios",                    // string — package name (scoped supported: @scope/name)
  version: "1.14.1",               // string — exact resolved version
  resolved: "https://registry...", // string — download URL
  integrity: "sha512-...",         // string — integrity hash
  isDev: false,                    // boolean — dev dependency flag
  hasInstallScripts: false,        // boolean — from lockfile metadata or registry
  source: "registry",             // "registry" | "git" | "file" | "url"
  directDependency: true,         // boolean — listed in package.json or transitive
}
```

**Source classification rules:**
- `registry`: resolved URL starts with `https://registry.npmjs.org` or similar registry URL
- `git`: resolved URL starts with `git://`, `git+https://`, `github:`, or similar
- `file`: resolved URL starts with `file:`
- `url`: resolved URL starts with `http://` or `https://` but is not a known registry

### TrustProfile

Per-package entry stored in the baseline. Captures the trust state at the time of admission.

```javascript
{
  name: "axios",                              // string
  version: "1.14.0",                          // string — version that was admitted
  admittedAt: "2026-03-15T10:00:00Z",        // string — ISO 8601 timestamp
  provenance: {
    hasAttestation: true,                     // boolean
    buildSystem: "github-actions",            // string | null
    sourceRepo: "https://github.com/axios/axios", // string | null
    publisherAccount: "jasonsaayman"          // string | null (tracked but not enforced in v0.1)
  },
  installScripts: [],                         // string[] — names of install lifecycle scripts
  source: "registry"                          // string — source type at admission time
}
```

### Baseline

The trusted state file. Stored at `.trustlock/baseline.json`. Committed to git.

```javascript
{
  schema_version: 1,                          // number — for forward-compat detection
  created_at: "2026-04-07T10:00:00Z",        // string — when init ran
  updated_at: "2026-04-07T14:30:00Z",        // string — last advancement
  lockfile_hash: "sha256:abc123...",          // string — SHA-256 of lockfile at last admission
  packages: {                                 // Record<string, TrustProfile>
    "axios": { /* TrustProfile */ },
    "express": { /* TrustProfile */ },
  }
}
```

**State transitions:**
- Created by `init` (all current packages trusted)
- Advanced by `check` in advisory mode when all changes admitted
- Never advanced by `check --enforce` (D10)
- Removed dependencies silently dropped on next successful advance (D3)

**Access pattern:** Full file read into memory → lookup by package name (O(1) via object key) → full file rewrite on advance.

### PolicyConfig

Loaded from `.trustlockrc.json`. Declares the team's trust policy.

```javascript
{
  cooldown_hours: 72,                         // number — minimum age for any version
  pinning: {
    production: "exact",                      // "exact" | "range" | "any"
    dev: "range"                              // "exact" | "range" | "any"
  },
  provenance: {
    required_for: [],                         // string[] — packages that MUST have provenance
    block_on_regression: true,                // boolean
    block_on_publisher_change: true           // boolean (tracked but not enforced in v0.1)
  },
  scripts: {
    block_unknown: true,                      // boolean
    allowlist: [                              // string[] — packages allowed to have install scripts
      "esbuild", "sharp", "bcrypt", "better-sqlite3",
      "fsevents", "node-gyp", "canvas", "puppeteer",
      "sqlite3", "@swc/core", "electron"
    ]
  },
  sources: {
    allow_git: false,                         // boolean
    allow_http: false,                        // boolean
    allow_file: false                         // boolean
  },
  approvals: {
    default_expiry_days: 7,                   // number
    max_expiry_days: 30,                      // number
    require_reason: true                      // boolean
  },
  ignore_packages: []                         // string[] — skip these entirely
}
```

**Access pattern:** Read once at start of `check`/`audit`. Immutable during evaluation.

### Approval

Entry in `.trustlock/approvals.json`. The file contains a JSON array of approval entries.

```javascript
{
  package: "axios",                           // string
  version: "1.14.1",                          // string — exact version
  overrides: ["cooldown", "provenance"],      // string[] — which rules this bypasses (D9: no wildcards)
  reason: "Verified against commit abc1234",  // string — required if config.approvals.require_reason
  approved_by: "tayyab",                      // string — from git config user.name or --as (D7)
  approved_at: "2026-04-07T10:30:00Z",       // string — ISO 8601
  expires: "2026-04-14T10:30:00Z"            // string — ISO 8601
}
```

**Validity rules:**
- Valid: `expires` is in the future AND `package`+`version` match AND requested rule is in `overrides`
- Expired: `expires` is in the past (skipped during check, removed by clean-approvals)
- Inapplicable: wrong package, version, or rule not in overrides

**Access pattern:** Read full array → filter for matching package+version → check each for expiry and rule coverage. Append on `approve`. Rewrite on `clean-approvals`.

### CheckResult

Per-dependency evaluation output. Ephemeral — not persisted.

```javascript
{
  package: "axios",
  version: "1.14.1",
  previousVersion: "1.14.0",                 // string | null (null if new dependency)
  decision: "blocked",                        // "admitted" | "admitted_with_approval" | "blocked"
  findings: [
    {
      rule: "cooldown",                       // string — rule identifier
      severity: "error",                      // "error" | "warning"
      message: "Published 2 hours ago (policy: 72h minimum)", // string
      detail: {                               // object — rule-specific structured data
        published_at: "2026-03-31T00:21:00Z",
        age_hours: 2,
        required_hours: 72,
        clears_at: "2026-04-03T00:21:00Z"    // D4: cooldown clears_at required
      }
    }
  ],
  approval: null,                             // Approval | null
  approvalCommand: "trustlock approve axios@1.14.1 --override cooldown --reason \"...\" --expires 7d"
}
```

**Decision logic:**
- No findings with severity "error" → `admitted`
- All error findings covered by valid approval → `admitted_with_approval`
- Any error finding not covered → `blocked`

### DependencyDelta

Computed diff between baseline and current lockfile.

```javascript
{
  added: ResolvedDependency[],    // in current, not in baseline
  removed: string[],              // in baseline, not in current (package names only)
  changed: [{                     // in both, version differs
    current: ResolvedDependency,
    previous: TrustProfile
  }],
  unchanged: string[]             // in both, same version (package names only)
}
```

**Rules:**
- `added` and `changed` trigger policy evaluation
- `removed` are silently dropped from baseline on next advance (D3)
- `unchanged` are not evaluated

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Spec: 2026-04-07-trustlock-full-spec
