/**
 * Publisher identity comparison — trust-continuity:publisher rule.
 *
 * Pure comparison function: no I/O, no HTTP calls.
 * The caller (policy engine) provides pre-fetched publisher accounts;
 * this module owns the null-handling, equality comparison, and
 * block_on_publisher_change config respect.
 *
 * Block/warn contract (D15, ADR-006):
 *   - Both old and new publishers known and differ, block_on_publisher_change: true  → block
 *   - Both old and new publishers known and differ, block_on_publisher_change: false → warn only
 *   - Old publisher is null (v1 legacy entry or prior fetch failure)                → warn only, record new publisher
 *   - New publisher is null (registry did not return _npmUser.name)                 → warn only
 *   - Both null                                                                     → warn only
 *   - Same publisher                                                                → no action
 */

/**
 * Compare the publisher of a changed package against the baseline.
 *
 * @param {{ publisherAccount: string | null | undefined }} oldEntry
 *   Baseline TrustProfile entry. `publisherAccount` is null/undefined for v1
 *   entries or when a prior registry fetch failed.
 * @param {{ publisherAccount: string | null | undefined }} newVersionMeta
 *   Version metadata object returned by registry/client.js getVersionMetadata.
 *   `publisherAccount` is extracted from `_npmUser.name` by npm-registry.js.
 * @param {{ provenance?: { block_on_publisher_change?: boolean } }} config
 *   Policy config. `provenance.block_on_publisher_change` defaults to `true`.
 * @returns {{ blocked: boolean, warning: string | null, newPublisherAccount: string | null }}
 */
export function comparePublisher(oldEntry, newVersionMeta, config) {
  const oldPublisher = oldEntry?.publisherAccount ?? null;
  const newPublisher = newVersionMeta?.publisherAccount ?? null;
  const blockOnChange = config?.provenance?.block_on_publisher_change ?? true;

  // Old publisher unknown (v1 legacy entry or prior fetch failure) — warn only (D15).
  if (oldPublisher === null) {
    return {
      blocked: false,
      warning: 'Could not compare publisher — no prior record for this package',
      newPublisherAccount: newPublisher,
    };
  }

  // New publisher unknown — warn only, no block.
  if (newPublisher === null) {
    return {
      blocked: false,
      warning: 'Could not compare publisher — registry did not return publisher for new version',
      newPublisherAccount: null,
    };
  }

  // Both known and different — apply block_on_publisher_change policy.
  if (oldPublisher !== newPublisher) {
    if (blockOnChange) {
      return {
        blocked: true,
        warning: null,
        newPublisherAccount: newPublisher,
      };
    }
    return {
      blocked: false,
      warning: `Publisher changed: ${oldPublisher} → ${newPublisher}`,
      newPublisherAccount: newPublisher,
    };
  }

  // Same publisher — no action.
  return { blocked: false, warning: null, newPublisherAccount: newPublisher };
}
