/**
 * Approval command generator — produces copy-pasteable `dep-fence approve`
 * commands for blocked packages.
 *
 * This is a pure string-formatting module. It has no I/O and no internal
 * module imports. It operates on plain data shapes.
 */

/**
 * Generate a `dep-fence approve` command for a blocked package.
 *
 * Format:
 *   dep-fence approve <package>@<version> --override <rule1> [--override <rule2> ...] [--expires <duration>]
 *
 * Rules:
 *   - One `--override <rule>` flag per entry in checkResult.blockingRules
 *   - `--expires <duration>` is included only when policyConfig.default_expiry is set
 *   - Scoped package names (e.g. "@scope/pkg") are handled correctly:
 *     the @version suffix is appended to the full name → "@scope/pkg@1.0.0"
 *
 * @param {{ packageName: string, version: string, blockingRules: string[] }} checkResult
 * @param {{ default_expiry?: string }} policyConfig
 * @returns {string}  Ready-to-run `dep-fence approve` command
 */
export function generateApprovalCommand(checkResult, policyConfig) {
  const { packageName, version, blockingRules } = checkResult;

  const packageAtVersion = `${packageName}@${version}`;

  const overrideFlags = blockingRules
    .map((rule) => `--override ${rule}`)
    .join(' ');

  const expiresFlag =
    policyConfig.default_expiry ? ` --expires ${policyConfig.default_expiry}` : '';

  return `dep-fence approve ${packageAtVersion} ${overrideFlags}${expiresFlag}`;
}
