/**
 * Terminal formatter tests — conventional test path (test/output/terminal.test.js).
 * Delegates to the primary test suite at src/output/__tests__/terminal.test.js.
 * Run via: node --test test/output/terminal.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCheckResults,
  formatApproveConfirmation,
  formatAuditReport,
  formatStatusMessage,
} from '../../src/output/terminal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function strip(str) { return str.replace(ANSI_RE, ''); }
function hasAnsi(str) { return ANSI_RE.test(str); }

function makeBlocked({ name = 'lodash', version = '4.17.21', oldVersion = '4.17.20', findings = [] } = {}) {
  return { name, version, oldVersion, findings };
}
function makeFinding({ rule = 'exposure:cooldown', severity = 'block', message = 'Package is too new', detail = {} } = {}) {
  return { rule, severity, message, detail };
}
function makeGrouped({ blocked = [], admitted_with_approval = [], new_packages = [], admitted = [] } = {}) {
  return { blocked, admitted_with_approval, new_packages, admitted };
}

let savedNoColor, savedTerm, envSaved = false;
function saveEnv() { savedNoColor = process.env.NO_COLOR; savedTerm = process.env.TERM; envSaved = true; }
function restoreEnv() { if (!envSaved) return; if (savedNoColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = savedNoColor; if (savedTerm === undefined) delete process.env.TERM; else process.env.TERM = savedTerm; envSaved = false; }

// ---------------------------------------------------------------------------
// Smoke tests — key behaviors
// ---------------------------------------------------------------------------

describe('formatStatusMessage', () => {
  it('returns the message followed by a newline', () => {
    const out = formatStatusMessage('No dependency changes');
    assert.ok(strip(out).includes('No dependency changes'));
    assert.ok(out.endsWith('\n'));
  });
});

describe('formatCheckResults — empty input', () => {
  it('returns "No dependency changes" for empty grouped results', () => {
    const out = strip(formatCheckResults(makeGrouped()));
    assert.ok(out.includes('No dependency changes'));
  });

  it('returns "No dependency changes" for null', () => {
    assert.ok(strip(formatCheckResults(null)).includes('No dependency changes'));
  });
});

describe('formatCheckResults — summary line', () => {
  it('includes N packages changed · N blocked · N admitted · wallTime', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express' }],
    });
    const out = strip(formatCheckResults(grouped, 1200));
    assert.ok(out.includes('2 packages changed'));
    assert.ok(out.includes('1 blocked'));
    assert.ok(out.includes('1 admitted'));
    assert.ok(out.includes('1.2s'));
  });
});

describe('formatCheckResults — BLOCKED section', () => {
  it('shows BLOCKED header', () => {
    const grouped = makeGrouped({ blocked: [makeBlocked({ findings: [makeFinding()] })] });
    assert.ok(strip(formatCheckResults(grouped)).includes('BLOCKED'));
  });

  it('multi-rule combined into single --override flag', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [
          makeFinding({ rule: 'exposure:cooldown', severity: 'block' }),
          makeFinding({ rule: 'trust-continuity:provenance', severity: 'block', message: 'Provenance' }),
        ],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    const overrideCount = (out.match(/--override/g) || []).length;
    assert.equal(overrideCount, 1, `Expected 1 --override flag, got ${overrideCount}`);
  });
});

describe('formatCheckResults — publisher-change', () => {
  it('shows ⚠ marker for publisher-change rule', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [makeFinding({ rule: 'trust-continuity:publisher-change', message: 'Publisher changed' })],
      })],
    });
    assert.ok(strip(formatCheckResults(grouped)).includes('\u26A0'));
  });

  it('shows Verify line for publisher-change rule', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [makeFinding({ rule: 'trust-continuity:publisher-change', message: 'Publisher changed' })],
      })],
    });
    assert.ok(strip(formatCheckResults(grouped)).includes('Verify the change is legitimate'));
  });
});

describe('formatCheckResults — ADMITTED section collapse', () => {
  it('collapses ADMITTED section in pure-admission case', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }, { name: 'react' }] });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('ADMITTED\n'));
    assert.ok(out.includes('Baseline advanced.'));
  });
});

describe('NO_COLOR suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('formatCheckResults: no ANSI codes when NO_COLOR=1', () => {
    process.env.NO_COLOR = '1';
    delete process.env.TERM;
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
    });
    assert.equal(hasAnsi(formatCheckResults(grouped)), false);
  });

  it('formatAuditReport: no ANSI codes when NO_COLOR=1', () => {
    process.env.NO_COLOR = '1';
    delete process.env.TERM;
    const out = formatAuditReport({
      totalPackages: 5, provenancePct: 0, blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {}, sourceTypeCounts: {},
    });
    assert.equal(hasAnsi(out), false);
  });

  it('formatStatusMessage: no ANSI codes when NO_COLOR=1', () => {
    process.env.NO_COLOR = '1';
    const out = formatStatusMessage('test message');
    assert.equal(hasAnsi(out), false);
    assert.ok(out.includes('test message'));
  });
});

describe('TERM=dumb suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('no ANSI codes when TERM=dumb', () => {
    delete process.env.NO_COLOR;
    process.env.TERM = 'dumb';
    const grouped = makeGrouped({ blocked: [makeBlocked({ findings: [makeFinding()] })] });
    assert.equal(hasAnsi(formatCheckResults(grouped)), false);
  });
});

describe('formatApproveConfirmation', () => {
  const entry = {
    package: 'lodash', version: '4.17.21',
    overrides: ['cooldown'],
    approver: 'tayyab',
    expires_at: '2026-04-17T00:00:00Z',
    reason: 'Testing',
  };

  it('includes "Commit this file." when terminalMode=true', () => {
    assert.ok(strip(formatApproveConfirmation(entry, true)).includes('Commit this file.'));
  });

  it('does NOT include "Commit this file." when terminalMode=false', () => {
    assert.ok(!strip(formatApproveConfirmation(entry, false)).includes('Commit this file.'));
  });
});

describe('formatAuditReport — audit section headers', () => {
  const report = {
    totalPackages: 5, provenancePct: 0, blockOnRegression: false,
    unallowlistedInstallScripts: [],
    ageDistribution: { under24h: 1, under72h: 2, over72h: 2 },
    sourceTypeCounts: { registry: 5 },
  };

  it('contains REGRESSION WATCH section', () => {
    assert.ok(strip(formatAuditReport(report)).includes('REGRESSION WATCH'));
  });

  it('contains INSTALL SCRIPTS section', () => {
    assert.ok(strip(formatAuditReport(report)).includes('INSTALL SCRIPTS'));
  });

  it('contains AGE SNAPSHOT section', () => {
    assert.ok(strip(formatAuditReport(report)).includes('AGE SNAPSHOT'));
  });

  it('contains PINNING section', () => {
    assert.ok(strip(formatAuditReport(report)).includes('PINNING'));
  });

  it('contains NON-REGISTRY SOURCES section', () => {
    assert.ok(strip(formatAuditReport(report)).includes('NON-REGISTRY SOURCES'));
  });

  it('zero-provenance case shows "No packages with provenance detected. ✓"', () => {
    assert.ok(strip(formatAuditReport(report)).includes('No packages with provenance detected.'));
  });
});

describe('module exports', () => {
  it('exports formatCheckResults', () => { assert.equal(typeof formatCheckResults, 'function'); });
  it('exports formatApproveConfirmation', () => { assert.equal(typeof formatApproveConfirmation, 'function'); });
  it('exports formatAuditReport', () => { assert.equal(typeof formatAuditReport, 'function'); });
  it('exports formatStatusMessage', () => { assert.equal(typeof formatStatusMessage, 'function'); });
});
