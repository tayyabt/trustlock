# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-04-14

### Fixed

- Correct GitHub repository URL in `package.json` (`tayyabt` → was incorrectly `TayyabTariq`)
- Add `--help` / `-h` and `--version` / `-v` flags to CLI
- Commit demo GIF so README image renders on npm and GitHub

## [0.1.0] - 2026-04-14

### Added

- Core CLI with 7 commands: `init`, `check`, `approve`, `audit`, `audit --compare`, `clean-approvals`, `install-hook`
- Policy engine with check layers: trust continuity, exposure control, execution surface, dependency delta
- **Trust continuity** — provenance regression detection via npm attestations API; publisher identity change detection (forward-compat)
- **Exposure control** — cooldown enforcement (configurable, default 72h) and version pinning checks
- **Execution surface** — install script detection with configurable allowlist (22 verified packages pre-populated); source type restrictions (`registry`, `git`, `file`, `url`)
- **Dependency delta** — new dependency surfacing, version change tracking, transitive surprise detection
- Approval workflow with scoped rule overrides, expiry dates, and copy-pasteable approve commands in blocked output
- Policy file (`.trustlockrc.json`) with sensible defaults written by `trustlock init`
- Approvals file (`.trustlock/approvals.json`) committed to Git for full audit trail
- Trust baseline tracking (`.trustlock/baseline.json`) with automatic advancement on clean check
- `--profile` flag on `check`: `strict` (168h cooldown, provenance required) and `relaxed` (24h cooldown, no provenance block)
- `extends` key in `.trustlockrc.json` for org policy inheritance from a remote URL or local path, with floor enforcement (repos cannot relax org thresholds)
- npm `package-lock.json` parser (v1, v2, v3)
- pnpm `pnpm-lock.yaml` parser (v5, v6, v9)
- Yarn `yarn.lock` parser (classic v1 and berry v2/v3)
- Python `requirements.txt` parser (exact pins, URL requirements, pip-compile annotations, hash lines)
- Python `uv.lock` parser (hand-rolled TOML subset; registry, path, git source types)
- npm registry client with local file caching (1-hour TTL)
- PyPI registry adapter for Python ecosystem packages
- npm attestations API client for SLSA provenance verification
- Terminal reporter with colored, grouped output (BLOCKED / ADMITTED with approval / NEW PACKAGES / ADMITTED) and reviewer-grade explanations
- JSON reporter (`--json`) for CI integration (schema version 2)
- SARIF 2.1.0 reporter (`--sarif`) for GitHub Advanced Security integration
- Git pre-commit hook integration: raw hook, Husky, and Lefthook
- CI enforce mode (`--enforce` flag, exit code 1 on policy violations)
- Cross-project audit (`trustlock audit --compare <dir...>`): version drift, provenance inconsistency, allowlist inconsistency
- Monorepo root resolution via nearest `.trustlockrc.json` up the directory tree; `--project-dir` override flag
- Offline graceful degradation: network-dependent checks warn but do not block when the registry is unreachable
- Zero npm runtime dependencies
- `--trust-current` flag on `init` to baseline existing dependencies without retroactive findings

### Not Yet Planned

- Publisher identity change detection (forward-compat finding type exists; registry data not yet wired)
- SARIF suppression list for accepted findings
- Policy profiles as sharable named configs beyond the two built-in profiles
