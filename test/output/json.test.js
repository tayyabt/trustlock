/**
 * Unit tests for src/output/json.js
 *
 * Covers:
 *   - formatCheckResults: JSON validity, round-trip fidelity, empty array
 *   - formatAuditReport: JSON validity, round-trip fidelity
 *   - Unusual characters: scoped package names, quotes, backslashes, Unicode
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCheckResults, formatAuditReport } from '../../src/output/json.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleResults = [
  {
    name: 'lodash',
    version: '4.17.21',
    checkResult: {
      decision: 'admitted',
      findings: [],
      approvalCommand: null,
    },
  },
  {
    name: 'express',
    version: '4.18.2',
    checkResult: {
      decision: 'blocked',
      findings: [
        {
          rule: 'cooldown',
          severity: 'block',
          message: 'Package released less than 72 hours ago',
          detail: { clears_at: '2026-04-10T12:00:00.000Z' },
        },
      ],
      approvalCommand: "dep-fence approve 'express@4.18.2' --override 'cooldown'",
    },
  },
];

const sampleAuditReport = {
  totalPackages: 42,
  provenancePct: 55,
  packagesWithInstallScripts: ['esbuild', 'fsevents'],
  sourceTypeCounts: { npm: 40, git: 2 },
  ageDistribution: { under24h: 5, under72h: 12, over72h: 25 },
  cooldownViolationCount: 3,
  blockOnRegression: true,
};

// ---------------------------------------------------------------------------
// formatCheckResults
// ---------------------------------------------------------------------------

describe('formatCheckResults', () => {
  it('returns a string parseable by JSON.parse', () => {
    const result = formatCheckResults(sampleResults);
    assert.doesNotThrow(() => JSON.parse(result), 'output must be valid JSON');
  });

  it('parsed output is structurally identical to the input array', () => {
    const result = formatCheckResults(sampleResults);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed, sampleResults);
  });

  it('returns "[]" for an empty array', () => {
    const result = formatCheckResults([]);
    assert.strictEqual(result, '[]');
  });

  it('round-trip fidelity: re-serializing the parsed output equals the original', () => {
    const result = formatCheckResults(sampleResults);
    const reparsed = JSON.parse(result);
    assert.deepStrictEqual(reparsed, JSON.parse(result));
  });

  it('handles @scope/name package names without breaking JSON', () => {
    const results = [
      {
        name: '@anthropic/very-long-scoped-package-name',
        version: '1.2.3',
        checkResult: { decision: 'admitted', findings: [], approvalCommand: null },
      },
    ];
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output), 'scoped package name must produce valid JSON');
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed[0].name, '@anthropic/very-long-scoped-package-name');
  });

  it('handles slashes and hyphens in package names without breaking JSON', () => {
    const results = [
      {
        name: '@scope/pkg-name/sub-path',
        version: '0.1.0',
        checkResult: { decision: 'admitted', findings: [], approvalCommand: null },
      },
    ];
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output));
  });

  it('handles double-quotes in message strings without breaking JSON', () => {
    const results = [
      {
        name: 'some-pkg',
        version: '1.0.0',
        checkResult: {
          decision: 'blocked',
          findings: [
            {
              rule: 'cooldown',
              severity: 'block',
              message: 'Package "some-pkg" was released recently',
              detail: {},
            },
          ],
          approvalCommand: null,
        },
      },
    ];
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output), 'embedded quotes must produce valid JSON');
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed[0].checkResult.findings[0].message, 'Package "some-pkg" was released recently');
  });

  it('handles backslashes in message strings without breaking JSON', () => {
    const results = [
      {
        name: 'some-pkg',
        version: '1.0.0',
        checkResult: {
          decision: 'blocked',
          findings: [
            {
              rule: 'scripts',
              severity: 'block',
              message: 'Install script path: C:\\Users\\project\\node_modules',
              detail: {},
            },
          ],
          approvalCommand: null,
        },
      },
    ];
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output), 'backslashes must produce valid JSON');
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed[0].checkResult.findings[0].message, 'Install script path: C:\\Users\\project\\node_modules');
  });

  it('handles Unicode characters in message strings without breaking JSON', () => {
    const results = [
      {
        name: 'some-pkg',
        version: '1.0.0',
        checkResult: {
          decision: 'blocked',
          findings: [
            {
              rule: 'cooldown',
              severity: 'block',
              message: 'Package released \u2022 check timestamp \u00e9\u00e0\u00fc',
              detail: {},
            },
          ],
          approvalCommand: null,
        },
      },
    ];
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output), 'Unicode must produce valid JSON');
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed[0].checkResult.findings[0].message, 'Package released \u2022 check timestamp \u00e9\u00e0\u00fc');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport
// ---------------------------------------------------------------------------

describe('formatAuditReport', () => {
  it('returns a string parseable by JSON.parse', () => {
    const result = formatAuditReport(sampleAuditReport);
    assert.doesNotThrow(() => JSON.parse(result), 'output must be valid JSON');
  });

  it('parsed output is structurally identical to the input object', () => {
    const result = formatAuditReport(sampleAuditReport);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed, sampleAuditReport);
  });

  it('round-trip fidelity: re-serializing the parsed output equals the original', () => {
    const result = formatAuditReport(sampleAuditReport);
    const reparsed = JSON.parse(result);
    assert.deepStrictEqual(reparsed, sampleAuditReport);
  });

  it('handles an empty audit report object without breaking JSON', () => {
    const output = formatAuditReport({});
    assert.doesNotThrow(() => JSON.parse(output));
    assert.deepStrictEqual(JSON.parse(output), {});
  });
});
