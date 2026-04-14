/**
 * Unit tests for src/output/sarif.js — formatSarifReport.
 *
 * Tests the SARIF 2.1.0 formatter in isolation with synthetic groupedResults.
 * No CLI invocation. All assertions operate on the parsed JSON output.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSarifReport } from '../../../src/output/sarif.js';

const LOCKFILE_URI = 'package-lock.json';

/** Build a minimal DependencyCheckResult for a blocked package. */
function blockedResult(name, version, rules) {
  return {
    name,
    version,
    checkResult: {
      decision: 'blocked',
      findings: rules.map((rule) => ({
        rule,
        severity: 'block',
        message: `${name}@${version} blocked by ${rule}`,
        detail: {},
      })),
      approvalCommand: null,
    },
  };
}

/** Build a minimal DependencyCheckResult for an admitted package. */
function admittedResult(name, version, decision = 'admitted') {
  return {
    name,
    version,
    checkResult: {
      decision,
      findings: [],
      approvalCommand: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Document structure
// ---------------------------------------------------------------------------

test('formatSarifReport: output is valid JSON', () => {
  const raw = formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, LOCKFILE_URI);
  assert.doesNotThrow(() => JSON.parse(raw), 'output must be parseable JSON');
});

test('formatSarifReport: $schema and version are correct', () => {
  const doc = JSON.parse(formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, LOCKFILE_URI));
  assert.equal(doc.version, '2.1.0');
  assert.match(doc.$schema, /sarif-schema-2\.1\.0\.json/);
});

test('formatSarifReport: tool.driver.name is "trustlock"', () => {
  const doc = JSON.parse(formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, LOCKFILE_URI));
  assert.equal(doc.runs[0].tool.driver.name, 'trustlock');
});

test('formatSarifReport: tool.driver.rules contains exactly 8 entries', () => {
  const doc = JSON.parse(formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, LOCKFILE_URI));
  const rules = doc.runs[0].tool.driver.rules;
  assert.equal(rules.length, 8);
});

test('formatSarifReport: tool.driver.rules contains all expected ruleIds', () => {
  const doc = JSON.parse(formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, LOCKFILE_URI));
  const ids = doc.runs[0].tool.driver.rules.map((r) => r.id);
  for (const expected of ['cooldown', 'provenance', 'scripts', 'sources', 'pinning', 'new-dep', 'transitive', 'publisher-change']) {
    assert.ok(ids.includes(expected), `expected ruleId '${expected}' in driver.rules`);
  }
});

test('formatSarifReport: artifacts entry matches lockfileUri', () => {
  const uri = 'subdir/package-lock.json';
  const doc = JSON.parse(formatSarifReport({ blocked: [], admitted_with_approval: [], new_packages: [], admitted: [] }, uri));
  assert.equal(doc.runs[0].artifacts[0].location.uri, uri);
});

// ---------------------------------------------------------------------------
// All-admitted → empty results
// ---------------------------------------------------------------------------

test('formatSarifReport: all admitted → results is empty array', () => {
  const groupedResults = {
    blocked: [],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [admittedResult('lodash', '4.17.21')],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.deepEqual(doc.runs[0].results, []);
});

test('formatSarifReport: admitted_with_approval → no SARIF results', () => {
  const groupedResults = {
    blocked: [],
    admitted_with_approval: [admittedResult('express', '4.18.0', 'admitted_with_approval')],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.deepEqual(doc.runs[0].results, []);
});

// ---------------------------------------------------------------------------
// Blocked findings → SARIF results
// ---------------------------------------------------------------------------

test('formatSarifReport: one blocked package with one rule → one result', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results.length, 1);
});

test('formatSarifReport: one blocked package with two rules → two results', () => {
  const groupedResults = {
    blocked: [blockedResult('lodash', '4.17.21', ['exposure:cooldown', 'trust-continuity:provenance'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results.length, 2, 'one result per blocking finding');
});

test('formatSarifReport: result has correct ruleId mapping (execution:scripts → scripts)', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results[0].ruleId, 'scripts');
});

test('formatSarifReport: result has correct ruleId for all 7 implemented rules', () => {
  const ruleMap = [
    ['exposure:cooldown',              'cooldown'],
    ['trust-continuity:provenance',    'provenance'],
    ['execution:scripts',              'scripts'],
    ['execution:sources',              'sources'],
    ['exposure:pinning',               'pinning'],
    ['delta:new-dependency',           'new-dep'],
    ['delta:transitive-surprise',      'transitive'],
  ];
  for (const [qualifiedRule, expectedId] of ruleMap) {
    const groupedResults = {
      blocked: [blockedResult('test-pkg', '1.0.0', [qualifiedRule])],
      admitted_with_approval: [],
      new_packages: [],
      admitted: [],
    };
    const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
    assert.equal(
      doc.runs[0].results[0].ruleId,
      expectedId,
      `${qualifiedRule} → ${expectedId}`
    );
  }
});

test('formatSarifReport: result level is "error"', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results[0].level, 'error');
});

test('formatSarifReport: message.text includes package@version prefix', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '2.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.match(doc.runs[0].results[0].message.text, /evil-pkg@2\.0\.0/);
});

test('formatSarifReport: artifactLocation.uri matches lockfileUri', () => {
  const uri = 'path/to/package-lock.json';
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, uri));
  assert.equal(doc.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, uri);
});

test('formatSarifReport: artifactLocation.index is 0', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results[0].locations[0].physicalLocation.artifactLocation.index, 0);
});

test('formatSarifReport: region.startLine is 1 for all results', () => {
  const groupedResults = {
    blocked: [blockedResult('evil-pkg', '1.0.0', ['execution:scripts', 'exposure:cooldown'])],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  for (const result of doc.runs[0].results) {
    assert.equal(result.locations[0].physicalLocation.region.startLine, 1);
  }
});

// ---------------------------------------------------------------------------
// Mixed blocked + admitted → only blocked appear
// ---------------------------------------------------------------------------

test('formatSarifReport: mixed blocked + admitted → only blocked produce results', () => {
  const groupedResults = {
    blocked: [
      blockedResult('evil-pkg', '1.0.0', ['execution:scripts']),
    ],
    admitted_with_approval: [admittedResult('approved-pkg', '1.0.0', 'admitted_with_approval')],
    new_packages: [],
    admitted: [admittedResult('safe-pkg', '2.0.0')],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results.length, 1);
  assert.match(doc.runs[0].results[0].message.text, /evil-pkg/);
});

// ---------------------------------------------------------------------------
// Warn-severity findings are not emitted
// ---------------------------------------------------------------------------

test('formatSarifReport: warn-severity findings in blocked result are not emitted', () => {
  const pkg = {
    name: 'mixed-pkg',
    version: '1.0.0',
    checkResult: {
      decision: 'blocked',
      findings: [
        { rule: 'execution:scripts',       severity: 'block', message: 'has scripts', detail: {} },
        { rule: 'delta:new-dependency',    severity: 'warn',  message: 'new dep',     detail: {} },
      ],
      approvalCommand: null,
    },
  };
  const groupedResults = {
    blocked: [pkg],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const doc = JSON.parse(formatSarifReport(groupedResults, LOCKFILE_URI));
  assert.equal(doc.runs[0].results.length, 1, 'only the block-severity finding emits a result');
  assert.equal(doc.runs[0].results[0].ruleId, 'scripts');
});

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

test('formatSarifReport: empty groupedResults → valid SARIF with empty results', () => {
  const groupedResults = {
    blocked: [],
    admitted_with_approval: [],
    new_packages: [],
    admitted: [],
  };
  const raw = formatSarifReport(groupedResults, LOCKFILE_URI);
  const doc = JSON.parse(raw);
  assert.equal(doc.version, '2.1.0');
  assert.deepEqual(doc.runs[0].results, []);
});
