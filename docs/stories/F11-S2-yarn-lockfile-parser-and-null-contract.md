# Story: F11-S2 — yarn lockfile parser and install-scripts null contract

## Parent
F11: Lockfile Parsers: pnpm + yarn

## Description
Implement the yarn lockfile parser (`src/lockfile/yarn.js`) for classic v1 and berry v2+, extend the format-detection router, and update the policy engine's scripts rule evaluation to treat `hasInstallScripts: null` as "unknown — defer to registry metadata" (C-NEW-1). This makes `trustlock init`, `check`, `approve`, and `audit` work in yarn projects.

## Scope
**In scope:**
- `src/lockfile/yarn.js` — new pure parser function; handles yarn classic v1 and berry v2+; excludes `languageName: unknown` workspace packages; reads `package.json` for dev/prod classification (C4)
- `src/lockfile/parser.js` — add `yarn.lock` filename detection branch; `__metadata` presence → berry, absence → classic; dispatch to `yarn.js` (builds on the router extended in F11-S1)
- `src/policy/check.js` (or the scripts rule module it delegates to) — update scripts rule to handle `hasInstallScripts: null` as "defer to registry metadata" (C-NEW-1)
- `test/fixtures/lockfiles/yarn-classic-v1.lock`, `yarn-berry-v2.lock`, `yarn-berry-with-built.lock` — new fixture files
- Unit tests for `yarn.js` against all fixture variants

**Not in scope:**
- pnpm parser (F11-S1)
- Any new registry calls from inside `yarn.js` — the parser only produces `null`; the registry fetch is in the policy engine (C-NEW-1)
- `src/lockfile/models.js` changes — model already supports `null` for `hasInstallScripts`
- dev/prod transitive-ancestor resolution beyond what `package.json` directly encodes — transitive packages inherit from closest direct ancestor; no full dependency graph walk

## Entry Points
- Route / page / screen: CLI entry — all commands that call `parseLockfile()` reach the yarn branch through the router
- Trigger / navigation path: `trustlock init`, `trustlock check`, `trustlock approve`, `trustlock audit` in a yarn project directory
- Starting surface: `src/lockfile/parser.js:parseLockfile(lockfilePath, projectRoot?)` — already extended by F11-S1; this story adds the `yarn.lock` branch

## Wiring / Integration Points
- Caller-side ownership: `src/lockfile/parser.js` owns format detection and dispatch — this story adds `yarn.lock` filename check, `__metadata` presence test for berry/classic, and calls `yarn.js:parseYarn(content, packageJsonPath)`.
- Callee-side ownership: `src/lockfile/yarn.js` — new file; this story owns its full implementation. Returns `ResolvedDependency[]`. Signature: `(content: string, packageJsonContent: string | null) => ResolvedDependency[]`. The `packageJsonContent` is the serialized JSON of `package.json`; `null` means skip dev/prod classification (all packages classified as `prod`).
- Caller-side conditional rule: The caller (`parser.js`) already exists and was extended in F11-S1. Wire it to the new `yarn.js` callee now — no deferred seam.
- Callee-side conditional rule: `yarn.js` is new. Must satisfy the ADR-004 contract. The policy engine side (`check.js` scripts rule) already exists; this story updates it in-place to handle `null`.
- Boundary / contract check: (a) Integration test calls `parseLockfile('test/fixtures/lockfiles/yarn-berry-v2.lock', null)` and verifies `languageName: unknown` packages are absent from the returned array. (b) Unit test verifies that a package with absent `dependenciesMeta[pkg].built` produces `hasInstallScripts: null`. (c) Policy engine test verifies that a package with `hasInstallScripts: null` triggers a registry metadata fetch rather than being treated as `false`.
- Files / modules to connect: `src/lockfile/parser.js` → `src/lockfile/yarn.js`; `src/policy/check.js` (scripts rule) — update in-place for null handling
- Deferred integration, if any: none

## Not Allowed To Stub
- The custom yarn format parser inside `yarn.js` — must handle multi-specifier header lines (`"pkg@^1.0", "pkg@1.x.x":` → one resolved entry, all specifiers point to it); no regex-only shortcut that misses edge cases
- `languageName: unknown` exclusion must happen in the parser, before any entry is added to the results array — the policy engine must never see workspace packages
- `__metadata` detection to distinguish berry from classic must be a real check of the lockfile content
- dev/prod classification must read the `package.json` `dependencies` / `devDependencies` maps for direct packages; transitive packages inherit from closest direct ancestor (C4) — this logic must be real, not a stub that marks everything `prod`
- `dependenciesMeta[pkg].built: true` absent → `hasInstallScripts: null` (not `false`, not `true`) — the `null` value is the contract signal to the policy engine (C-NEW-1)
- Policy engine scripts rule: the update to handle `null` as "defer to registry metadata" must be a real code change — not a comment, not a TODO

## Behavioral / Interaction Rules
- `yarn.js` must NOT import any module from `src/registry/` — the parser produces data; it does not make network calls (C-NEW-1). `hasInstallScripts: null` is the explicit signal to the policy engine to resolve this via registry metadata.
- Multi-specifier header resolution: all specifiers in a header line (`"pkg@^1.0.0", "pkg@~1.0.0":`) map to the same single resolved entry. The resolved entry uses the `resolved` URL and `checksum`/`integrity` field from that block.
- yarn berry `checksum:` field (not `integrity:`) is stored as-is in `ResolvedDependency.integrity`. It is used for identity, not verification.
- yarn berry packages with `languageName: unknown` are excluded at the parser level — they are workspace packages and have no supply chain significance.
- Policy engine null handling: the scripts rule currently evaluates `hasInstallScripts` as a boolean. After this story, when `hasInstallScripts === null`, the rule must consult the registry metadata object (already fetched in step 5a of the check flow) to resolve the `scripts` flag. If registry metadata is also unavailable (stale/missing cache), apply the same degradation annotations as other registry-dependent rules (ADR-003).

## Acceptance Criteria
- [ ] `parseLockfile('test/fixtures/lockfiles/yarn-classic-v1.lock', null)`: multi-specifier header line (`"pkg@^1.0.0", "pkg@1.x.x":`) produces one resolved entry; both specifiers point to it.
- [ ] `parseLockfile('test/fixtures/lockfiles/yarn-berry-v2.lock', null)`: packages with `languageName: unknown` are absent from the returned array.
- [ ] dev/prod classification: package listed under `dependencies` in `package.json` → `isDev: false`; package listed under `devDependencies` → `isDev: true`; transitive package not directly listed → inherit from closest direct ancestor.
- [ ] yarn berry `dependenciesMeta[pkg].built` absent → `hasInstallScripts: null` in the returned `ResolvedDependency`.
- [ ] yarn berry `dependenciesMeta[pkg].built: true` → `hasInstallScripts: true`.
- [ ] `src/lockfile/yarn.js` does not import any module from `src/registry/` (C-NEW-1). Verified by: `node -e "const m = require('./src/lockfile/yarn.js')"` runs without importing registry; or grep: `grep -r "src/registry" src/lockfile/yarn.js` returns empty.
- [ ] Policy engine scripts rule: a package with `hasInstallScripts: null` causes the engine to check registry metadata for the `scripts` field rather than treating `null` as `false`. Test: mock registry metadata with `hasScripts: true`; verify the package is blocked. Mock with `hasScripts: false`; verify it passes the scripts rule.
- [ ] Format detection: `yarn.lock` file with `__metadata` block → berry path; `yarn.lock` without `__metadata` → classic path.
- [ ] Existing npm and pnpm lockfile parsing paths are unchanged after adding the yarn branch to `parser.js`.
- [ ] `node --input-type=module -e "import './src/lockfile/yarn.js'"` resolves without error (no missing runtime dependencies).

## Task Breakdown
1. Create `test/fixtures/lockfiles/yarn-classic-v1.lock` — include at least one multi-specifier header block and one plain package
2. Create `test/fixtures/lockfiles/yarn-berry-v2.lock` — include at least one `languageName: unknown` workspace package and one regular package; include one package with `dependenciesMeta` built absent
3. Create `test/fixtures/lockfiles/yarn-berry-with-built.lock` — include one package with `dependenciesMeta[pkg].built: true`
4. Create `src/lockfile/yarn.js` — implement custom format parser; multi-specifier resolution; berry/classic variant handling; `languageName: unknown` exclusion; dev/prod classification from `package.json`; `dependenciesMeta.built` → `hasInstallScripts: null/true`
5. Extend `src/lockfile/parser.js` — add `yarn.lock` filename detection branch; `__metadata` presence check; dispatch to `yarn.js`
6. Update `src/policy/check.js` (or the scripts-rule delegate) — handle `hasInstallScripts === null` by consulting already-fetched registry metadata; document the `null` contract in a code comment citing C-NEW-1
7. Write unit tests for `yarn.js` covering all AC items; write policy engine test for null handling

## Verification
```
node --test test/lockfile/yarn.test.js
# Expected: all tests pass, no errors

node --test test/lockfile/parser.test.js
# Expected: yarn detection tests pass; pnpm and npm paths unchanged

node --test test/policy/scripts-rule.test.js
# Expected: null-hasInstallScripts tests pass

grep -r "src/registry" src/lockfile/yarn.js
# Expected: no output (yarn.js does not import registry)
```

## Edge Cases to Handle
- yarn classic multi-specifier header line (`"pkg@^1.0", "pkg@1.x.x":`) — parse once, register under all specifiers
- yarn berry `languageName: unknown` — excluded at parser; not passed to policy engine
- yarn berry `checksum:` format differs from npm `integrity` — stored as-is; used for identity, not verification
- yarn berry `dependenciesMeta[pkg].built: true` absent — `hasInstallScripts: null`; policy engine defers to registry
- yarn dev/prod classification: transitive package not directly in `package.json` → inherit from closest direct ancestor
- `--lockfile` flag pointing to a yarn lockfile from an npm project directory — must honour the flag and parse as yarn

## Dependencies
- Depends on: F11-S1 task (touches `src/lockfile/parser.js`; S2 must build on S1's version of the router to avoid merge conflict)
- Blocked by: none (F03's registry client, already done as task-021, is used by the policy engine for the null-handling path — no new wiring required)

## Effort
L — yarn's custom format, multi-specifier resolution, dev/prod ancestor-inheritance, and the policy engine null-handling update together make this the more complex of the two F11 stories.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P1

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
