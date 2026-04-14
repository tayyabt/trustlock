/**
 * Approval model — data shape, validation constants, duration parsing,
 * and createApproval factory.
 *
 * Approval structure:
 *   package      {string}    Package name (e.g. "lodash")
 *   version      {string}    Exact version (e.g. "4.17.21")
 *   overrides    {string[]}  Policy rule names this approval bypasses
 *   reason       {string}    Human-readable reason for the approval
 *   approver     {string}    Identity string (git user.name or --as value)
 *   approved_at  {string}    ISO 8601 UTC timestamp of when approval was granted
 *   expires_at   {string}    ISO 8601 UTC timestamp of expiry
 */

/**
 * Maps finding rule IDs (category:name format used by policy rules) to the short
 * approval names accepted by `trustlock approve --override`.
 *
 * The terminal formatter uses this to translate findings into a copy-pasteable command.
 */
export const FINDING_RULE_TO_APPROVAL_NAME = new Map([
  ['exposure:cooldown',           'cooldown'],
  ['execution:scripts',           'scripts'],
  ['execution:sources',           'sources'],
  ['trust-continuity:provenance', 'provenance'],
  ['exposure:pinning',            'pinning'],
  ['delta:new-dependency',        'new-dep'],
  ['delta:transitive-surprise',   'transitive'],
]);

/**
 * The set of valid policy rule names that can be used in overrides.
 * An approval must name one or more of these explicitly (D9: no wildcard approvals).
 */
export const VALID_RULE_NAMES = new Set([
  'provenance',
  'cooldown',
  'pinning',
  'scripts',
  'sources',
  'new-dep',
  'transitive',
]);

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Parse a duration string into milliseconds.
 *
 * Accepted formats:
 *   "Nd"  — N days  (e.g. "7d", "30d")
 *   "Nh"  — N hours (e.g. "24h", "1h")
 *
 * @param {string} str  Duration string to parse
 * @returns {number}    Duration in milliseconds
 * @throws {Error}      When the format is invalid or the numeric part is non-positive
 */
export function parseDuration(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error(`Invalid duration "${str}": must be a non-empty string like "7d" or "24h"`);
  }

  const match = str.match(/^(\d+)(d|h)$/);
  if (!match) {
    throw new Error(
      `Invalid duration "${str}": expected format is "<number>d" (days) or "<number>h" (hours), e.g. "7d" or "24h"`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value <= 0) {
    throw new Error(`Invalid duration "${str}": value must be a positive integer`);
  }

  return unit === 'd' ? value * MS_PER_DAY : value * MS_PER_HOUR;
}

/**
 * Create a validated Approval object.
 *
 * Validates:
 *   - overrides is a non-empty array of valid rule names (D9)
 *   - reason is non-empty when config.require_reason is true
 *   - duration is parseable
 *   - expiry is capped at config.max_expiry_days (not rejected)
 *
 * @param {object} input
 * @param {string}   input.package    Package name
 * @param {string}   input.version    Exact version
 * @param {string[]} input.overrides  Rule names to bypass
 * @param {string}   input.reason     Reason string
 * @param {string}   input.approver   Approver identity
 * @param {string}   input.duration   Duration string (e.g. "7d", "24h")
 * @param {object}  config
 * @param {boolean}  config.require_reason   Whether reason is required
 * @param {number}   config.max_expiry_days  Maximum allowed expiry in days
 * @returns {{ package: string, version: string, overrides: string[], reason: string, approver: string, approved_at: string, expires_at: string }}
 * @throws {Error}  When validation fails
 */
export function createApproval(input, config) {
  // Validate overrides — must be non-empty and all valid rule names (D9)
  if (!Array.isArray(input.overrides) || input.overrides.length === 0) {
    throw new Error(
      `Approval must specify at least one override rule (D9: no wildcard approvals). ` +
      `Valid rules: ${[...VALID_RULE_NAMES].join(', ')}`
    );
  }

  const invalidOverrides = input.overrides.filter((r) => !VALID_RULE_NAMES.has(r));
  if (invalidOverrides.length > 0) {
    throw new Error(
      `Invalid override rule name(s): ${invalidOverrides.join(', ')}. ` +
      `Valid rules: ${[...VALID_RULE_NAMES].join(', ')}`
    );
  }

  // Validate reason when required
  if (config.require_reason && (!input.reason || input.reason.trim().length === 0)) {
    throw new Error('A non-empty reason is required (require_reason is enabled in config)');
  }

  // Parse and cap duration
  const requestedMs = parseDuration(input.duration);
  const maxMs = (config.max_expiry_days || 30) * MS_PER_DAY;
  const effectiveMs = Math.min(requestedMs, maxMs);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + effectiveMs);

  return {
    package: input.package,
    version: input.version,
    overrides: [...input.overrides],
    reason: input.reason || '',
    approver: input.approver,
    approved_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}
