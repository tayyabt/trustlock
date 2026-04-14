# ADR-003: Registry Caching and Offline Behavior

## Status
Accepted

## Supersedes
N/A

## Context
Policy rules like cooldown and provenance require live npm registry data. Other rules (pinning, source type, diff) are local-only. The tool must degrade gracefully when the registry is unreachable — not block CI on npm outages, but not silently skip security checks either. The spec (section 7.3) defines offline behavior expectations.

## Options Considered

### Option 1: Cache-first with staleness markers
- Description: Registry responses cached as JSON files in `.trustlock/.cache/`. Cache key: `{package}@{version}` for version data, `{package}` for full metadata. Fresh cache (within TTL) used directly. Stale cache triggers refresh attempt; on failure, stale data used with warning annotation. No cache + no network → "skipped" warning.
- Pros: Works offline if previously run. Stale data is better than no data. Clear signal when data quality is degraded. CI doesn't break on registry outages.
- Cons: Stale cache could miss a provenance regression that happened after the cache was written.

### Option 2: Strict online/offline split
- Description: Registry checks either succeed (fresh data) or emit "skipped: registry unreachable." No stale cache usage.
- Pros: No false confidence from stale data.
- Cons: First run on a new package always needs network. More checks skipped in offline scenarios.

### Option 3: Always-online with circuit breaker
- Description: Require network for registry checks. If registry fails, retry with exponential backoff. After N failures, circuit-break and skip all registry checks for the rest of the run.
- Pros: Maximizes fresh data.
- Cons: Slow when registry is flaky. Circuit breaker adds complexity.

## Decision
Option 1: Cache-first with staleness markers. This provides the best balance of availability and data quality.

**Cache TTLs:**
- Version metadata: 24 hours (immutable once published)
- Full package metadata (includes `time` object for cooldown): 1 hour
- Attestations: 1 hour

**Degradation hierarchy per check:**
1. Fresh cache → use, no warning
2. Stale cache → use, annotate findings with "stale registry data"
3. No cache, no network → skip check, annotate with "skipped: registry unreachable"

**`--no-cache` flag:** Bypasses cache entirely, fetches fresh.

## Consequences
- Implementation: Cache layer must store fetch timestamp alongside data. Cache reads check TTL. Cache writes are atomic (write to temp file, rename). Cache directory is gitignored (D8).
- Testing: Must test all three degradation states (fresh, stale, missing). Mock the HTTP layer to simulate registry failures.
- Operations: `.trustlock/.cache/` grows over time. Not a concern for typical projects (a few MB). Could add cache size limit in future.
- Future: v0.5 trust intelligence API would replace direct registry calls. The cache layer's interface (fetch metadata for package+version) remains the same.

## Deployment Architecture
- Deployment method: N/A (runtime behavior)
- Infrastructure needed: npm registry (external, best-effort)
- Environment variables: None (registry URL could be configurable in future for private registries)
- CI/CD considerations: CI environments may have restricted network. Cache-first behavior means subsequent CI runs are faster. `--no-cache` available for strict freshness.

## Module Structure
- `src/registry/cache.js` — read/write/TTL cache management
- `src/registry/client.js` — HTTP client, cache integration, degradation logic
- `src/registry/npm-registry.js` — npm registry API adapter
- `src/registry/provenance.js` — npm attestations API adapter

## Metadata
- Agent: architect
- Date: 2026-04-08
- Feature: registry-caching
