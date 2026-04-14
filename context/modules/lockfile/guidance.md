# Module Guidance: Lockfile

## Responsibilities
- Auto-detect lockfile format and version
- Parse lockfile content into `ResolvedDependency[]`
- Classify dependency source types
- Fail hard on unrecognized format versions

## Stable Rules
- Parsers are pure functions: `(content: string) → ResolvedDependency[]`
- Each format version is handled explicitly — no fallthrough to "closest" version
- Unknown `lockfileVersion` → throw error (exit 2)
- Source classification is deterministic based on `resolved` URL patterns

## Usage Expectations
- Called once per `check`, `init`, or `audit` invocation
- Receives file path, reads and parses the file, returns the common model
- Missing fields (e.g., `hasInstallScripts` in npm v1/v2) are set to `null` — caller fetches from registry

## Router Implementation Pattern
- `detectFormat()` reads the file once and calls `_detectFromParsed(parsed, filename)` internally.
- `parseLockfile()` also reads the file once and calls `_detectFromParsed()` on the same parsed object — avoids double file read.
- `_detectFromParsed()` is a private helper that owns all version-check logic and exit-2 behavior. Do not duplicate this logic in `parseLockfile()`.

## Integration Guidance
- Policy engine receives `ResolvedDependency[]` and uses it alongside baseline for delta computation
- Baseline module receives `ResolvedDependency[]` during init to build the initial baseline
- To add a new lockfile format (v0.2): create a new parser file, add detection logic to `parser.js`

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: lockfile
