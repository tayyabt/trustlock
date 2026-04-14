# trustlock — Architecture

Design decisions, module map, and data flows for trustlock v0.1.

## What trustlock does

trustlock is a dependency admission controller for npm projects. It evaluates trust signals on dependency changes and makes binary admit/block decisions based on a declared policy. It runs as a Git pre-commit hook (advisory) and as a CI check (`--enforce`).

## Key design decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | **All-or-nothing baseline advance** | If any dependency is blocked, the baseline does not advance for any package. This prevents partial trust state. |
| D2 | **Approval valid in same commit** | The pre-commit hook reads the working tree, so an approval written in the same commit is effective immediately. |
| D3 | **Removed dependencies are silent** | Removal is always safe; no policy evaluation on removals. |
| D4 | **Cooldown `clears_at` required in output** | Blocked packages show the exact UTC timestamp when the cooldown will clear. |
| D5 | **Single lockfile in v0.1** | Only `package-lock.json` is supported. pnpm and yarn support is deferred to v0.2. |
| D6 | **`init` fails if `.trustlock/` exists** | Prevents silent re-initialization. Delete the directory or use `--force` (manual). |
| D7 | **Approver from git config** | Approver identity is `git config user.name` or `--as`. No anonymous approvals. |
| D8 | **Cache is gitignored** | `.trustlock/.cache/` is never committed. Cache is a performance optimization, not state. |
| D9 | **No wildcard approvals** | Every approval must name specific rule(s). Blanket `--override *` is rejected. |
| D10 | **CI is read-only** | `--enforce` never writes or advances the baseline. |
| Q1 | **Fail hard on unknown lockfile version** | Exit 2 on unrecognized `lockfileVersion`. No best-effort degraded mode. |
| Q2 | **Manual approval cleanup only** | `check` skips expired approvals but never deletes them. Use `clean-approvals`. |

## Technology choices

- **Runtime:** Node.js >= 18.3 (for `node:util.parseArgs`)
- **Language:** JavaScript, ES modules (`import`/`export`)
- **Zero runtime dependencies** (ADR-001) — pure Node.js built-ins only
- **HTTP:** `node:https`
- **CLI args:** `node:util.parseArgs`
- **File I/O:** `node:fs/promises` with atomic writes (write to temp, rename)
- **Git operations:** `node:child_process`
- **No build step** — source files are the distribution

The zero-dependency constraint is a product thesis: a supply chain security tool should not itself be a supply chain risk. See [ADR-001](docs/adrs/ADR-001-zero-runtime-dependencies.md).

## Module map

```
┌─────────────────────────────────────────────┐
│                    CLI                       │
│  init | check | approve | audit | clean     │
│  install-hook                                │
├─────────────────────────────────────────────┤
│                 Policy Engine                │
│  Loads policy → evaluates rules → decides    │
│  Rules: provenance, cooldown, pinning,       │
│         scripts, sources, new-dep, transitive│
├──────────┬──────────┬───────────────────────┤
│ Lockfile │ Registry │ Baseline  | Approvals  │
│ Parser   │ Client   │ Manager   | Store      │
│          │ + Cache  │           |            │
├──────────┴──────────┴───────────────────────┤
│                   Output                     │
│            Terminal | JSON                    │
├─────────────────────────────────────────────┤
│                   Utils                      │
│            git | semver | time               │
└─────────────────────────────────────────────┘
```

### Module files

| Module | Responsibility | Key files |
|--------|---------------|-----------|
| **cli** | Command routing, arg parsing, entry points | `src/cli/index.js`, `src/cli/args.js`, `src/cli/commands/*.js` |
| **policy** | Core evaluation engine — admit/block decisions | `src/policy/engine.js`, `src/policy/config.js`, `src/policy/rules/*.js`, `src/policy/decision.js` |
| **lockfile** | Parse lockfiles into common model | `src/lockfile/parser.js` (router), `src/lockfile/npm.js` (v1/v2/v3), `src/lockfile/models.js` |
| **registry** | Fetch trust signals from npm, with caching | `src/registry/client.js`, `src/registry/npm-registry.js`, `src/registry/provenance.js`, `src/registry/cache.js` |
| **baseline** | Manage trusted state, compute deltas | `src/baseline/manager.js`, `src/baseline/diff.js` |
| **approvals** | Scoped, time-limited policy overrides | `src/approvals/store.js`, `src/approvals/validator.js`, `src/approvals/generator.js`, `src/approvals/models.js` |
| **output** | Format results for humans and machines | `src/output/terminal.js`, `src/output/json.js` |
| **utils** | Shared helpers | `src/utils/git.js`, `src/utils/semver.js`, `src/utils/time.js` |

### Layering rules

```
cli → policy → [lockfile, registry, baseline, approvals] → output
                                                            utils (leaf)
```

- **cli** depends on policy and output; contains no business logic.
- **policy** depends on lockfile, registry, baseline, approvals; owns all admit/block decisions.
- **lockfile, registry, baseline, approvals** are independent of each other.
- **output** depends only on data models; no business logic.
- **utils** is a leaf — any module may use it; it depends on nothing.

## Data flow: `trustlock check`

```
1. CLI parses args (--enforce, --json, --dry-run, --lockfile, --no-cache)
2. Policy engine loads:
   a. PolicyConfig from .trustlockrc.json
   b. Baseline from .trustlock/baseline.json
   c. Approvals from .trustlock/approvals.json
   d. Current lockfile via lockfile parser
3. Compute delta: current lockfile vs baseline
4. If no changes → "No dependency changes" → exit 0
5. For each changed/added dependency:
   a. Fetch registry metadata concurrently (cache-first unless --no-cache)
   b. Evaluate all applicable policy rules
   c. Check for valid (non-expired, scope-matching) approvals
   d. Produce CheckResult (admitted | admitted_with_approval | blocked)
6. Format output (terminal or JSON)
7. If all admitted and not --dry-run and not --enforce:
   a. Advance baseline with newly admitted packages
   b. git add .trustlock/baseline.json (auto-staged)
8. Exit: 0 (advisory or all-pass) | 1 (enforce + any block) | 2 (fatal error)
```

## Data flow: `trustlock init`

```
1. Detect lockfile (package-lock.json). Fail if none found (exit 2).
2. Fail if .trustlock/ already exists (D6, exit 2).
3. Validate lockfile version (unless --no-baseline). Exit 2 on unknown version (Q1).
4. Write .trustlockrc.json with defaults (or --strict thresholds).
5. Create .trustlock/ directory scaffold:
   a. .trustlock/approvals.json — empty array
   b. .trustlock/.cache/ — cache directory
   c. .trustlock/.gitignore — ignores .cache/ (D8)
6. If --no-baseline: print scaffold notice, exit 0.
7. Parse lockfile → ResolvedDependency[]
8. For each dependency: fetch provenance attestations from registry.
9. Write .trustlock/baseline.json (git-staged automatically).
10. Print summary.
```

## Data flow: `trustlock approve`

```
1. Parse <pkg>@<ver> positional argument.
2. Validate --override: must be non-empty, all valid rule names (D9).
3. Load approval config (require_reason, max_expiry_days) from .trustlockrc.json.
4. Validate --expires duration: must not exceed max_expiry_days.
5. Validate --reason: required when require_reason is true.
6. Resolve approver identity: --as flag or git config user.name (D7).
7. Parse lockfile and verify package@version exists.
8. Append approval entry to .trustlock/approvals.json (atomic write).
9. Print confirmation with expiry timestamp.
```

## Data formats

### `.trustlockrc.json` (PolicyConfig)

```json
{
  "cooldown_hours": 72,
  "pinning": { "required": false },
  "scripts": { "allowlist": [] },
  "sources": { "allowed": ["registry"] },
  "provenance": { "required_for": [] },
  "transitive": { "max_new": 5 },
  "require_reason": true,
  "max_expiry_days": 30
}
```

### `.trustlock/baseline.json`

```json
{
  "lockfile_hash": "<sha256 of package-lock.json>",
  "packages": {
    "lodash": {
      "version": "4.17.21",
      "provenanceStatus": "verified"
    }
  }
}
```

### `.trustlock/approvals.json`

```json
[
  {
    "package": "new-hotness",
    "version": "1.0.0",
    "overrides": ["cooldown"],
    "reason": "Reviewed by security team",
    "approver": "Jane Smith",
    "approved_at": "2026-04-09T10:00:00.000Z",
    "expires_at": "2026-05-09T10:00:00.000Z"
  }
]
```

## Lockfile parser architecture

The lockfile module uses a router pattern (ADR-004):

1. `src/lockfile/parser.js` — detects format by filename and internal schema markers, delegates to format-specific parser.
2. `src/lockfile/npm.js` — handles npm lockfile v1, v2, v3. Returns `ResolvedDependency[]`.
3. `src/lockfile/models.js` — defines the common `ResolvedDependency` model.

All parsers are pure functions: `(fileContent: string) => ResolvedDependency[]`. Unknown lockfile versions fail hard with exit 2 (Q1).

## Registry caching

Registry responses are cached in `.trustlock/.cache/` with a configurable TTL. The cache directory is gitignored (D8). Use `--no-cache` to bypass the cache. See [ADR-003](docs/adrs/ADR-003-registry-caching-and-offline-behavior.md) for the full caching strategy.
