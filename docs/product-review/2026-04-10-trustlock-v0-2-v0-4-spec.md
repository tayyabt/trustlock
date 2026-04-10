# Product Review: trustlock v0.2–v0.3 Spec

**Spec:** `specs/2026-04-10-trustlock-v0.2-v0.4-spec.md`
**Date:** 2026-04-10
**Reviewer:** PM (product-review skill)
**Status:** Binding

---

## User Model

### User types

| Type | Role | Primary goal |
|---|---|---|
| Developer (local) | Runs pre-commit hook; approves blocks | Stay unblocked; get the exact command to unblock |
| Developer (team) | Same as above; approval enters code review | Team-auditable approval trail |
| Tech lead / security owner | Authors policy; may publish org policy via `extends` | Consistent enforcement without noise |
| CI system | Runs `--enforce`; uploads SARIF | Binary pass/fail; machine-readable output |
| Auditor (passive) | Reads `audit` output and approval history | Read-only status snapshot |

### Permissions

No in-product access control. All write operations are scoped by repo write access. The approval file goes through normal code review — that is the governance layer. Org policy governance is external (URL access control).

### Main workflows

1. Normal commit (no deps changed) → silent exit 0
2. Deps changed, all admitted → baseline advances → commit proceeds
3. Deps blocked → summary + blocked section + approve command → developer approves or waits → re-check → passes
4. New package added → NEW PACKAGES section (admitted or blocked per policy)
5. Publisher change detected → elevated block with `⚠` → developer investigates → approves or reverts
6. CI enforcement → `--enforce` → SARIF to GitHub Advanced Security → PR blocked or passes
7. Audit → read-only status snapshot; no side effects
8. Monorepo → projectRoot/gitRoot resolved at startup; `--project-dir` for CI
9. Org policy → tech lead publishes JSON at URL; repos use `extends`; floor enforcement automatic
10. Cross-project audit (`audit --compare`) → informational, always exits 0

### Handoffs

- Developer → code review: approval file committed alongside lockfile change
- CI → GitHub Advanced Security: SARIF via `actions/upload-sarif`
- Tech lead → team: org policy JSON at URL, referenced via `extends`

---

## Interaction Model

### Initiators

| Command | Who triggers | How |
|---|---|---|
| `init` | Developer | Manual, once per project |
| `check` | Pre-commit hook / CI / developer | Automatic on commit; on every PR run |
| `approve` | Developer | Manual, in response to a block |
| `audit` | Developer / tech lead | Manual, on-demand |
| `install-hook` | Developer | Manual, once per repo clone |
| `audit --compare` | Tech lead | Manual, periodic |

### What users provide vs. system-automatic

**`init`:** user runs from project dir; system detects lockfile, walks up for git root, fetches registry metadata for all packages, writes baseline + config + empty approvals. TTY-aware progress counter on stderr.

**`check`:** user provides nothing (hook) or optional flags. System resolves roots, loads policy (including remote `extends`), diffs lockfile vs baseline, fetches metadata for changed packages, evaluates rules, checks approvals, formats output, advances baseline if all admitted. Progress counter on stderr when ≥5 packages need metadata fetch.

**`approve`:** user provides `package@version`, `--override <rules>`, `--reason "..."`, optional `--expires`, optional `--as`. System validates package in lockfile, validates rule names, calculates absolute expiry, gets approver from git config (or `--as`), appends to approvals.json, prints confirmation with absolute expiry. "Commit this file" reminder always printed in terminal mode only.

**`audit`:** user provides nothing (or `--provenance`, `--pinning`, `--compare`). System reads lockfile + baseline, outputs section-per-signal. No side effects, always exits 0.

**`install-hook`:** user provides nothing (or `--project-dir`). System finds gitRoot, writes hook to `gitRoot/.git/hooks/pre-commit` with correct `--project-dir` embedded.

### Ownership rules

- **Approvals file:** manual cleanup only — `check` skips expired entries, never deletes.
- **Baseline:** advanced automatically on full admission only. CI (`--enforce`) never writes.
- **Org policy (remote `extends`):** cached 1 hour; stale cache used with stderr warning on failure; hard error if unreachable with no cache.

### Validation

- `approve`: package must be in current lockfile; override values must be valid rule names; expiry must not exceed config max.
- Profile floor enforcement: no profile may lower numeric floors below base config (exception: built-in `relaxed`).
- `extends` floor enforcement: repo cannot lower numeric floors below org policy; array values are unioned (repo cannot remove org entries).
- `init`: hard error if `.trustlock/` already exists.
- All commands: hard error if no `.git/` found in any parent directory.

### Lifecycle transitions

```
lockfile unchanged             → silent exit 0
all packages admitted          → baseline advances → commit proceeds
any package blocked            → baseline frozen → exit 0 advisory / exit 1 enforce
approval recorded              → re-check → admitted_with_approval → baseline advances
cooldown clears (time elapses) → re-check → admitted → baseline advances
approval expires               → check skips it → block resumes → re-approve required
```

---

## Binding Product Decisions

### D1 — `check` progress counter threshold
Show progress counter on stderr whenever `check` must fetch metadata for ≥5 packages. Below that threshold, silence is not confusing.

### D2 — Dev dependency handling
Dev dependencies are subject to all admission rules identically to production dependencies. trustlock makes no dev/prod distinction in blocking logic.

### D3 — `source.path` entries in uv.lock
Excluded entirely from admission checks and from audit output. Local first-party paths are not supply chain.

### D4 — JSON schema_version 2 only for v0.2+
No backward-compatibility shim for schema_version 1 consumers. Existing tooling must migrate to schema_version 2.

### D5 — `--json` and `--sarif` are mutually exclusive
If both are passed, exit with error: `Cannot use --json and --sarif together.`

### D6 — `audit --compare` is lockfile-read only
Reads lockfiles and baselines for signal data only. Does not load or evaluate per-directory policy. Always exits 0.

### D7 — pnpm workspace support in v0.2 ≠ workspace auto-detection
v0.2 filters pnpm lockfile entries by matching projectRoot against importer keys in pnpm-lock.yaml. This is lockfile-level filtering, not workspace auto-detection (reading `package.json` workspaces field), which is deferred to v0.3.

### D8 — `--as` flag on `approve` is confirmed in scope
Carry-forward from v0.1. Allows specifying approver identity when git config is unavailable.

### D9 — "Commit this file" reminder is terminal-only
Not emitted in `--json` mode.

### D10 — `delta:transitive-surprise` maps to `transitive` ruleId in SARIF
The `# via` annotation from pip-compile enriches the `message.text` field. No new SARIF ruleId. ruleId = `transitive`.

### D11 — `trustlock clean` is out of scope for v0.2–v0.3
Referenced only in system-overview architecture diagram. Not specified in this spec. Deferred (implicitly v0.4+).

### D12 — Built-in `relaxed` profile: product definition
`relaxed` reduces cooldown below the default 72h and does not require provenance for any package. Exact numeric values are an architecture decision. It must be documented, its behavior predictable, and a user-defined profile named `relaxed` overrides it entirely.

### D13 — `--lockfile` flag scope
Overrides only the lockfile file path. `.trustlockrc.json` and `.trustlock/` are still resolved from `projectRoot`. `--project-dir` and `--lockfile` remain independent flags.

### D14 — Default approval expiry is 7 days
The `--expires 7d` shown in blocked section approve commands is the default. Configurable via policy. Carry-forward from v0.1.

### D15 — Publisher change + null baseline: warn, never block
When `publisherAccount` is null for the old version: emit a stderr warning (`Could not compare publisher — no prior record`) but do not block. Record new publisher for future runs. Block only when both old and new publishers are known and differ.

### D16 — `--no-cache` flag
Carry-forward from v0.1. Behavior unchanged. Not redefined in this spec.

---

## Out of Scope (explicit)

- Cargo / crates.io — v0.4
- `trustlock diff`, `trustlock why` — v0.4
- CycloneDX SBOM generation — v0.4
- Shell completions and man page — v0.4
- `trustlock clean` command — v0.4+
- GitHub App / PR bot — not in scope
- Automatic allowlist curation — not in scope
- Go modules (go.sum) — v0.5+
- `.npmrc` / private registry support — deferred
- Workspace auto-detection from `package.json` workspaces field — v0.3
- Hosted trust intelligence API — v0.5+

---

## Notes for Architecture

- Publisher identity fetch (`_npmUser.name`) adds a new registry call per changed package. Architecture must confirm this fits within the zero-dependency constraint and existing cache layer.
- Remote `extends` fetch introduces a network call at policy-load time. Cache path and failure modes are product-specified (D15 in `extends` section). Architecture decides cache storage format.
- SARIF output (`--sarif`) goes to stdout. All other diagnostic output goes to stderr. This boundary must hold — do not mix.
- pnpm YAML parser and uv TOML parser must be purpose-built (no external libraries). Scope is intentionally narrow — only the constructs actually emitted by these tools.
- PyPI attestation check: do not hardcode endpoint URL. Verify current PyPI API documentation at implementation time.
- Profile floor enforcement and `extends` floor enforcement must be applied in the same pass. Architecture must define the merge order: `extends` base → repo config → profile overlay, with floors checked at each step.
