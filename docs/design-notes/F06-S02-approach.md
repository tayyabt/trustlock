# Design Approach: F06-S02 Trust & Exposure Rules

## Summary

Implement three pure-function policy rules in `src/policy/rules/`: `provenance.js` (trust-continuity:provenance), `cooldown.js` (exposure:cooldown), and `pinning.js` (exposure:pinning). Each rule exports an `evaluate` function matching the engine contract. All three rules return `Finding[]` — empty array means admit, non-empty means block or skipped.

The rules land before the engine (F06-S04), so the integration seam is explicit: each file exports a named `evaluate` function. F06-S04 wires the calls; this story owns the callee side only.

## Key Design Decisions

1. **Severity values**: Story behavioral rules specify `severity: "error"` for blocking findings and `severity: "skipped"` for registry-unavailable cases. Used as specified in the active work artifact (overrides the `'block'` placeholder in `models.js`).
2. **provenance rule — `registryData` shape**: `registryData.hasProvenance` (boolean). Null `registryData` triggers skip-don't-block behavior (edge case #6).
3. **provenance rule — baseline shape**: Uses `baseline.provenanceStatus === "verified"` to detect "had attestation in baseline" (from `src/baseline/manager.js` TrustProfile definition).
4. **cooldown rule — `now` injectable**: `evaluate(dependency, baseline, registryData, policy, now = new Date())` — the 5th arg lets tests pass a fixed reference time without mocking globals.
5. **pinning rule — `packageJsonPath` as 5th arg**: Story permits "part of policy or separate argument." Separate arg chosen for deterministic testability without patching `policy` shape.
6. **pinning rule — async**: Requires `node:fs/promises` file read; returns `Promise<Finding[]>`. Engine (F06-S04) must `await` this rule.
7. **Range detection**: Checks for `^`, `~`, `>`, `>=`, `<`, `<=`, `*`, `x` anywhere in the version spec string. Applied to both `dependencies` and `devDependencies`.

## Integration / Wiring

- **Callee-side (this story)**: Implements all three rule functions. Each exports `evaluate(dependency, baseline, registryData, policy[, extra])`.
- **Caller-side (F06-S04, deferred)**: `engine.js` will import and call each rule. The seam is kept explicit — no stub in engine.js is created here.
- `Finding` shape is imported from `src/policy/models.js` (F06-S01, already landed).
- `pinning.js` imports `node:fs/promises` directly (C2 constraint — reads `package.json`, not lockfile).

## Files to Create/Modify

- `src/policy/rules/provenance.js` — trust-continuity:provenance rule
- `src/policy/rules/cooldown.js` — exposure:cooldown rule with clears_at UTC timestamp (D4)
- `src/policy/rules/pinning.js` — exposure:pinning rule, reads package.json via fs/promises
- `test/policy/rules/provenance.test.js` — unit tests covering all ACs
- `test/policy/rules/cooldown.test.js` — unit tests covering all ACs
- `test/policy/rules/pinning.test.js` — unit tests covering all ACs (uses temp files for real I/O)

## Testing Approach

Node.js built-in `node:test` runner. Each test file is run independently with `node --test`. All tests use in-memory fixture data except pinning tests which write a temp `package.json` and clean up in `after`/`finally`.

## Acceptance Criteria / Verification Mapping

- AC: provenance blocks regression (had attestation, lost it) → `test/policy/rules/provenance.test.js` "regression block case"
- AC: provenance blocks required_for with no attestation → `test/policy/rules/provenance.test.js` "required_for block case"
- AC: provenance admits when attestation present → `test/policy/rules/provenance.test.js` "admit — attestation present"
- AC: provenance admits when not in required_for and no prior attestation → `test/policy/rules/provenance.test.js` "admit — never had attestation, not required"
- AC: provenance skips when registry unavailable → `test/policy/rules/provenance.test.js` "skipped — registry unavailable"
- AC: cooldown blocks with clears_at when age < threshold → `test/policy/rules/cooldown.test.js` "block — too new, includes clears_at"
- AC: cooldown admits when age >= threshold → `test/policy/rules/cooldown.test.js` "admit — old enough"
- AC: cooldown skips when publishedAt unavailable → `test/policy/rules/cooldown.test.js` "skipped — no publishedAt"
- AC: pinning blocks range ops when required → `test/policy/rules/pinning.test.js` "block — caret range"
- AC: pinning admits exact versions → `test/policy/rules/pinning.test.js` "admit — exact version"
- AC: pinning admits when disabled → `test/policy/rules/pinning.test.js` "admit — pinning disabled"
- AC: All three return correct Finding[] fields → verified by field assertions in every test

## Verification Results

Commands run:
```
node --test test/policy/rules/provenance.test.js  → 12/12 PASS
node --test test/policy/rules/cooldown.test.js    → 12/12 PASS
node --test test/policy/rules/pinning.test.js     → 11/11 PASS
```

- AC: provenance blocks regression (had attestation, lost it) → PASS — `node --test test/policy/rules/provenance.test.js`
- AC: provenance blocks required_for with no attestation → PASS — covered by 3 test cases (no baseline, unverified baseline, unknown baseline)
- AC: provenance admits (attestation present, in required_for) → PASS
- AC: provenance admits (not required, no prior attestation) → PASS — 2 test cases
- AC: provenance skips when registry unavailable (registryData null) → PASS — severity "skipped", does not block
- AC: cooldown blocks with detail.clears_at (ISO 8601 UTC, D4) → PASS — clears_at matches publishedAt + cooldown_hours, ends with "Z"
- AC: cooldown admits when age >= threshold → PASS — 2 test cases (100h > 72h, exactly 72h)
- AC: cooldown skips when publishedAt unavailable → PASS — 4 cases: null registryData, null publishedAt, undefined publishedAt, invalid timestamp
- AC: pinning blocks range operators (^, ~, *, >=) when required → PASS — 5 range operator test cases
- AC: pinning blocks ranges in devDependencies → PASS
- AC: pinning admits exact version → PASS — 2 test cases (deps, devDeps)
- AC: pinning admits when pinning.required = false → PASS
- AC: all three rules return Finding[] with correct rule/severity/message/detail → PASS — shape validated in dedicated tests for each rule

## Stubs

None. All three rules are real implementations. Engine wiring (F06-S04) is intentionally deferred with an explicit seam note.

## Environment Setup Blocker

None — all tests use in-process data; no external services required.

## Documentation Updates

None — no interface, env var, or operator workflow changes.

## Deployment Impact

None.

## Questions/Concerns

- The `severity` value conflict between models.js (`'block'`) and story behavioral rules (`"error"`) is resolved by following the story as the active specification. F06-S04 implementor should align engine severity checks with `'error'` not `'block'`.
- pinning.js returns `Promise<Finding[]>` (async). F06-S04 engine must `await` the pinning rule specifically.

## Metadata

- Agent: developer
- Date: 2026-04-09
- Work Item: F06-S02
- Work Type: story
- Branch: burnish/task-029-implement-trust-exposure-rules
- ADR: ADR-001 (zero runtime deps)
