# System Overview: dep-fence v0.1

## What It Is

A dependency admission controller for npm projects. Evaluates trust signals on dependency changes and produces binary admit/block decisions based on declared policy.

## Where It Runs

- **Git pre-commit hook** (advisory mode): warns on violations, exit 0; advances baseline on full admission
- **CI check** (enforce mode, `--enforce`): blocks on violations, exit 1; never advances baseline

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                    CLI                       │
│  init | check | approve | audit | clean     │
│  install-hook                                │
├─────────────────────────────────────────────┤
│                 Policy Engine                │
│  Loads policy → evaluates rules → decides    │
│  Rules: provenance, cooldown, pinning,       │
│         scripts, sources, new-dep, transitive│
├──────────┬──────────┬───────────────────────┤
│ Lockfile │ Registry │ Baseline  | Approvals  │
│ Parser   │ Client   │ Manager   | Store      │
│          │ + Cache  │           |            │
├──────────┴──────────┴───────────────────────┤
│                   Output                     │
│            Terminal | JSON                    │
├─────────────────────────────────────────────┤
│                   Utils                      │
│            git | semver | time               │
└─────────────────────────────────────────────┘
```

## Data Flow: `dep-fence check`

```
1. CLI parses args (--enforce, --json, --dry-run, --lockfile, --no-cache)
2. Policy engine loads:
   a. PolicyConfig from .depfencerc.json
   b. Baseline from .dep-fence/baseline.json
   c. Approvals from .dep-fence/approvals.json
   d. Current lockfile via lockfile parser
3. Compute delta: current lockfile vs baseline
4. If no changes → "No dependency changes" → exit 0
5. For each changed/added dependency:
   a. Fetch registry metadata (cache-first)
   b. Evaluate all applicable rules
   c. Check for valid (non-expired, scope-matching) approvals
   d. Produce CheckResult (admitted | admitted_with_approval | blocked)
6. Format output (terminal or JSON)
7. If all admitted and not --dry-run and not --enforce:
   a. Update baseline with newly admitted packages
   b. git add .dep-fence/baseline.json
8. Exit: 0 (advisory or all-pass) | 1 (enforce + any block) | 2 (fatal error)
```

## Data Flow: `dep-fence init`

```
1. Detect lockfile (package-lock.json). Fail if none found.
2. Fail if .dep-fence/ already exists (D6).
3. Create .depfencerc.json with defaults.
4. Create .dep-fence/ directory.
5. Create .dep-fence/approvals.json (empty array).
6. Create .dep-fence/.cache/ and .dep-fence/.gitignore (cache gitignored, D8).
7. Parse current lockfile → ResolvedDependency[].
8. For each dependency, build TrustProfile (fetch registry metadata for provenance).
9. Write .dep-fence/baseline.json.
10. Print summary.
```

## Data Flow: `dep-fence approve`

```
1. Parse package@version from args.
2. Validate package exists in current lockfile.
3. Validate --override values are valid rule names.
4. Calculate expiry (--expires or default from config). Enforce max.
5. Get approver identity (git config user.name or --as).
6. Append entry to .dep-fence/approvals.json.
7. Print confirmation with expiry date.
```

## Key Constraints

- **Zero runtime dependencies.** Pure Node.js built-ins only.
- **All-or-nothing baseline advance (D1).** If any dependency is blocked, no baseline advancement for any.
- **Approval in same commit (D2).** Pre-commit hook reads working tree, not previous commit.
- **CI is read-only (D10).** `--enforce` never writes baseline.
- **Fail hard on unknown lockfile versions (Q1).** Exit 2, no best-effort.
- **Manual approval cleanup only (Q2).** `check` skips expired, never deletes.

## Technology

- **Runtime:** Node.js (>=18.3 for `node:util.parseArgs`)
- **Language:** JavaScript (ES modules)
- **HTTP:** `node:https` (built-in)
- **CLI args:** `node:util.parseArgs` (built-in)
- **File I/O:** `node:fs/promises` (built-in)
- **Child process:** `node:child_process` for git operations
- **Package format:** npm package, publishable to registry
- **No TypeScript in v0.1** — minimizes build complexity and keeps the tool simple

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Spec: 2026-04-07-dep-fence-full-spec
