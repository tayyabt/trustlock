# Design Note: F06-S03 — Execution & Delta Rules

## Summary
Implement four policy rules as pure `evaluate()` functions: `scripts.js`, `sources.js`, `new-dependency.js`, and `transitive-surprise.js`. These complete the execution and delta rule set for F06. Two rules (`new-dependency`, `transitive-surprise`) produce `severity: "warning"` findings only; two rules (`scripts`, `sources`) produce `severity: "error"` blocking findings.

## Approach
Each rule follows the established pattern from F06-S02 (provenance, cooldown, pinning):
- Named `evaluate` export
- Signature: `evaluate(dependency, baseline, registryData, policy[, extra]) → Finding[]`
- Pure function; no side effects
- Returns `[]` to admit, `[{...Finding}]` to block or warn

**`scripts.js`** — `execution:scripts`
1. Check if `dependency.name` is in `policy.scripts.allowlist` → admit immediately (`[]`)
2. Determine `hasInstallScripts`: use `dependency.hasInstallScripts` if not null (npm v3 lockfile); otherwise fall back to `registryData?.hasInstallScripts`
3. If both are null → skipped (registry unreachable), return `[]`
4. If `hasInstallScripts` is true and not allowlisted → return `severity: "error"` finding
5. Otherwise → `[]`

**`sources.js`** — `execution:sources`
1. Inspect `dependency.resolved` URL
2. Classify source type: `registry` (npmjs.org), `git` (`git+` prefix or `github:` etc.), `file` (`file:` prefix), `url` (other http/https)
3. If classified type is in `policy.sources.allowed` → `[]`
4. Otherwise → `severity: "error"` finding
5. Standard npm registry URL prefix: `https://registry.npmjs.org/`

**`new-dependency.js`** — `delta:new-dependency`
1. If `baseline` is null → package has no baseline record → return `severity: "warning"` finding
2. Otherwise → `[]`

**`transitive-surprise.js`** — `delta:transitive-surprise`
1. Accept an optional 5th `delta` parameter (pattern established by cooldown's `now` param)
2. Read `delta?.newTransitiveCount`; if missing/null → `[]`
3. Threshold hardcoded at 5
4. If `newTransitiveCount > 5` → `severity: "warning"` finding
5. Otherwise → `[]`

## Integration / Wiring Plan
- All four rules import nothing from models.js — they produce plain-object findings matching the `Finding` shape
- Caller (`engine.js`, F06-S04) will import each rule and call `evaluate()` with pre-fetched data
- The seam is explicit: each rule exports a named `evaluate` matching the 4-arg contract (plus optional 5th)
- `transitive-surprise.js` uses a 5th optional `delta` parameter; this aligns with the cooldown pattern and keeps the same base contract

## Files Expected to Change
- **New:** `src/policy/rules/scripts.js`
- **New:** `src/policy/rules/sources.js`
- **New:** `src/policy/rules/new-dependency.js`
- **New:** `src/policy/rules/transitive-surprise.js`
- **New:** `test/policy/rules/scripts.test.js`
- **New:** `test/policy/rules/sources.test.js`
- **New:** `test/policy/rules/new-dependency.test.js`
- **New:** `test/policy/rules/transitive-surprise.test.js`

## Acceptance Criteria to Verification Mapping

| AC | Verification |
|---|---|
| `scripts.js`: blocks non-allowlisted package with install scripts | `scripts.test.js` — should-block case |
| `scripts.js`: admits packages in allowlist | `scripts.test.js` — should-admit via allowlist |
| `scripts.js`: skips when both hasInstallScripts are null | `scripts.test.js` — null registry edge case |
| `scripts.js`: npm v3 vs v1/v2 hasInstallScripts handling | `scripts.test.js` — lockfile-value-takes-precedence case |
| `sources.js`: blocks git/file/non-registry urls | `sources.test.js` — should-block cases |
| `sources.js`: admits standard registry URLs | `sources.test.js` — should-admit cases including scoped packages |
| `new-dependency.js`: warning for packages with no baseline | `new-dependency.test.js` — warn case |
| `new-dependency.js`: admits packages with baseline | `new-dependency.test.js` — admit case |
| `transitive-surprise.js`: warning when count > 5 | `transitive-surprise.test.js` — warn case |
| `transitive-surprise.js`: admits when count ≤ 5 or no delta | `transitive-surprise.test.js` — admit and no-delta cases |
| All rules return correct Finding shape | Finding-shape tests in each test file |

## Test Strategy
- Node.js built-in test runner (`node:test`) — same as existing S02 tests
- Each test file: admit case, block/warn case, edge cases
- No file I/O in these rules (unlike pinning) — all synchronous

## Stubs
None. All rules are self-contained pure functions. No external dependencies.

## Risks / Questions
- `sources.js` source type classification: the story lists `git+` prefix as the git marker. Need to also handle `github:`, `bitbucket:`, `gitlab:` shorthands if used, but the story only explicitly requires `git+`, `file:`, `http:`/`https:` (non-registry), so sticking to those.
- `transitive-surprise.js` threshold: hardcoded at 5 per story; `policy.transitive.max_new` exists in `PolicyConfig` but the story explicitly says to NOT read from policy config for v0.1.

## Verification Results

_Updated after implementation._

| AC | Result | Evidence |
|---|---|---|
| scripts.js: blocks non-allowlisted with install scripts | PASS | `node --test test/policy/rules/scripts.test.js` |
| scripts.js: admits allowlisted package | PASS | `node --test test/policy/rules/scripts.test.js` |
| scripts.js: skipped when null registry, null lockfile | PASS | `node --test test/policy/rules/scripts.test.js` |
| scripts.js: npm v3 lockfile value takes precedence | PASS | `node --test test/policy/rules/scripts.test.js` |
| sources.js: blocks git/file/non-registry | PASS | `node --test test/policy/rules/sources.test.js` |
| sources.js: admits registry URLs | PASS | `node --test test/policy/rules/sources.test.js` |
| new-dependency.js: warning for null baseline | PASS | `node --test test/policy/rules/new-dependency.test.js` |
| new-dependency.js: admits with baseline | PASS | `node --test test/policy/rules/new-dependency.test.js` |
| transitive-surprise.js: warning when > 5 | PASS | `node --test test/policy/rules/transitive-surprise.test.js` |
| transitive-surprise.js: admits when ≤ 5 or no delta | PASS | `node --test test/policy/rules/transitive-surprise.test.js` |
| All rules: correct Finding shape | PASS | All test files include shape assertions |
