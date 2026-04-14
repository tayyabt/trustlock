/**
 * SARIF 2.1.0 formatter for trustlock.
 *
 * Maps grouped CheckResult data from the policy engine to a valid SARIF 2.1.0
 * JSON document for consumption by GitHub Advanced Security and compatible tooling.
 *
 * ADR-001: zero runtime dependencies — pure JSON serialization, no external imports.
 * This is a leaf module with no imports from other src/ modules.
 *
 * Input shape (groupedResults):
 *   {
 *     blocked: DependencyCheckResult[],          // decision === 'blocked'
 *     admitted_with_approval: DependencyCheckResult[],
 *     new_packages: DependencyCheckResult[],
 *     admitted: DependencyCheckResult[],
 *   }
 *
 * Each DependencyCheckResult:
 *   {
 *     name: string,
 *     version: string,
 *     checkResult: {
 *       decision: string,
 *       findings: Finding[],
 *       approvalCommand: string | null,
 *     }
 *   }
 *
 * Each Finding:
 *   { rule: string, severity: string, message: string, detail: object }
 *   severity 'block' = blocking finding (after normalizeSeverity in policy engine)
 *
 * Only `groupedResults.blocked` entries produce SARIF results.
 * admitted and admitted_with_approval entries produce zero results.
 */

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/**
 * All trustlock policy rules registered as SARIF tool driver rules.
 * Includes publisher-change for forward compatibility (rule not yet implemented).
 */
const DRIVER_RULES = [
  {
    id: 'cooldown',
    name: 'Cooldown',
    shortDescription: { text: 'Package added too recently' },
  },
  {
    id: 'provenance',
    name: 'Provenance',
    shortDescription: { text: 'Missing provenance attestation' },
  },
  {
    id: 'scripts',
    name: 'InstallScripts',
    shortDescription: { text: 'Package runs install scripts' },
  },
  {
    id: 'sources',
    name: 'NoSource',
    shortDescription: { text: 'Package has no source repository' },
  },
  {
    id: 'pinning',
    name: 'Pinning',
    shortDescription: { text: 'Package version is not pinned' },
  },
  {
    id: 'new-dep',
    name: 'NewDependency',
    shortDescription: { text: 'New dependency added' },
  },
  {
    id: 'transitive',
    name: 'TransitiveSurprise',
    shortDescription: { text: 'Unexpected transitive dependency' },
  },
  {
    id: 'publisher-change',
    name: 'PublisherChange',
    shortDescription: { text: 'Package publisher account changed' },
  },
];

/**
 * Maps a fully-qualified trustlock rule name to its SARIF short ruleId.
 *
 * @type {Map<string, string>}
 */
const RULE_ID_MAP = new Map([
  ['exposure:cooldown',              'cooldown'],
  ['trust-continuity:provenance',    'provenance'],
  ['execution:scripts',              'scripts'],
  ['execution:sources',              'sources'],
  ['exposure:pinning',               'pinning'],
  ['delta:new-dependency',           'new-dep'],
  ['delta:transitive-surprise',      'transitive'],
  ['trust-continuity:publisher-change', 'publisher-change'],
]);

/**
 * Resolve the SARIF `ruleId` for a finding's fully-qualified rule name.
 * Falls back to the raw rule name if no mapping is found.
 *
 * @param {string} qualifiedRule  e.g. 'exposure:cooldown'
 * @returns {string}  e.g. 'cooldown'
 */
function toRuleId(qualifiedRule) {
  return RULE_ID_MAP.get(qualifiedRule) ?? qualifiedRule;
}

/**
 * Format grouped policy engine results as a SARIF 2.1.0 JSON string.
 *
 * Only blocked findings appear in `runs[0].results`. One SARIF result is
 * emitted per blocking finding (not per package) — if two rules fire on one
 * package, two SARIF result entries are emitted.
 *
 * Admitted packages (decision `admitted` or `admitted_with_approval`) produce
 * zero SARIF results.
 *
 * @param {object} groupedResults  Grouped policy engine results (see module doc)
 * @param {string} lockfileUri     Lockfile path relative to projectRoot (pre-computed)
 * @returns {string}  SARIF 2.1.0 JSON string (2-space indented)
 */
export function formatSarifReport(groupedResults, lockfileUri) {
  const blocked = groupedResults.blocked ?? [];

  const results = [];

  for (const entry of blocked) {
    const { name, version, checkResult } = entry;
    const findings = checkResult?.findings ?? [];

    for (const finding of findings) {
      // Only emit SARIF results for blocking findings.
      if (finding.severity !== 'block') {
        continue;
      }

      results.push({
        ruleId: toRuleId(finding.rule),
        level: 'error',
        message: {
          text: `${name}@${version}: ${finding.message}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: lockfileUri,
                index: 0,
              },
              region: {
                startLine: 1,
              },
            },
          },
        ],
      });
    }
  }

  const document = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'trustlock',
            rules: DRIVER_RULES,
          },
        },
        results,
        artifacts: [
          {
            location: {
              uri: lockfileUri,
            },
          },
        ],
      },
    ],
  };

  return JSON.stringify(document, null, 2);
}
