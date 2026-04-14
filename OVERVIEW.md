# trustlock — Project Overview

## What it is

trustlock is a dependency admission controller for npm, pnpm, yarn, and Python projects. It evaluates trust signals on dependency changes and makes binary admit/block decisions based on a declared policy — before those changes land in CI or are committed to the repository.

## Why it exists

Most supply chain attacks exploit a narrow window: a malicious version is published, then pulled within hours before the community detects it. Standard dependency management (`npm install`, lockfile commits) offers no controls on *what* you're pulling in — only *that* you're pulling in a fixed version. trustlock fills that gap by requiring that each new or changed dependency pass explicit trust checks before it is admitted into the baseline.

trustlock enforces the same trust model across npm, pnpm, yarn, and Python (pip/uv) projects. Teams that mix ecosystems or maintain multiple lockfiles get a consistent policy and audit trail.

## How it works

trustlock tracks a **trusted baseline** — a snapshot of all known-good package versions. When the lockfile changes, trustlock computes the delta, fetches trust signals from the registry (npm or PyPI depending on ecosystem), runs policy rules, and produces an **admit** or **block** decision per package.

Trust signals evaluated per package:

| Signal | Rule name | What it checks |
|--------|-----------|----------------|
| Publication age | `cooldown` | How long since the version was published (default: 72h required) |
| SLSA attestations | `provenance` | Whether the package has signed provenance attestations |
| Version pinning | `pinning` | Whether the lockfile uses exact versions (not ranges) |
| Install scripts | `scripts` | Whether the package runs `preinstall`/`postinstall`/`install` hooks |
| Source type | `sources` | Whether the package comes from the registry, a git URL, a local path, or a URL |
| First-time addition | `new-dep` | Whether this is the first time this package appears in the project |
| Transitive bloat | `transitive` | Whether a single upgrade introduces an unexpectedly large transitive dependency count |
| Publisher change | `publisher-change` | Whether the package's publisher identity changed between versions |

**All-or-nothing baseline advance (D1):** If any package is blocked, the baseline does not advance for any package. Partial trust state is never written.

## Two operating modes

| Mode | How to invoke | Exit code on block | Advances baseline? |
|------|--------------|-------------------|-------------------|
| Advisory (pre-commit hook) | `trustlock check` | `0` — warns but allows commit | Yes, on full admission |
| Enforce (CI) | `trustlock check --enforce` | `1` — hard block | Never |

## The approval workflow

When a package is blocked, the operator approves the specific rule override with an audit trail:

```
trustlock approve new-hotness@1.0.0 \
  --override cooldown \
  --reason "Verified safe by team review" \
  --expires 7d
```

Approvals are scoped to specific rules, require a reason by default, and expire after a configurable duration. No wildcard approvals (D9).

## What gets committed

| File | Committed? | Purpose |
|------|-----------|---------|
| `.trustlockrc.json` | Yes | Policy configuration — the rules and thresholds |
| `.trustlock/baseline.json` | Yes | Trusted package snapshot — auto-staged on admission |
| `.trustlock/approvals.json` | Yes | Approval audit trail |
| `.trustlock/.cache/` | No (gitignored) | Registry response cache — performance optimization only |

## Policy profiles and inheritance

trustlock ships two built-in profiles:

| Profile | Effect |
|---------|--------|
| `strict` | 168h cooldown, provenance required for all packages |
| `relaxed` | 24h cooldown, no block on provenance regression or publisher change |

```bash
trustlock check --enforce --profile strict
```

Organizations can also define a shared policy URL and extend it per repo via the `extends` key in `.trustlockrc.json`. Repo configs can only tighten the org baseline — trustlock enforces a floor so repos cannot relax org-mandated thresholds.

## Key design constraints

- **Zero runtime dependencies (ADR-001):** trustlock uses only Node.js built-ins. A supply chain security tool should not itself be a supply chain risk.
- **Node.js >= 18.3:** Required for `node:util.parseArgs`.
- **Multi-ecosystem lockfile support:** `package-lock.json` (npm v1/v2/v3), `pnpm-lock.yaml` (v5/v6/v9), `yarn.lock` (classic and berry), `requirements.txt` (pip/pip-compile), and `uv.lock` are all supported.
- **No build step:** Source files are the distribution.

## Further reading

- [README.md](README.md) — Installation, quick start, and command overview
- [USAGE.md](USAGE.md) — Full command reference, all flags, exit codes, error messages
- [POLICY-REFERENCE.md](POLICY-REFERENCE.md) — Every `.trustlockrc.json` option
- [ARCHITECTURE.md](ARCHITECTURE.md) — Module map, data flows, and design decisions
- [docs/adrs/](docs/adrs/) — Architecture decision records
