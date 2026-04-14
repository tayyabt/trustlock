# Feature: [F11] Lockfile Parsers: pnpm + yarn

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Extends trustlock to support pnpm-lock.yaml (v5/v6/v9) and yarn.lock (classic v1 and berry v2+). Both parsers are hand-rolled with no external libraries per ADR-001. All trust rules apply identically to pnpm and yarn dependencies; no dev/prod distinction in blocking logic (D2).

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Parser changes are invisible to the user — the same commands and output structure apply. No new user-facing flow is introduced. Existing check-admit and blocked-approve workflows are unchanged in their interaction model.
- Target Sprint: 3
- Sprint Rationale: pnpm and yarn support are core v0.2 deliverables. Depends on F09 (paths.js for projectRoot/gitRoot at startup); otherwise independent of F10 and F12. Can proceed in parallel with output redesign.

## Description

pnpm-lock.yaml is YAML-format; the parser is a purpose-built line-by-line YAML reader scoped to the constructs pnpm actually emits (block mappings, block sequences, quoted strings, multi-level indentation). It handles key-path decoding for scoped packages across all three format versions. In pnpm monorepos, `pnpm-lock.yaml` lives at gitRoot; workspace filtering uses `importers` section keys matched against `projectRoot` (C10).

yarn.lock (classic v1 and berry v2+) uses a custom format — not YAML, not JSON. The parser reads multi-specifier header lines, resolves all specifiers to a single entry, and handles the different hash/checksum field names across versions. `languageName: unknown` workspace packages are excluded at the parser level, not in the policy engine. Dev/prod classification requires reading `package.json` (C4) since yarn.lock does not encode this.

Both parsers slot into the existing ADR-004 format-detection router. Format detection examines the lockfile name and, for pnpm, the `lockfileVersion` field; for yarn, the presence of `__metadata` distinguishes berry from classic.

## User-Facing Behavior

- `trustlock init` in a pnpm project: detects `pnpm-lock.yaml`, parses all non-workspace packages, builds baseline.
- `trustlock init` in a yarn project: detects `yarn.lock`, cross-references `package.json` for dev/prod classification.
- `trustlock check`, `approve`, `audit` work identically for pnpm and yarn projects as for npm projects.
- pnpm monorepo: running from a workspace sub-package filters to that importer's dependencies only.
- All trust rules (cooldown, provenance, scripts, publisher-change, etc.) apply to pnpm and yarn packages identically (D2).
- Unsupported pnpm lockfile versions exit 2 (consistent with existing behavior for unknown npm lockfile versions).

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. pnpm v5/v6 scoped package key `/@scope/name/version` — must decode name and version from key path.
2. pnpm v9 explicit `name:` and `version:` fields — must read fields, not key path.
3. pnpm `hasBin: true` or `requiresBuild: true` — maps to `hasInstallScripts: true`.
4. pnpm workspace: `importers` key is a relative path from gitRoot; must match against `projectRoot`; no match means no packages admitted (error or empty result).
5. yarn classic multi-specifier header line (`"pkg@^1.0", "pkg@1.x.x":`) — parse once, register under all specifiers.
6. yarn berry `languageName: unknown` — excluded at parser; no policy evaluation for workspace packages.
7. yarn berry `checksum:` format differs from npm `integrity` — stored as-is; used for identity, not verification.
8. yarn berry `dependenciesMeta[pkg].built: true` absent in lockfile — fall back to registry API per spec; must respect ADR-003 cache-first.
9. yarn dev/prod classification: package not in `package.json` directly (transitive) — classified same type as closest direct ancestor.
10. `--lockfile` flag pointing to a pnpm or yarn lockfile from an npm project directory — must honour the lockfile flag and parse accordingly.

## Acceptance Criteria
- [ ] pnpm v5, v6, v9 fixtures: name, version, integrity extracted correctly for plain and scoped packages.
- [ ] pnpm workspace: running from `packages/backend/` filters to that importer's entries only (C10); no `package.json` workspaces field read.
- [ ] yarn classic: multi-specifier header produces one resolved entry; all specifiers point to it.
- [ ] yarn berry: `languageName: unknown` packages absent from admission results.
- [ ] yarn dev/prod classification reads `package.json`; transitive packages inherit from closest direct ancestor (C4).
- [ ] yarn berry `dependenciesMeta[pkg].built` absent: falls back to registry API (ADR-003 cache-first).
- [ ] Format detection router extends cleanly: existing npm path unchanged.
- [ ] Unknown pnpm lockfile version exits 2 (consistent with existing behavior).
- [ ] Dev dependencies subject to all admission rules identically (D2).

## Dependencies
- F09 (paths.js — projectRoot/gitRoot at startup)
- F02 (lockfile parser architecture — ADR-004 format-detection router to extend)
- F03 (registry client — fallback for yarn install script detection)

## Layering
- `src/lockfile/pnpm.js` (new) + `src/lockfile/yarn.js` (new) → format-detection router in `src/lockfile/index.js` (or equivalent) updated to branch on filename

## Module Scope
- lockfile

## Complexity Assessment
- Modules affected: lockfile/pnpm.js (new), lockfile/yarn.js (new), lockfile/index.js (router update)
- New patterns introduced: yes — purpose-built YAML line-parser (pnpm), custom format parser with multi-specifier resolution (yarn)
- Architecture review needed: no (ADR-001 and ADR-004 cover this)
- Design review needed: no

## PM Assumptions (if any)
- pnpm workspace filtering is importer-key matching only (C10); workspace auto-detection from `package.json` workspaces field is deferred to v0.3 (D7).
- `requiresBuild` in pnpm maps to `hasInstallScripts` — this is the correct equivalence per spec §3.2.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §3.2, §5.1
- Sprint: 3
