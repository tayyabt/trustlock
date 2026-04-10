/**
 * Built-in policy profile constants and overlay logic for trustlock.
 *
 * Exports:
 *   BUILTIN_PROFILES    — constant map of built-in profile objects (strict, relaxed)
 *   isBuiltinProfile    — predicate: returns true if the name is a built-in profile
 *   applyProfileOverlay — applies a named profile onto a merged policy config
 *
 * This module is callee-only. It imports nothing from other trustlock modules.
 * Callers: check.js (F14-S2), loader.js (F15).
 */

/**
 * Built-in profile constants.
 *
 * Per ADR-005:
 *   strict  — tighter cooldown, provenance required for all packages
 *   relaxed — reduced cooldown, no provenance block-on-regression/publisher-change
 *
 * @type {Record<string, object>}
 */
export const BUILTIN_PROFILES = {
  strict: {
    cooldown_hours: 168,
    provenance: {
      required_for: ['*'],
    },
  },
  relaxed: {
    cooldown_hours: 24,
    provenance: {
      block_on_regression: false,
      block_on_publisher_change: false,
    },
  },
};

/**
 * Returns true if `name` is a key in BUILTIN_PROFILES, false otherwise.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isBuiltinProfile(name) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_PROFILES, name);
}

/**
 * Nested object keys that receive one-level deep merge semantics.
 * All other profile keys (scalars, arrays, unrecognized objects) are shallowly overridden.
 */
const NESTED_OBJECT_KEYS = new Set(['provenance', 'scripts', 'sources', 'pinning', 'approvals']);

/**
 * Check numeric floor constraints for a user-defined profile.
 *
 * For each top-level numeric field in `profile`: throws if the profile value is
 * below the corresponding value in `mergedConfig`.
 *
 * For each key that is a nested object (NESTED_OBJECT_KEYS): recursively checks
 * one level of numeric fields within that nested object.
 *
 * Throws on the first violation found.
 *
 * @param {object} mergedConfig — the already-merged base policy config
 * @param {object} profile      — the profile object being applied
 * @param {string} profileName  — name used in the error message
 */
function checkFloors(mergedConfig, profile, profileName) {
  for (const [key, value] of Object.entries(profile)) {
    const baseValue = mergedConfig[key];

    if (typeof value === 'number') {
      if (typeof baseValue === 'number' && value < baseValue) {
        throw new Error(
          `Profile "${profileName}" sets ${key}=${value}, below base config minimum of ${baseValue}. Profiles can only tighten policy, not loosen it.`
        );
      }
    } else if (
      NESTED_OBJECT_KEYS.has(key) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      // One level deep: check numeric fields within the nested object
      if (baseValue !== null && typeof baseValue === 'object') {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const baseNestedValue = baseValue[nestedKey];
          if (typeof nestedValue === 'number' && typeof baseNestedValue === 'number') {
            if (nestedValue < baseNestedValue) {
              throw new Error(
                `Profile "${profileName}" sets ${nestedKey}=${nestedValue}, below base config minimum of ${baseNestedValue}. Profiles can only tighten policy, not loosen it.`
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Apply a named profile overlay onto a merged policy config.
 *
 * Resolution order:
 *   1. profilesMap[profileName] (user-defined) — wins over built-ins
 *   2. BUILTIN_PROFILES[profileName]            — fallback
 *
 * If neither source has the named profile, returns `undefined` (caller handles not-found).
 *
 * Merge semantics:
 *   - Scalar and array fields: profile value overrides base (shallow override)
 *   - Nested objects (provenance, scripts, sources, pinning, approvals): one-level
 *     deep merge — profile keys override base keys; keys absent from profile fall
 *     through to base
 *
 * Floor enforcement:
 *   - For user-defined profiles (isBuiltin = false): throws if any numeric field
 *     in the profile is below the corresponding value in mergedConfig
 *   - For built-in profiles (isBuiltin = true): floor checks are skipped (C11)
 *
 * Warning signal:
 *   - If the resulting config has provenance.required_for that includes "*",
 *     the returned warnings array includes "provenance-all"
 *
 * Return shape: always `{ config, warnings }` — callers check warnings.includes("provenance-all")
 *
 * @param {object}  mergedConfig  — the already-merged base policy config
 * @param {string}  profileName   — the profile name to apply
 * @param {object}  [profilesMap] — user-defined profiles from config (may be undefined)
 * @param {boolean} isBuiltin     — true only when applying a built-in profile (skips floor checks)
 * @returns {{ config: object, warnings: string[] } | undefined}
 */
export function applyProfileOverlay(mergedConfig, profileName, profilesMap, isBuiltin) {
  const safeProfilesMap = profilesMap != null ? profilesMap : {};

  // User-defined wins over built-in
  const profile =
    Object.prototype.hasOwnProperty.call(safeProfilesMap, profileName)
      ? safeProfilesMap[profileName]
      : BUILTIN_PROFILES[profileName];

  if (profile === undefined) {
    return undefined;
  }

  // Floor enforcement for user-defined profiles only
  if (!isBuiltin) {
    checkFloors(mergedConfig, profile, profileName);
  }

  // Apply overlay: one-level deep merge for nested objects, shallow override otherwise
  const config = { ...mergedConfig };
  for (const [key, value] of Object.entries(profile)) {
    if (
      NESTED_OBJECT_KEYS.has(key) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      config[key] = { ...(mergedConfig[key] || {}), ...value };
    } else {
      config[key] = value;
    }
  }

  // Warning signal: provenance.required_for includes "*"
  const warnings = [];
  if (
    Array.isArray(config.provenance?.required_for) &&
    config.provenance.required_for.includes('*')
  ) {
    warnings.push('provenance-all');
  }

  return { config, warnings };
}
