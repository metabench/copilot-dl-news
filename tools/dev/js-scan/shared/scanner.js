'use strict';

const fs = require('fs');
const path = require('path');

const LANGUAGE_ENV = (process.env.TSNJS_SCAN_LANGUAGE || '').trim().toLowerCase();
const DEFAULT_LANGUAGE = LANGUAGE_ENV === 'typescript' ? 'typescript' : 'javascript';
const LANGUAGE_ALIASES = Object.freeze({
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript'
});

const languageRuntimes = {
  javascript: require('../../lib/swcAst'),
  typescript: require('../../lib/swcTs')
};

const { createFileRecord } = require('../lib/fileContext');

const DEFAULT_EXTENSIONS = Object.freeze(['.js', '.cjs', '.mjs', '.jsx']);
const DEFAULT_TS_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx']);
const DEFAULT_EXCLUDES = Object.freeze([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'build',
  'tmp',
  'logs'
]);
const DEPRECATED_PATH_FRAGMENTS = Object.freeze([
  'deprecated-ui',
  'deprecated-ui-root'
]);
const GENERATED_PATH_FRAGMENTS = Object.freeze([
  'public/assets',
  'screenshots'
]);

function normalizeLanguageOption(value) {
  if (typeof value !== 'string') {
    return DEFAULT_LANGUAGE;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return DEFAULT_LANGUAGE;
  }
  return LANGUAGE_ALIASES[normalized] || DEFAULT_LANGUAGE;
}

function resolveExtensionsForLanguage(language, overrides) {
  if (Array.isArray(overrides) && overrides.length > 0) {
    const seen = new Set();
    const normalized = [];
    overrides.forEach((ext) => {
      if (typeof ext !== 'string') {
        return;
      }
      const trimmed = ext.trim();
      if (!trimmed) {
        return;
      }
      const value = trimmed.startsWith('.') ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`;
      if (!seen.has(value)) {
        seen.add(value);
        normalized.push(value);
      }
    });
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return language === 'typescript' ? DEFAULT_TS_EXTENSIONS : DEFAULT_EXTENSIONS;
}

function isJavaScriptFile(filePath, extensions = DEFAULT_EXTENSIONS) {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

function shouldExclude(relativePath, excludes) {
  if (!relativePath) {
    return false;
  }
  const segments = relativePath.split(/\\|\//);
  return excludes.some((pattern) => segments.includes(pattern) || relativePath.includes(pattern));
}

function isDeprecatedPath(relativePath) {
  if (!relativePath) {
    return false;
  }
  return DEPRECATED_PATH_FRAGMENTS.some((fragment) => relativePath.split(/\//).includes(fragment));
}

function walkDirectory(rootDir, options, results) {
  const { excludes, extensions, followSymlinks, deprecatedOnly } = options;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const relativePath = results.rootRelative(fullPath);
    const entryIsDeprecated = isDeprecatedPath(relativePath);

    if (entry.isSymbolicLink() && followSymlinks !== true) {
      continue;
    }

    if (entry.isDirectory()) {
      if (shouldExclude(relativePath, excludes)) {
        continue;
      }

      if (deprecatedOnly && !entryIsDeprecated) {
        continue;
      }

      walkDirectory(fullPath, options, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (shouldExclude(relativePath, excludes)) {
      continue;
    }

    if (deprecatedOnly && !entryIsDeprecated) {
      continue;
    }

    if (!isJavaScriptFile(fullPath, extensions)) {
      continue;
    }

    results.files.push(fullPath);
  }
}

function scanWorkspace(options = {}) {
  const language = normalizeLanguageOption(options.language);
  const runtime = language === 'typescript' ? languageRuntimes.typescript : languageRuntimes.javascript;
  const { parseModule, collectFunctions } = runtime;
  const rootDir = path.resolve(options.rootDir || options.dir || process.cwd());
  const includeDeprecated = options.includeDeprecated === true || options.deprecatedOnly === true;
  const deprecatedOnly = options.deprecatedOnly === true;
  const followDependencies = options.followDependencies === true;
  const dependencyDepthLimit = typeof options.dependencyDepth === 'number' && options.dependencyDepth > 0
    ? options.dependencyDepth
    : Infinity;
  const excludePatterns = new Set(DEFAULT_EXCLUDES);
  GENERATED_PATH_FRAGMENTS.forEach((fragment) => excludePatterns.add(fragment));
  if (Array.isArray(options.exclude)) {
    options.exclude.forEach((pattern) => excludePatterns.add(pattern));
  }
  if (!includeDeprecated) {
    DEPRECATED_PATH_FRAGMENTS.forEach((fragment) => excludePatterns.add(fragment));
  }
  const excludes = Array.from(excludePatterns);
  const extensions = resolveExtensionsForLanguage(language, options.extensions);

  const followSymlinks = Boolean(options.followSymlinks);

  const rootRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');
  const collectedFiles = [];
  const stats = {
    scannedFiles: 0,
    parsedFiles: 0,
    functions: 0,
    classes: 0
  };
  const parseErrors = [];

  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  walkDirectory(rootDir, { excludes, extensions, followSymlinks, deprecatedOnly }, { files: collectedFiles, rootRelative });

  const pending = collectedFiles.map((filePath) => ({ filePath: path.resolve(filePath), depth: 0 }));
  const queuedPaths = new Set(pending.map((entry) => entry.filePath));
  const visitedPaths = new Set();
  const fileRecords = [];

  while (pending.length > 0) {
    const current = pending.shift();
    const absolutePath = current.filePath;

    if (visitedPaths.has(absolutePath)) {
      continue;
    }
    visitedPaths.add(absolutePath);

    stats.scannedFiles += 1;

    let source;
    try {
      source = fs.readFileSync(absolutePath, 'utf8');
    } catch (error) {
      parseErrors.push({ filePath: absolutePath, error });
      continue;
    }

    let ast;
    let functions;
    let mapper;
    try {
      ast = parseModule(source, path.basename(absolutePath));
      const collectResult = collectFunctions(ast, source);
      functions = collectResult.functions;
      mapper = collectResult.mapper;
    } catch (error) {
      parseErrors.push({ filePath: absolutePath, error });
      continue;
    }

    let record;
    try {
      record = createFileRecord({
        filePath: absolutePath,
        rootDir,
        source,
        ast,
        functions,
        mapper
      });
      fileRecords.push(record);
      stats.parsedFiles += 1;
      stats.functions += record.stats.functions;
      stats.classes += record.stats.classes;
    } catch (error) {
      parseErrors.push({ filePath: absolutePath, error });
      continue;
    }

    const resolvedImports = new Set();
    const resolvedRequires = new Set();
    const resolvedAbsolutePaths = new Set();

    const collectResolvedTargets = (specifiers, kind) => {
      if (!Array.isArray(specifiers) || specifiers.length === 0) {
        return;
      }

      specifiers.forEach((specifier) => {
        const resolvedPaths = resolveDependencyCandidates(absolutePath, specifier, {
          rootDir,
          extensions,
          excludes,
          deprecatedOnly
        });

        resolvedPaths.forEach((resolvedPath) => {
          const normalizedPath = path.resolve(resolvedPath);

          const relativePath = rootRelative(normalizedPath);
          if (shouldExclude(relativePath, excludes)) {
            return;
          }

          if (deprecatedOnly && !isDeprecatedPath(relativePath)) {
            return;
          }

          if (!isJavaScriptFile(normalizedPath, extensions)) {
            return;
          }

          resolvedAbsolutePaths.add(normalizedPath);
          if (kind === 'imports') {
            resolvedImports.add(relativePath);
          } else {
            resolvedRequires.add(relativePath);
          }
        });
      });
    };

    if (record.dependencies) {
      collectResolvedTargets(record.dependencies.imports, 'imports');
      collectResolvedTargets(record.dependencies.requires, 'requires');
    }

    record.resolvedDependencies = {
      imports: Array.from(resolvedImports).sort(),
      requires: Array.from(resolvedRequires).sort()
    };

    if (!followDependencies) {
      continue;
    }

    if (current.depth >= dependencyDepthLimit) {
      continue;
    }

    resolvedAbsolutePaths.forEach((normalizedPath) => {
      if (visitedPaths.has(normalizedPath) || queuedPaths.has(normalizedPath)) {
        return;
      }

      const relativePath = rootRelative(normalizedPath);
      if (shouldExclude(relativePath, excludes)) {
        return;
      }

      if (deprecatedOnly && !isDeprecatedPath(relativePath)) {
        return;
      }

      if (!isJavaScriptFile(normalizedPath, extensions)) {
        return;
      }

      queuedPaths.add(normalizedPath);
      pending.push({ filePath: normalizedPath, depth: current.depth + 1 });
    });
  }

  return {
    rootDir,
    language,
    files: fileRecords,
    stats,
    errors: parseErrors
  };
}

function resolveDependencyCandidates(filePath, specifier, context) {
  const sanitized = sanitizeModuleSpecifier(specifier);
  if (!sanitized) {
    return [];
  }

  const candidates = new Set();
  const basePath = resolveBasePath(filePath, sanitized, context.rootDir);
  if (!basePath) {
    return [];
  }

  expandToFileCandidates(basePath, context.extensions).forEach((candidate) => {
    candidates.add(candidate);
  });

  return Array.from(candidates);
}

function sanitizeModuleSpecifier(specifier) {
  if (typeof specifier !== 'string') {
    return '';
  }
  const trimmed = specifier.trim();
  if (!trimmed) {
    return '';
  }
  if (/^(?:node:|https?:|data:|fs:)/i.test(trimmed)) {
    return '';
  }
  if (trimmed.includes('!')) {
    return '';
  }
  return trimmed.split('?')[0].split('#')[0];
}

function resolveBasePath(currentFile, specifier, rootDir) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return path.resolve(path.dirname(currentFile), specifier);
  }

  if (specifier.startsWith('/')) {
    return path.resolve(rootDir, specifier.slice(1));
  }

  return null;
}

function expandToFileCandidates(basePath, extensions) {
  const queue = [basePath];
  const discovered = new Set();
  const results = new Set();

  if (!path.extname(basePath)) {
    extensions.forEach((ext) => {
      queue.push(`${basePath}${ext}`);
    });
  }

  while (queue.length > 0) {
    const candidate = queue.shift();
    const normalized = path.resolve(candidate);

    if (discovered.has(normalized)) {
      continue;
    }
    discovered.add(normalized);

    let stats;
    try {
      stats = fs.statSync(normalized);
    } catch (error) {
      continue;
    }

    if (stats.isFile()) {
      if (isJavaScriptFile(normalized, extensions)) {
        results.add(normalized);
      }
      continue;
    }

    if (stats.isDirectory()) {
      extensions.forEach((ext) => {
        queue.push(path.join(normalized, `index${ext}`));
      });
    }
  }

  return Array.from(results);
}

module.exports = {
  scanWorkspace,
  isJavaScriptFile,
  DEFAULT_EXTENSIONS,
  DEFAULT_TS_EXTENSIONS,
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS,
  normalizeLanguageOption
};
