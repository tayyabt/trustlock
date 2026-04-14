# Feature: [F17] Cross-Project Audit

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Adds `trustlock audit --compare <dir1> <dir2> ...` to read lockfiles from multiple project directories and produce a unified report of version drift, provenance inconsistency, and allowlist inconsistency. Lockfile-read only — no policy evaluation, no baseline modification, always exits 0 (D6). Standalone; no dependency on F15 or F16.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: `audit --compare` is a passive, informational command with no side effects and no blocking behavior. It is always exit 0. No recovery or approval flow is possible from this command's output — it informs, it does not act. The tech lead who uses this command can read the output and decide to investigate individual project baselines separately. No unique user-facing flow warrants a standalone workflow doc.
- Target Sprint: 4
- Sprint Rationale: Standalone feature with no dependency on F15 or F16. Can be the first or last Sprint 4 item. It depends on lockfile parsers being available for all formats the user might pass — npm (F02), pnpm/yarn (F11), Python (F16) — but does not require those to ship first since it reads lockfiles directly. In practice, F16 ships in parallel in Sprint 4; cross-audit should be sequenced last to benefit from all available parsers.

## Description

`src/cli/commands/cross-audit.js` (or `audit.js` extended with `--compare`) reads lockfiles from each supplied directory's `projectRoot`. It uses existing lockfile parsers to produce a `ResolvedDependency[]` per directory, then reports:

1. **Version drift:** packages present in multiple projects at different versions.
2. **Provenance inconsistency:** same package name at different versions — some entries with SLSA provenance (or PyPI attestations), others without.
3. **Allowlist inconsistency:** packages allowlisted in one project's `scripts.allowlist` (`.trustlockrc.json`) but absent from another's.

The command does NOT read or evaluate per-directory policy for admission purposes (D6). It reads `.trustlockrc.json` only to extract the `scripts.allowlist` field for the allowlist comparison section. No baseline modification. No rule evaluation. Exit code is always 0.

## User-Facing Behavior

- `trustlock audit --compare packages/frontend packages/backend packages/api` — produces a unified multi-project report.
- Report sections: version drift, provenance inconsistency, allowlist inconsistency.
- If no inconsistencies found in a section: "No version drift detected. ✓" (or equivalent per-section confirmation).
- Exit code always 0.
- Output goes to stdout; same styling conventions as `trustlock audit` single-project output.

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. Only one directory supplied — error: `--compare requires at least two directories.`
2. Directory not found — error exit with `Directory not found: <path>.`
3. Directory has no lockfile — error exit or skip with warning; verify at implementation time (skip with warning is more useful).
4. All projects at same versions — version drift section shows "No version drift detected. ✓".
5. All projects have same allowlists — allowlist section shows "No allowlist inconsistencies. ✓".
6. Package present in only one project (not shared) — no version drift reported for that package (drift requires presence in 2+ projects).
7. Mix of npm and pnpm lockfiles across directories — format detection runs per directory; both parsers used.
8. `source.path` entries in uv.lock — excluded per C12; not included in cross-audit comparisons.
9. Provenance comparison: same package name at same version in two projects — no inconsistency (same version, same provenance state).
10. Directory supplied as absolute path — resolved as-is; directory supplied as relative path — resolved relative to cwd.

## Acceptance Criteria
- [ ] `trustlock audit --compare <dir1> <dir2>` reads lockfiles from each directory and outputs version drift, provenance inconsistency, and allowlist inconsistency sections.
- [ ] No policy evaluation — does not load or apply per-directory `.trustlockrc.json` admission rules (except `scripts.allowlist` for the allowlist comparison section).
- [ ] No baseline modification.
- [ ] Exit code always 0 (D6).
- [ ] Fewer than two directories: error exit with clear message.
- [ ] Directory without a lockfile: skip with warning (or error — document the chosen behavior in acceptance test).
- [ ] Multi-format lockfiles (npm + pnpm): format detection runs per directory; each parser used.
- [ ] `source.path` entries in uv.lock excluded from comparisons (C12).
- [ ] Clean sections show confirmation ("No version drift detected. ✓").

## Dependencies
- F04 (baseline — read only, for provenance data in baseline if used for comparison)
- F02 (lockfile parser — npm format)
- F11 (lockfile parsers — pnpm/yarn; expected to be available by Sprint 4)
- F16 (lockfile parsers — Python formats; parallel in Sprint 4; cross-audit benefits from but does not strictly depend on)

## Layering
- `src/cli/commands/cross-audit.js` (new, or `audit.js` extended) — reads lockfiles via existing parsers, produces unified report; no policy engine involvement

## Module Scope
- cli

## Complexity Assessment
- Modules affected: cli/commands/cross-audit.js (new), cli/args.js (--compare flag on audit)
- New patterns introduced: no — reuses existing lockfile parsers and output formatting conventions
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- `audit --compare` reads baselines for provenance data if available in each directory, but does NOT advance or modify them.
- Allowlist comparison reads `.trustlockrc.json` from each directory — specifically the `scripts.allowlist` field only. No full policy load.
- If F16 (Python parsers) has not shipped yet, cross-audit gracefully skips Python lockfiles with a warning. This is a sequencing assumption, not a hard dependency.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §4.5, §5.3
- Sprint: 4
