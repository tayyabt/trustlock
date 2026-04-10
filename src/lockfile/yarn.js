/**
 * yarn lockfile parser — classic v1 and berry v2+.
 *
 * Public API:
 *   parseYarn(content, packageJsonContent) → ResolvedDependency[]
 *
 * Format overview:
 *   classic v1: custom text format; header lines contain one or more
 *               quoted specifiers separated by commas; fields use `key "value"` syntax.
 *   berry v2+:  `__metadata:` block present; fields use `key: value` syntax;
 *               workspace packages have `languageName: unknown` and are excluded.
 *
 * Pure function — no I/O, no network, no imports from the registry module.
 */

import { validateDependency, SOURCE_TYPES } from './models.js';

// ── Name extraction ───────────────────────────────────────────────────────────

/**
 * Extract package name from a specifier string (with or without quotes).
 * Handles scoped packages: `@babel/core@^7.0.0` → `@babel/core`.
 *
 * @param {string} spec - e.g. "lodash@^4.17.21" or "@babel/core@npm:^7.0.0"
 * @returns {string}
 */
function specifierToName(spec) {
  // Strip surrounding quotes
  const s = spec.replace(/^["']|["']$/g, '');
  if (s.startsWith('@')) {
    // Scoped: find the second '@'
    const idx = s.indexOf('@', 1);
    return idx === -1 ? s : s.slice(0, idx);
  }
  const idx = s.indexOf('@');
  return idx === -1 ? s : s.slice(0, idx);
}

// ── Source type classification ────────────────────────────────────────────────

/**
 * Infer source type from resolved URL or resolution descriptor.
 *
 * @param {string|null} resolved
 * @param {string|null} integrity
 * @returns {string}
 */
function classifySourceType(resolved, integrity) {
  if (integrity) return SOURCE_TYPES.registry;
  if (!resolved) return SOURCE_TYPES.git;
  if (
    resolved.startsWith('git') ||
    resolved.includes('git+') ||
    resolved.endsWith('.git') ||
    resolved.startsWith('github:') ||
    resolved.startsWith('bitbucket:')
  ) {
    return SOURCE_TYPES.git;
  }
  if (resolved.startsWith('file:') || resolved.startsWith('.')) {
    return SOURCE_TYPES.file;
  }
  return SOURCE_TYPES.registry;
}

// ── Dev/prod classification via BFS ──────────────────────────────────────────

/**
 * Parse a package.json content string and return { devSet, prodSet }.
 *
 * @param {string|null} packageJsonContent
 * @returns {{ devSet: Set<string>, prodSet: Set<string> }}
 */
function parsePackageJson(packageJsonContent) {
  if (!packageJsonContent) return { devSet: new Set(), prodSet: new Set() };
  try {
    const pkg = JSON.parse(packageJsonContent);
    return {
      devSet: new Set(Object.keys(pkg.devDependencies || {})),
      prodSet: new Set(Object.keys(pkg.dependencies || {})),
    };
  } catch {
    return { devSet: new Set(), prodSet: new Set() };
  }
}

/**
 * Assign `isDev` to all entries via:
 *   1. Direct lookup in package.json dependency maps.
 *   2. BFS from direct packages to propagate isDev to transitive deps.
 *   3. Unvisited packages default to isDev: false.
 *
 * Mutates entries in place.
 *
 * @param {object[]} entries     - Parsed entries with `name`, `specifiers`, `deps`, `isDev`.
 * @param {Map<string, object>}  specifierToEntry - Maps each specifier string to its entry.
 * @param {string|null} packageJsonContent
 */
function classifyDevProd(entries, specifierToEntry, packageJsonContent) {
  const { devSet, prodSet } = parsePackageJson(packageJsonContent);

  // Step 1: mark direct packages
  for (const entry of entries) {
    if (devSet.has(entry.name)) {
      entry.isDev = true;
    } else if (prodSet.has(entry.name)) {
      entry.isDev = false;
    }
    // else: remains null, to be resolved by BFS
  }

  // Step 2: BFS — prod entries first so prod wins over dev when both reach a transitive dep
  const queue = [
    ...entries.filter((e) => e.isDev === false),
    ...entries.filter((e) => e.isDev === true),
  ];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift();
    for (const depSpecifier of current.deps) {
      const depEntry = specifierToEntry.get(depSpecifier);
      if (!depEntry || visited.has(depEntry)) continue;
      depEntry.isDev = current.isDev;
      visited.add(depEntry);
      queue.push(depEntry);
    }
  }

  // Step 3: unvisited packages default to prod
  for (const entry of entries) {
    if (entry.isDev === null) entry.isDev = false;
  }
}

// ── Classic v1 parser ─────────────────────────────────────────────────────────

/**
 * Parse a yarn classic v1 header line into an array of specifier strings.
 * Handles both quoted and unquoted specifiers, including multi-specifier lines.
 *
 * Examples:
 *   `"lodash@^4.17.21", "lodash@4.x.x":` → ["lodash@^4.17.21", "lodash@4.x.x"]
 *   `express@^4.18.2:`                    → ["express@^4.18.2"]
 *
 * @param {string} line - Raw header line (at indent 0, ending with ':').
 * @returns {string[]}
 */
function parseClassicHeader(line) {
  const withoutTrailingColon = line.replace(/:$/, '').trim();
  const parts = withoutTrailingColon.split(/,\s*/);
  return parts.map((p) => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

/**
 * Parse a yarn classic v1 field line (at indent 2).
 * Field formats:
 *   `  version "4.17.21"`     → { key: 'version', value: '4.17.21' }
 *   `  resolved "url"`        → { key: 'resolved', value: 'url' }
 *   `  integrity sha512-...`  → { key: 'integrity', value: 'sha512-...' }
 *   `  dependencies:`         → { key: 'dependencies', value: null }
 *
 * @param {string} line
 * @returns {{ key: string, value: string|null }|null}
 */
function parseClassicField(line) {
  const trimmed = line.trimStart();
  if (!trimmed) return null;

  // Key is the first whitespace-delimited token
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) {
    // Key only (e.g., "dependencies:")
    const key = trimmed.replace(/:$/, '');
    return { key, value: null };
  }

  const key = trimmed.slice(0, spaceIdx);
  const rest = trimmed.slice(spaceIdx).trim();

  if (!rest) return { key, value: null };

  // Unquote value if surrounded by double quotes
  if (rest.startsWith('"') && rest.endsWith('"')) {
    return { key, value: rest.slice(1, -1) };
  }
  return { key, value: rest };
}

/**
 * Parse a yarn classic v1 lockfile into a ResolvedDependency array.
 *
 * @param {string} content            - Raw lockfile text
 * @param {string|null} packageJsonContent - Serialized package.json or null
 * @returns {ResolvedDependency[]}
 */
function parseClassic(content, packageJsonContent) {
  const lines = content.split('\n');

  /** @type {Map<string, object>} specifier → entry object */
  const specifierToEntry = new Map();
  /** @type {object[]} all unique entries */
  const entries = [];

  let currentEntry = null;
  let inDependencies = false;

  const flushEntry = () => {
    if (!currentEntry) return;
    if (currentEntry.name && currentEntry.version) {
      entries.push(currentEntry);
      for (const spec of currentEntry.specifiers) {
        specifierToEntry.set(spec, currentEntry);
      }
    }
    currentEntry = null;
    inDependencies = false;
  };

  for (const line of lines) {
    // Skip comment lines
    if (line.trimStart().startsWith('#')) continue;
    // Blank line — signals end of current package block
    if (!line.trim()) {
      inDependencies = false;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // Indent 0: package header line
    if (indent === 0) {
      flushEntry();
      const specifiers = parseClassicHeader(line);
      if (!specifiers.length) continue;
      const name = specifierToName(specifiers[0]);
      if (!name) continue;
      currentEntry = {
        name,
        version: null,
        resolved: null,
        integrity: null,
        hasInstallScripts: null, // classic lockfile does not encode this
        specifiers,
        deps: [],
        isDev: null,
      };
      inDependencies = false;
      continue;
    }

    if (!currentEntry) continue;

    // Indent 2: package fields
    if (indent === 2) {
      inDependencies = false;
      const field = parseClassicField(line);
      if (!field) continue;
      const { key, value } = field;
      if (key === 'version' && value) {
        currentEntry.version = value;
      } else if (key === 'resolved' && value) {
        currentEntry.resolved = value;
      } else if (key === 'integrity' && value) {
        currentEntry.integrity = value;
      } else if (key === 'dependencies') {
        inDependencies = true;
      }
      continue;
    }

    // Indent 4: dependency entries inside `dependencies:` block
    if (indent === 4 && inDependencies) {
      const field = parseClassicField(line);
      if (!field) continue;
      // Field key is the dep name; value is the specifier range (e.g. "^4.17.21")
      const depName = field.key.replace(/:$/, '');
      const depRange = field.value || '';
      if (depName && depRange) {
        // Reconstruct the full specifier as it appears in lockfile headers
        currentEntry.deps.push(`${depName}@${depRange}`);
      }
      continue;
    }
  }

  flushEntry();

  classifyDevProd(entries, specifierToEntry, packageJsonContent);

  return entries.map((entry) => {
    const sourceType = classifySourceType(entry.resolved, entry.integrity);
    return validateDependency({
      name: entry.name,
      version: entry.version,
      resolved: entry.resolved,
      integrity: entry.integrity,
      isDev: entry.isDev,
      hasInstallScripts: entry.hasInstallScripts,
      sourceType,
      directDependency: entry.specifiers.some((s) => {
        const n = specifierToName(s);
        // directDependency: true if this is a direct package.json dep
        return !!(parsePackageJson(packageJsonContent).devSet.has(n) ||
                  parsePackageJson(packageJsonContent).prodSet.has(n));
      }),
    });
  });
}

// ── Berry v2+ parser ──────────────────────────────────────────────────────────

/**
 * Parse a yarn berry v2+ field line (at indent 2, `key: value` syntax).
 *
 * @param {string} line
 * @returns {{ key: string, value: string|null }|null}
 */
function parseBerryField(line) {
  const trimmed = line.trimStart();
  if (!trimmed) return null;

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return null;

  const key = trimmed.slice(0, colonIdx).trim();
  const rest = trimmed.slice(colonIdx + 1).trim();

  if (!rest) return { key, value: null };

  // Strip surrounding quotes from value
  if (
    (rest.startsWith('"') && rest.endsWith('"')) ||
    (rest.startsWith("'") && rest.endsWith("'"))
  ) {
    return { key, value: rest.slice(1, -1) };
  }
  return { key, value: rest };
}

/**
 * Parse a yarn berry v2+ lockfile into a ResolvedDependency array.
 * Excludes packages with `languageName: unknown` (workspace packages).
 *
 * @param {string} content            - Raw lockfile text
 * @param {string|null} packageJsonContent - Serialized package.json or null
 * @returns {ResolvedDependency[]}
 */
function parseBerry(content, packageJsonContent) {
  const lines = content.split('\n');

  /** @type {Map<string, object>} specifier → entry */
  const specifierToEntry = new Map();
  /** @type {object[]} all unique entries (after workspace exclusion) */
  const entries = [];

  let currentEntry = null;
  let inMetadata = false;
  let inDependencies = false;
  let inDependenciesMeta = false;
  let currentDepsMetaPkg = null;

  const flushEntry = () => {
    if (!currentEntry) return;
    // Exclude workspace packages (languageName: unknown)
    if (
      currentEntry.languageName !== 'unknown' &&
      currentEntry.name &&
      currentEntry.version
    ) {
      entries.push(currentEntry);
      for (const spec of currentEntry.specifiers) {
        specifierToEntry.set(spec, currentEntry);
      }
    }
    currentEntry = null;
    inMetadata = false;
    inDependencies = false;
    inDependenciesMeta = false;
    currentDepsMetaPkg = null;
  };

  for (const line of lines) {
    // Skip comment lines
    if (line.trimStart().startsWith('#')) continue;
    // Blank line — signals end of current package block
    if (!line.trim()) {
      inDependencies = false;
      inDependenciesMeta = false;
      currentDepsMetaPkg = null;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // Indent 0: either __metadata: or package header
    if (indent === 0) {
      flushEntry();
      const field = parseBerryField(line);
      if (!field) continue;

      if (field.key === '__metadata') {
        inMetadata = true;
        continue;
      }

      inMetadata = false;
      // Package header line — may be multi-specifier like classic
      // Strip trailing ':' and parse specifiers
      const headerLine = line.trimEnd().replace(/:$/, '');
      const parts = headerLine.split(/,\s*/);
      const specifiers = parts
        .map((p) => p.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);

      if (!specifiers.length) continue;
      const name = specifierToName(specifiers[0]);
      if (!name) continue;

      currentEntry = {
        name,
        version: null,
        resolved: null,
        integrity: null, // set from checksum: field
        hasInstallScripts: null,
        languageName: null,
        specifiers,
        deps: [],
        isDev: null,
        // Track if any dependenciesMeta entry has built: true
        _hasBuilt: false,
      };
      inDependencies = false;
      inDependenciesMeta = false;
      currentDepsMetaPkg = null;
      continue;
    }

    if (!currentEntry || inMetadata) continue;

    // Indent 2: package-level fields
    if (indent === 2) {
      inDependencies = false;
      inDependenciesMeta = false;
      currentDepsMetaPkg = null;

      const field = parseBerryField(line);
      if (!field) continue;
      const { key, value } = field;

      if (key === 'version' && value) {
        currentEntry.version = value;
      } else if (key === 'resolution' && value) {
        currentEntry.resolved = value;
      } else if (key === 'checksum' && value) {
        // berry uses checksum: instead of integrity: — stored as-is (ADR-004)
        currentEntry.integrity = value;
      } else if (key === 'languageName' && value) {
        currentEntry.languageName = value;
      } else if (key === 'dependencies') {
        inDependencies = true;
      } else if (key === 'dependenciesMeta') {
        inDependenciesMeta = true;
      }
      continue;
    }

    // Indent 4
    if (indent === 4) {
      if (inDependencies) {
        // Dep entry inside dependencies block: `  depName: "npm:^version"`
        const field = parseBerryField(line);
        if (!field) continue;
        const depName = field.key.replace(/:$/, '');
        const depValue = field.value || '';
        if (depName && depValue) {
          // Reconstruct the full specifier as it appears in lockfile headers
          currentEntry.deps.push(`${depName}@${depValue}`);
        }
        continue;
      }

      if (inDependenciesMeta) {
        // Sub-package name inside dependenciesMeta block
        const field = parseBerryField(line);
        if (!field) continue;
        currentDepsMetaPkg = field.key.replace(/:$/, '');
        continue;
      }

      // Any other indent-4 field resets sub-block state
      inDependencies = false;
      inDependenciesMeta = false;
      currentDepsMetaPkg = null;
      continue;
    }

    // Indent 6: fields inside dependenciesMeta sub-package
    if (indent === 6 && inDependenciesMeta && currentDepsMetaPkg) {
      const field = parseBerryField(line);
      if (!field) continue;
      // C-NEW-1 signal: if built: true present in any dependenciesMeta entry →
      // hasInstallScripts: true for this package.
      if (field.key === 'built' && field.value === 'true') {
        currentEntry._hasBuilt = true;
      }
      continue;
    }
  }

  flushEntry();

  // Resolve hasInstallScripts from _hasBuilt flag
  for (const entry of entries) {
    entry.hasInstallScripts = entry._hasBuilt ? true : null;
  }

  classifyDevProd(entries, specifierToEntry, packageJsonContent);

  const { devSet, prodSet } = parsePackageJson(packageJsonContent);

  return entries.map((entry) => {
    const sourceType = classifySourceType(entry.resolved, entry.integrity);
    return validateDependency({
      name: entry.name,
      version: entry.version,
      resolved: entry.resolved,
      integrity: entry.integrity,
      isDev: entry.isDev,
      hasInstallScripts: entry.hasInstallScripts,
      sourceType,
      directDependency: devSet.has(entry.name) || prodSet.has(entry.name),
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a yarn.lock file into a ResolvedDependency array.
 *
 * Detects berry format by the presence of `__metadata:` at line start.
 * Classic v1 format is used otherwise.
 *
 * @param {string} content            - Raw content of yarn.lock
 * @param {string|null} packageJsonContent - Serialized package.json for dev/prod
 *                                           classification; null = all prod.
 * @returns {ResolvedDependency[]}
 */
export function parseYarn(content, packageJsonContent) {
  const isBerry = /^__metadata:/m.test(content);
  if (isBerry) return parseBerry(content, packageJsonContent);
  return parseClassic(content, packageJsonContent);
}
