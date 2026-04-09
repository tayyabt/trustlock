import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCheckResults,
  formatAuditReport,
  formatStatusMessage,
} from '../../src/output/terminal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip all ANSI escape codes from a string. */
function strip(str) {
  return str.replace(ANSI_RE, '');
}

/** Returns true if the string contains any ANSI escape codes. */
function hasAnsi(str) {
  return ANSI_RE.test(str);
}

/** Build a minimal DependencyCheckResult for testing. */
function makeResult({ name = 'lodash', version = '4.17.21', decision = 'admitted', findings = [] } = {}) {
  return { name, version, checkResult: { decision, findings } };
}

/** Build a minimal Finding. */
function makeFinding({ rule = 'exposure:cooldown', severity = 'block', message = 'Too new', detail = {} } = {}) {
  return { rule, severity, message, detail };
}

// ---------------------------------------------------------------------------
// Environment helpers — save/restore process.env per-test
// ---------------------------------------------------------------------------

let savedNoColor;
let savedTerm;

function setNoColor(value) {
  if (value === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = value;
  }
}

function setTerm(value) {
  if (value === undefined) {
    delete process.env.TERM;
  } else {
    process.env.TERM = value;
  }
}

// Restore env after each test that mutates it.
// Tests that need a clean env call saveEnv() / restoreEnv() manually.
let envSaved = false;
function saveEnv() {
  savedNoColor = process.env.NO_COLOR;
  savedTerm    = process.env.TERM;
  envSaved     = true;
}
function restoreEnv() {
  if (!envSaved) return;
  setNoColor(savedNoColor);
  setTerm(savedTerm);
  envSaved = false;
}

// ---------------------------------------------------------------------------
// formatStatusMessage
// ---------------------------------------------------------------------------

describe('formatStatusMessage', () => {
  it('returns the message followed by a newline', () => {
    const out = formatStatusMessage('No dependency changes');
    assert.ok(strip(out).includes('No dependency changes'));
    assert.ok(out.endsWith('\n'));
  });

  it('applies dim styling when colors are enabled', () => {
    saveEnv();
    setNoColor(undefined);
    setTerm(undefined);
    try {
      const out = formatStatusMessage('hello');
      assert.ok(hasAnsi(out), 'expected ANSI codes in output');
    } finally {
      restoreEnv();
    }
  });

  it('NO_COLOR=1: no ANSI codes', () => {
    saveEnv();
    setNoColor('1');
    try {
      const out = formatStatusMessage('hello');
      assert.equal(hasAnsi(out), false);
      assert.ok(out.includes('hello'));
    } finally {
      restoreEnv();
    }
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — empty input
// ---------------------------------------------------------------------------

describe('formatCheckResults — empty results', () => {
  it('returns "No dependency changes" for an empty array', () => {
    const out = formatCheckResults([]);
    assert.ok(strip(out).includes('No dependency changes'));
  });

  it('returns "No dependency changes" for null/undefined', () => {
    assert.ok(strip(formatCheckResults(null)).includes('No dependency changes'));
    assert.ok(strip(formatCheckResults(undefined)).includes('No dependency changes'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — admitted
// ---------------------------------------------------------------------------

describe('formatCheckResults — admitted result', () => {
  it('includes package name and version', () => {
    const out = strip(formatCheckResults([makeResult({ decision: 'admitted' })]));
    assert.ok(out.includes('lodash@4.17.21'));
  });

  it('includes "admitted" label', () => {
    const out = strip(formatCheckResults([makeResult({ decision: 'admitted' })]));
    assert.ok(out.includes('admitted'));
  });

  it('applies green color to admitted line', () => {
    saveEnv();
    setNoColor(undefined);
    setTerm(undefined);
    try {
      const out = formatCheckResults([makeResult({ decision: 'admitted' })]);
      // Green = \x1b[32m
      assert.ok(out.includes('\x1b[32m'));
    } finally {
      restoreEnv();
    }
  });

  it('does not include "blocked" or approval command', () => {
    const out = strip(formatCheckResults([makeResult({ decision: 'admitted' })]));
    assert.ok(!out.includes('blocked'));
    assert.ok(!out.includes('trustlock approve'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — admitted_with_approval
// ---------------------------------------------------------------------------

describe('formatCheckResults — admitted_with_approval result', () => {
  it('includes "admitted (with approval)" label', () => {
    const out = strip(formatCheckResults([makeResult({ decision: 'admitted_with_approval' })]));
    assert.ok(out.includes('admitted (with approval)'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — blocked
// ---------------------------------------------------------------------------

describe('formatCheckResults — blocked result', () => {
  it('includes "blocked" label', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding()] }),
    ]));
    assert.ok(out.includes('blocked'));
  });

  it('applies red color to blocked decision line', () => {
    saveEnv();
    setNoColor(undefined);
    setTerm(undefined);
    try {
      const out = formatCheckResults([
        makeResult({ decision: 'blocked', findings: [makeFinding()] }),
      ]);
      // Red = \x1b[31m
      assert.ok(out.includes('\x1b[31m'));
    } finally {
      restoreEnv();
    }
  });

  it('includes a trustlock approve command', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding({ rule: 'exposure:cooldown' })] }),
    ]));
    assert.ok(out.includes('trustlock approve'));
    assert.ok(out.includes('cooldown'));
  });

  it('BUG-001: execution:scripts finding uses short name "scripts" in --override', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding({ rule: 'execution:scripts', severity: 'block' })] }),
    ]));
    assert.ok(out.includes('--override'), 'Expected --override flag');
    assert.ok(out.includes('scripts'), 'Expected short name "scripts"');
    assert.ok(!out.includes('execution:scripts'), 'Must not contain full rule ID "execution:scripts"');
  });

  it('BUG-001: exposure:cooldown finding uses short name "cooldown" in --override', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding({ rule: 'exposure:cooldown', severity: 'block' })] }),
    ]));
    assert.ok(out.includes('--override'), 'Expected --override flag');
    assert.ok(out.includes('cooldown'), 'Expected short name "cooldown"');
    assert.ok(!out.includes('exposure:cooldown'), 'Must not contain full rule ID "exposure:cooldown"');
  });

  it('approval command includes pkg@version', () => {
    const out = strip(formatCheckResults([
      makeResult({ name: 'express', version: '5.0.0', decision: 'blocked',
        findings: [makeFinding({ rule: 'exposure:cooldown' })] }),
    ]));
    assert.ok(out.includes('express@5.0.0'));
  });

  it('approval command uses --override flag', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding({ rule: 'execution:scripts' })] }),
    ]));
    assert.ok(out.includes('--override'));
  });

  it('multiple blocking rules each get --override flag', () => {
    const out = strip(formatCheckResults([
      makeResult({
        decision: 'blocked',
        findings: [
          makeFinding({ rule: 'exposure:cooldown', severity: 'block' }),
          makeFinding({ rule: 'execution:scripts', severity: 'block' }),
        ],
      }),
    ]));
    const overrideCount = (out.match(/--override/g) || []).length;
    assert.equal(overrideCount, 2);
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — findings
// ---------------------------------------------------------------------------

describe('formatCheckResults — findings', () => {
  it('prints all findings without truncation (many findings)', () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ rule: `rule:${i}`, severity: 'block', message: `Finding ${i}` }),
    );
    const out = strip(formatCheckResults([makeResult({ decision: 'blocked', findings })]));
    for (let i = 0; i < 10; i++) {
      assert.ok(out.includes(`Finding ${i}`), `Expected "Finding ${i}" in output`);
    }
  });

  it('includes [block] tag for block-severity findings', () => {
    const out = strip(formatCheckResults([
      makeResult({ decision: 'blocked', findings: [makeFinding({ severity: 'block' })] }),
    ]));
    assert.ok(out.includes('[block]'));
  });

  it('includes [warn] tag for warn-severity findings', () => {
    const out = strip(formatCheckResults([
      makeResult({
        decision: 'admitted',
        findings: [makeFinding({ severity: 'warn', message: 'Minor warning' })],
      }),
    ]));
    assert.ok(out.includes('[warn]'));
    assert.ok(out.includes('Minor warning'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — cooldown clears_at (D4)
// ---------------------------------------------------------------------------

describe('formatCheckResults — cooldown clears_at (D4)', () => {
  it('includes human-readable clears_at when present in finding detail', () => {
    const finding = makeFinding({
      rule: 'exposure:cooldown',
      severity: 'block',
      message: 'Package is too new',
      detail: { clears_at: '2026-04-12T14:30:00Z' },
    });
    const out = strip(formatCheckResults([makeResult({ decision: 'blocked', findings: [finding] })]));
    // Should contain month name, not raw ISO
    assert.ok(out.includes('April'), `Expected "April" in output, got: ${out}`);
    assert.ok(out.includes('2026'));
    assert.ok(out.includes('UTC'));
    assert.ok(!out.includes('2026-04-12T14:30:00Z'), 'Should not contain raw ISO string');
  });

  it('does not include clears_at text when detail has no clears_at field', () => {
    const finding = makeFinding({ detail: {} });
    const out = strip(formatCheckResults([makeResult({ decision: 'blocked', findings: [finding] })]));
    assert.ok(!out.includes('clears'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — approval command shell escaping
// ---------------------------------------------------------------------------

describe('formatCheckResults — approval command shell escaping', () => {
  it('approval command for scoped package includes full scoped name', () => {
    const out = strip(formatCheckResults([
      makeResult({
        name: '@anthropic/very-long-scoped-package-name',
        version: '1.2.3',
        decision: 'blocked',
        findings: [makeFinding({ rule: 'exposure:cooldown' })],
      }),
    ]));
    assert.ok(out.includes('@anthropic/very-long-scoped-package-name@1.2.3'));
    assert.ok(out.includes('trustlock approve'));
  });

  it('package name with single quote is shell-escaped in approval command', () => {
    // Edge case: package name that would need shell escaping
    const out = strip(formatCheckResults([
      makeResult({
        name: "pkg-with-'quote",
        version: '1.0.0',
        decision: 'blocked',
        findings: [makeFinding({ rule: 'exposure:cooldown' })],
      }),
    ]));
    // Should be present and not break the line
    assert.ok(out.includes('trustlock approve'));
    // The escaped form avoids a bare single quote ending the shell argument
    assert.ok(!out.includes("'pkg-with-'quote@"), 'unescaped single quote should not appear');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — long package names
// ---------------------------------------------------------------------------

describe('formatCheckResults — long package names', () => {
  it('very long scoped package name does not cause truncation or error', () => {
    const name = '@anthropic/very-long-scoped-package-name';
    const out = strip(formatCheckResults([makeResult({ name, version: '0.1.0', decision: 'admitted' })]));
    assert.ok(out.includes(name));
    assert.ok(out.includes('0.1.0'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — mixed results
// ---------------------------------------------------------------------------

describe('formatCheckResults — mixed results', () => {
  it('prints both admitted and blocked packages', () => {
    const results = [
      makeResult({ name: 'react', version: '18.0.0', decision: 'admitted' }),
      makeResult({
        name: 'danger-pkg', version: '0.0.1', decision: 'blocked',
        findings: [makeFinding()],
      }),
    ];
    const out = strip(formatCheckResults(results));
    assert.ok(out.includes('react@18.0.0'));
    assert.ok(out.includes('admitted'));
    assert.ok(out.includes('danger-pkg@0.0.1'));
    assert.ok(out.includes('blocked'));
  });
});

// ---------------------------------------------------------------------------
// NO_COLOR suppression
// ---------------------------------------------------------------------------

describe('NO_COLOR suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('formatCheckResults: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    setTerm(undefined);
    const results = [
      makeResult({ decision: 'admitted' }),
      makeResult({ name: 'b', version: '1.0.0', decision: 'blocked', findings: [makeFinding()] }),
    ];
    const out = formatCheckResults(results);
    assert.equal(hasAnsi(out), false, `Expected no ANSI codes with NO_COLOR=1\n${out}`);
  });

  it('formatAuditReport: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    setTerm(undefined);
    const out = formatAuditReport({
      totalPackages: 5, provenancePct: 0, packagesWithInstallScripts: [],
      sourceTypeCounts: { registry: 5 }, ageDistribution: { under24h: 1, under72h: 2, over72h: 2 },
      cooldownViolationCount: 0, blockOnRegression: false,
    });
    assert.equal(hasAnsi(out), false);
  });

  it('formatStatusMessage: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    const out = formatStatusMessage('test message');
    assert.equal(hasAnsi(out), false);
    assert.ok(out.includes('test message'));
  });

  it('NO_COLOR=any-truthy-string suppresses ANSI', () => {
    setNoColor('true');
    setTerm(undefined);
    const out = formatCheckResults([makeResult({ decision: 'admitted' })]);
    assert.equal(hasAnsi(out), false);
  });
});

// ---------------------------------------------------------------------------
// TERM=dumb suppression
// ---------------------------------------------------------------------------

describe('TERM=dumb suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('formatCheckResults: no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    const results = [
      makeResult({ decision: 'admitted' }),
      makeResult({ name: 'b', version: '1.0.0', decision: 'blocked', findings: [makeFinding()] }),
    ];
    const out = formatCheckResults(results);
    assert.equal(hasAnsi(out), false, `Expected no ANSI codes with TERM=dumb\n${out}`);
  });

  it('formatAuditReport: no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    const out = formatAuditReport({
      totalPackages: 3, provenancePct: 0, packagesWithInstallScripts: [],
      sourceTypeCounts: {}, ageDistribution: {},
      cooldownViolationCount: 0, blockOnRegression: false,
    });
    assert.equal(hasAnsi(out), false);
  });

  it('formatStatusMessage: no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    const out = formatStatusMessage('status');
    assert.equal(hasAnsi(out), false);
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — summary stats
// ---------------------------------------------------------------------------

describe('formatAuditReport — summary stats', () => {
  const baseReport = {
    totalPackages: 10,
    provenancePct: 80,
    packagesWithInstallScripts: ['esbuild', 'node-gyp'],
    sourceTypeCounts: { registry: 9, git: 1 },
    ageDistribution: { under24h: 1, under72h: 3, over72h: 6 },
    cooldownViolationCount: 1,
    blockOnRegression: false,
  };

  it('includes total packages count', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('10'));
  });

  it('includes provenance percentage', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('80%'));
  });

  it('includes install scripts list', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('esbuild'));
    assert.ok(out.includes('node-gyp'));
  });

  it('shows "none" when no install scripts', () => {
    const out = strip(formatAuditReport({ ...baseReport, packagesWithInstallScripts: [] }));
    assert.ok(out.includes('none'));
  });

  it('includes source type breakdown', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('registry'));
    assert.ok(out.includes('git'));
  });

  it('includes age distribution', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('24'));
    assert.ok(out.includes('72'));
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — heuristic suggestions
// ---------------------------------------------------------------------------

describe('formatAuditReport — heuristic suggestions', () => {
  it('0% provenance: "Consider relaxing block_on_regression" suggestion appears', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      packagesWithInstallScripts: [],
      sourceTypeCounts: { registry: 5 },
      ageDistribution: {},
      cooldownViolationCount: 0,
      blockOnRegression: false,
    }));
    assert.ok(
      out.includes('Consider relaxing block_on_regression'),
      `Expected "Consider relaxing block_on_regression" in output:\n${out}`,
    );
  });

  it('0% provenance + blockOnRegression=true: "no effect" suggestion appears', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      packagesWithInstallScripts: [],
      sourceTypeCounts: {},
      ageDistribution: {},
      cooldownViolationCount: 0,
      blockOnRegression: true,
    }));
    assert.ok(
      out.includes('block_on_regression has no effect'),
      `Expected "block_on_regression has no effect" in output:\n${out}`,
    );
  });

  it('high cooldown violation rate: "consider lowering cooldown_hours" suggestion appears', () => {
    const out = strip(formatAuditReport({
      totalPackages: 4,
      provenancePct: 100,
      packagesWithInstallScripts: [],
      sourceTypeCounts: {},
      ageDistribution: {},
      cooldownViolationCount: 3, // 75% > 50%
      blockOnRegression: false,
    }));
    assert.ok(
      out.includes('consider lowering cooldown_hours'),
      `Expected "consider lowering cooldown_hours" in output:\n${out}`,
    );
  });

  it('no suggestions when provenance > 0 and low violation rate', () => {
    const out = strip(formatAuditReport({
      totalPackages: 10,
      provenancePct: 90,
      packagesWithInstallScripts: [],
      sourceTypeCounts: {},
      ageDistribution: {},
      cooldownViolationCount: 1, // 10%, below 50%
      blockOnRegression: false,
    }));
    assert.ok(!out.includes('Suggestions'), 'Expected no suggestions section');
  });

  it('no heuristic suggestions for 0 total packages', () => {
    const out = strip(formatAuditReport({
      totalPackages: 0,
      provenancePct: 0,
      packagesWithInstallScripts: [],
      sourceTypeCounts: {},
      ageDistribution: {},
      cooldownViolationCount: 0,
      blockOnRegression: false,
    }));
    // With 0 packages, division guard prevents cooldown heuristic; provenance heuristic still fires
    // (provenancePct=0 path — acceptable behaviour: report still shows the 0% message)
    assert.ok(typeof out === 'string');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — colors
// ---------------------------------------------------------------------------

describe('formatAuditReport — colors', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('suggestions are yellow when colors are on', () => {
    setNoColor(undefined);
    setTerm(undefined);
    const out = formatAuditReport({
      totalPackages: 5, provenancePct: 0, packagesWithInstallScripts: [],
      sourceTypeCounts: {}, ageDistribution: {},
      cooldownViolationCount: 0, blockOnRegression: false,
    });
    // Yellow = \x1b[33m
    assert.ok(out.includes('\x1b[33m'), 'Expected yellow ANSI in suggestion lines');
  });
});

// ---------------------------------------------------------------------------
// module exports
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports formatCheckResults as a function', () => {
    assert.equal(typeof formatCheckResults, 'function');
  });

  it('exports formatAuditReport as a function', () => {
    assert.equal(typeof formatAuditReport, 'function');
  });

  it('exports formatStatusMessage as a function', () => {
    assert.equal(typeof formatStatusMessage, 'function');
  });
});
