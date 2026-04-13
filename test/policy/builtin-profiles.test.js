import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PROFILES,
  isBuiltinProfile,
  applyProfileOverlay,
} from '../../src/policy/builtin-profiles.js';

// ---------------------------------------------------------------------------
// BUILTIN_PROFILES — shape and values (ADR-005)
// ---------------------------------------------------------------------------

test('BUILTIN_PROFILES: exports strict profile with correct values', () => {
  assert.ok('strict' in BUILTIN_PROFILES, 'strict profile must exist');
  assert.equal(BUILTIN_PROFILES.strict.cooldown_hours, 168);
  assert.deepEqual(BUILTIN_PROFILES.strict.provenance.required_for, ['*']);
});

test('BUILTIN_PROFILES: exports relaxed profile with correct values', () => {
  assert.ok('relaxed' in BUILTIN_PROFILES, 'relaxed profile must exist');
  assert.equal(BUILTIN_PROFILES.relaxed.cooldown_hours, 24);
  assert.equal(BUILTIN_PROFILES.relaxed.provenance.block_on_regression, false);
  assert.equal(BUILTIN_PROFILES.relaxed.provenance.block_on_publisher_change, false);
});

// ---------------------------------------------------------------------------
// isBuiltinProfile
// ---------------------------------------------------------------------------

test('isBuiltinProfile: returns true for "strict"', () => {
  assert.equal(isBuiltinProfile('strict'), true);
});

test('isBuiltinProfile: returns true for "relaxed"', () => {
  assert.equal(isBuiltinProfile('relaxed'), true);
});

test('isBuiltinProfile: returns false for unknown name', () => {
  assert.equal(isBuiltinProfile('myprofile'), false);
});

test('isBuiltinProfile: returns false for empty string', () => {
  assert.equal(isBuiltinProfile(''), false);
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — not-found profile returns undefined
// ---------------------------------------------------------------------------

test('applyProfileOverlay: profile not in profilesMap and not a built-in returns undefined', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const result = applyProfileOverlay(base, 'nonexistent', {}, false);
  assert.equal(result, undefined);
});

test('applyProfileOverlay: undefined profilesMap falls back to built-ins', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const result = applyProfileOverlay(base, 'strict', undefined, true);
  assert.ok(result !== undefined, 'should resolve to built-in strict');
  assert.equal(result.config.cooldown_hours, 168);
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — built-in strict overlay
// ---------------------------------------------------------------------------

test('applyProfileOverlay: strict overlay sets cooldown_hours=168 and provenance.required_for=["*"]', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [] },
    scripts: { allowlist: [] },
  };
  const result = applyProfileOverlay(base, 'strict', {}, true);
  assert.ok(result !== undefined);
  assert.equal(result.config.cooldown_hours, 168);
  assert.deepEqual(result.config.provenance.required_for, ['*']);
});

test('applyProfileOverlay: strict overlay with isBuiltin=true signals provenance-all warning', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const result = applyProfileOverlay(base, 'strict', {}, true);
  assert.ok(Array.isArray(result.warnings), 'warnings must be an array');
  assert.ok(result.warnings.includes('provenance-all'), 'must include provenance-all warning');
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — built-in relaxed overlay (floor skipped for isBuiltin)
// ---------------------------------------------------------------------------

test('applyProfileOverlay: relaxed built-in with cooldown below base does NOT throw (C11)', () => {
  // base cooldown_hours=72; relaxed sets it to 24 — below base — but isBuiltin=true skips floor
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [], block_on_regression: true, block_on_publisher_change: true },
  };
  assert.doesNotThrow(() => {
    applyProfileOverlay(base, 'relaxed', {}, true);
  });
});

test('applyProfileOverlay: relaxed overlay sets cooldown_hours=24', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [], block_on_regression: true, block_on_publisher_change: true },
  };
  const result = applyProfileOverlay(base, 'relaxed', {}, true);
  assert.equal(result.config.cooldown_hours, 24);
});

test('applyProfileOverlay: relaxed built-in does not emit provenance-all warning', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const result = applyProfileOverlay(base, 'relaxed', {}, true);
  assert.ok(!result.warnings.includes('provenance-all'), 'relaxed must not trigger provenance-all');
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — floor enforcement for user-defined profiles
// ---------------------------------------------------------------------------

test('applyProfileOverlay: user-defined profile lowering cooldown_hours throws with exact message', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { myprofile: { cooldown_hours: 24 } };
  assert.throws(
    () => applyProfileOverlay(base, 'myprofile', profilesMap, false),
    (err) => {
      assert.ok(
        err.message === 'Profile "myprofile" sets cooldown_hours=24, below base config minimum of 72. Profiles can only tighten policy, not loosen it.',
        `unexpected message: ${err.message}`
      );
      return true;
    }
  );
});

test('applyProfileOverlay: user-defined profile NOT lowering cooldown_hours does not throw', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { tighter: { cooldown_hours: 168 } };
  assert.doesNotThrow(() => applyProfileOverlay(base, 'tighter', profilesMap, false));
});

test('applyProfileOverlay: user-defined profile with same cooldown_hours as base does not throw', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { same: { cooldown_hours: 72 } };
  assert.doesNotThrow(() => applyProfileOverlay(base, 'same', profilesMap, false));
});

test('applyProfileOverlay: throws on first numeric violation (multiple violations)', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [] },
  };
  // cooldown_hours is the first numeric key encountered — violation there
  const profilesMap = { bad: { cooldown_hours: 10 } };
  assert.throws(
    () => applyProfileOverlay(base, 'bad', profilesMap, false),
    /Profile "bad" sets cooldown_hours=10/
  );
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — user-defined profile named "relaxed" (overrides built-in, floor applies)
// ---------------------------------------------------------------------------

test('applyProfileOverlay: user-defined profile named "relaxed" overrides built-in', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  // User-defined relaxed with cooldown_hours=96 — above base (72), valid; floor check does NOT throw
  const profilesMap = { relaxed: { cooldown_hours: 96 } };
  const result = applyProfileOverlay(base, 'relaxed', profilesMap, false);
  assert.ok(result !== undefined);
  assert.equal(result.config.cooldown_hours, 96, 'user-defined relaxed wins');
});

test('applyProfileOverlay: user-defined "relaxed" lowering cooldown below base throws (floor applies)', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  // User-defined relaxed with cooldown_hours=24 — below base — floor enforced (isBuiltin=false)
  const profilesMap = { relaxed: { cooldown_hours: 24 } };
  assert.throws(
    () => applyProfileOverlay(base, 'relaxed', profilesMap, false),
    /Profile "relaxed" sets cooldown_hours=24, below base config minimum of 72/
  );
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — nested provenance merge (one-level deep)
// ---------------------------------------------------------------------------

test('applyProfileOverlay: nested provenance merge — profile keys override, absent keys fall through', () => {
  const base = {
    cooldown_hours: 72,
    provenance: {
      required_for: ['express'],
      block_on_regression: true,
      block_on_publisher_change: true,
    },
  };
  // Profile only overrides block_on_regression
  const profilesMap = { p: { provenance: { block_on_regression: false } } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.equal(result.config.provenance.block_on_regression, false, 'profile key overrides base');
  assert.equal(result.config.provenance.block_on_publisher_change, true, 'absent key falls through');
  assert.deepEqual(result.config.provenance.required_for, ['express'], 'absent key falls through');
});

test('applyProfileOverlay: nested provenance merge — provenance.required_for overridden by profile', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: ['express', 'lodash'] },
  };
  const profilesMap = { p: { provenance: { required_for: ['*'] } } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.deepEqual(result.config.provenance.required_for, ['*']);
  assert.ok(result.warnings.includes('provenance-all'));
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — nested scripts merge (one-level deep)
// ---------------------------------------------------------------------------

test('applyProfileOverlay: nested scripts merge — profile keys override, absent keys fall through', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [] },
    scripts: { allowlist: ['esbuild'], block_all: true },
  };
  // Profile overrides allowlist but leaves block_all unchanged
  const profilesMap = { p: { scripts: { allowlist: ['esbuild', 'husky'] } } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.deepEqual(result.config.scripts.allowlist, ['esbuild', 'husky'], 'profile key overrides');
  assert.equal(result.config.scripts.block_all, true, 'absent key falls through');
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — required_for: ["*"] warning signal
// ---------------------------------------------------------------------------

test('applyProfileOverlay: profile with provenance.required_for: ["*"] returns provenance-all warning', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { strict_custom: { provenance: { required_for: ['*'] } } };
  const result = applyProfileOverlay(base, 'strict_custom', profilesMap, false);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.includes('provenance-all'));
});

test('applyProfileOverlay: profile without provenance.required_for: ["*"] returns empty warnings', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { p: { cooldown_hours: 168 } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.deepEqual(result.warnings, []);
});

test('applyProfileOverlay: provenance.required_for containing both specific and "*" still signals warning', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: ['npm:pkg'] } };
  // Profile sets required_for to ["npm:pkg", "*"]
  const profilesMap = { p: { provenance: { required_for: ['npm:pkg', '*'] } } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.ok(result.warnings.includes('provenance-all'));
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — return shape always { config, warnings }
// ---------------------------------------------------------------------------

test('applyProfileOverlay: always returns { config, warnings } shape', () => {
  const base = { cooldown_hours: 72, provenance: { required_for: [] } };
  const profilesMap = { p: { cooldown_hours: 168 } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.ok('config' in result, 'result must have config');
  assert.ok('warnings' in result, 'result must have warnings');
  assert.ok(typeof result.config === 'object');
  assert.ok(Array.isArray(result.warnings));
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — base config keys absent from profile fall through
// ---------------------------------------------------------------------------

test('applyProfileOverlay: base config keys absent from profile are preserved', () => {
  const base = {
    cooldown_hours: 72,
    provenance: { required_for: [] },
    pinning: { required: true },
    sources: { allowed: ['registry', 'git'] },
  };
  // Profile only sets cooldown_hours — everything else must fall through
  const profilesMap = { p: { cooldown_hours: 168 } };
  const result = applyProfileOverlay(base, 'p', profilesMap, false);
  assert.equal(result.config.pinning.required, true, 'pinning.required falls through');
  assert.deepEqual(result.config.sources.allowed, ['registry', 'git'], 'sources falls through');
  assert.deepEqual(result.config.provenance.required_for, [], 'provenance falls through');
});

// ---------------------------------------------------------------------------
// applyProfileOverlay — no cross-layer imports (verified by AC grep, not tested here)
// This test exercises the C-NEW-2 contract: callable from a synthetic check.js stub
// ---------------------------------------------------------------------------

test('applyProfileOverlay: C-NEW-2 — callable with synthetic mergedConfig (simulates check.js caller)', () => {
  // Simulate what check.js (F14-S2) will do: load mergedConfig from loadPolicy,
  // then call applyProfileOverlay with the parsed profilesMap and isBuiltin flag
  const syntheticMergedConfig = {
    cooldown_hours: 72,
    pinning: { required: false },
    scripts: { allowlist: [] },
    sources: { allowed: ['registry'] },
    provenance: { required_for: [] },
    transitive: { max_new: 5 },
    profiles: {
      // profiles key is part of mergedConfig but not used by applyProfileOverlay directly
    },
  };
  const syntheticProfilesMap = { enterprise: { cooldown_hours: 240, provenance: { required_for: ['*'] } } };

  const result = applyProfileOverlay(syntheticMergedConfig, 'enterprise', syntheticProfilesMap, false);
  assert.ok(result !== undefined, 'must return a result');
  assert.equal(result.config.cooldown_hours, 240);
  assert.ok(result.warnings.includes('provenance-all'));
});
