# trustlock — Policy Reference

Complete reference for every configurable field in `.trustlockrc.json`.

## Overview

`.trustlockrc.json` is a JSON file in your project root created by `trustlock init`. It controls which policy rules run and at what thresholds. All fields are optional; unset fields use their documented defaults.

Unknown top-level keys are silently ignored (forward compatibility).

## Field reference

### `cooldown_hours`

| Property | Value |
|----------|-------|
| Type | `number` |
| Default | `72` |
| Unit | Hours |

How many hours must pass after a package version is published to npm before trustlock will admit it. Packages published within the cooldown window are blocked with the `exposure:cooldown` finding.

The cooldown window protects against [protestware](https://en.wikipedia.org/wiki/Protestware) and supply-chain attacks that rely on brief publication windows before the community detects the malicious version.

**Example:**
```json
{
  "cooldown_hours": 24
}
```

Set to `0` to disable cooldown enforcement entirely.

---

### `pinning.required`

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `false` |

When `true`, trustlock blocks any package whose corresponding entry in `package.json` uses a floating semver range (`^`, `~`, `*`, `x`, or range syntax). Exact pinning (`"4.17.21"`) is required.

Floating ranges allow `npm install` to silently upgrade to a newer patch or minor version, bypassing trustlock review. Enabling `pinning.required` enforces that every direct dependency version is locked.

**Example:**
```json
{
  "pinning": {
    "required": true
  }
}
```

---

### `scripts.allowlist`

| Property | Value |
|----------|-------|
| Type | `string[]` |
| Default | `[]` |
| Element type | npm package name |

List of package names whose install-time scripts (`preinstall`, `postinstall`, `install`) are explicitly allowed. Packages not on this list that have install scripts are blocked with an `execution:scripts` finding.

**Note:** Install script detection requires npm lockfile v3. With v1/v2 lockfiles this field has no effect.

**Example:**
```json
{
  "scripts": {
    "allowlist": ["esbuild", "fsevents", "node-gyp"]
  }
}
```

Set to an empty array `[]` (the default) to block all packages with install scripts.

---

### `sources.allowed`

| Property | Value |
|----------|-------|
| Type | `string[]` |
| Default | `["registry"]` |
| Allowed values | `"registry"`, `"git"`, `"file"`, `"url"` |

Allowed package source types. Packages whose source type is not in this list are blocked with a `trust:sources` finding.

| Source type | Description |
|-------------|-------------|
| `"registry"` | Published to the npm registry (default; safe) |
| `"git"` | Installed from a git URL (e.g. `github:org/repo`) |
| `"file"` | Installed from a local path (e.g. `file:../my-lib`) |
| `"url"` | Installed from an HTTP/HTTPS tarball URL |

**Example (allow git sources in addition to registry):**
```json
{
  "sources": {
    "allowed": ["registry", "git"]
  }
}
```

---

### `provenance.required_for`

| Property | Value |
|----------|-------|
| Type | `string[]` |
| Default | `[]` |
| Element type | npm package name, or `"*"` for all packages |

List of package names that must carry SLSA provenance attestations. Packages on this list that lack attestations are blocked with a `trust:provenance` finding.

Use `"*"` to require provenance for all packages. This is a strict setting appropriate for high-assurance environments.

**Example (require provenance for specific packages):**
```json
{
  "provenance": {
    "required_for": ["@myorg/critical-lib", "payment-sdk"]
  }
}
```

**Example (require provenance for all packages):**
```json
{
  "provenance": {
    "required_for": ["*"]
  }
}
```

---

### `transitive.max_new`

| Property | Value |
|----------|-------|
| Type | `number` |
| Default | `5` |

Maximum number of new transitive dependencies that a single direct dependency upgrade may introduce before trustlock emits a `trust:transitive-surprise` finding. This is a warning-level finding (does not block by itself) that surfaces unexpected dependency bloat.

**Example:**
```json
{
  "transitive": {
    "max_new": 3
  }
}
```

Set to a high number (e.g. `1000`) to effectively disable transitive surprise warnings.

---

### `require_reason`

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `true` |

When `true`, the `--reason` flag is required for every `trustlock approve` invocation. A missing or empty reason causes the command to exit 2.

Set to `false` to allow silent approvals (not recommended for team environments).

**Example:**
```json
{
  "require_reason": false
}
```

---

### `max_expiry_days`

| Property | Value |
|----------|-------|
| Type | `number` |
| Default | `30` |
| Unit | Days |

Maximum allowed approval expiry in days. If `trustlock approve --expires` specifies a duration longer than `max_expiry_days`, the command exits 2 with an error. This prevents indefinite approvals from accumulating.

**Example:**
```json
{
  "max_expiry_days": 14
}
```

---

## Complete example

```json
{
  "cooldown_hours": 72,
  "pinning": {
    "required": false
  },
  "scripts": {
    "allowlist": []
  },
  "sources": {
    "allowed": ["registry"]
  },
  "provenance": {
    "required_for": []
  },
  "transitive": {
    "max_new": 5
  },
  "require_reason": true,
  "max_expiry_days": 30
}
```

This is the exact policy written by `trustlock init` (no flags). See [`examples/configs/production.trustlockrc.json`](examples/configs/production.trustlockrc.json) for a strict production policy and [`examples/configs/relaxed.trustlockrc.json`](examples/configs/relaxed.trustlockrc.json) for a permissive greenfield policy.

## Policy rule names

These names are used in `--override` flags for `trustlock approve`:

| Rule name | Dimension |
|-----------|-----------|
| `cooldown` | Publication age cooldown |
| `provenance` | SLSA provenance attestation |
| `pinning` | Exact version pinning |
| `scripts` | Install-time scripts |
| `sources` | Package source type |
| `new-dep` | First-time dependency addition |
| `transitive` | New transitive dependency count |
