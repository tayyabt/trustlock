# Design Approach: F06-S01 Policy Config & Data Models

## Summary
Implements `src/policy/models.js` (shape definitions) and `src/policy/config.js` (`loadPolicy`) — the foundational data layer for the entire policy engine. These files must exist before any rule or engine work begins (F06-S02, F06-S03, F06-S04 all import from them).

`models.js` defines plain-object shapes documented in JSDoc comments: `PolicyConfig`, `Finding`, `CheckResult`, and `DependencyCheckResult`. No validation logic — shapes exist purely as documentation contracts.

`config.js` reads `.depfencerc.json` via `node:fs/promises`, merges the file contents over a `DEFAULTS` constant, drops unknown top-level keys (forward-compat), and throws structured errors with `.exitCode = 2` for missing-file and malformed-JSON cases.

## Key Design Decisions
1. **Plain objects, no classes** — follows global conventions (camelCase functions, PascalCase names in docs). `models.js` documents each field in JSDoc comments; the exported values are the default-shape objects.
2. **Deep merge for nested policy fields** — `pinning`, `scripts`, `sources`, `provenance`, and `transitive` are nested objects. Merge at the sub-key level so a partial override like `{ pinning: { required: true } }` fills in only the override without requiring the caller to specify all fields.
3. **Known-keys-only extraction** — only extract the 6 known top-level config keys (`cooldown_hours`, `pinning`, `scripts`, `sources`, `provenance`, `transitive`). Unknown keys are silently dropped. This is the forward-compat behavior (edge case #4 in the feature brief).
4. **Structured error objects** — errors thrown by `loadPolicy` include `message` and `exitCode: 2`. The CLI caller (F08) checks `.exitCode` to propagate the correct process exit. This matches the exit-code contract in the system overview and global architecture.
5. **Zero runtime dependencies (ADR-001)** — uses `node:fs/promises` only. No external validation libraries.

## Integration / Wiring
- **Callee-side**: This story is the callee for all F06 stories and F08. It exports `loadPolicy(configPath: string): Promise<PolicyConfig>` and the four shape definitions.
- **Caller-side** (F08, deferred): `src/cli/commands/check.js` will call `loadPolicy()` with an absolute path. That file does not exist yet. The seam is explicit: the function signature and error contract are documented in `config.js` and covered by tests.
- **Boundary contract**: Unit tests verify the full contract. CLI wiring is intentionally deferred to F08.

## Files to Create/Modify
- `src/policy/models.js` — shape definitions for `PolicyConfig`, `Finding`, `CheckResult`, `DependencyCheckResult`
- `src/policy/config.js` — `loadPolicy(configPath)` implementation with `DEFAULTS` and merge logic
- `test/policy/config.test.js` — unit tests (valid-full, valid-sparse, missing-file, malformed-JSON, unknown-rule-names)
- `test/fixtures/policy/valid-full.json` — fixture with all policy fields set
- `test/fixtures/policy/valid-sparse.json` — fixture with only some fields (defaults should fill the rest)
- `test/fixtures/policy/malformed.json` — fixture with invalid JSON

## Testing Approach
Node.js built-in test runner (`node --test`). Tests cover all 6 acceptance criteria:
- Load full config → verify all fields match file values
- Load sparse config → verify missing fields filled from defaults
- Missing file → verify thrown error has `.exitCode = 2` and path in message
- Malformed JSON → verify thrown error has `.exitCode = 2` and parse detail
- Unknown rule names → verify no throw, known fields still merged correctly

## Acceptance Criteria / Verification Mapping
- AC: `loadPolicy()` returns complete `PolicyConfig` with all fields populated → Verification: `test/policy/config.test.js` "valid full config" test
- AC: Missing file throws with `.exitCode = 2` and path in message → Verification: `test/policy/config.test.js` "missing file" test
- AC: Malformed JSON throws with `.exitCode = 2` with parse error detail → Verification: `test/policy/config.test.js` "malformed JSON" test
- AC: Unknown rule names ignored — no error → Verification: `test/policy/config.test.js` "unknown rule names" test
- AC: `models.js` exports all four shapes with documented fields → Verification: `node --test test/policy/config.test.js` (imports models) + manual inspection
- AC: Unit tests cover valid (all fields), valid (sparse), missing file, malformed JSON, unknown rule name → Verification: 5 distinct test cases in `test/policy/config.test.js`

## Verification Results
- AC: `loadPolicy()` returns complete `PolicyConfig` with all fields populated → PASS — `test/policy/config.test.js` "valid full config" and "valid sparse config" tests pass
- AC: Missing file throws with `.exitCode = 2` and path in message → PASS — `test/policy/config.test.js` "missing file" test passes
- AC: Malformed JSON throws with `.exitCode = 2` with parse error detail → PASS — `test/policy/config.test.js` "malformed JSON" test passes
- AC: Unknown rule names ignored — no error → PASS — `test/policy/config.test.js` "unknown rule names" test passes
- AC: `models.js` exports all four shapes with documented fields → PASS — 4 model shape tests pass; all required fields present
- AC: Unit tests cover valid (all fields), valid (sparse), missing file, malformed JSON, unknown rule name → PASS — 9 tests total, all pass

Command: `node --test test/policy/config.test.js` — 9 pass, 0 fail, 0 skipped

Manual verification:
```
node -e "import('./src/policy/config.js').then(m => m.loadPolicy('.depfencerc.json'))..."
# Output: Policy file not found: .depfencerc.json exit: 2  ✓ expected
```

## Story Run Log Update
### 2026-04-09 developer: Implementation complete
- Created `src/policy/models.js`, `src/policy/config.js`, `test/policy/config.test.js`
- Created fixtures: `test/fixtures/policy/valid-full.json`, `valid-sparse.json`, `malformed.json`
- `node --test test/policy/config.test.js`: 9 PASS, 0 FAIL
- No deferred checks. CLI wiring intentionally deferred to F08.

## Documentation Updates
None — no setup, interfaces, or env vars changed that are documented externally.

## Deployment Impact
None.

## Questions/Concerns
- The `transitive.max_new` default (5) is from feature brief edge case #10. The story says "transitive threshold" without specifying the key name; using `transitive.max_new` to match the nested object pattern of the other fields.

## Stubs
None. All implementation is real.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Work Item: F06-S01
- Work Type: story
