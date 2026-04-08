/**
 * JSON formatter for dep-fence.
 *
 * Serializes CheckResult[] and audit report objects to JSON strings for
 * machine consumption (CI integration). Pure serialization: no business
 * logic, no ANSI codes, no module dependencies.
 *
 * Input shapes:
 *   CheckResult[]: array of DependencyCheckResult objects as produced by
 *     the policy engine and passed through the CLI.
 *   AuditReport: object as produced by the audit command.
 *
 * Both functions return a 2-space indented JSON string. The caller (CLI,
 * F08) writes the returned string directly to stdout.
 *
 * ADR-001: zero runtime dependencies — uses only JSON.stringify.
 */

/**
 * Serialize an array of check results to a valid JSON string.
 *
 * @param {object[]} results - CheckResult[] from the policy engine
 * @returns {string} Valid JSON string; parseable by JSON.parse without error
 */
export function formatCheckResults(results) {
  return JSON.stringify(results, null, 2);
}

/**
 * Serialize an audit report object to a valid JSON string.
 *
 * @param {object} report - AuditReport from the audit command
 * @returns {string} Valid JSON string; parseable by JSON.parse without error
 */
export function formatAuditReport(report) {
  return JSON.stringify(report, null, 2);
}
