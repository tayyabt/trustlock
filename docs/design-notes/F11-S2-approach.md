# Design Approach: task-065 — yarn lockfile parser and install-scripts null contract

## Summary

Implements `src/lockfile/yarn.js` as a pure synchronous parser for yarn classic v1 and berry v2+ lockfiles. The parser uses a line-by-line state machine (no regex-only shortcut) to handle multi-specifier header lines, berry `__metadata` detection, `languageName: unknown` workspace exclusion, and dev/prod classification via a BFS graph walk over the lockfile dependency graph seeded from `package.json`.

Updates `src/lockfile/parser.js` to add a `yarn.lock` filename branch (reads `package.json` content and delegates to `parseYarn`). Updates `src/policy/rules/scripts.js` to implement C-NEW-1: when `hasInstallScripts === null`, the rule consults `registryData.hasScripts` instead of silently skipping.

## Approach

### yarn.js parser

**Format detection**: `parseYarn(content, packageJsonContent)` checks for `__metadata:` at line start (`/^__metadata:/m`) to distinguish berry from classic. Detection is on raw content, not filename — satisfies the router AC for `__metadata` presence check.

**Classic v1 parsing**:
- Lines at indent 0 (non-comment, non-blank) are package header lines.
- Header: `"name@spec1", "name@spec2":` or `name@spec:` — parse all specifiers by stripping trailing `:`, splitting on `, `, removing quotes.
- Fields at indent 2: `version "x.y.z"`, `resolved "url"`, `integrity sha512-...`
- `dependencies:` at indent 2 starts a sub-block; dep entries at indent 4: `name "^specifier"` → reconstruct full specifier `name@^specifier` for BFS.
- `hasInstallScripts: null` always for classic (lockfile does not encode this).

**Berry v2+ parsing**:
- `__metadata:` block at indent 0: skip all its sub-fields.
- Package header lines: same quote-stripping logic as classic.
- Fields at indent 2 use `: ` syntax: `version:`, `resolution:`, `checksum:`, `languageName:`, `linkType:`.
- `languageName: unknown` entries are excluded immediately (workspace packages).
- `dependenciesMeta:` block (indent 2) → sub-entries at indent 4 (dep name) → `built: true` at indent 6. If ANY dep in `dependenciesMeta` has `built: true` → `hasInstallScripts: true`. Otherwise `hasInstallScripts: null`.
- `checksum:` value is stored as `integrity` (used for identity, not verification — ADR-004).

**Dev/prod classification (shared)**:
- Parse `package.json` JSON: `dependencies` keys → `isDev: false`, `devDependencies` keys → `isDev: true`.
- Build `specifierToEntry` map (each specifier in an entry's `specifiers[]` points to the same entry object).
- BFS from direct packages (prod entries first, dev second) → propagate `isDev` to unvisited transitive deps via their dep specifier list.
- Unvisited entries (not reachable from any direct dep): `isDev: false` (conservative default).
- If `packageJsonContent` is null: all entries get `isDev: false`.

**Source type classification**:
- Has integrity/checksum → `registry`
- Resolved URL contains `git` keyword or `.git` suffix → `git`
- Resolved URL starts with `file:` → `file`
- Default → `registry`

### parser.js update

Add `yarn.lock` branch before the JSON-parse block:
```
if (filename === 'yarn.lock') {
  read package.json if path provided, then call parseYarn(content, pkgJsonContent)
}
```
packageJsonContent is null if the caller passes null as the second arg.

### scripts.js update (C-NEW-1)

Replace the `hasInstallScripts == null → return []` shortcut with:
- `null + registryData == null` → skip (same behavior as before for lockfiles without script metadata)
- `null + registryData.hasScripts === false` → admit
- `null + registryData.hasScripts === true` → fall through to allowlist check (same path as `hasInstallScripts: true`)

## Integration / Wiring Plan

- `parser.js` imports `parseYarn` from `./yarn.js` — new import added.
- `yarn.js` imports only `validateDependency, SOURCE_TYPES` from `./models.js` — no registry imports (AC enforced by grep).
- `scripts.js` uses the `registryData` parameter already present in the function signature (was unused for null case before).

## Exact Files Expected to Change

| File | Change |
|---|---|
| `src/lockfile/yarn.js` | **New** — full parser implementation |
| `src/lockfile/parser.js` | Add yarn.lock branch, import parseYarn |
| `src/policy/rules/scripts.js` | C-NEW-1 null handling via registryData |
| `test/lockfile/yarn.test.js` | **New** — unit + integration tests |
| `test/policy/rules/scripts.test.js` | Add C-NEW-1 null+registryData tests |
| `test/fixtures/lockfiles/yarn-classic-v1.lock` | **New** — classic fixture |
| `test/fixtures/lockfiles/yarn-berry-v2.lock` | **New** — berry fixture with workspace exclusion |
| `test/fixtures/lockfiles/yarn-berry-with-built.lock` | **New** — berry fixture with built: true |

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| Multi-specifier header → one entry | `yarn.test.js` classic multi-specifier test |
| `languageName: unknown` absent from results | `yarn.test.js` berry workspace exclusion test |
| dev/prod from package.json | `yarn.test.js` classification tests |
| `built` absent → `hasInstallScripts: null` | `yarn.test.js` berry null test |
| `built: true` → `hasInstallScripts: true` | `yarn.test.js` built fixture test |
| No registry imports | `grep -r "src/registry" src/lockfile/yarn.js` returns empty |
| Scripts rule null → check registry | `scripts.test.js` C-NEW-1 tests |
| Format detection `__metadata` → berry | `yarn.test.js` format detection test; `parser.test.js` |
| npm/pnpm paths unchanged | `parser.test.js` existing tests pass |
| `node --input-type=module` loads cleanly | run in verification |

## Test Strategy

- `test/lockfile/yarn.test.js`: unit tests for `parseYarn` against all three fixtures; dev/prod classification with inline package.json; integration via `parseLockfile`.
- `test/policy/rules/scripts.test.js`: add 3 new tests for C-NEW-1 (null+null, null+false, null+true).
- Existing test suites (`pnpm.test.js`, `parser.test.js`, `scripts.test.js`) must remain green.

## Stubs

None. All wiring is real:
- `yarn.js` full parser (no regex-only shortcut, no stub)
- `languageName: unknown` exclusion in parser, not policy engine
- BFS dev/prod classification is real
- `dependenciesMeta.built` detection is real
- C-NEW-1 in scripts.js is a real code change

## Risks and Questions

- Yarn lockfile format edge cases: multi-specifier lines with no quotes (unquoted specifiers at indent 0) are handled by the header parser stripping quotes optionally.
- Berry format variations: checksum field may include a `10/` prefix (yarn berry 3+ format) — stored as-is, used for identity only.
- BFS convergence: circular dependencies in lockfile graph → guard with a `visited` Set (already in design).

## Verification Results

All acceptance criteria verified as of 2026-04-10.

| AC | Status | Evidence |
|---|---|---|
| Multi-specifier header → one entry | PASS | `yarn.test.js:24` — multi-specifier test |
| `languageName: unknown` absent | PASS | `yarn.test.js:52` — berry workspace exclusion |
| dev/prod from package.json | PASS | `yarn.test.js:84–99` — classification suite |
| `built` absent → `hasInstallScripts: null` | PASS | `yarn.test.js:66` — berry null test |
| `built: true` → `hasInstallScripts: true` | PASS | `yarn.test.js:70` — built fixture test |
| No registry imports | PASS | `grep -r "src/registry" src/lockfile/yarn.js` → empty |
| Scripts null → check registry (`hasScripts: true` blocks) | PASS | `scripts.test.js` C-NEW-1 tests |
| Scripts null → check registry (`hasScripts: false` admits) | PASS | `scripts.test.js` C-NEW-1 tests |
| Format detection: `__metadata` → berry | PASS | `yarn.test.js:105–118` — format detection suite |
| npm/pnpm paths unchanged | PASS | All 196 tests pass (lockfile + policy suites) |
| Module loads cleanly | PASS | `node --input-type=module -e "import './src/lockfile/yarn.js'"` exits 0 |

Commands run:
```
node --test test/lockfile/yarn.test.js
# 30 tests, 30 pass

node --test test/lockfile/parser.test.js
# 16 tests, 16 pass

node --test test/policy/rules/scripts.test.js
# 15 tests, 15 pass

node --test test/policy/rules/*.test.js test/lockfile/*.test.js
# 196 tests, 196 pass

grep -r "src/registry" src/lockfile/yarn.js
# (no output)

node --input-type=module -e "import './src/lockfile/yarn.js'"
# exits 0

.burnish/check-no-stubs.sh
# check-no-stubs: OK
```

---

*Design note authored: 2026-04-10*
