/**
 * Unit tests for src/output/json.js — schema_version 2
 *
 * Covers all F10-S3 acceptance criteria:
 *   - schema_version: 2 present at top level
 *   - Grouped keys always present (even as empty arrays)
 *   - approve_command always present on blocked entries
 *   - Multi-rule blocked entry: rules array + combined approve_command
 *   - No results[] flat array (no v1 structure)
 *   - formatAuditReport: valid JSON with named section keys
 *   - "Commit this file." never in JSON output
 *   - ADR-001: no imports from src/ modules (verified via static grep in CI)
 *   - JSON.parse round-trip for all fixtures
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCheckResults, formatAuditReport } from '../../../src/output/json.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Minimal fully-populated groupedResults for a mixed run. */
const mixedResults = {
  blocked: [
    {
      name: 'express',
      version: '4.18.2',
      from_version: '4.17.3',
      rules: ['cooldown'],
      approve_command: "trustlock approve 'express@4.18.2' --override 'cooldown'",
    },
  ],
  admitted_with_approval: [
    {
      name: 'lodash',
      version: '4.17.21',
      approver: 'Alice',
      expires: '2026-05-01T00:00:00.000Z',
      reason: 'emergency patch',
    },
  ],
  new_packages: [
    {
      name: 'uuid',
      version: '9.0.0',
      admitted: true,
    },
  ],
  admitted: [
    { name: 'ms', version: '2.1.3' },
  ],
  summary: {
    changed: 4,
    blocked: 1,
    admitted: 2,
    wall_time_ms: 420,
  },
};

/** groupedResults where all four arrays are empty. */
const emptyResults = {
  blocked: [],
  admitted_with_approval: [],
  new_packages: [],
  admitted: [],
};

/** groupedResults with a multi-rule blocked entry. */
const multiRuleResults = {
  blocked: [
    {
      name: 'react',
      version: '19.0.0',
      from_version: '18.2.0',
      rules: ['cooldown', 'provenance'],
      approve_command: "trustlock approve 'react@19.0.0' --override 'cooldown,provenance'",
    },
  ],
  admitted_with_approval: [],
  new_packages: [],
  admitted: [],
};

/** Minimal groupedResults with no summary key (formatter must compute it). */
const noSummaryResults = {
  blocked: [
    {
      name: 'chalk',
      version: '5.3.0',
      from_version: '5.2.0',
      rules: ['cooldown'],
      approve_command: "trustlock approve 'chalk@5.3.0' --override 'cooldown'",
    },
  ],
  admitted_with_approval: [],
  new_packages: [],
  admitted: [{ name: 'semver', version: '7.6.0' }],
};

/** Audit report with named section keys. */
const auditReport = {
  regression_watch: {
    packages: ['react', 'lodash'],
    note: 'SLSA provenance detected on 2 packages',
  },
  install_scripts: {
    packages: ['esbuild'],
    unallowlisted: ['esbuild'],
  },
  age_snapshot: {
    under24h: 1,
    under72h: 2,
    over72h: 40,
  },
  pinning: {
    unpinned_count: 0,
  },
  non_registry_sources: {
    packages: [],
  },
};

// ---------------------------------------------------------------------------
// formatCheckResults — schema_version 2
// ---------------------------------------------------------------------------

describe('formatCheckResults — schema_version 2', () => {
  it('output is parseable by JSON.parse', () => {
    assert.doesNotThrow(() => JSON.parse(formatCheckResults(mixedResults)));
  });

  it('schema_version is 2 at the top level', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.strictEqual(parsed.schema_version, 2);
  });

  it('schema_version is 2 even when all groups are empty', () => {
    const parsed = JSON.parse(formatCheckResults(emptyResults));
    assert.strictEqual(parsed.schema_version, 2);
  });

  it('all four group keys are present when all arrays are empty', () => {
    const parsed = JSON.parse(formatCheckResults(emptyResults));
    assert.ok(Object.hasOwn(parsed, 'blocked'),               'blocked must be present');
    assert.ok(Object.hasOwn(parsed, 'admitted_with_approval'),'admitted_with_approval must be present');
    assert.ok(Object.hasOwn(parsed, 'new_packages'),          'new_packages must be present');
    assert.ok(Object.hasOwn(parsed, 'admitted'),              'admitted must be present');
    assert.deepStrictEqual(parsed.blocked, []);
    assert.deepStrictEqual(parsed.admitted_with_approval, []);
    assert.deepStrictEqual(parsed.new_packages, []);
    assert.deepStrictEqual(parsed.admitted, []);
  });

  it('all four group keys are present in mixed run', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.ok(Object.hasOwn(parsed, 'blocked'));
    assert.ok(Object.hasOwn(parsed, 'admitted_with_approval'));
    assert.ok(Object.hasOwn(parsed, 'new_packages'));
    assert.ok(Object.hasOwn(parsed, 'admitted'));
  });

  it('blocked entry includes approve_command', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.strictEqual(parsed.blocked.length, 1);
    assert.ok(
      Object.hasOwn(parsed.blocked[0], 'approve_command'),
      'approve_command must be present on blocked entry',
    );
    assert.strictEqual(
      typeof parsed.blocked[0].approve_command,
      'string',
      'approve_command must be a string',
    );
    assert.ok(parsed.blocked[0].approve_command.length > 0, 'approve_command must be non-empty');
  });

  it('multi-rule blocked entry: rules array contains all fired rules', () => {
    const parsed = JSON.parse(formatCheckResults(multiRuleResults));
    assert.strictEqual(parsed.blocked.length, 1);
    assert.deepStrictEqual(parsed.blocked[0].rules, ['cooldown', 'provenance']);
  });

  it('multi-rule blocked entry: approve_command is present and non-empty', () => {
    const parsed = JSON.parse(formatCheckResults(multiRuleResults));
    assert.ok(Object.hasOwn(parsed.blocked[0], 'approve_command'));
    assert.ok(parsed.blocked[0].approve_command.includes('cooldown,provenance'));
  });

  it('output has no results key — no v1 flat structure', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.ok(!Object.hasOwn(parsed, 'results'), 'results[] must not exist in schema_version 2 output');
  });

  it('output has no results key — no v1 flat structure (empty run)', () => {
    const parsed = JSON.parse(formatCheckResults(emptyResults));
    assert.ok(!Object.hasOwn(parsed, 'results'), 'results[] must not exist in schema_version 2 output');
  });

  it('summary is present with required fields when caller provides it', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.ok(Object.hasOwn(parsed, 'summary'), 'summary must be present');
    assert.strictEqual(parsed.summary.changed,      4);
    assert.strictEqual(parsed.summary.blocked,      1);
    assert.strictEqual(parsed.summary.admitted,     2);
    assert.strictEqual(parsed.summary.wall_time_ms, 420);
  });

  it('summary is computed from arrays when caller omits it', () => {
    const parsed = JSON.parse(formatCheckResults(noSummaryResults));
    assert.ok(Object.hasOwn(parsed, 'summary'));
    // 1 blocked + 0 admitted_with_approval + 0 new_packages + 1 admitted = 2 changed
    assert.strictEqual(parsed.summary.changed,  2);
    assert.strictEqual(parsed.summary.blocked,  1);
    // admitted = admitted.length (1) + admitted_with_approval.length (0) = 1
    assert.strictEqual(parsed.summary.admitted, 1);
    assert.strictEqual(parsed.summary.wall_time_ms, 0);
  });

  it('entry fields are preserved: blocked entry name/version/from_version', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.strictEqual(parsed.blocked[0].name,         'express');
    assert.strictEqual(parsed.blocked[0].version,      '4.18.2');
    assert.strictEqual(parsed.blocked[0].from_version, '4.17.3');
  });

  it('admitted_with_approval entry fields preserved', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.strictEqual(parsed.admitted_with_approval.length, 1);
    const entry = parsed.admitted_with_approval[0];
    assert.strictEqual(entry.name,     'lodash');
    assert.strictEqual(entry.approver, 'Alice');
    assert.strictEqual(entry.expires,  '2026-05-01T00:00:00.000Z');
    assert.strictEqual(entry.reason,   'emergency patch');
  });

  it('admitted entry contains name and version only', () => {
    const parsed = JSON.parse(formatCheckResults(mixedResults));
    assert.strictEqual(parsed.admitted.length, 1);
    assert.strictEqual(parsed.admitted[0].name,    'ms');
    assert.strictEqual(parsed.admitted[0].version, '2.1.3');
  });

  it('"Commit this file." never appears in JSON output', () => {
    const output = formatCheckResults(mixedResults);
    assert.ok(!output.includes('Commit this file'), '"Commit this file." must never appear in JSON output');
  });

  it('"Commit this file." never appears in empty-run JSON output', () => {
    const output = formatCheckResults(emptyResults);
    assert.ok(!output.includes('Commit this file'), '"Commit this file." must never appear in JSON output');
  });

  it('handles scoped package names without breaking JSON', () => {
    const results = {
      blocked: [
        {
          name: '@scope/my-pkg',
          version: '1.0.1',
          from_version: '1.0.0',
          rules: ['cooldown'],
          approve_command: "trustlock approve '@scope/my-pkg@1.0.1' --override 'cooldown'",
        },
      ],
      admitted_with_approval: [],
      new_packages: [],
      admitted: [],
    };
    assert.doesNotThrow(() => JSON.parse(formatCheckResults(results)));
    const parsed = JSON.parse(formatCheckResults(results));
    assert.strictEqual(parsed.blocked[0].name, '@scope/my-pkg');
  });

  it('handles special characters in approve_command without breaking JSON', () => {
    const results = {
      blocked: [
        {
          name: 'some-pkg',
          version: '2.0.0',
          from_version: '1.0.0',
          rules: ['cooldown'],
          approve_command: "trustlock approve 'some-pkg@2.0.0' --override 'cooldown'",
        },
      ],
      admitted_with_approval: [],
      new_packages: [],
      admitted: [],
    };
    assert.doesNotThrow(() => JSON.parse(formatCheckResults(results)));
  });

  it('output uses 2-space indentation', () => {
    const output = formatCheckResults(emptyResults);
    // Top-level key should be indented with 2 spaces
    assert.ok(output.includes('\n  "schema_version"'), 'output must use 2-space indent');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport
// ---------------------------------------------------------------------------

describe('formatAuditReport', () => {
  it('output is parseable by JSON.parse', () => {
    assert.doesNotThrow(() => JSON.parse(formatAuditReport(auditReport)));
  });

  it('produces a JSON object with named section keys (not an array)', () => {
    const parsed = JSON.parse(formatAuditReport(auditReport));
    assert.strictEqual(typeof parsed, 'object');
    assert.ok(!Array.isArray(parsed), 'result must be an object, not an array');
  });

  it('named section keys are preserved in output', () => {
    const parsed = JSON.parse(formatAuditReport(auditReport));
    assert.ok(Object.hasOwn(parsed, 'regression_watch'),   'regression_watch key must be present');
    assert.ok(Object.hasOwn(parsed, 'install_scripts'),    'install_scripts key must be present');
    assert.ok(Object.hasOwn(parsed, 'age_snapshot'),       'age_snapshot key must be present');
    assert.ok(Object.hasOwn(parsed, 'pinning'),            'pinning key must be present');
    assert.ok(Object.hasOwn(parsed, 'non_registry_sources'), 'non_registry_sources key must be present');
  });

  it('round-trip fidelity: parsed output deep-equals the input', () => {
    const parsed = JSON.parse(formatAuditReport(auditReport));
    assert.deepStrictEqual(parsed, auditReport);
  });

  it('handles an empty audit report object', () => {
    const output = formatAuditReport({});
    assert.doesNotThrow(() => JSON.parse(output));
    assert.deepStrictEqual(JSON.parse(output), {});
  });

  it('"Commit this file." never appears in audit report JSON output', () => {
    const output = formatAuditReport(auditReport);
    assert.ok(!output.includes('Commit this file'), '"Commit this file." must never appear in JSON output');
  });

  it('output uses 2-space indentation', () => {
    const output = formatAuditReport(auditReport);
    assert.ok(output.includes('\n  "'), 'output must use 2-space indent');
  });
});
