/**
 * pnpm lockfile parser — v5, v6, v9.
 *
 * Public API:
 *   parsePnpm(content, projectRoot) → ResolvedDependency[]
 *
 * Format overview:
 *   v5: packages keyed as  /name/version  or  /@scope/name/version
 *   v6: packages keyed as  /name@version  or  /@scope/name@version
 *   v9: packages keyed as  name@version   with explicit `name:` and `version:` fields;
 *       may include an `importers:` section for workspace dependency filtering.
 *
 * Pure function — no I/O, no network, no imports from src/registry/.
 */

import { validateDependency, SOURCE_TYPES } from './models.js';

const SUPPORTED_VERSIONS = new Set([5, 6, 9]);

// ── YAML line parser ──────────────────────────────────────────────────────────

/**
 * Parse a single YAML line into { indent, key, value } or null.
 *
 * Handles:
 *   - Blank lines and comment lines → null
 *   - Mapping headers: "  key:" → { indent, key, value: null }
 *   - Key-value pairs: "  key: value" → { indent, key, value }
 *   - Single-quoted keys: "  'key': ..." (pnpm uses these for scoped @-packages in v9)
 *
 * Does NOT interpret YAML scalars (booleans/numbers stay as strings).
 *
 * @param {string} line
 * @returns {{ indent: number, key: string, value: string|null }|null}
 */
function _parseLine(line) {
  if (line.trim() === '' || line.trimStart().startsWith('#')) return null;

  const indent = line.length - line.trimStart().length;
  const content = line.trimStart();

  let key, rest;

  if (content.startsWith("'")) {
    // Single-quoted key (e.g. '@scope/pkg@1.0.0':)
    const closeQuote = content.indexOf("'", 1);
    if (closeQuote === -1) return null;
    key = content.slice(1, closeQuote);
    rest = content.slice(closeQuote + 1);
  } else if (content.startsWith('"')) {
    // Double-quoted key
    const closeQuote = content.indexOf('"', 1);
    if (closeQuote === -1) return null;
    key = content.slice(1, closeQuote);
    rest = content.slice(closeQuote + 1);
  } else {
    // Unquoted key — ends at first ':'
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) return null;
    key = content.slice(0, colonIdx);
    rest = content.slice(colonIdx);
  }

  if (!rest.startsWith(':')) return null;

  const afterColon = rest.slice(1);

  if (afterColon === '' || afterColon.trim() === '') {
    return { indent, key, value: null };
  }

  if (afterColon.startsWith(' ') || afterColon.startsWith('\t')) {
    return { indent, key, value: afterColon.trim() };
  }

  return null;
}

/**
 * Strip surrounding single or double quotes from a YAML scalar value.
 *
 * @param {string|null} s
 * @returns {string|null}
 */
function _unquote(s) {
  if (!s) return s;
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// ── lockfileVersion detection ─────────────────────────────────────────────────

/**
 * Read the `lockfileVersion:` field from raw pnpm-lock.yaml content.
 * Returns the major version as an integer (e.g. 5, 6, 9), or null if absent.
 *
 * Handles both unquoted integers (`lockfileVersion: 5`) and quoted strings
 * (`lockfileVersion: '6.0'`, `lockfileVersion: '9.0'`).
 *
 * @param {string} content
 * @returns {number|null}
 */
export function _parseLockfileVersion(content) {
  for (const line of content.split('\n')) {
    const m = line.match(/^lockfileVersion:\s*['"]?(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// ── Key decoding ──────────────────────────────────────────────────────────────

/**
 * Decode a pnpm v5 package key into { name, version }.
 * Key format: /name/version  or  /@scope/pkgname/version
 * The version segment may include a peer suffix separated by '_'; it is stripped.
 *
 * @param {string} key - Raw key including leading '/'
 * @returns {{ name: string, version: string }|null}
 */
function _parseV5Key(key) {
  if (!key.startsWith('/')) return null;
  const stripped = key.slice(1);

  // Find the last '/' to separate the version segment
  const lastSlash = stripped.lastIndexOf('/');
  if (lastSlash === -1) return null;

  const name = stripped.slice(0, lastSlash);
  const versionRaw = stripped.slice(lastSlash + 1);
  // Strip peer/platform suffix: "1.2.3_some-peer@4.0.0" → "1.2.3"
  const version = versionRaw.split('_')[0].split('(')[0];

  if (!name || !version) return null;
  return { name, version };
}

/**
 * Decode a pnpm v6 package key into { name, version }.
 * Key format: /name@version  or  /@scope/pkgname@version
 * The version segment may include a peer suffix; it is stripped.
 *
 * @param {string} key - Raw key including leading '/'
 * @returns {{ name: string, version: string }|null}
 */
function _parseV6Key(key) {
  if (!key.startsWith('/')) return null;
  const stripped = key.slice(1);

  // Find the last '@' to separate name from version.
  // For scoped packages like @scope/pkgname@version the last '@' is the version separator.
  const lastAt = stripped.lastIndexOf('@');
  if (lastAt === -1) return null;

  const name = stripped.slice(0, lastAt);
  const versionRaw = stripped.slice(lastAt + 1);
  // Strip peer/platform suffix
  const version = versionRaw.split('(')[0].split('_')[0];

  if (!name || !version) return null;
  return { name, version };
}

/**
 * Decode a pnpm v9 package key into { name, version } as a fallback
 * when explicit `name:` / `version:` fields are absent from the entry body.
 * Key format: name@version  or  @scope/pkgname@version  (no leading '/')
 *
 * @param {string} key
 * @returns {{ name: string, version: string }|null}
 */
function _parseV9Key(key) {
  if (key.startsWith('@')) {
    // Scoped: @scope/pkgname@version — second '@' is the version separator
    const secondAt = key.indexOf('@', 1);
    if (secondAt === -1) return null;
    const name = key.slice(0, secondAt);
    const version = key.slice(secondAt + 1).split('(')[0];
    if (!name || !version) return null;
    return { name, version };
  }
  const lastAt = key.lastIndexOf('@');
  if (lastAt === -1) return null;
  const name = key.slice(0, lastAt);
  const version = key.slice(lastAt + 1).split('(')[0];
  if (!name || !version) return null;
  return { name, version };
}

// ── integrity extraction ──────────────────────────────────────────────────────

/**
 * Extract the integrity hash from a pnpm resolution value.
 * Handles the inline flow mapping pnpm always emits:
 *   {integrity: sha512-abc}
 *   {integrity: sha512-abc, tarball: https://...}
 *
 * @param {string|null} value
 * @returns {string|null}
 */
function _extractIntegrity(value) {
  if (!value) return null;
  const m = value.match(/integrity:\s*([^\s,}]+)/);
  return m ? m[1] : null;
}

// ── source type classification ────────────────────────────────────────────────

/**
 * Infer the source type from available resolution metadata.
 * pnpm lockfiles don't expose resolved download URLs for registry packages
 * the same way npm does; we classify by what resolution fields are present.
 *
 * @param {string|null} integrity
 * @param {string|null} resolutionValue - Raw inline resolution string
 * @returns {string}
 */
function _classifySourceType(integrity, resolutionValue) {
  if (integrity) return SOURCE_TYPES.registry;
  if (resolutionValue) {
    if (resolutionValue.includes('directory')) return SOURCE_TYPES.file;
  }
  return SOURCE_TYPES.git;
}

// ── ResolvedDependency builder ────────────────────────────────────────────────

/**
 * Build a validated ResolvedDependency from raw parsed fields.
 *
 * @param {{ name: string, version: string, integrity: string|null,
 *           hasBin: boolean, requiresBuild: boolean,
 *           isDev?: boolean, resolutionValue?: string|null }} pkg
 * @returns {import('./models.js').ResolvedDependency}
 */
function _buildDep(pkg) {
  const integrity = pkg.integrity || null;
  const hasInstallScripts = (pkg.hasBin || pkg.requiresBuild) ? true : null;
  const sourceType = _classifySourceType(integrity, pkg.resolutionValue || null);

  return validateDependency({
    name: pkg.name,
    version: pkg.version,
    resolved: null, // pnpm lockfiles do not expose a direct tarball URL for registry pkgs
    integrity,
    isDev: !!pkg.isDev,
    hasInstallScripts,
    sourceType,
    directDependency: false, // pnpm lockfile does not mark direct vs transitive
  });
}

// ── v5 / v6 parser ────────────────────────────────────────────────────────────

/**
 * Parse a pnpm v5 or v6 lockfile's packages section.
 *
 * Package keys:
 *   v5: /name/version  or  /@scope/name/version
 *   v6: /name@version  or  /@scope/name@version
 *
 * @param {string} content
 * @param {5|6} majorVersion
 * @returns {ResolvedDependency[]}
 */
function _parseV5V6(content, majorVersion) {
  const lines = content.split('\n');
  const results = [];

  let section = null;
  let currentPkg = null;
  let inResolution = false;

  const flush = () => {
    if (currentPkg && currentPkg.name && currentPkg.version) {
      results.push(_buildDep(currentPkg));
    }
    currentPkg = null;
    inResolution = false;
  };

  for (const line of lines) {
    const parsed = _parseLine(line);
    if (!parsed) continue;
    const { indent, key, value } = parsed;

    // Top-level section header (indent 0)
    if (indent === 0) {
      flush();
      section = key;
      continue;
    }

    if (section !== 'packages') continue;

    // Package key (indent 2)
    if (indent === 2) {
      flush();
      const pkgInfo = majorVersion === 5 ? _parseV5Key(key) : _parseV6Key(key);
      if (pkgInfo) {
        currentPkg = {
          name: pkgInfo.name,
          version: pkgInfo.version,
          integrity: null,
          hasBin: false,
          requiresBuild: false,
          isDev: false,
          resolutionValue: null,
        };
      }
      continue;
    }

    if (!currentPkg) continue;

    // Package field (indent 4)
    if (indent === 4) {
      // Entering any indent-4 field resets block-resolution state
      inResolution = false;

      if (key === 'resolution') {
        currentPkg.resolutionValue = value;
        currentPkg.integrity = _extractIntegrity(value);
        if (!value) inResolution = true; // block-style resolution
      } else if (key === 'hasBin' && value === 'true') {
        currentPkg.hasBin = true;
      } else if (key === 'requiresBuild' && value === 'true') {
        currentPkg.requiresBuild = true;
      } else if (key === 'dev' && value === 'true') {
        currentPkg.isDev = true;
      }
      continue;
    }

    // Resolution sub-field (indent 6, block-style resolution only)
    if (indent === 6 && inResolution && key === 'integrity') {
      currentPkg.integrity = value;
    }
  }

  flush();
  return results;
}

// ── v9 parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a pnpm v9 lockfile.
 *
 * v9 package entries carry explicit `name:` and `version:` fields.
 * If an importers section is present and projectRoot is non-null,
 * only the packages referenced by that importer are returned.
 *
 * @param {string} content
 * @param {string|null} projectRoot
 * @returns {ResolvedDependency[]}
 */
function _parseV9(content, projectRoot) {
  const lines = content.split('\n');

  // packagesMap: pkgKey → raw pkg data
  const packagesMap = new Map();
  // importersMap: importerKey → Map<pkgName, resolvedVersion>
  const importersMap = new Map();

  let section = null;

  // Packages state
  let currentPkgKey = null;
  let currentPkg = null;

  // Importers state
  let currentImporterKey = null;
  let currentImporterSection = null; // 'dependencies' | 'devDependencies' | ...
  let currentDepName = null;

  const flushPkg = () => {
    if (currentPkgKey && currentPkg) {
      packagesMap.set(currentPkgKey, currentPkg);
    }
    currentPkgKey = null;
    currentPkg = null;
  };

  for (const line of lines) {
    const parsed = _parseLine(line);
    if (!parsed) continue;
    const { indent, key, value } = parsed;

    // Top-level section header (indent 0)
    if (indent === 0) {
      flushPkg();
      section = key;
      currentImporterKey = null;
      currentImporterSection = null;
      currentDepName = null;
      continue;
    }

    // ── packages section ───────────────────────────────────────────────────
    if (section === 'packages') {
      if (indent === 2) {
        flushPkg();
        currentPkgKey = key;
        currentPkg = {
          name: null,
          version: null,
          integrity: null,
          hasBin: false,
          requiresBuild: false,
          resolutionValue: null,
        };
        continue;
      }

      if (indent === 4 && currentPkg) {
        if (key === 'name') {
          currentPkg.name = _unquote(value);
        } else if (key === 'version') {
          currentPkg.version = _unquote(value);
        } else if (key === 'resolution') {
          currentPkg.resolutionValue = value;
          currentPkg.integrity = _extractIntegrity(value);
        } else if (key === 'hasBin' && value === 'true') {
          currentPkg.hasBin = true;
        } else if (key === 'requiresBuild' && value === 'true') {
          currentPkg.requiresBuild = true;
        }
        continue;
      }
    }

    // ── importers section ──────────────────────────────────────────────────
    if (section === 'importers') {
      if (indent === 2) {
        currentImporterKey = key;
        currentImporterSection = null;
        currentDepName = null;
        if (!importersMap.has(key)) {
          importersMap.set(key, new Map());
        }
        continue;
      }

      if (indent === 4 && currentImporterKey) {
        const DEP_SECTIONS = new Set(['dependencies', 'devDependencies', 'optionalDependencies']);
        if (DEP_SECTIONS.has(key)) {
          currentImporterSection = key;
        } else {
          currentImporterSection = null;
        }
        currentDepName = null;
        continue;
      }

      if (indent === 6 && currentImporterKey && currentImporterSection) {
        currentDepName = key;
        continue;
      }

      if (indent === 8 && currentImporterKey && currentImporterSection && currentDepName) {
        if (key === 'version') {
          importersMap.get(currentImporterKey).set(currentDepName, value);
        }
        continue;
      }
    }
  }

  flushPkg();

  // ── build result ───────────────────────────────────────────────────────────

  const hasImporters = importersMap.size > 0;

  if (projectRoot !== null && hasImporters) {
    // Workspace filtering: return only packages used by the matched importer
    const importerDeps = importersMap.get(projectRoot);
    if (!importerDeps) return [];

    const result = [];
    for (const [pkgName, resolvedVersion] of importerDeps.entries()) {
      const pkgKey = `${pkgName}@${resolvedVersion}`;
      const pkg = packagesMap.get(pkgKey);
      if (!pkg) continue;

      // Resolve name/version: prefer explicit fields, fall back to key decoding
      const name = pkg.name || (_parseV9Key(pkgKey) || {}).name || pkgName;
      const version = pkg.version || (_parseV9Key(pkgKey) || {}).version || resolvedVersion;
      if (!name || !version) continue;

      result.push(_buildDep({ ...pkg, name, version }));
    }
    return result;
  }

  // No workspace filtering — return all packages
  const result = [];
  for (const [pkgKey, pkg] of packagesMap.entries()) {
    const name = pkg.name || (_parseV9Key(pkgKey) || {}).name;
    const version = pkg.version || (_parseV9Key(pkgKey) || {}).version;
    if (!name || !version) continue;
    result.push(_buildDep({ ...pkg, name, version }));
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a pnpm-lock.yaml file into a ResolvedDependency array.
 *
 * Calls process.exit(2) if the lockfileVersion is not 5, 6, or 9.
 *
 * @param {string} content     - Raw content of pnpm-lock.yaml
 * @param {string|null} projectRoot - Workspace importer key to filter by;
 *                                    null means no filtering (return all packages).
 * @returns {ResolvedDependency[]}
 */
export function parsePnpm(content, projectRoot) {
  const majorVersion = _parseLockfileVersion(content);

  if (!SUPPORTED_VERSIONS.has(majorVersion)) {
    console.error(
      `Unsupported pnpm lockfile version ${majorVersion}. trustlock supports v5, v6, v9.`
    );
    process.exit(2);
  }

  if (majorVersion === 9) {
    return _parseV9(content, projectRoot);
  }

  return _parseV5V6(content, majorVersion);
}
