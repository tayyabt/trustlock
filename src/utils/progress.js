/**
 * TTY-aware progress counter utility.
 *
 * Factory: createProgress(total, stream) → { tick(n), done() }
 *
 * TTY mode:    writes \rFetching metadata [N/total] per tick; done() emits \n
 * Non-TTY mode: writes Fetching metadata [N/total]\n at ~10% intervals; done() emits \n
 * Zero total:  returns a strict no-op; no division-by-zero risk
 *
 * Never writes to stdout; only to the injected stream (always stderr in production).
 * No imports — satisfies ADR-001 (zero runtime dependencies).
 */

/**
 * Create a progress counter bound to a writable stream.
 *
 * @param {number} total   - Total number of items to process.
 * @param {object} stream  - Writable stream with a write(string) method and optional isTTY.
 * @returns {{ tick(n?: number): void, done(): void }}
 */
export function createProgress(total, stream) {
  if (total === 0) {
    return { tick() {}, done() {} };
  }

  // Interval for non-TTY writes: every ~10% of total, minimum 1.
  const interval = Math.ceil(total * 0.1);
  let count = 0;
  let finished = false;

  function done() {
    if (finished) return;
    finished = true;
    stream.write('\n');
  }

  if (stream.isTTY) {
    return {
      tick(n = 1) {
        count += n;
        stream.write(`\rFetching metadata [${count}/${total}]`);
      },
      done,
    };
  }

  // Non-TTY: emit a full line at each ~10% boundary.
  return {
    tick(n = 1) {
      const prev = count;
      count += n;
      // Detect interval crossing: more than one boundary may be crossed if n > 1.
      if (Math.floor(count / interval) > Math.floor(prev / interval)) {
        stream.write(`Fetching metadata [${count}/${total}]\n`);
      }
    },
    done,
  };
}
