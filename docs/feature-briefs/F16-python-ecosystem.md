# Feature: [F16] Python Ecosystem: Parsers + PyPI Adapter

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Extends trustlock to Python projects by adding parsers for requirements.txt (pinned pip), pip-compile annotated requirements, and uv.lock (TOML-format). Adds `src/registry/pypi.js` as a new registry adapter using the PyPI JSON API. `source.path` entries in uv.lock are excluded entirely from checks (D3, C12). PyPI attestation URL is a named constant, not a string literal (C7).

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Python ecosystem parsers are invisible to the user — the same trustlock commands apply. `trustlock init` in a Python project is a new scenario, but the interaction model is identical to the npm init flow (already documented in init-onboarding.md). No new interactive pattern or recovery flow unique to Python ecosystem support.
- Target Sprint: 4
- Sprint Rationale: v0.3 work. Parallel with F15 once the `registry/client.js` interface is stable. Independent of policy inheritance. Does not depend on F15 or F17.

## Description

`src/lockfile/requirements.js` parses pip requirements files with exact version pins (`package==1.2.3`). Package names are normalised per PEP 508. Hash lines (`--hash=sha256:...`) are stored as the integrity equivalent. URL requirements are classified as `source: url`. The `# via` annotations from pip-compile output feed the `delta:transitive-surprise` rule with ruleId `transitive` in SARIF (D10). Unpinned requirements (`>=`, `<=`, `~=`, etc.) are flagged under the `pinning` rule.

`src/lockfile/uv.js` is a purpose-built line-by-line TOML parser scoped to the `[[package]]`, inline key-value pairs, inline tables, and arrays that uv.lock actually emits. `source.path` entries are marked `source: file` and skipped entirely by the policy engine (C12). `source.registry` and `source.git` are handled as supply-chain sources.

`src/registry/pypi.js` fetches `https://pypi.org/pypi/{name}/{version}/json`. Publisher identity uses `urls[].uploader` (falling back to `info.maintainer_email`). Publish date uses the earliest `upload_time_iso_8601` across release files. PyPI attestations are checked via the PyPI Simple API with `application/vnd.pypi.simple.v1+json` Accept header — the endpoint is defined as a named constant, not a string literal (C7). Cache key namespace is `pypi/{name}/{version}` to avoid collision with npm cache entries.

## User-Facing Behavior

- `trustlock init` in a Python project with `requirements.txt` or `uv.lock`: detects lockfile, fetches PyPI metadata for all packages, builds baseline.
- All trust rules (cooldown, provenance equivalence via PyPI attestations, pinning, publisher-change) apply to Python packages.
- `uv.lock` `source.path` entries produce no output — excluded entirely from checks and audit (D3, C12).
- Unpinned requirements.txt entries (using `>=`, etc.) are flagged under the `pinning` rule.
- `pip-compile` `# via` annotation enriches `message.text` in SARIF output for transitive additions; ruleId remains `transitive` (D10).
- PyPI provenance adoption is low; audit output applies same "regression watch" framing with an ecosystem note (per §4.3 and spec §2.4).
- Dev dependencies subject to all admission rules identically (D2).

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. `requirements.txt` with URL requirement (`package @ https://...`) — classified as `source: url`, admitted or blocked per sources rule.
2. PEP 508 name normalization: `Pillow` and `pillow` are the same package; case-insensitive, hyphens/underscores equivalent.
3. pip-compile `# via` annotation — parsed; enriches SARIF `message.text`; no new ruleId (D10).
4. uv.lock `source.path` entry — marked `source: file`; excluded from admission checks and audit output (C12).
5. uv.lock `source.git` entry — treated as supply-chain source; subject to rules.
6. PyPI `urls[].uploader` absent — fall back to `info.maintainer_email`; if also absent, `null`.
7. PyPI attestation endpoint: named constant in pypi.js; no hardcoded string literal in fetch calls (C7).
8. PyPI cache key collision with npm: namespace must be `pypi/{name}/{version}`; verified in test.
9. Multiple `upload_time_iso_8601` values across release files — use earliest as the authoritative publish date.
10. Unpinned requirement with `>=` — flagged under `pinning` rule; same behavior as npm version ranges.

## Acceptance Criteria
- [ ] requirements.txt: exact pins, ranges (flagged under `pinning`), URL requirements (`source: url`), PEP 508 name normalization.
- [ ] pip-compile `# via` annotation parsed; transitive attribution in SARIF `message.text`; ruleId = `transitive` (D10).
- [ ] uv.lock: registry and git sources handled; `source.path` entries excluded from all checks and audit output (C12).
- [ ] `pypi.js` `urls[].uploader` extracted as publisher; falls back to `info.maintainer_email`.
- [ ] Publish date is earliest `upload_time_iso_8601` across release files.
- [ ] PyPI attestation endpoint defined as a named constant; grep check confirms no hardcoded URL string literal in fetch call (C7).
- [ ] PyPI cache key namespace `pypi/{name}/{version}`; no collision with npm cache entries.
- [ ] Format detection router extends cleanly: existing npm/pnpm/yarn paths unchanged.
- [ ] Dev dependencies subject to all admission rules identically (D2).

## Dependencies
- F09 (paths.js — projectRoot for lockfile detection)
- F03 (registry client architecture — pypi.js follows same adapter pattern)
- F02 (lockfile parser architecture — ADR-004 router to extend for Python formats)

## Layering
- `src/lockfile/requirements.js` (new) + `src/lockfile/uv.js` (new) + `src/registry/pypi.js` (new) → format detection router updated to branch on `.txt`, `uv.lock` filenames

## Module Scope
- lockfile, registry

## Complexity Assessment
- Modules affected: lockfile/requirements.js (new), lockfile/uv.js (new), registry/pypi.js (new), lockfile router (updated), registry router (if present)
- New patterns introduced: yes — purpose-built TOML line-parser for uv.lock; new registry adapter pattern for PyPI; PEP 508 name normalization
- Architecture review needed: no (spec review covers feasibility)
- Design review needed: no

## PM Assumptions (if any)
- PyPI attestation endpoint discovery must happen at implementation time per spec §4.3. PM cannot specify the endpoint — it is an implementation-time verification step.
- `uv source.path` exclusion is absolute (C12) — not configurable by policy.
- Cargo/crates.io is deferred to v0.4. Only pip/pip-compile/uv lockfiles are in scope for v0.3.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §4.2–4.3, §5.3, §6.2
- Sprint: 4
