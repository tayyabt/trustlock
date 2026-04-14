# Demo

This directory contains fixtures and a recording script for the trustlock terminal demo.

## Generating the GIF

The demo uses [vhs](https://github.com/charmbracelet/vhs) to produce a deterministic terminal recording.

### Prerequisites

```bash
# macOS
brew install vhs

# or go install
go install github.com/charmbracelet/vhs@latest
```

Also requires `ffmpeg` and `ttyd` (installed automatically by vhs on macOS via Homebrew).

### Generate

From the repo root:

```bash
# 1. Install trustlock globally from source
npm install -g .

# 2. Edit demo/demo.tape to set the correct path to demo/fixtures/
#    (replace /path/to/trustlock with the actual repo path)

# 3. Run vhs
vhs demo/demo.tape
```

The output GIF is written to `demo/trustlock-demo.gif`.

## Fixtures

| File | Description |
|------|-------------|
| `fixtures/package.json` | Minimal project with `lodash` as a dependency |
| `fixtures/package-lock.json` | v3 lockfile — lodash only (baseline state) |
| `fixtures/package-lock-upgraded.json` | Adds `ms@2.1.3` (old, trusted — will be admitted) |
| `fixtures/package-lock-suspicious.json` | Adds `new-hotness@1.0.0` (recently published — will be blocked by cooldown) |
| `fixtures/.trustlockrc.json` | Default policy (72h cooldown) |
| `fixtures/.trustlock/approvals.json` | Empty approvals list |

## Demo flow

1. Show starting project state
2. Run `trustlock init --trust-current`
3. Swap in `package-lock-upgraded.json` and commit — trustlock admits `ms@2.1.3`
4. Swap in `package-lock-suspicious.json` and commit — trustlock blocks `new-hotness@1.0.0`
5. Run `trustlock approve new-hotness@1.0.0 --override cooldown --reason "..." --expires 7d`
6. Commit again — trustlock admits with approval
