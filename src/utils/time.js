/**
 * Time utilities for dep-fence.
 * ISO 8601 timestamp parsing and age calculation.
 */

/**
 * Parse an ISO 8601 timestamp string into a Date object.
 * Handles UTC (Z), timezone offsets (+HH:MM / -HH:MM), and milliseconds.
 * @param {string} str
 * @returns {Date | null} A valid Date, or null if the string is not a valid timestamp.
 */
export function parseTimestamp(str) {
  if (typeof str !== 'string' || str.trim() === '') return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Calculate the age of a timestamp in hours, relative to `now`.
 * @param {string} isoString — ISO 8601 timestamp string
 * @param {Date} [now] — reference point; defaults to current time (injectable for tests)
 * @returns {number} Age in hours (floating-point). Returns Infinity if isoString is invalid.
 */
export function calculateAgeInHours(isoString, now = new Date()) {
  const then = parseTimestamp(isoString);
  if (!then) return Infinity;
  const diffMs = now.getTime() - then.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Format an ISO 8601 timestamp as a human-readable UTC string.
 * Output example: "April 12, 2026 at 14:30 UTC"
 * @param {string} isoString — ISO 8601 timestamp string
 * @returns {string} Human-readable timestamp, or the original string if invalid.
 */
export function formatHumanReadableTimestamp(isoString) {
  const d = parseTimestamp(isoString);
  if (!d) return String(isoString);

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);

  return `${datePart} at ${timePart} UTC`;
}
