# Review: task-029 — Implement Trust & Exposure Rules (F06-S02)

## Status
Ready for review.

## Summary
Implemented three pure-function policy rules in `src/policy/rules/`:
- `provenance.js` — `trust-continuity:provenance`: blocks provenance regression and required-but-missing attestation; skips on registry unavailability.
- `cooldown.js` — `exposure:cooldown`: blocks versions newer than `cooldown_hours`; includes exact UTC `clears_at` timestamp in `detail` (D4); skips when `publishedAt` is unavailable.
- `pinning.js` — `exposure:pinning`: reads `package.json` via `node:fs/promises` (not lockfile, per C2); blocks floating ranges in both `dependencies` and `devDependencies` when `pinning.required = true`.

## Verification

All 35 tests pass:
```
node --test test/policy/rules/provenance.test.js  → 12/12 PASS
node --test test/policy/rules/cooldown.test.js    → 12/12 PASS
node --test test/policy/rules/pinning.test.js     → 11/11 PASS
```

## Acceptance Criteria

- [x] `provenance.js` blocks regression (had attestation, lost it)
- [x] `provenance.js` blocks required_for with no attestation (edge case #5)
- [x] `provenance.js` admits when attestation present or never required
- [x] `provenance.js` returns `severity: "skipped"` when registry unavailable (edge case #6)
- [x] `cooldown.js` blocks with `detail.clears_at` ISO 8601 UTC when age < cooldown_hours (D4)
- [x] `cooldown.js` admits when age >= cooldown_hours
- [x] `cooldown.js` returns `severity: "skipped"` when `publishedAt` unavailable
- [x] `pinning.js` reads `package.json` (not lockfile, C2) and blocks floating ranges when required
- [x] `pinning.js` returns `[]` when `pinning.required = false` or all versions are exact
- [x] All three return `Finding[]` with correct `rule`, `severity`, `message`, `detail`
- [x] Unit tests cover: admit, block, registry-unavailable (provenance, cooldown), range detection (pinning)

## Notes for Reviewer

- `pinning.js` is async (`Promise<Finding[]>`) because it reads `package.json` via `node:fs/promises`. F06-S04 engine must `await` this rule.
- `severity: "error"` for blocking findings (per story behavioral rules), `severity: "skipped"` for registry-unavailable cases. F06-S04 implementor should align engine severity checks accordingly.
- `pinning.js` accepts `packageJsonPath` as a 5th argument (not embedded in policy). Story explicitly permits this choice.
- Engine seam (F06-S04 wiring) is intentionally deferred and kept explicit.

## Files Changed

**Source:**
- `src/policy/rules/provenance.js` (new)
- `src/policy/rules/cooldown.js` (new)
- `src/policy/rules/pinning.js` (new)

**Tests:**
- `test/policy/rules/provenance.test.js` (new)
- `test/policy/rules/cooldown.test.js` (new)
- `test/policy/rules/pinning.test.js` (new)

**Design:**
- `docs/design-notes/F06-S02-approach.md` (new)
