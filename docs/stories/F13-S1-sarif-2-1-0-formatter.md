# Story: F13-S1 — SARIF 2.1.0 Formatter (`output/sarif.js`)

## Parent
F13: SARIF Output

## Description
Create `src/output/sarif.js` — a new leaf formatter in the output layer that maps the grouped CheckResult structure (F10 schema v2) to a valid SARIF 2.1.0 JSON document. This story owns the pure formatter with no CLI wiring; `check.js` wiring is F13-S2.

## Scope
**In scope:**
- `src/output/sarif.js` (new) — leaf formatter, no external imports from `src/`
- `formatSarifReport(groupedResults, lockfileUri)` → string (SARIF 2.1.0 JSON)
- `runs[0].tool.driver.rules`: 8 entries — `cooldown`, `provenance`, `scripts`, `sources`, `pinning`, `new-dep`, `transitive`, `publisher-change`
- `runs[0].results`: one entry per blocked finding (not per package); admitted and admitted_with_approval produce no results
- `artifactLocation.uri` populated from `lockfileUri` (pre-computed by caller, relative to projectRoot via F09 paths.js)
- `startLine: 1` hardcoded for all results (per spec §3.4 — no line-level precision)
- Edge cases: all-admitted → empty `results` array; multiple rules per package → one result per finding
- Tests for the formatter in isolation (no CLI invocation needed here)

**Not in scope:**
- `check.js` wiring or `--sarif` flag handling (F13-S2)
- `args.js` changes (F10-S4 already owns `--sarif` and `--json`/`--sarif` mutex)
- `--quiet` interaction (F13-S2)
- `--enforce` exit code (F13-S2)

## Entry Points
- Route / page / screen: `src/output/sarif.js` — pure SARIF formatting module
- Trigger / navigation path: Called by `check.js` (F13-S2) when `args.sarif === true`
- Starting surface: New file; no existing sarif.js in the output module

## Wiring / Integration Points
- Caller-side ownership: F13-S2 owns the `check.js` call site — it passes `groupedResults` and the pre-computed `lockfileUri` to `formatSarifReport`
- Callee-side ownership: This story owns the full SARIF serialization contract in `sarif.js`
- Caller-side conditional rule: The caller (check.js) does not exist yet for this boundary — keep the seam explicit. `formatSarifReport(groupedResults, lockfileUri)` is the expected export signature for F13-S2 to consume.
- Callee-side conditional rule: The `groupedResults` shape is established by F10-S3 (`src/output/json.js` schema v2): `{ blocked: CheckResult[], admitted_with_approval: CheckResult[], new_packages: CheckResult[], admitted: CheckResult[] }`. Wire to that contract directly.
- Boundary / contract check: Unit tests call `formatSarifReport(groupedResults, lockfileUri)` with synthetic grouped results and parse the output with `JSON.parse` to verify `$schema`, `version`, `runs[0].tool.driver.name`, `runs[0].tool.driver.rules.length === 8`, and `runs[0].results` count.
- Files / modules to connect: `src/output/sarif.js` only — leaf module; no imports from other `src/` modules (ADR-001)
- Deferred integration, if any: CLI wiring is F13-S2

## Not Allowed To Stub
- `runs[0].tool.driver.rules` must contain exactly 8 named rule objects — no stub or placeholder count
- Each blocked finding must produce a real `runs[0].results` entry with correct `ruleId`, `level: "error"`, `message.text`, and `artifactLocation.uri` — no placeholder shapes
- `admitted_with_approval` entries must produce zero SARIF results — the suppression logic must be real, not a comment
- `runs[0].tool.driver.name` must be the literal string `"trustlock"` — no variable or config reference
- SARIF `$schema` and `version: "2.1.0"` must be literal values in the output object

## Behavioral / Interaction Rules
- SARIF 2.1.0 document shape:
  ```json
  {
    "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    "version": "2.1.0",
    "runs": [{
      "tool": {
        "driver": {
          "name": "trustlock",
          "rules": [
            { "id": "cooldown", "name": "Cooldown", "shortDescription": { "text": "Package added too recently" } },
            { "id": "provenance", "name": "Provenance", "shortDescription": { "text": "Missing provenance attestation" } },
            { "id": "scripts", "name": "InstallScripts", "shortDescription": { "text": "Package runs install scripts" } },
            { "id": "sources", "name": "NoSource", "shortDescription": { "text": "Package has no source repository" } },
            { "id": "pinning", "name": "Pinning", "shortDescription": { "text": "Package version is not pinned" } },
            { "id": "new-dep", "name": "NewDependency", "shortDescription": { "text": "New dependency added" } },
            { "id": "transitive", "name": "TransitiveSurprise", "shortDescription": { "text": "Unexpected transitive dependency" } },
            { "id": "publisher-change", "name": "PublisherChange", "shortDescription": { "text": "Package publisher account changed" } }
          ]
        }
      },
      "results": [ ... ],
      "artifacts": [{ "location": { "uri": "<lockfileUri>" } }]
    }]
  }
  ```
- Each `results` entry shape:
  ```json
  {
    "ruleId": "<rule-name>",
    "level": "error",
    "message": { "text": "<package@version>: <human-readable reason>" },
    "locations": [{
      "physicalLocation": {
        "artifactLocation": { "uri": "<lockfileUri>", "index": 0 },
        "region": { "startLine": 1 }
      }
    }]
  }
  ```
- Multiple rules firing on one package → one `results` entry per rule (not per package)
- `transitive` ruleId: `message.text` includes `# via` annotation from pip-compile if present in the CheckResult (D10)
- Admitted packages (status `admitted` or `admitted_with_approval`) → produce zero results entries

## Acceptance Criteria
- [ ] `src/output/sarif.js` exports `formatSarifReport(groupedResults, lockfileUri)` as a named export
- [ ] Output is valid JSON with `$schema`, `version: "2.1.0"`, and `runs[0]` present
- [ ] `runs[0].tool.driver.name` is `"trustlock"`
- [ ] `runs[0].tool.driver.rules` contains exactly 8 entries with `id` values: `cooldown`, `provenance`, `scripts`, `sources`, `pinning`, `new-dep`, `transitive`, `publisher-change`
- [ ] Each blocked finding produces one `runs[0].results` entry with correct `ruleId`, `level: "error"`, `message.text`, and `artifactLocation.uri` matching `lockfileUri`
- [ ] Admitted packages (status `admitted` or `admitted_with_approval`) produce zero results entries
- [ ] All-admitted input → `runs[0].results` is an empty array; output is still valid SARIF
- [ ] Multiple rules on one package → one result per rule (not one per package)
- [ ] `region.startLine` is `1` for all results
- [ ] No import from any other `src/` module (ADR-001: leaf formatter only)
- [ ] Unit test: `formatSarifReport` with one blocked package (two rules) produces two results entries; `JSON.parse` succeeds
- [ ] Unit test: `formatSarifReport` with all admitted → `results: []`; `JSON.parse` succeeds

## Task Breakdown
1. Create `src/output/sarif.js` with `formatSarifReport(groupedResults, lockfileUri)` export
2. Implement `runs[0].tool.driver.rules` array with all 8 named rule objects as literal constants
3. Implement results mapping: iterate `groupedResults.blocked` (and `groupedResults.new_packages` where blocked), emit one result per firing rule per package
4. Implement admission suppression: skip `admitted` and `admitted_with_approval` entries entirely
5. Write unit tests covering: one blocked package two rules, all admitted, mixed blocked+admitted, empty input

## Verification
```
node --experimental-vm-modules node_modules/.bin/jest src/output/sarif.test.js
# Expected: all tests pass, no errors

# Manual smoke (assuming a test fixture):
node -e "
const { formatSarifReport } = await import('./src/output/sarif.js');
const r = JSON.parse(formatSarifReport(
  { blocked: [{ name: 'lodash', version: '4.17.21', rules: ['cooldown', 'provenance'] }],
    admitted_with_approval: [], new_packages: [], admitted: [] },
  'package-lock.json'
));
console.assert(r.version === '2.1.0');
console.assert(r.runs[0].results.length === 2);
console.log('PASS');
"
```

## Edge Cases to Handle
- All packages admitted → `results: []`; valid SARIF document still produced
- Package admitted_with_approval → no results entry (same as fully admitted)
- Multiple rules fire on one package → one result per rule, same `artifactLocation.uri`
- `transitive` rule: `message.text` includes `# via` annotation if present in the result data (D10)
- `lockfileUri` is passed in pre-computed by the caller (relative to projectRoot via F09); formatter does not compute paths

## Dependencies
- Depends on: F10-S3 (task-062) — stable `groupedResults` grouped structure contract from json.js schema v2 must be finalized before this formatter can reference the same input shape
- Blocked by: none (formatter is a pure function, can be developed against the F10-S3 contract shape in parallel if needed)

## Effort
M — new leaf module with a well-specified schema; no ambiguity in input/output shape; tests are straightforward

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
