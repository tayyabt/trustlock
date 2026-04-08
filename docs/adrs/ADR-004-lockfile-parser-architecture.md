# ADR-004: Lockfile Parser Architecture

## Status
Accepted

## Supersedes
N/A

## Context
dep-fence must parse npm lockfiles (v1, v2, v3 in v0.1) and later pnpm and yarn lockfiles (v0.2). Each format has a significantly different structure. The tool needs a common dependency model that normalizes across formats. Unknown lockfile format versions must fail hard (exit 2) per Q1 resolution.

## Options Considered

### Option 1: Router pattern with format-specific parsers
- Description: A `parser.js` module auto-detects the lockfile format (by filename and internal schema markers), then delegates to a format-specific parser (`npm.js`, later `pnpm.js`, `yarn.js`). Each parser handles its own format versions internally and returns `ResolvedDependency[]`. The router owns format detection; parsers own format parsing.
- Pros: Clean separation. Each parser is self-contained and testable in isolation. New ecosystems are new files. Format-specific quirks don't leak across parsers.
- Cons: Some minor duplication in how parsers normalize to the common model.

### Option 2: Single parser with format adapters
- Description: One unified parser with pluggable adapters for each format. Shared normalization logic.
- Pros: Less duplication in normalization.
- Cons: Adapter abstraction leaks format differences. Shared code becomes a coordination bottleneck as formats diverge.

## Decision
Option 1: Router with format-specific parsers.

**Format detection logic:**
1. Filename: `package-lock.json` → npm, `pnpm-lock.yaml` → pnpm (v0.2), `yarn.lock` → yarn (v0.2)
2. For npm: read `lockfileVersion` field. 1 → v1 parser, 2 → v2 parser, 3 → v3 parser, other → exit 2 (fail hard)
3. Auto-detection precedence: `package-lock.json` > `pnpm-lock.yaml` > `yarn.lock` (npm first since it's the only v0.1 format)
4. `--lockfile <path>` overrides auto-detection

**Common model contract:** Every parser must return `ResolvedDependency[]` with all fields populated. If a lockfile format doesn't provide a field (e.g., `hasInstallScripts` in npm v1/v2), the parser sets it to `null` and the policy engine fetches the missing data from the registry.

## Consequences
- Implementation: `src/lockfile/parser.js` (router), `src/lockfile/npm.js` (handles v1/v2/v3), `src/lockfile/models.js` (common model definition/validation). Each parser is a pure function: `(fileContent: string) => ResolvedDependency[]`.
- Testing: Each parser tested against fixture lockfiles. Fixtures in `test/fixtures/lockfiles/` cover v1, v2, v3, edge cases (scoped packages, git deps, file deps).
- Operations: Unknown lockfile version fails with a clear error message: "Unsupported npm lockfile version X. dep-fence supports v1, v2, v3."
- Future: v0.2 adds `pnpm.js` and `yarn.js` as new files. Router gains new detection branches. Common model unchanged.

## Deployment Architecture
- Deployment method: N/A (internal architecture)
- Infrastructure needed: None
- Environment variables: None
- CI/CD considerations: None

## Module Structure
- `src/lockfile/parser.js` — format detection and router
- `src/lockfile/npm.js` — npm lockfile v1/v2/v3 parser
- `src/lockfile/models.js` — ResolvedDependency model definition
- `test/fixtures/lockfiles/` — fixture lockfiles for all supported versions

## Metadata
- Agent: architect
- Date: 2026-04-08
- Feature: lockfile-parsing
