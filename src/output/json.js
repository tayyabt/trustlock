/**
 * JSON formatter for trustlock — schema_version 2.
 *
 * Serializes grouped check results and audit report objects to JSON strings
 * for machine consumption (CI integration). Pure serialization: no business
 * logic, no ANSI codes, no imports from other src/ modules.
 *
 * Output schema_version 2 top-level shape for formatCheckResults:
 *   {
 *     "schema_version": 2,
 *     "summary": { "changed": N, "blocked": N, "admitted": N, "wall_time_ms": N },
 *     "blocked": [ { name, version, from_version, rules, approve_command } ],
 *     "admitted_with_approval": [ { name, version, approver, expires, reason } ],
 *     "new_packages": [ { name, version, admitted, approve_command? } ],
 *     "admitted": [ { name, version } ]
 *   }
 *
 * All four group keys are always present, even as empty arrays.
 * approve_command is always present on every blocked entry — never null.
 * No schema_version 1 backward-compatibility shim (C5).
 *
 * ADR-001: zero runtime dependencies — uses only JSON.stringify.
 */

/**
 * @typedef {object} BlockedEntry
 * @property {string}   name             Package name
 * @property {string}   version          New (resolved) version
 * @property {string}   from_version     Previous baseline version
 * @property {string[]} rules            Fired blocking rule identifiers
 * @property {string}   approve_command  Ready-to-run trustlock approve command (always present)
 */

/**
 * @typedef {object} AdmittedWithApprovalEntry
 * @property {string} name     Package name
 * @property {string} version  Resolved version
 * @property {string} approver Approver identity (git user or --as value)
 * @property {string} expires  Approval expiry as ISO 8601 UTC string
 * @property {string} reason   Human-readable reason for the approval
 */

/**
 * @typedef {object} NewPackageEntry
 * @property {string}   name             Package name
 * @property {string}   version          Resolved version
 * @property {boolean}  admitted         Whether the package was admitted
 * @property {string}   [approve_command] Present only when the new package is blocked
 */

/**
 * @typedef {object} AdmittedEntry
 * @property {string} name    Package name
 * @property {string} version Resolved version
 */

/**
 * @typedef {object} GroupedCheckResults
 * @property {BlockedEntry[]}                blocked
 * @property {AdmittedWithApprovalEntry[]}   admitted_with_approval
 * @property {NewPackageEntry[]}             new_packages
 * @property {AdmittedEntry[]}              admitted
 * @property {{ changed?: number, blocked?: number, admitted?: number, wall_time_ms?: number }} [summary]
 */

/**
 * Serialize grouped check results to a schema_version 2 JSON string.
 *
 * All four group keys are always present in the output, even when empty.
 * The summary is computed from the input arrays if not provided by the caller;
 * wall_time_ms defaults to 0 when absent (the CLI layer in F10-S4 passes it).
 *
 * @param {GroupedCheckResults} groupedResults
 * @returns {string} Valid 2-space-indented JSON string; parseable by JSON.parse
 */
export function formatCheckResults(groupedResults) {
  const blocked               = groupedResults.blocked               ?? [];
  const admitted_with_approval = groupedResults.admitted_with_approval ?? [];
  const new_packages           = groupedResults.new_packages           ?? [];
  const admitted               = groupedResults.admitted               ?? [];
  const warnings               = groupedResults.warnings               ?? [];

  const inSummary = groupedResults.summary ?? {};
  const summary = {
    changed:      inSummary.changed      ?? (blocked.length + admitted_with_approval.length + new_packages.length + admitted.length),
    blocked:      inSummary.blocked      ?? blocked.length,
    admitted:     inSummary.admitted     ?? (admitted.length + admitted_with_approval.length),
    wall_time_ms: inSummary.wall_time_ms ?? 0,
  };

  const output = {
    schema_version: 2,
    summary,
    blocked,
    admitted_with_approval,
    new_packages,
    admitted,
  };

  if (warnings.length > 0) {
    output.warnings = warnings;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Serialize an audit report object to a valid JSON string.
 *
 * The report object is expected to carry named section keys (e.g.
 * regression_watch, install_scripts, age_snapshot, pinning,
 * non_registry_sources) as constructed by the audit command. This function is
 * a pure pass-through serializer — it does not restructure the report.
 *
 * @param {object} report - Structured audit report from the audit command
 * @returns {string} Valid 2-space-indented JSON string; parseable by JSON.parse
 */
export function formatAuditReport(report) {
  return JSON.stringify(report, null, 2);
}
