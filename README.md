# dep-fence

A dependency admission controller for npm projects. dep-fence evaluates trust signals on dependency changes and makes binary admit/block decisions based on a declared policy — before those changes land in CI or are committed.

## How it works

dep-fence runs as a **Git pre-commit hook** (advisory mode) and a **CI check** (enforce mode):

- **Advisory (pre-commit):** warns on violations, exits 0, advances the trusted baseline when all packages are admitted.
- **Enforce (`--enforce`):** blocks on violations, exits 1, never advances the baseline.

Trust signals evaluated per-package:
- **Cooldown** — how long since the version was published to npm
- **Provenance** — whether the package has SLSA attestations
- **Pinning** — whether `package.json` uses exact versions
- **Install scripts** — whether the package runs install-time scripts
- **Sources** — whether the package comes from the npm registry, a git URL, a local path, or a URL
- **New dependencies** — first-time additions to the project
- **Transitive surprise** — unexpected jump in transitive dependency count

## Installation

```bash
npm install -g dep-fence
```

Requires Node.js >= 18.3.

## Quick start

### Workflow 1 — Onboarding a project

```bash
# 1. Initialize dep-fence in your project (requires package-lock.json)
dep-fence init

# 2. Install the Git pre-commit hook
dep-fence install-hook

# 3. Optionally review your current dependency posture
dep-fence audit
```

After `init`, dep-fence creates:
- `.depfencerc.json` — policy configuration
- `.dep-fence/baseline.json` — trusted dependency snapshot
- `.dep-fence/approvals.json` — approval records
- `.dep-fence/.cache/` — registry cache (gitignored)

Commit `.depfencerc.json` and `.dep-fence/baseline.json` to your repository.

### Workflow 2 — Check and admit a dependency update

```bash
# Run dep install as normal
npm install lodash@4.17.21

# dep-fence check runs automatically via the pre-commit hook.
# To run it manually:
dep-fence check

# Output when all packages are admitted:
# ✔ lodash@4.17.21 — admitted
```

When all packages pass, `dep-fence check` advances the baseline automatically (advisory mode only) and exits 0.

### Workflow 3 — Handle a blocked dependency

```bash
# A new package fails the cooldown rule:
dep-fence check
# ✖ new-hotness@1.0.0 — blocked
#   exposure:cooldown  Published 2h ago (policy requires 72h)
#   Run to approve: dep-fence approve new-hotness@1.0.0 --override cooldown --reason "..." --expires 7d

# Approve the override, then re-check:
dep-fence approve new-hotness@1.0.0 \
  --override cooldown \
  --reason "Needed for feature X; verified safe by team review" \
  --expires 7d

dep-fence check
# ✔ new-hotness@1.0.0 — admitted with approval
```

## Commands

| Command | Description |
|---|---|
| `dep-fence init` | Initialize dep-fence in the current project |
| `dep-fence check` | Evaluate dependency changes against policy |
| `dep-fence approve <pkg>@<ver>` | Approve a blocked package |
| `dep-fence audit` | Scan the full dependency tree for trust posture |
| `dep-fence clean-approvals` | Remove expired approval entries |
| `dep-fence install-hook` | Install the Git pre-commit hook |

## Documentation

- [USAGE.md](USAGE.md) — Full command reference, all flags, exit codes, error messages
- [POLICY-REFERENCE.md](POLICY-REFERENCE.md) — Every `.depfencerc.json` option
- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions and module map
- [examples/](examples/) — Config and CI workflow examples

## CI integration

Add dep-fence to your CI pipeline:

```yaml
# GitHub Actions — see examples/ci/github-actions.yml
- run: npx dep-fence check --enforce
```

See [`examples/ci/`](examples/ci/) for GitHub Actions, Lefthook, and Husky configurations.

## License

MIT
