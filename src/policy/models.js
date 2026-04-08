/**
 * Policy data model shapes for dep-fence.
 *
 * All shapes are plain objects. These exports document the expected structure
 * with field-level JSDoc comments; they serve as the canonical contract for
 * every other F06 module that produces or consumes policy data.
 */

/**
 * PolicyConfig — the resolved, fully-merged policy configuration.
 *
 * Fields:
 *   cooldown_hours          {number}   Hours after publish time before a version may be admitted.
 *                                      Default: 72.
 *   pinning.required        {boolean}  When true, floating semver ranges in package.json are blocked.
 *                                      Default: false.
 *   scripts.allowlist       {string[]} Package names whose install scripts are allowed to run.
 *                                      Default: [].
 *   sources.allowed         {string[]} Allowed source types. Valid values: 'registry', 'git',
 *                                      'file', 'url'. Default: ['registry'].
 *   provenance.required_for {string[]} Package names that must carry provenance attestation.
 *                                      Default: [].
 *   transitive.max_new      {number}   Maximum new transitive dependencies allowed from a single
 *                                      direct dep upgrade before a warning finding is emitted.
 *                                      Default: 5.
 */
export const PolicyConfig = {
  cooldown_hours: 72,
  pinning: {
    required: false,
  },
  scripts: {
    allowlist: [],
  },
  sources: {
    allowed: ['registry'],
  },
  provenance: {
    required_for: [],
  },
  transitive: {
    max_new: 5,
  },
};

/**
 * Finding — a single policy violation or informational observation produced by a rule.
 *
 * Fields:
 *   rule      {string}  Rule identifier (e.g. 'exposure:cooldown', 'execution:scripts').
 *   severity  {string}  'block' or 'warn'. Only 'block' findings can cause a blocked decision.
 *   message   {string}  Human-readable summary of the finding.
 *   detail    {object}  Rule-specific supplementary data (timestamps, thresholds, etc.).
 */
export const Finding = {
  rule: '',
  severity: 'block',
  message: '',
  detail: {},
};

/**
 * CheckResult — the admission decision and supporting findings for a single dependency.
 *
 * Fields:
 *   decision        {string}       'admitted' | 'admitted_with_approval' | 'blocked'.
 *   findings        {Finding[]}    All findings produced by rule evaluation (block and warn).
 *   approvalCommand {string|null}  Suggested `dep-fence approve` command when decision is
 *                                  'blocked'; null otherwise.
 */
export const CheckResult = {
  decision: 'admitted',
  findings: [],
  approvalCommand: null,
};

/**
 * DependencyCheckResult — pairs a resolved dependency with its check outcome.
 *
 * Fields:
 *   name        {string}       Package name (e.g. 'lodash', '@scope/pkg').
 *   version     {string}       Resolved exact version (e.g. '4.17.21').
 *   checkResult {CheckResult}  The admission decision and findings for this dependency.
 */
export const DependencyCheckResult = {
  name: '',
  version: '',
  checkResult: { ...CheckResult },
};
