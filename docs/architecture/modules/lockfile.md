# Module Architecture: Lockfile

## Purpose
Parse lockfiles into the common `ResolvedDependency` model. Detect lockfile format and version. Fail hard on unsupported formats.

## Responsibilities
- Auto-detect lockfile by filename (package-lock.json, later pnpm-lock.yaml, yarn.lock)
- Detect lockfile schema version (npm v1/v2/v3)
- Parse lockfile content into `ResolvedDependency[]`
- Classify dependency source type (registry, git, file, url)
- Determine direct vs. transitive dependency status
- Fail hard (exit 2) on unrecognized lockfile format versions

## Entry Points
- `parser.js:parseLockfile(lockfilePath)` → `ResolvedDependency[]`
- `parser.js:detectFormat(lockfilePath)` → `{ format: "npm", version: 3 }`
- `models.js:validateDependency(dep)` → validated `ResolvedDependency`

## Dependencies
- Depends on: nothing (leaf module — reads files only)
- Used by: policy (for current dependency state), baseline (for init)

## Allowed Interactions
- Read lockfile from filesystem
- Read package.json for direct dependency detection

## Forbidden Interactions
- Must NOT fetch from registry (that's registry module's job)
- Must NOT evaluate policy rules
- Must NOT write any files

## Notes
- npm.js handles v1, v2, v3 internally with version-specific parsing logic
- v1 uses `dependencies` tree, v2 uses `packages` map with backward-compat `dependencies`, v3 uses `packages` map only
- `hasInstallScripts` is available in v3 lockfiles but not v1/v2 — set to `null` when unavailable, policy engine fetches from registry
- All parsers are pure functions: `(content: string) → ResolvedDependency[]`

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: lockfile
