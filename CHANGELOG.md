# Changelog

## [0.1.0] — 2026-04-09

Initial release of dep-fence — a dependency admission controller for npm projects.

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
- `dep-fence init`: initialize dep-fence in a project — creates `.depfencerc.json`, baseline, approvals store, cache directory, and `.gitignore`; supports `--strict` and `--no-baseline`
- `dep-fence check`: evaluate dependency delta against policy; advisory (exit 0) and enforce (`--enforce`, exit 1) modes; supports `--json`, `--dry-run`, `--lockfile`, `--no-cache`
- `dep-fence approve`: write a scoped, time-limited approval for a blocked package; supports `--override`, `--reason`, `--expires`, `--as`
- `dep-fence audit`: scan the full dependency tree for trust posture; prints provenance coverage, install-script packages, source breakdown, age distribution
- `dep-fence clean-approvals`: remove expired approval entries from `.dep-fence/approvals.json`
- `dep-fence install-hook`: install `dep-fence check` as a Git pre-commit hook; supports `--force`

**Lockfile support**
- npm lockfile v1, v2, v3 (`package-lock.json`)
- Format detection and parser router with hard-fail on unknown versions (Q1)

**Registry integration**
- npm registry metadata fetch (`https://registry.npmjs.org/<pkg>/<ver>`)
- npm provenance attestation fetch (`https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`)
- File-based cache with configurable TTL; gitignored (D8)
- Graceful degradation when registry is unreachable (offline operation)

**Baseline management**
- Baseline create and read from `.dep-fence/baseline.json`
- Delta computation (added, changed, removed packages)
- Auto-stage baseline on admission: `git add .dep-fence/baseline.json` (ADR-002)
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
- `POLICY-REFERENCE.md`: complete `.depfencerc.json` field reference
- `ARCHITECTURE.md`: module map, layering rules, data flows, data formats
- `examples/configs/production.depfencerc.json`: strict production policy
- `examples/configs/relaxed.depfencerc.json`: permissive greenfield policy with annotations
- `examples/ci/github-actions.yml`: GitHub Actions integration
- `examples/ci/lefthook.yml`: Lefthook integration
- `examples/ci/husky/.husky/pre-commit`: Husky pre-commit hook

### Known issues

- **BUG-001:** `dep-fence check` generates approval commands using full rule IDs (e.g. `--override 'execution:scripts'`) while `dep-fence approve` only accepts short rule names (e.g. `--override scripts`). Copy-pasting the generated command produces `Error: 'execution:scripts' is not a valid rule name.` Workaround: replace the category prefix manually (e.g. `execution:scripts` → `scripts`, `exposure:cooldown` → `cooldown`, `trust:provenance` → `provenance`). Fix targeted for v0.1.1.
