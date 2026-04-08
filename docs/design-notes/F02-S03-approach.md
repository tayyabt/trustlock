# Design Note: F02-S03 — npm Lockfile Parser (v1, v2, v3)

## Summary

Implement the real npm lockfile parser in `src/lockfile/npm.js`, replacing the current stub. Handle v1 (nested `dependencies` tree), v2 (prefer `packages` over `dependencies`), and v3 (`packages` only with `hasInstallScripts`). Enrich the existing fixture lockfiles with real package entries and create the npm test file.

## Approach

**`src/lockfile/npm.js`** exports a single `parseNpm(lockfileContent, packageJsonContent)` function that:
1. Parses both JSON strings.
2. Reads `lockfileVersion` to dispatch to the correct internal function (`_parseV1`, `_parseV2V3`).
3. Builds a `directSet` and `devSet` by reading `dependencies` and `devDependencies` from package.json.
4. Returns `validateDependency()`-coerced `ResolvedDependency[]`.

**v1 parsing (`_parseV1`):** Recurse through the `dependencies` tree. Each entry at the top level is checked against `directSet`/`devSet`. Nested entries are transitive. Key is the package name (not `node_modules/`-prefixed). `hasInstallScripts` is `null`.

**v2/v3 parsing (`_parseV2V3`):** Prefer `packages` map if present (v2 always has it alongside `dependencies`; v3 has only `packages`). Skip the root entry (`""`). Key format is `node_modules/@scope/name` or `node_modules/name` — strip `node_modules/` prefix to get the package name. For v3, read `hasInstallScripts` from the entry. For v2 (when `packages` is used), `hasInstallScripts` is `null`.

**Source type classification (`_classifySource`):**
- `resolved` starts with `git+` or `github:` → `"git"`
- `resolved` starts with `file:` → `"file"`
- `resolved` starts with `https://registry.npmjs.org` or `http://registry.npmjs.org` → `"registry"`
- Any other non-null URL → `"url"`
- `resolved` is null/undefined → `"registry"` (safe default for rare v1 cases, integrity still present)

**Direct / dev detection:**
- `directDependency`: name is in `directSet` (union of package.json `dependencies` + `devDependencies`)
- `isDev`: name is in `devSet` (package.json `devDependencies`) AND NOT in `dependencies`

## Integration / Wiring Plan

`parser.js` already imports `parseNpm` from `./npm.js` and calls it at line 108. The stub returns `[]` today. Replacing the stub body completes the wiring — no changes to `parser.js` needed.

## Files Expected to Change

| File | Action |
|------|--------|
| `src/lockfile/npm.js` | Replace stub with full implementation |
| `test/lockfile/npm.test.js` | Create (new file) |
| `test/fixtures/lockfiles/npm-v1.json` | Enrich with real package entries |
| `test/fixtures/lockfiles/npm-v2.json` | Enrich with real package entries |
| `test/fixtures/lockfiles/npm-v3.json` | Enrich with real package entries |
| `test/fixtures/lockfiles/package.json` | Enrich with matching dependencies/devDependencies |

`parser.js`, `models.js` — no changes needed.

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|----|-------------|
| v1 fixture parses to `ResolvedDependency[]` with flattened nested deps | `npm.test.js` v1 unit test |
| v2 fixture prefers `packages` over `dependencies` | `npm.test.js` v2 unit test (v2 lockfile has conflicting `dependencies` entry to prove preference) |
| v3 fixture extracts `hasInstallScripts` | `npm.test.js` v3 unit test checks field is boolean |
| `hasInstallScripts` is `null` for v1/v2 | Checked in v1 and v2 unit tests |
| Source type classification (registry/git/file/url) | `npm.test.js` source-type tests |
| `directDependency` flag from package.json cross-ref | `npm.test.js` direct-dep tests |
| `isDev` flag from devDependencies cross-ref | `npm.test.js` isDev tests |
| Scoped packages across all versions | Fixtures include `@scope/pkg` entries |
| Git / file deps parsed correctly | Fixtures include `git+https://…` and `file:…` entries |
| No `resolved` field → `resolved: null` | v1 fixture has one entry without `resolved` |
| Empty lockfile returns `[]` | `npm.test.js` empty-lockfile test |
| Integration: `parseLockfile(v3.json, package.json)` | Integration test in `npm.test.js` |
| `node --test test/lockfile/npm.test.js` passes | Run as verification command |

## Test Strategy

- Unit tests per version in `test/lockfile/npm.test.js` using the enriched fixture files.
- One integration test calling `parseLockfile()` end-to-end with fixture paths.
- Edge cases: scoped packages, git deps, file deps, no-resolved, empty lockfile.
- v2 fixture includes a `dependencies` map with a different version to prove `packages` is preferred.

## Risks and Questions

- None: the model, router, and test infra all exist. This story completes the implementation.

## Verification Results

Command: `node --test test/lockfile/npm.test.js`
Outcome: 39 pass, 0 fail

Command: `node --test "test/lockfile/*.test.js"`
Outcome: 70 pass, 0 fail (all lockfile tests including parser and models)

| AC | Status | Evidence |
|----|--------|---------|
| v1 fixture parses correctly | PASS | `parses v1 fixture into non-empty ResolvedDependency[]` |
| v2 prefers packages | PASS | `v2: prefers packages map — lodash version is 4.17.21, not 4.0.0 from dependencies` |
| v3 extracts hasInstallScripts | PASS | `v3: lodash has hasInstallScripts: false`, `v3: my-local-pkg has hasInstallScripts: true` |
| hasInstallScripts null for v1/v2 | PASS | `v1: all entries have hasInstallScripts === null`, `v2: all entries have hasInstallScripts === null` |
| Source type classification | PASS | 6 source-type classification tests covering registry/git/file/url/null |
| directDependency cross-ref | PASS | `transitive dep is not direct`, direct deps correctly flagged |
| isDev flag | PASS | `v1: devDependency (mocha) has isDev: true`, `only-devDependencies` test |
| Scoped packages | PASS | `@scope/dev-tool`, `@scope/transitive` tests across v1/v2/v3 |
| Git / file deps | PASS | `my-git-pkg` → "git", `my-local-pkg` → "file" across all versions |
| No resolved → null | PASS | `v1: dep with no resolved field gets resolved: null` |
| Empty lockfile → [] | PASS | Empty-dependency tests for v1, v2, v3 |
| Integration test | PASS | `parseLockfile(package-lock.json, package.json) returns correct ResolvedDependency[]` |
| node --test passes | PASS | 70/70 tests pass |
