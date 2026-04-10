# Review: task-065 — yarn lockfile parser and install-scripts null contract

## Outcome

Ready for review. All 11 acceptance criteria pass. 196 tests green across lockfile and policy suites.

## What Was Implemented

1. **`src/lockfile/yarn.js`** (new) — pure synchronous parser for yarn classic v1 and berry v2+:
   - Classic: line-by-line state machine handles multi-specifier header lines, `version "..."`, `resolved "..."`, `integrity ...` fields, and `dependencies:` sub-block for BFS graph traversal.
   - Berry: `__metadata:` block detection, `languageName: unknown` workspace exclusion at parse time, `checksum:` stored as integrity, `dependenciesMeta[pkg].built: true` → `hasInstallScripts: true`, absent → `null`.
   - Shared BFS dev/prod classifier: direct packages seeded from `package.json` `dependencies`/`devDependencies`, transitive packages inherit from closest direct ancestor. Prod-first BFS ordering ensures prod wins when a package is reachable from both paths.
   - No imports from `src/registry/`.

2. **`src/lockfile/parser.js`** (updated):
   - Added `import { parseYarn } from './yarn.js'`.
   - Yarn branch in `detectFormat` and `parseLockfile`: detects `yarn.lock` by name or `.lock` extension (analogous to pnpm's `.yaml` extension handling for `--lockfile` flag); checks `__metadata:` for berry/classic; reads `package.json` if path provided.

3. **`src/policy/rules/scripts.js`** (updated, C-NEW-1):
   - `hasInstallScripts === null` now defers to `registryData.hasScripts` instead of unconditionally skipping.
   - `registryData == null` or `registryData.hasScripts === false` → admit (ADR-003 degradation behavior preserved).
   - `registryData.hasScripts === true` → fall through to allowlist check, same path as `hasInstallScripts: true`.

4. **Fixtures** (new): `yarn-classic-v1.lock`, `yarn-berry-v2.lock`, `yarn-berry-with-built.lock`.

5. **Tests** (new/updated): `test/lockfile/yarn.test.js` (30 tests), `test/policy/rules/scripts.test.js` (+4 C-NEW-1 tests).

## Acceptance Criteria Verification

| AC | Status |
|---|---|
| Multi-specifier header → one entry | PASS |
| `languageName: unknown` absent | PASS |
| dev/prod from package.json | PASS |
| `built` absent → `hasInstallScripts: null` | PASS |
| `built: true` → `hasInstallScripts: true` | PASS |
| No registry imports in yarn.js | PASS |
| Scripts null + `hasScripts: true` → blocked | PASS |
| Scripts null + `hasScripts: false` → admitted | PASS |
| Format detection (`__metadata`) | PASS |
| npm/pnpm paths unchanged | PASS |
| Module loads cleanly | PASS |

## Reviewer Notes

- `parsePackageJson` is called twice in `parseClassic` for `directDependency` computation. For large lockfiles this could be optimized; however, JSON.parse on a package.json is negligible in practice and this keeps the code simple.
- The `.lock` extension detection in `parser.js` is intentional: it mirrors the `.yaml` extension approach used for pnpm `--lockfile` overrides and is needed for fixture-based integration tests.
- `classifyDevProd` mutates entry objects in place before `validateDependency` is called — this is contained within the parser module and does not escape the pure-function contract at the `parseYarn` export boundary.

---

*Review artifact authored: 2026-04-10*
