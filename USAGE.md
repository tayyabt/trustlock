# trustlock — Usage Reference

Full reference for all trustlock commands, flags, exit codes, and error messages.

## Contents

- [Global behavior](#global-behavior)
- [Exit codes](#exit-codes)
- [Commands](#commands)
  - [init](#trustlock-init)
  - [check](#trustlock-check)
  - [approve](#trustlock-approve)
  - [audit](#trustlock-audit)
  - [clean-approvals](#trustlock-clean-approvals)
  - [install-hook](#trustlock-install-hook)
- [Error messages](#error-messages)

---

## Global behavior

trustlock reads configuration from `.trustlockrc.json` in the current working directory. All commands that require a policy file (`check`, `approve`, `audit`) will exit 2 if `.trustlockrc.json` is missing.

All output goes to **stdout**. Error messages and warnings go to **stderr**.

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Success — all packages admitted, no changes detected, or informational command completed |
| `1`  | Blocked — one or more packages blocked **and** `--enforce` was passed to `check` |
| `2`  | Fatal error — missing config, malformed lockfile, unknown lockfile version, invalid arguments |

Advisory mode (`trustlock check` without `--enforce`) always exits 0, even when packages are blocked. This is intentional: the pre-commit hook warns but does not block commits.

---

## Commands

### trustlock init

Initialize trustlock in the current project. Creates `.trustlockrc.json`, the `.trustlock/` directory scaffold, and optionally the initial trusted baseline from the current lockfile.

```
trustlock init [--strict] [--no-baseline]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--strict` | boolean | Write stricter default policy thresholds (`cooldown_hours: 24`, `pinning.required: true`, `provenance.required_for: ["*"]`) |
| `--no-baseline` | boolean | Create config and scaffold only; skip lockfile parsing and baseline creation |

**What it creates:**

- `.trustlockrc.json` — policy configuration with defaults (or strict defaults with `--strict`)
- `.trustlock/baseline.json` — trusted snapshot of all packages in the current lockfile (unless `--no-baseline`)
- `.trustlock/approvals.json` — empty approvals store
- `.trustlock/.cache/` — registry response cache directory
- `.trustlock/.gitignore` — gitignores the `.cache/` directory (D8)

**Requirements:**

- `package-lock.json` must exist in the current directory.
- `.trustlock/` must not already exist (D6). Delete it first or use manual cleanup; see error messages below.

**Exit codes:**

- `0` — Initialization completed successfully.
- `2` — `.trustlock/` already exists, no lockfile found, lockfile JSON is malformed, or unsupported lockfile version.

**Examples:**

```bash
# Standard initialization
trustlock init

# Initialize with strict policy thresholds
trustlock init --strict

# Scaffold only — skip baseline creation (useful when lockfile is very large or offline)
trustlock init --no-baseline
```

**Output:**
```
Baselined 142 packages. Detected npm lockfile v3. Next: run 'trustlock install-hook' to enable the pre-commit hook.
```

With `--no-baseline`:
```
Skipped baseline creation. Run `trustlock audit` to review your dependency posture before running `trustlock check`.
```

---

### trustlock check

Evaluate dependency changes against the policy. Computes the delta between the current lockfile and the trusted baseline, fetches registry metadata, runs all policy rules, and reports admission decisions.

```
trustlock check [--enforce] [--json] [--dry-run] [--lockfile <path>] [--no-cache]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--enforce` | boolean | Exit 1 when any package is blocked. Never advances baseline. Use in CI. |
| `--json` | boolean | Emit results as a JSON array to stdout instead of terminal-formatted text |
| `--dry-run` | boolean | Evaluate policy and print results but do not advance the baseline |
| `--lockfile <path>` | string | Override lockfile auto-detection with an explicit path |
| `--no-cache` | boolean | Bypass registry response cache; always fetch fresh metadata |

**Behavior:**

1. Loads `.trustlockrc.json` and `.trustlock/baseline.json`.
2. Auto-detects `package-lock.json` (or uses `--lockfile`).
3. Computes delta: packages added or changed since the baseline.
4. If no changes detected: prints `No dependency changes` and exits 0.
5. For each changed/added package: fetches npm registry metadata, evaluates all policy rules, checks for valid approvals.
6. Prints results (terminal or JSON).
7. If all packages admitted and not `--enforce` and not `--dry-run`: advances baseline and git-stages `.trustlock/baseline.json`.
8. Exits per exit code table above.

**Advisory vs enforce:**

- Without `--enforce` (pre-commit / developer workflow): exits 0 regardless of blocks; advances baseline only on full admission.
- With `--enforce` (CI): exits 1 on any block; never advances baseline (D10).

**Examples:**

```bash
# Advisory check (pre-commit default)
trustlock check

# CI enforcement
trustlock check --enforce

# Dry run — evaluate without writing baseline
trustlock check --dry-run

# Machine-readable output
trustlock check --json

# Explicit lockfile path
trustlock check --lockfile path/to/package-lock.json

# Bypass registry cache
trustlock check --no-cache
```

**Output (terminal):**
```
✔ express@4.18.2 — admitted
✖ new-package@1.0.0 — blocked
  exposure:cooldown  Published 2h ago (policy requires 72h)
  Run to approve: trustlock approve new-package@1.0.0 --override cooldown --reason "..." --expires 7d
```

**Output (--json):**
```json
[
  {
    "name": "express",
    "version": "4.18.2",
    "checkResult": {
      "decision": "admitted",
      "findings": [],
      "approvalCommand": null
    }
  }
]
```

---

### trustlock approve

Write an approval entry for a blocked package. Approval overrides are scoped to specific policy rules, have a mandatory reason (by default), and expire after a configurable duration.

```
trustlock approve <pkg>@<ver> --override <rules> [--reason <text>] [--expires <duration>] [--as <name>]
```

**Arguments:**

| Argument | Required | Description |
|----------|----------|-------------|
| `<pkg>@<ver>` | Yes | Package name and exact version, e.g. `lodash@4.17.21` or `@scope/pkg@1.0.0` |

**Flags:**

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--override <rules>` | string (repeatable) | Yes | Comma-separated or repeated flag. Rule names to override. See valid rules below. |
| `--reason <text>` | string | Yes (default) | Human-readable reason for the approval. Required when `require_reason: true` in config. |
| `--expires <duration>` | string | No | Expiry duration. Format: `<N>d` (days) or `<N>h` (hours). Default: `max_expiry_days` from config (default 30d). Capped at `max_expiry_days`. |
| `--as <name>` | string | No | Override approver identity. Default: `git config user.name`. |

**Valid rule names (D9 — no wildcard approvals):**

| Rule name | Policy dimension |
|-----------|-----------------|
| `cooldown` | Release age / publication cooldown |
| `provenance` | SLSA provenance attestation |
| `pinning` | Exact version pinning in package.json |
| `scripts` | Install-time script execution |
| `sources` | Package source type (registry, git, file, url) |
| `new-dep` | First-time dependency addition |
| `transitive` | New transitive dependency count |

**Examples:**

```bash
# Basic approval with reason
trustlock approve express@5.0.0 \
  --override cooldown \
  --reason "Reviewed changelog; no breaking changes for our use case"

# Override multiple rules with one flag (comma-separated)
trustlock approve risky-pkg@2.1.0 \
  --override cooldown,provenance \
  --reason "Approved by security team in ticket SEC-123"

# Override multiple rules with repeated flags
trustlock approve risky-pkg@2.1.0 \
  --override cooldown \
  --override provenance \
  --reason "Approved by security team"

# Set a shorter expiry
trustlock approve temp-tool@1.0.0 \
  --override new-dep \
  --reason "One-time build script" \
  --expires 7d

# Set approver identity explicitly (useful in CI)
trustlock approve some-pkg@1.0.0 \
  --override cooldown \
  --reason "CI-triggered approval" \
  --as "ci-bot"
```

**Output:**
```
Approved new-package@1.0.0 (overrides: cooldown). Expires: 2026-05-09T14:22:00.000Z
```

**Requirements:**

- `<pkg>@<ver>` must exist in the current lockfile.
- `--override` must contain only valid rule names (listed above). No wildcards (D9).
- `--reason` is required by default; configure `require_reason: false` to disable.
- `--expires` must not exceed `max_expiry_days` (default: 30 days).
- Approver identity resolved from `git config user.name` or `--as`. Exits 2 if neither is set.

---

### trustlock audit

Scan the full dependency tree for trust posture. Evaluates every package in the lockfile (not just recent changes) and prints aggregate statistics with heuristic suggestions.

```
trustlock audit
```

**No flags.** Always exits 0 (informational command; no enforcement).

**Requires:** `.trustlockrc.json` and `package-lock.json`.

**Output includes:**
- Total package count
- Provenance coverage percentage
- Packages with install scripts (npm lockfile v3 only)
- Source type breakdown (registry vs git vs file vs url)
- Age distribution (< 24h, 24–72h, > 72h)
- Cooldown violation count
- List of currently blocked packages with their suggested approval commands

**Examples:**

```bash
# Review full tree posture
trustlock audit
```

**Sample output:**
```
trustlock audit — 142 packages

Provenance:      23% (33 packages have SLSA attestations)
Install scripts: 4 packages (acorn, esbuild, fsevents, node-gyp)
Sources:         registry: 141, git: 1
Age:             <24h: 0  24-72h: 2  >72h: 140
Cooldown:        2 packages violate current policy (72h cooldown)

Currently blocked packages:
  some-new-pkg@1.0.0
    Run to approve: trustlock approve some-new-pkg@1.0.0 --override cooldown --reason "..." --expires 7d
```

---

### trustlock clean-approvals

Remove expired approval entries from `.trustlock/approvals.json`. Prints counts of removed and remaining approvals.

```
trustlock clean-approvals
```

**No flags.** Always exits 0 (informational command).

**Note:** `trustlock check` automatically skips expired approvals when evaluating policy but does not delete them (Q2). Use `clean-approvals` to prune the file.

**Examples:**

```bash
trustlock clean-approvals
```

**Output (when expired entries are found):**
```
Removed 3 expired approval(s). 2 active approval(s) remain.
```

**Output (when no expired entries):**
```
No expired approvals found.
```

---

### trustlock install-hook

Install `trustlock check` as a Git pre-commit hook. Creates or appends to `.git/hooks/pre-commit` and makes it executable.

```
trustlock install-hook [--force]
```

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--force` | boolean | Overwrite an existing hook that does not already contain `trustlock check` |

**Behavior:**

| State | Behavior |
|-------|----------|
| Hook does not exist | Creates `/.git/hooks/pre-commit` with shebang + `trustlock check`, sets executable |
| Hook exists and already contains `trustlock check` | Prints `Hook already installed.` — no changes |
| Hook exists without `trustlock check`, no `--force` | Appends `trustlock check` on a new line |
| Hook exists without `trustlock check`, `--force` | Overwrites with fresh hook after printing a warning |

**Examples:**

```bash
# Install (or append to existing hook)
trustlock install-hook

# Overwrite an existing hook
trustlock install-hook --force
```

**Output (new install):**
```
Installed trustlock pre-commit hook at /path/to/.git/hooks/pre-commit
```

**Output (append):**
```
Appended trustlock check to existing pre-commit hook at /path/to/.git/hooks/pre-commit
```

**Output (already installed):**
```
Hook already installed.
```

**Requirements:**

- Must be run inside a git repository (`.git` must exist).

---

## Error messages

| Error | Command | Exit | Meaning |
|-------|---------|------|---------|
| `trustlock is already initialized. Delete .trustlock/ to reinitialize.` | init | 2 | D6: `.trustlock/` already exists |
| `No lockfile found. Run npm install first to generate package-lock.json.` | init | 2 | `package-lock.json` absent |
| `Unsupported npm lockfile version X. trustlock supports v1, v2, v3.` | init, check | 2 | Q1: unknown lockfile version |
| `No .trustlockrc.json found. Run trustlock init first.` | check, audit | 2 | Policy file absent |
| `No baseline found. Run trustlock init first.` | check | 2 | Baseline absent |
| `Baseline is corrupted or uses an unsupported schema version.` | check | 2 | Baseline file malformed |
| `No lockfile found. Expected: package-lock.json` | check, audit | 2 | Lockfile absent |
| `Error: Invalid package spec "<spec>". Expected format: <name>@<version>` | approve | 2 | Malformed `<pkg>@<ver>` argument |
| `Error: --override is required.` | approve | 2 | `--override` flag missing |
| `Error: '<rule>' is not a valid rule name. Valid rules: ...` | approve | 2 | Invalid rule name in `--override` |
| `Error: Maximum expiry is N days` | approve | 2 | `--expires` exceeds `max_expiry_days` |
| `Error: --reason is required` | approve | 2 | Reason absent and `require_reason: true` |
| `Error: Cannot determine approver identity. Set git config user.name or use --as` | approve | 2 | No git user identity and no `--as` |
| `Error: <pkg>@<ver> not found in lockfile` | approve | 2 | Package not in current lockfile |
| `Not a git repository (no .git directory found)` | install-hook | 2 | Must be inside a git repo |
| `Usage: trustlock <command> [options]\nAvailable commands: ...` | (no command) | 2 | No command provided |
| `Unknown command: <cmd>. Available commands: ...` | (unknown cmd) | 2 | Unrecognized command |
