# Product Review: trustlock Full Spec

**Spec:** `specs/2026-04-07-trustlock-full-spec.md`
**Reviewed:** 2026-04-08
**Status:** Approved with binding decisions

---

## 1. User Model

### User types

| User type | Goal | Sees | Does |
|---|---|---|---|
| **Developer** | Ship code without supply chain friction | Advisory check results on commit; block reasons; generated approval commands | Updates dependencies, runs `approve` when blocked, commits approval entries |
| **Policy owner** | Balance supply chain security with developer velocity | Audit reports, policy compliance summaries, baseline state | Runs `init`, edits `.trustlockrc.json`, manages allowlists, adjusts thresholds |
| **CI pipeline** (non-human) | Enforce policy as a hard merge gate | JSON/SARIF output, exit codes | Runs `trustlock check --enforce`; never approves; never writes approvals |
| **Code reviewer** | Verify dependency changes and approvals are justified | Approval entries in PR diff, CI check status | Reviews approvals during normal PR review; no direct trustlock commands |

### Permissions

trustlock has no access control. Any developer can run `approve`. Enforcement of "who may approve" is delegated entirely to Git code review — approvals are committed files subject to PR review like any other change.

---

## 2. Workflows and Handoffs

### Primary workflows

1. **Happy-path update:** Developer updates dep -> commits -> pre-commit hook runs `check` -> all admitted -> baseline advances -> commit succeeds.
2. **Blocked dependency:** Hook blocks -> developer sees reason + approval command -> developer waits (cooldown) or runs `approve` -> commits approval + lockfile together -> CI re-checks -> reviewer sees approval in diff.
3. **Onboarding:** Policy owner runs `init` -> baseline created from current lockfile -> hook installed -> team starts using.
4. **Audit:** Policy owner runs `audit` -> sees whole-tree trust posture -> adjusts policy.
5. **Hygiene:** `clean-approvals` removes expired entries.

### Handoffs

- **Developer -> CI:** Commit/PR triggers enforced check.
- **Developer -> Reviewer:** Approval JSON entries land in the PR diff for human review.
- **Policy owner -> Team:** Policy file changes propagate to all local hooks and CI.

---

## 3. Interaction Model

### Initiation

| Action | Initiator | Trigger |
|---|---|---|
| `check` (advisory) | Git pre-commit hook | `git commit` |
| `check --enforce` | CI pipeline | PR opened/updated |
| `approve` | Developer | Manual, after block |
| `init` | Policy owner | Manual, once per project |
| `audit` | Policy owner or developer | Manual, on-demand |
| `clean-approvals` | Developer, CI, or cron | Manual or automated |
| `install-hook` | Developer or policy owner | Manual, once per clone |

### System automation

- Detects changed packages via baseline diff (developer provides nothing beyond the lockfile change).
- Validates approval inputs: override names, max expiry, package existence in lockfile.
- Records approval timestamp and approver identity from `git config user.name`.
- Advances baseline automatically on full admission (local hook flow only).

### Feedback

| Scenario | Output |
|---|---|
| No changes | "No dependency changes" -> exit 0 |
| All admitted | Summary of admitted packages -> baseline advances -> exit 0 |
| Blocked | Per-package block reasons + generated approval commands -> exit 0 (advisory) / exit 1 (enforce) |
| Config missing / parse failure | Fatal error -> exit 2 |
| Registry unreachable | Per-check warnings; registry-dependent checks become warnings, not blocks; CI does not break on npm outages |
| Invalid approval input | Error with specific reason (package not in lockfile, invalid override name, expiry exceeds max) |

---

## 4. Binding Product Decisions

These decisions are binding for architecture and planning.

### D1. All-or-nothing baseline advance

If a commit changes multiple packages and any one is blocked, no baseline advancement occurs for any package. The developer must resolve all blocks before any enter the baseline.

### D2. Approval valid in same commit

The pre-commit hook reads the approvals file from the working tree at commit time, not from the previous commit. A developer can write an approval and commit it alongside the lockfile change in a single commit.

### D3. Removed dependencies — silent, no policy evaluation

Removed packages are silently dropped from the baseline when the check passes. No rule fires on removal. Removing a dependency reduces attack surface.

### D4. Cooldown clears_at timestamp required

When cooldown blocks a package, the output must include the exact UTC timestamp when the cooldown clears. Non-negotiable UX requirement.

### D5. Single lockfile in v0.1

`--lockfile` accepts exactly one path or auto-detects one. Monorepo / multiple lockfile support deferred to v0.2.

### D6. init fails if .trustlock/ exists

`init` errors if `.trustlock/` already exists. The user must delete the directory first to reset. A `--force` flag on `init` may override this.

### D7. Approver identity from git config

Approval attribution uses `git config user.name` (or `--as` flag). Not `$USER` or OS identity.

### D8. Cache is gitignored

`.trustlock/.cache/` is created during `init` and added to `.trustlock/.gitignore`. Cache is local, ephemeral, and never committed.

### D9. No wildcard approvals

An approval must specify which rules it overrides via `--override`. There is no "approve all rules" option. The developer must declare exactly what policy they are bypassing.

### D10. CI is read-only — no baseline advance in enforce mode

`check --enforce` never advances the baseline. Baseline advancement happens only in the local pre-commit hook flow. If a team wants CI to advance the baseline, they configure an explicit step (future `trustlock advance-baseline` or equivalent). CI that silently writes and pushes is out of scope.

---

## 5. Open Questions

These must be resolved before architecture begins.

### Q1. Unrecognized lockfile format version

If an npm lockfile v4 (or other unrecognized version) appears, should trustlock fail hard (exit 2) or attempt best-effort parsing with a warning? Affects forward-compatibility design of the parser.

### Q2. Approval cleanup trigger

The spec defines `clean-approvals` but not when it runs. Options: (a) manual only, (b) `check` auto-cleans expired approvals as a side effect, (c) CI runs it periodically. Affects whether expired approvals accumulate.

---

## 6. Scope Boundaries

### In scope for v0.1

- npm lockfile parsing (v1, v2, v3)
- All policy rules from spec section 6 (trust-continuity:provenance, exposure:cooldown, exposure:pinning, execution:scripts, execution:sources, delta:new-dependency, delta:transitive-surprise)
- Baseline management (create, read, advance)
- Approval workflow (create, validate, clean)
- Registry client with caching (npm registry + attestations API)
- CLI commands: init, check, approve, audit, clean-approvals, install-hook
- Terminal and JSON output
- Git hook integration

### Explicitly out of scope

- Malware detection, CVE tracking, license compliance (spec section 10)
- Dependency recommendations
- Access control within trustlock (delegated to git/PR review)
- Publisher change detection (v0.2)
- SARIF output (v0.2)
- pnpm/yarn parsers (v0.2)
- Monorepo / multiple lockfile support (v0.2)
- Policy profiles (v0.2)
- Registry mirroring or proxying
