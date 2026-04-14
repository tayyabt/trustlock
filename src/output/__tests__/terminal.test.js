import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCheckResults,
  formatApproveConfirmation,
  formatAuditReport,
  formatStatusMessage,
} from '../terminal.js';

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

/** Build a blocked entry. */
function makeBlocked({
  name = 'lodash',
  version = '4.17.21',
  oldVersion = '4.17.20',
  findings = [],
} = {}) {
  return { name, version, oldVersion, findings };
}

/** Build a finding. */
function makeFinding({
  rule = 'exposure:cooldown',
  severity = 'block',
  message = 'Package is too new',
  detail = {},
} = {}) {
  return { rule, severity, message, detail };
}

/** Build an admitted_with_approval entry. */
function makeApproval({
  name = 'react',
  version = '18.0.0',
  approver = 'tayyab',
  expires_at = '2026-04-17T00:00:00Z',
  reason = 'Testing upgrade',
} = {}) {
  return { name, version, approver, expires_at, reason };
}

/** Build grouped check results. */
function makeGrouped({
  blocked = [],
  admitted_with_approval = [],
  new_packages = [],
  admitted = [],
} = {}) {
  return { blocked, admitted_with_approval, new_packages, admitted };
}

// ---------------------------------------------------------------------------
// Environment helpers — save/restore process.env per-test
// ---------------------------------------------------------------------------

let savedNoColor;
let savedTerm;
let savedTZ;
let envSaved = false;

function setNoColor(value) {
  if (value === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = value;
}

function setTerm(value) {
  if (value === undefined) delete process.env.TERM;
  else process.env.TERM = value;
}

function setTZ(value) {
  if (value === undefined) delete process.env.TZ;
  else process.env.TZ = value;
}

function saveEnv() {
  savedNoColor = process.env.NO_COLOR;
  savedTerm    = process.env.TERM;
  savedTZ      = process.env.TZ;
  envSaved     = true;
}

function restoreEnv() {
  if (!envSaved) return;
  setNoColor(savedNoColor);
  setTerm(savedTerm);
  setTZ(savedTZ);
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
// formatCheckResults — empty / null input
// ---------------------------------------------------------------------------

describe('formatCheckResults — empty input', () => {
  it('returns "No dependency changes" for empty grouped results', () => {
    const out = strip(formatCheckResults(makeGrouped()));
    assert.ok(out.includes('No dependency changes'));
  });

  it('returns "No dependency changes" for null', () => {
    assert.ok(strip(formatCheckResults(null)).includes('No dependency changes'));
  });

  it('returns "No dependency changes" for undefined', () => {
    assert.ok(strip(formatCheckResults(undefined)).includes('No dependency changes'));
  });

  it('ends with a newline', () => {
    assert.ok(formatCheckResults(makeGrouped()).endsWith('\n'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — summary line
// ---------------------------------------------------------------------------

describe('formatCheckResults — summary line', () => {
  it('shows N packages changed · N blocked · N admitted · wallTime', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express' }, { name: 'react' }],
    });
    const out = strip(formatCheckResults(grouped, 1200));
    // 3 changed: 1 blocked + 2 admitted
    assert.ok(out.includes('3 packages changed'), `output: ${out}`);
    assert.ok(out.includes('1 blocked'));
    assert.ok(out.includes('2 admitted'));
    assert.ok(out.includes('1.2s'));
  });

  it('formats sub-second wall time in ms', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped, 850));
    assert.ok(out.includes('850ms'), `output: ${out}`);
  });

  it('uses singular "package" for 1 changed', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped, 0));
    assert.ok(out.includes('1 package changed'), `output: ${out}`);
    assert.ok(!out.includes('1 packages changed'));
  });

  it('summary uses middle dot separator \xB7', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped, 0));
    assert.ok(out.includes('\xB7'), 'expected middle dot separator');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — BLOCKED section
// ---------------------------------------------------------------------------

describe('formatCheckResults — BLOCKED section', () => {
  it('shows BLOCKED section header', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('BLOCKED'));
  });

  it('shows package name with version range (old → new)', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ name: 'lodash', version: '4.17.21', oldVersion: '4.17.20', findings: [makeFinding()] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('lodash'));
    assert.ok(out.includes('4.17.20'));
    assert.ok(out.includes('4.17.21'));
    assert.ok(out.includes('\u2192'), 'expected → arrow');
  });

  it('shows the fired rule name in brackets', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ rule: 'exposure:cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('[cooldown]'), `output: ${out}`);
  });

  it('shows the finding message as a diagnosis line', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ message: 'Package is under 72-hour cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('Package is under 72-hour cooldown'));
  });

  it('generates a trustlock approve command', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ name: 'lodash', version: '4.17.21', findings: [makeFinding({ rule: 'exposure:cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('trustlock approve'));
    assert.ok(out.includes('lodash@4.17.21'));
    assert.ok(out.includes('--override'));
  });

  it('multi-rule: combines all overrides in a single --override flag', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        name: 'lodash',
        version: '4.17.21',
        findings: [
          makeFinding({ rule: 'exposure:cooldown', severity: 'block' }),
          makeFinding({ rule: 'trust-continuity:provenance', severity: 'block', message: 'Provenance changed' }),
        ],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    // Should have exactly ONE --override flag
    const overrideCount = (out.match(/--override/g) || []).length;
    assert.equal(overrideCount, 1, `Expected 1 --override flag, got ${overrideCount} in:\n${out}`);
    // The combined value should contain both short names
    assert.ok(out.includes('cooldown'), `missing "cooldown" in: ${out}`);
    assert.ok(out.includes('provenance'), `missing "provenance" in: ${out}`);
  });

  it('short override name is used: execution:scripts → scripts', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ rule: 'execution:scripts' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('scripts'), 'Expected short name "scripts"');
    assert.ok(!out.includes('execution:scripts'), 'Must not contain full rule ID');
  });

  it('short override name is used: exposure:cooldown → cooldown', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ rule: 'exposure:cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('cooldown'), 'Expected short name "cooldown"');
    assert.ok(!out.includes('exposure:cooldown'), 'Must not contain full rule ID');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — publisher-change elevation
// ---------------------------------------------------------------------------

describe('formatCheckResults — publisher-change elevation', () => {
  it('shows ⚠ marker on package line for publisher-change block', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        name: 'express',
        version: '4.19.0',
        findings: [makeFinding({ rule: 'trust-continuity:publisher-change', message: 'Publisher changed' })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('\u26A0'), 'Expected ⚠ marker for publisher-change');
  });

  it('shows "Verify the change is legitimate before approving." line', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [makeFinding({ rule: 'trust-continuity:publisher-change', message: 'Publisher changed' })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('Verify the change is legitimate before approving.'));
  });

  it('non-publisher-change rule does NOT get ⚠ marker', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ rule: 'exposure:cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('\u26A0'), 'Unexpected ⚠ marker for non-publisher-change rule');
  });

  it('non-publisher-change rule does NOT get "Verify" line', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ rule: 'exposure:cooldown' })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('Verify the change is legitimate'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — cooldown clears_at timestamp
// ---------------------------------------------------------------------------

describe('formatCheckResults — cooldown clears_at timestamp', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('shows UTC timestamp when TZ is not set', () => {
    setTZ(undefined);
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [makeFinding({
          rule: 'exposure:cooldown',
          detail: { clears_at: '2026-04-15T14:30:00Z' },
        })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('April'), `Expected "April" in: ${out}`);
    assert.ok(out.includes('2026'));
    assert.ok(out.includes('UTC'));
    assert.ok(!out.includes('2026-04-15T14:30:00Z'), 'Should not include raw ISO string');
  });

  it('shows local timezone label when TZ is set', () => {
    setTZ('America/New_York');
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        findings: [makeFinding({
          rule: 'exposure:cooldown',
          detail: { clears_at: '2026-04-15T14:30:00Z' },
        })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('America/New_York'), `Expected TZ label in: ${out}`);
    assert.ok(!out.includes('UTC'), 'Should not say UTC when TZ is set');
  });

  it('no Clears line when finding has no clears_at', () => {
    setTZ(undefined);
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding({ detail: {} })] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('Clears:'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — ADMITTED (with approval) section
// ---------------------------------------------------------------------------

describe('formatCheckResults — ADMITTED (with approval) section', () => {
  it('shows ADMITTED (with approval) header when entries present', () => {
    const grouped = makeGrouped({
      admitted_with_approval: [makeApproval()],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('ADMITTED (with approval)'));
  });

  it('shows package, approver, expiry, and reason', () => {
    const grouped = makeGrouped({
      admitted_with_approval: [makeApproval({
        name: 'react', version: '18.0.0',
        approver: 'tayyab',
        expires_at: '2026-04-17T00:00:00Z',
        reason: 'Testing upgrade',
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('react@18.0.0'));
    assert.ok(out.includes('tayyab'));
    assert.ok(out.includes('April'));  // part of the expiry timestamp
    assert.ok(out.includes('Testing upgrade'));
  });

  it('does NOT show ADMITTED (with approval) when no entries', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('ADMITTED (with approval)'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — NEW PACKAGES section
// ---------------------------------------------------------------------------

describe('formatCheckResults — NEW PACKAGES section', () => {
  it('shows NEW PACKAGES section when new_packages is non-empty', () => {
    const grouped = makeGrouped({
      new_packages: [{ name: 'axios', version: '1.0.0' }],
      admitted: [{ name: 'axios' }],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('NEW PACKAGES'));
  });

  it('shows package name and version in NEW PACKAGES section', () => {
    const grouped = makeGrouped({
      new_packages: [{ name: 'axios', version: '1.0.0' }, { name: 'uuid', version: '9.0.0' }],
      admitted: [{ name: 'axios' }, { name: 'uuid' }],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('axios@1.0.0'));
    assert.ok(out.includes('uuid@9.0.0'));
  });

  it('does NOT show NEW PACKAGES when new_packages is empty', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped));
    assert.ok(!out.includes('NEW PACKAGES'));
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — ADMITTED section collapse
// ---------------------------------------------------------------------------

describe('formatCheckResults — ADMITTED section collapse', () => {
  it('shows ADMITTED section when there are also blocked packages', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express' }],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('ADMITTED'));
    assert.ok(out.includes('express'));
  });

  it('collapses ADMITTED section when it is the only section (pure admission)', () => {
    const grouped = makeGrouped({
      admitted: [{ name: 'lodash' }, { name: 'react' }, { name: 'express' }],
    });
    const out = strip(formatCheckResults(grouped));
    // No ADMITTED section header in pure-admission case
    assert.ok(!out.includes('ADMITTED\n'), 'ADMITTED section should collapse in pure-admission case');
  });

  it('pure-admission output is: summary + baseline footer only', () => {
    const grouped = makeGrouped({
      admitted: [{ name: 'lodash' }, { name: 'react' }],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('Baseline advanced.'));
    assert.ok(!out.includes('BLOCKED'));
    assert.ok(!out.includes('NEW PACKAGES'));
    assert.ok(!out.includes('ADMITTED (with approval)'));
  });

  it('ADMITTED shows names only (no version details)', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express', version: '5.0.0' }],
    });
    const out = strip(formatCheckResults(grouped));
    // Should show name but NOT in the format "express@5.0.0" (names only in admitted section)
    assert.ok(out.includes('express'), 'should show package name');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — baseline footer
// ---------------------------------------------------------------------------

describe('formatCheckResults — baseline footer', () => {
  it('shows "Baseline advanced." when no blocked packages', () => {
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('Baseline advanced.'));
  });

  it('shows "Baseline not advanced — N packages blocked." when blocked', () => {
    const grouped = makeGrouped({
      blocked: [
        makeBlocked({ name: 'lodash', findings: [makeFinding()] }),
        makeBlocked({ name: 'react', version: '18.0.0', oldVersion: '17.0.0', findings: [makeFinding()] }),
      ],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('Baseline not advanced'), `output: ${out}`);
    assert.ok(out.includes('2 packages blocked'));
  });

  it('singular "package" for 1 blocked', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('1 package blocked'), `output: ${out}`);
    assert.ok(!out.includes('1 packages blocked'));
  });

  it('baseline footer is last in output', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express' }],
    });
    const out = strip(formatCheckResults(grouped)).trimEnd();
    const lastLine = out.split('\n').filter(Boolean).pop();
    assert.ok(
      lastLine.includes('Baseline'),
      `Expected footer to be last line, got: "${lastLine}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — section order
// ---------------------------------------------------------------------------

describe('formatCheckResults — section order', () => {
  it('sections appear in correct order: BLOCKED → ADMITTED (with approval) → NEW PACKAGES → ADMITTED → footer', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted_with_approval: [makeApproval()],
      new_packages: [{ name: 'axios', version: '1.0.0' }],
      admitted: [{ name: 'express' }],
    });
    const out = strip(formatCheckResults(grouped));
    const blockedPos   = out.indexOf('BLOCKED');
    const approvalPos  = out.indexOf('ADMITTED (with approval)');
    const newPkgPos    = out.indexOf('NEW PACKAGES');
    const admittedPos  = out.lastIndexOf('ADMITTED');
    const footerPos    = out.indexOf('Baseline');

    assert.ok(blockedPos  < approvalPos,  'BLOCKED must come before ADMITTED (with approval)');
    assert.ok(approvalPos < newPkgPos,    'ADMITTED (with approval) must come before NEW PACKAGES');
    assert.ok(newPkgPos   < admittedPos,  'NEW PACKAGES must come before ADMITTED');
    assert.ok(admittedPos < footerPos,    'ADMITTED must come before baseline footer');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — shell escaping
// ---------------------------------------------------------------------------

describe('formatCheckResults — shell escaping', () => {
  it('scoped package name is correctly included in approve command', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        name: '@anthropic/sdk',
        version: '1.0.0',
        oldVersion: '0.9.0',
        findings: [makeFinding({ rule: 'exposure:cooldown' })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('@anthropic/sdk@1.0.0'));
    assert.ok(out.includes('trustlock approve'));
  });

  it('package name with single quote is shell-escaped', () => {
    const grouped = makeGrouped({
      blocked: [makeBlocked({
        name: "pkg-with-'quote",
        version: '1.0.0',
        findings: [makeFinding({ rule: 'exposure:cooldown' })],
      })],
    });
    const out = strip(formatCheckResults(grouped));
    assert.ok(out.includes('trustlock approve'));
    // The bare unescaped single quote should not terminate the argument
    assert.ok(!out.includes("'pkg-with-'quote@"), 'unescaped single quote should not appear');
  });
});

// ---------------------------------------------------------------------------
// formatCheckResults — NO_COLOR suppression
// ---------------------------------------------------------------------------

describe('NO_COLOR suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    setTerm(undefined);
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
      admitted: [{ name: 'express' }],
    });
    const out = formatCheckResults(grouped);
    assert.equal(hasAnsi(out), false, `Expected no ANSI codes with NO_COLOR=1\n${out}`);
  });

  it('no ANSI codes when NO_COLOR=any-truthy-string', () => {
    setNoColor('true');
    setTerm(undefined);
    const grouped = makeGrouped({ admitted: [{ name: 'lodash' }] });
    assert.equal(hasAnsi(formatCheckResults(grouped)), false);
  });

  it('formatStatusMessage: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    const out = formatStatusMessage('test message');
    assert.equal(hasAnsi(out), false);
    assert.ok(out.includes('test message'));
  });

  it('formatAuditReport: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    setTerm(undefined);
    const out = formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: { under24h: 1, under72h: 2, over72h: 2 },
      sourceTypeCounts: { registry: 5 },
    });
    assert.equal(hasAnsi(out), false);
  });

  it('formatApproveConfirmation: no ANSI codes when NO_COLOR=1', () => {
    setNoColor('1');
    const entry = {
      package: 'lodash', version: '4.17.21',
      overrides: ['cooldown'],
      approver: 'tayyab',
      expires_at: '2026-04-17T00:00:00Z',
      reason: 'Testing',
    };
    assert.equal(hasAnsi(formatApproveConfirmation(entry, true)), false);
  });
});

// ---------------------------------------------------------------------------
// TERM=dumb suppression
// ---------------------------------------------------------------------------

describe('TERM=dumb suppression', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    const grouped = makeGrouped({
      blocked: [makeBlocked({ findings: [makeFinding()] })],
    });
    const out = formatCheckResults(grouped);
    assert.equal(hasAnsi(out), false, `Expected no ANSI codes with TERM=dumb\n${out}`);
  });

  it('formatStatusMessage: no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    assert.equal(hasAnsi(formatStatusMessage('status')), false);
  });

  it('formatAuditReport: no ANSI codes when TERM=dumb', () => {
    setNoColor(undefined);
    setTerm('dumb');
    const out = formatAuditReport({
      totalPackages: 3, provenancePct: 0, blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    });
    assert.equal(hasAnsi(out), false);
  });
});

// ---------------------------------------------------------------------------
// formatApproveConfirmation
// ---------------------------------------------------------------------------

describe('formatApproveConfirmation', () => {
  const baseEntry = {
    package: 'lodash',
    version: '4.17.21',
    overrides: ['cooldown'],
    approver: 'tayyab',
    expires_at: '2026-04-17T00:00:00Z',
    reason: 'Needed for CI unblock',
  };

  it('includes package@version', () => {
    const out = strip(formatApproveConfirmation(baseEntry, false));
    assert.ok(out.includes('lodash@4.17.21'));
  });

  it('includes approver name', () => {
    const out = strip(formatApproveConfirmation(baseEntry, false));
    assert.ok(out.includes('tayyab'));
  });

  it('includes absolute expiry timestamp', () => {
    const out = strip(formatApproveConfirmation(baseEntry, false));
    assert.ok(out.includes('April'), `Expected "April" in: ${out}`);
    assert.ok(out.includes('2026'));
  });

  it('includes reason when provided', () => {
    const out = strip(formatApproveConfirmation(baseEntry, false));
    assert.ok(out.includes('Needed for CI unblock'));
  });

  it('includes "Commit this file." when terminalMode=true', () => {
    const out = strip(formatApproveConfirmation(baseEntry, true));
    assert.ok(out.includes('Commit this file.'));
  });

  it('does NOT include "Commit this file." when terminalMode=false', () => {
    const out = strip(formatApproveConfirmation(baseEntry, false));
    assert.ok(!out.includes('Commit this file.'));
  });

  it('ends with a newline', () => {
    assert.ok(formatApproveConfirmation(baseEntry, false).endsWith('\n'));
  });

  it('includes overrides list', () => {
    const entry = { ...baseEntry, overrides: ['cooldown', 'provenance'] };
    const out = strip(formatApproveConfirmation(entry, false));
    assert.ok(out.includes('cooldown'));
    assert.ok(out.includes('provenance'));
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — section order
// ---------------------------------------------------------------------------

describe('formatAuditReport — section order', () => {
  const baseReport = {
    totalPackages: 10,
    provenancePct: 50,
    blockOnRegression: false,
    unallowlistedInstallScripts: ['esbuild'],
    allowlistedInstallScripts: [],
    ageDistribution: { under24h: 1, under72h: 2, over72h: 7 },
    exactPinnedCount: 8,
    rangePinnedCount: 2,
    sourceTypeCounts: { registry: 10 },
  };

  it('contains all five section headers', () => {
    const out = strip(formatAuditReport(baseReport));
    assert.ok(out.includes('REGRESSION WATCH'), `missing REGRESSION WATCH in: ${out}`);
    assert.ok(out.includes('INSTALL SCRIPTS'));
    assert.ok(out.includes('AGE SNAPSHOT'));
    assert.ok(out.includes('PINNING'));
    assert.ok(out.includes('NON-REGISTRY SOURCES'));
  });

  it('sections appear in the correct order', () => {
    const out = strip(formatAuditReport(baseReport));
    const regressionPos     = out.indexOf('REGRESSION WATCH');
    const installScriptsPos = out.indexOf('INSTALL SCRIPTS');
    const agePos            = out.indexOf('AGE SNAPSHOT');
    const pinningPos        = out.indexOf('PINNING');
    const nonRegPos         = out.indexOf('NON-REGISTRY SOURCES');

    assert.ok(regressionPos     < installScriptsPos, 'REGRESSION WATCH before INSTALL SCRIPTS');
    assert.ok(installScriptsPos < agePos,            'INSTALL SCRIPTS before AGE SNAPSHOT');
    assert.ok(agePos            < pinningPos,        'AGE SNAPSHOT before PINNING');
    assert.ok(pinningPos        < nonRegPos,         'PINNING before NON-REGISTRY SOURCES');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — REGRESSION WATCH
// ---------------------------------------------------------------------------

describe('formatAuditReport — REGRESSION WATCH', () => {
  it('zero-provenance case: shows "No packages with provenance detected. ✓"', () => {
    const out = strip(formatAuditReport({
      totalPackages: 10,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    }));
    assert.ok(
      out.includes('No packages with provenance detected.'),
      `Expected zero-provenance message in: ${out}`,
    );
    assert.ok(out.includes('\u2713'), 'Expected ✓ checkmark');
  });

  it('non-zero provenance: shows count and percentage', () => {
    const out = strip(formatAuditReport({
      totalPackages: 10,
      provenancePct: 50,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    }));
    assert.ok(out.includes('50%'), `Expected 50% in: ${out}`);
    assert.ok(out.includes('10'), 'Expected totalPackages');
  });

  it('does NOT label the section "provenance score" or "trust score"', () => {
    const out = strip(formatAuditReport({
      totalPackages: 10,
      provenancePct: 50,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    }));
    assert.ok(!out.toLowerCase().includes('provenance score'), 'Should not say "provenance score"');
    assert.ok(!out.toLowerCase().includes('trust score'), 'Should not say "trust score"');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — INSTALL SCRIPTS
// ---------------------------------------------------------------------------

describe('formatAuditReport — INSTALL SCRIPTS', () => {
  it('unallowlisted packages shown with ✗ marker', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: ['esbuild', 'node-gyp'],
      allowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    }));
    assert.ok(out.includes('\u2717 esbuild'), `Expected ✗ esbuild in: ${out}`);
    assert.ok(out.includes('\u2717 node-gyp'), `Expected ✗ node-gyp in: ${out}`);
  });

  it('no install scripts: shows "None. ✓"', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: {},
    }));
    assert.ok(out.includes('None.'), `Expected "None." in: ${out}`);
    assert.ok(out.includes('\u2713'), 'Expected ✓ checkmark');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — AGE SNAPSHOT
// ---------------------------------------------------------------------------

describe('formatAuditReport — AGE SNAPSHOT', () => {
  it('shows under24h, under72h, and over72h counts', () => {
    const out = strip(formatAuditReport({
      totalPackages: 10,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: { under24h: 2, under72h: 3, over72h: 5 },
      sourceTypeCounts: {},
    }));
    assert.ok(out.includes('2'), 'Expected under24h count');
    assert.ok(out.includes('3'), 'Expected under72h count');
    assert.ok(out.includes('5'), 'Expected over72h count');
  });
});

// ---------------------------------------------------------------------------
// formatAuditReport — NON-REGISTRY SOURCES
// ---------------------------------------------------------------------------

describe('formatAuditReport — NON-REGISTRY SOURCES', () => {
  it('all registry: shows "All packages from registry. ✓"', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: { registry: 5 },
    }));
    assert.ok(out.includes('All packages from registry.'), `output: ${out}`);
  });

  it('non-registry sources listed by type', () => {
    const out = strip(formatAuditReport({
      totalPackages: 5,
      provenancePct: 0,
      blockOnRegression: false,
      unallowlistedInstallScripts: [],
      ageDistribution: {},
      sourceTypeCounts: { registry: 3, git: 2 },
    }));
    assert.ok(out.includes('git'), `Expected "git" in: ${out}`);
    assert.ok(out.includes('2'), 'Expected count');
    // "registry" is excluded from the non-registry section
    const nonRegIdx   = out.indexOf('NON-REGISTRY SOURCES');
    const afterNonReg = out.slice(nonRegIdx);
    assert.ok(!afterNonReg.includes('registry: 3'), 'Should not list registry count in non-registry section');
  });
});

// ---------------------------------------------------------------------------
// module exports
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports formatCheckResults as a function', () => {
    assert.equal(typeof formatCheckResults, 'function');
  });

  it('exports formatApproveConfirmation as a function', () => {
    assert.equal(typeof formatApproveConfirmation, 'function');
  });

  it('exports formatAuditReport as a function', () => {
    assert.equal(typeof formatAuditReport, 'function');
  });

  it('exports formatStatusMessage as a function', () => {
    assert.equal(typeof formatStatusMessage, 'function');
  });
});
