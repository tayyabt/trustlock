# Design Note: F04-S01 — Baseline Data Model, Read, and Create

## Summary
Implement the `Baseline` and `TrustProfile` data structures plus `createBaseline()` and `readBaseline()` in `src/baseline/manager.js`. This is the foundation layer for all other baseline operations (delta computation F04-S02, advancement F04-S03).

## Approach
Pure module — no file writes (caller owns persistence). `createBaseline()` is synchronous: it builds the in-memory `Baseline` object from `ResolvedDependency[]`. `readBaseline()` is async: it reads from disk, parses JSON, validates schema. Errors are returned as structured values, not thrown, so callers can choose the exit code (exit 2 for corrupted/invalid per conventions).

## Integration / Wiring Plan
- **Imports:** `src/lockfile/models.js` — only for `ResolvedDependency` type contract. No runtime import of the validation function needed; the story calls into `manager.js` with already-validated deps from the lockfile parser.
- **Caller seam (deferred):** CLI init command (F08) will call `createBaseline()` and write the result. No caller exists yet. Seam is kept explicit via named exports.
- **No circular deps:** `baseline` module imports from `lockfile` model layer, which is a lower layer per global architecture layering rules.

## Exact Files Expected to Change
- `src/baseline/manager.js` — **new** — full module implementation
- `test/baseline/manager.test.js` — **new** — unit tests

## Data Structures

### Baseline
```js
{
  schema_version: 1,           // hardcoded for v0.1
  created_at: "<ISO 8601 UTC>",
  lockfile_hash: "<sha256 hex>",
  packages: {
    "<name>": TrustProfile,
    ...
  }
}
```

### TrustProfile
```js
{
  name: string,
  version: string,
  admittedAt: "<ISO 8601 UTC>",
  provenanceStatus: "verified" | "unverified" | "unknown",
  hasInstallScripts: boolean | null,
  sourceType: "registry" | "git" | "file" | "url"
}
```

## Error Return Values (readBaseline)
| Condition | Return |
|---|---|
| File not found (ENOENT) | `{ error: "not_initialized" }` |
| Invalid JSON | `{ error: "corrupted" }` |
| schema_version !== 1 | `{ error: "unsupported_schema", version: N }` |

## Acceptance Criteria to Verification Mapping
| AC | Verification |
|---|---|
| createBaseline returns Baseline with schema_version:1, created_at, lockfile_hash, packages map | test: `valid create` |
| Each packages entry is TrustProfile with all 6 fields | test: `valid create - trust profile fields` |
| readBaseline loads, parses, validates, returns Baseline | test: `read round-trip` |
| readBaseline returns `{error:"not_initialized"}` for missing file | test: `missing file` |
| readBaseline returns `{error:"corrupted"}` for invalid JSON | test: `corrupted file` |
| readBaseline returns `{error:"unsupported_schema",version:N}` for wrong schema | test: `wrong schema version` |
| Unit tests cover all 6 ACs plus empty dep list | test file covers all cases |

## Test Strategy
- Node.js built-in test runner (`node:test`)
- `readBaseline` tests use real temp directory + real file I/O (per global conventions: integration tests use temp directories with real file I/O)
- `createBaseline` tests are pure — no I/O
- No mocks needed: no external dependencies in this module

## Stubs
None. No external dependencies exist in this module.

## Risks and Questions
- `provenanceStatus` for `createBaseline`: the story specifies callers pass `"unknown"` when registry data is unavailable. Since `createBaseline` doesn't fetch registry data, it always sets `provenanceStatus: "unknown"`. Callers that do have provenance data would need to mutate after creation. This is correct for now — no registry fetching in this story scope.
- The `admittedAt` timestamp is set to `new Date().toISOString()` at creation time. No clock injection — acceptable for v0.1.

## Verification Results

Command: `node --test test/baseline/manager.test.js`
Result: 9 tests pass, 0 fail

| AC | Status | Evidence |
|---|---|---|
| createBaseline schema_version:1, created_at, lockfile_hash, packages | PASS | test: "createBaseline returns a Baseline with required top-level fields" |
| TrustProfile fields (all 6) | PASS | test: "createBaseline produces TrustProfile entries with all required fields" |
| readBaseline round-trip | PASS | test: "readBaseline returns the Baseline object for a valid file (round-trip)" |
| readBaseline: not_initialized | PASS | test: "readBaseline returns { error: 'not_initialized' } when file does not exist" |
| readBaseline: corrupted | PASS | test: "readBaseline returns { error: 'corrupted' } for a file with invalid JSON" |
| readBaseline: unsupported_schema | PASS | test: "readBaseline returns { error: 'unsupported_schema', version } for unknown schema_version" |
| Unit tests: all 7 cases covered | PASS | 9 tests total (includes null hasInstallScripts, empty dep list, package name keying) |

Full suite: `node --test` — 41 tests pass, 0 fail.
