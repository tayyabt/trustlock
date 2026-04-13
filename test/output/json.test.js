/**
 * Unit tests for src/output/json.js — schema_version 2 (updated for F10-S3)
 *
 * This file mirrors the canonical tests in src/output/__tests__/json.test.js
 * and validates the new grouped-input API introduced in the schema_version 2
 * rewrite. The v1 pass-through tests (flat results[] round-trip) are removed
 * because the v1 flat-array API no longer exists (C5: no backward-compat shim).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCheckResults, formatAuditReport } from '../../src/output/json.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const blockedResults = {
  blocked: [
    {
      name: 'express',
      version: '4.18.2',
      from_version: '4.17.3',
      rules: ['cooldown'],
      approve_command: "trustlock approve 'express@4.18.2' --override 'cooldown'",
    },
  ],
  admitted_with_approval: [],
  new_packages: [],
  admitted: [{ name: 'lodash', version: '4.17.21' }],
  summary: { changed: 2, blocked: 1, admitted: 1, wall_time_ms: 300 },
};

const auditReport = {
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
  it('returns valid JSON parseable by JSON.parse', () => {
    assert.doesNotThrow(() => JSON.parse(formatCheckResults(blockedResults)));
  });

  it('schema_version is 2', () => {
    const parsed = JSON.parse(formatCheckResults(blockedResults));
    assert.strictEqual(parsed.schema_version, 2);
  });

  it('all four group keys are always present', () => {
    const emptyRun = { blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] };
    const parsed = JSON.parse(formatCheckResults(emptyRun));
    assert.ok(Object.hasOwn(parsed, 'blocked'));
    assert.ok(Object.hasOwn(parsed, 'admitted_with_approval'));
    assert.ok(Object.hasOwn(parsed, 'new_packages'));
    assert.ok(Object.hasOwn(parsed, 'admitted'));
  });

  it('no v1 flat results[] array in output', () => {
    const parsed = JSON.parse(formatCheckResults(blockedResults));
    assert.ok(!Object.hasOwn(parsed, 'results'), 'v1 results[] must not exist');
  });

  it('approve_command present on blocked entry', () => {
    const parsed = JSON.parse(formatCheckResults(blockedResults));
    assert.ok(Object.hasOwn(parsed.blocked[0], 'approve_command'));
    assert.strictEqual(typeof parsed.blocked[0].approve_command, 'string');
  });

  it('handles @scope/name package names without breaking JSON', () => {
    const results = {
      blocked: [
        {
          name: '@anthropic/very-long-scoped-package-name',
          version: '1.2.3',
          from_version: '1.2.2',
          rules: ['cooldown'],
          approve_command: "trustlock approve '@anthropic/very-long-scoped-package-name@1.2.3' --override 'cooldown'",
        },
      ],
      admitted_with_approval: [],
      new_packages: [],
      admitted: [],
    };
    const output = formatCheckResults(results);
    assert.doesNotThrow(() => JSON.parse(output));
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.blocked[0].name, '@anthropic/very-long-scoped-package-name');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport
// ---------------------------------------------------------------------------

describe('formatAuditReport', () => {
  it('returns valid JSON parseable by JSON.parse', () => {
    assert.doesNotThrow(() => JSON.parse(formatAuditReport(auditReport)));
  });

  it('round-trip fidelity: parsed output equals input object', () => {
    const parsed = JSON.parse(formatAuditReport(auditReport));
    assert.deepStrictEqual(parsed, auditReport);
  });

  it('result is an object (named keys), not an array', () => {
    const parsed = JSON.parse(formatAuditReport(auditReport));
    assert.ok(!Array.isArray(parsed));
    assert.strictEqual(typeof parsed, 'object');
  });

  it('handles an empty audit report object', () => {
    const output = formatAuditReport({});
    assert.doesNotThrow(() => JSON.parse(output));
    assert.deepStrictEqual(JSON.parse(output), {});
  });
});
