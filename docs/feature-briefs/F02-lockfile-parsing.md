# Feature: F02 Lockfile Parsing (npm)

## Summary
Parse npm lockfiles (v1, v2, v3) into a common `ResolvedDependency` model. Auto-detect format and version. Fail hard on unrecognized versions.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Data-layer module — pure functions with no user interaction, tested via unit tests against fixture lockfiles
- Target Sprint: 1
- Sprint Rationale: Foundational data layer — policy engine and baseline both depend on the parsed dependency model

## Description
This feature implements the lockfile parsing module per ADR-004. A router (`parser.js`) detects the lockfile format by filename and schema version, then delegates to `npm.js` which handles v1, v2, and v3 internally. All parsers return `ResolvedDependency[]` conforming to the common model defined in `models.js`.

The common model captures: name, version, resolved URL, integrity hash, isDev flag, hasInstallScripts (null when unavailable in v1/v2), source type classification (registry/git/file/url), and directDependency status.

Unknown lockfile versions trigger exit 2 with a clear error message (Q1 resolution: fail hard, no best-effort).

## User-Facing Behavior
Not directly user-facing. Called internally by `init`, `check`, `audit`, and `approve` (for package validation).

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. npm lockfile v1 — uses nested `dependencies` tree structure; must flatten correctly
2. npm lockfile v2 — has both `packages` map and backward-compat `dependencies`; must prefer `packages`
3. npm lockfile v3 — `packages` only, includes `hasInstallScripts` field
4. Unknown lockfile version (e.g., v4) — must exit 2 with message "Unsupported npm lockfile version X"
5. Scoped packages (`@scope/name`) — key format differs between v1 (`node_modules/@scope/name`) and v3 (`node_modules/@scope/name`)
6. Git-resolved dependencies — `resolved` URL starts with `git+` or `github:`; source type = "git"
7. File-resolved dependencies — `resolved` URL starts with `file:`; source type = "file"
8. Packages with no `resolved` field (rare but possible in v1) — must handle gracefully
9. Empty lockfile (no dependencies) — must return empty array, not crash
10. Lockfile with only devDependencies — `isDev` flag must be correctly set by cross-referencing package.json

## Acceptance Criteria
- [ ] `parseLockfile()` correctly parses npm lockfile v1, v2, and v3 fixture files into `ResolvedDependency[]`
- [ ] `detectFormat()` returns `{ format: "npm", version: N }` for valid lockfiles
- [ ] Unknown lockfile version causes process exit with code 2 and a descriptive error
- [ ] `hasInstallScripts` is populated from v3 lockfiles and set to `null` for v1/v2
- [ ] Source type correctly classified as "registry", "git", "file", or "url" based on `resolved` field
- [ ] `directDependency` flag correctly set by cross-referencing package.json `dependencies` and `devDependencies`
- [ ] Scoped packages parsed correctly across all three lockfile versions
- [ ] Unit tests cover all three versions with fixture lockfiles including edge cases

## Dependencies
- F01 (shared utilities)

## Layering
- Single layer: lockfile parser (leaf module, no downstream dependencies)

## Module Scope
- lockfile

## Complexity Assessment
- Modules affected: lockfile
- New patterns introduced: yes — router/parser pattern per ADR-004
- Architecture review needed: no (covered by ADR-004)
- Design review needed: no

## PM Assumptions (if any)
- Fixture lockfiles will be hand-crafted to cover v1, v2, v3, scoped packages, git deps, and file deps. Real-world lockfiles are too large and noisy for test fixtures.
- `hasInstallScripts: null` signals to the policy engine that it must fetch this data from the registry for v1/v2 lockfiles.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-dep-fence-full-spec.md
- Sprint: 1
