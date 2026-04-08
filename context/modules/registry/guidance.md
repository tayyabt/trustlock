# Module Guidance: Registry

## Responsibilities
- Fetch package metadata, version metadata, and attestations from npm registry
- Cache responses with TTL and staleness markers
- Degrade gracefully when registry is unreachable

## Stable Rules
- Cache-first: check cache before network request
- TTL enforcement: version metadata 24h, full metadata 1h, attestations 1h
- Staleness hierarchy: fresh → stale with warning → skipped with warning
- Never throw on network errors — return degraded result with status indicator
- Concurrency limit: 10 parallel HTTP requests

## Usage Expectations
- Called by policy engine during evaluation — one or more calls per changed dependency
- Returns structured data with a quality indicator (fresh, stale, unavailable)
- `--no-cache` bypasses cache entirely

## Integration Guidance
- Policy engine calls registry functions and receives metadata + quality status
- Registry module never evaluates policy — just provides data
- Cache directory (`.dep-fence/.cache/`) is gitignored and managed internally
- To add a new registry (v0.3 PyPI): create a new adapter file following the same interface

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: registry
