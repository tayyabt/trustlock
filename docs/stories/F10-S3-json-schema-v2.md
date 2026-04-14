# Story: F10-S3 — json.js schema_version 2 rewrite

## Parent
F10: Output/UX Redesign

## Description
Rewrite `src/output/json.js` to produce schema_version 2 JSON output: grouped keys (`blocked`, `admitted_with_approval`, `new_packages`, `admitted`) matching the terminal structure, `approve_command` always present on blocked entries, and no backward-compatibility shim for schema_version 1 (D4, C5). This story owns the pure JSON formatter; CLI wiring is F10-S4.

## Scope
**In scope:**
- `src/output/json.js` (schema v2 rewrite)
- `formatCheckResults(groupedResults)` → JSON string (schema_version 2, grouped keys)
- `formatAuditReport(report)` → JSON string (structured audit report)
- `approve_command` field always present on blocked entries
- No schema_version 1 output path (C5: no backward-compat shim)

**Not in scope:**
- Terminal output (F10-S2)
- SARIF output (F13 — future sprint, depends on schema_version 2 being stable here)
- `--json` flag wiring (F10-S4)
- Progress counter (not in JSON stdout — enforced by CLI layer in F10-S4)
- "Commit this file." reminder (terminal-only per D9; never in JSON output)

## Entry Points
- Route / page / screen: `src/output/json.js` — pure JSON formatting module
- Trigger / navigation path: Called by CLI command handlers (check.js) when `--json` flag is active
- Starting surface: Existing `json.js` in the output module; this story rewrites it in place

## Wiring / Integration Points
- Caller-side ownership: F10-S4 owns wiring check.js to call `json.js:formatCheckResults` when `--json` is active
- Callee-side ownership: This story owns the full output schema and serialization logic in json.js
- Caller-side conditional rule: check.js exists but is not yet updated for F10 — this story defines the schema; F10-S4 wires to it
- Callee-side conditional rule: The existing json.js is being rewritten in place; this story delivers the new schema_version 2 contract
- Boundary / contract check: `formatCheckResults(groupedResults)` must accept the same `{ blocked, admitted_with_approval, new_packages, admitted }` shape as terminal.js S2 (shared input model); output must be parseable JSON with `schema_version: 2` at the top level. CI consumers can validate against this schema.
- Files / modules to connect: `src/output/json.js` only — leaf module, no imports from other `src/` modules
- Deferred integration, if any: SARIF output (F13) is a separate future story that reads the stable schema_version 2 structure established here

## Not Allowed To Stub
- `schema_version: 2` must be the literal value at the top level of every output object — no conditional, no fallback to 1
- `approve_command` must always be present on every entry in the `blocked` array — it is not optional (C5 + feature brief §2.1)
- Grouped key structure (`blocked`, `admitted_with_approval`, `new_packages`, `admitted`) must be present in every output, even as empty arrays — no omitting keys when empty
- No schema_version 1 fallback, migration shim, or conditional branch that outputs the old flat `results[]` structure (C5)

## Behavioral / Interaction Rules
- Top-level output shape:
  ```json
  {
    "schema_version": 2,
    "summary": { "changed": N, "blocked": N, "admitted": N, "wall_time_ms": N },
    "blocked": [ ... ],
    "admitted_with_approval": [ ... ],
    "new_packages": [ ... ],
    "admitted": [ ... ]
  }
  ```
- `blocked` entries must include: `name`, `version`, `from_version`, `rules`, `approve_command` (always present, never null)
- `admitted_with_approval` entries must include: `name`, `version`, `approver`, `expires`, `reason`
- `new_packages` entries must include: `name`, `version`, `admitted` (boolean), `approve_command` (if blocked)
- `admitted` entries: `name`, `version` only (minimal, matches terminal treatment)
- `approve_command` is never omitted on blocked entries; if multiple rules fire, the combined override string is `"cooldown,provenance"` (matching what terminal.js renders)
- "Commit this file." reminder is never included in JSON output (D9)
- Output is valid JSON; `JSON.stringify` with no trailing newline issues; formatted with 2-space indent for readability

## Acceptance Criteria
- [ ] `schema_version: 2` present at top level of every output object
- [ ] Grouped structure: `blocked`, `admitted_with_approval`, `new_packages`, `admitted` always present (empty array if no entries)
- [ ] `approve_command` always present on every `blocked` entry
- [ ] Multi-rule blocked entry: `rules` array lists all fired rules; `approve_command` includes all in a single `--override` flag value
- [ ] No `results[]` flat array in output (schema_version 1 structure must be completely absent)
- [ ] `formatAuditReport` produces valid JSON with named section keys
- [ ] "Commit this file." line never appears in JSON output
- [ ] `src/output/json.js` imports nothing outside Node.js built-ins (ADR-001)
- [ ] Unit tests: schema_version 2 present, grouped keys always present, approve_command always present on blocked, no v1 flat structure
- [ ] Output parses cleanly with `JSON.parse` (no trailing commas, no syntax errors)

## Task Breakdown
1. Read and understand the existing `src/output/json.js` before touching it
2. Define the schema_version 2 output shape as a JSDoc type comment at the top of the file
3. Implement `formatCheckResults(groupedResults)` → JSON string with schema_version 2 top-level shape
4. Implement `blocked` entry serializer: name, version, from_version, rules array, approve_command (always)
5. Implement `admitted_with_approval` entry serializer: name, version, approver, expires, reason
6. Implement `new_packages` entry serializer: name, version, admitted, approve_command (when blocked)
7. Implement `admitted` entry serializer: name, version only
8. Implement `formatAuditReport(report)` → JSON string with named section keys
9. Write unit tests in `src/output/__tests__/json.test.js`

## Verification
```bash
node --test src/output/__tests__/json.test.js
# Expected: all tests pass
# Spot-check: parse output with JSON.parse; confirm schema_version === 2
# Spot-check: blocked entry with two rules; confirm approve_command present with both rules in --override
# Spot-check: admitted-only run; confirm blocked and admitted_with_approval are [] not absent
```

## Edge Cases to Handle
- All packages admitted (no blocked entries): `blocked: []` must be present, not omitted
- Multiple rules on one blocked package: `approve_command` combines all as `"cooldown,provenance"` in a single `--override` value
- `--json` and `--sarif` mutual exclusion: this story does not enforce the gate; that is args.js in F10-S4. json.js is called only after the gate passes.
- Progress counter lines must never appear in JSON stdout: enforced by CLI layer (F10-S4), not by this module

## Dependencies
- Depends on: none within F10 (json.js is a leaf formatter; no import dependency on progress.js or terminal.js)
- Blocked by: none

## Effort
M — schema v2 rewrite is well-specified; primary work is the serialization shape and tests; no complex branching

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P2

---

## Run Log

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
