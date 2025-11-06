'use strict';

const { filterFunctions, createPatternMatcher } = require('../shared/filters');

function normalizePatterns(patterns) {
  if (!Array.isArray(patterns)) {
    return [];
  }
  return patterns
    .map((pattern) => (typeof pattern === 'string' ? pattern.trim() : pattern))
    .filter((pattern) => pattern !== null && pattern !== undefined && pattern !== '');
}

function runPatternSearch(files, patterns, options = {}) {
  const normalizedPatterns = normalizePatterns(patterns);
  if (normalizedPatterns.length === 0) {
    throw new Error('Pattern search requires at least one pattern.');
  }

  const matcher = createPatternMatcher(normalizedPatterns);
  const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : 50;

  const matches = [];

  files.forEach((file) => {
    const filtered = filterFunctions(file.functions, {
      exportedOnly: options.exportedOnly,
      internalOnly: options.internalOnly,
      asyncOnly: options.asyncOnly,
      generatorOnly: options.generatorOnly,
      kinds: options.kinds,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths
    });

    filtered.forEach((fn) => {
      if (!matcher(fn.name) && !matcher(fn.canonicalName)) {
        return;
      }
      matches.push({
        file: file.relativePath,
        function: {
          name: fn.name,
          canonicalName: fn.canonicalName,
          kind: fn.kind,
          exportKind: fn.exportKind,
          hash: fn.hash,
          line: fn.line,
          column: fn.column,
          span: fn.span,
          exported: fn.exported,
          isAsync: fn.isAsync,
          isGenerator: fn.isGenerator
        }
      });
    });
  });

  matches.sort((a, b) => {
    if (a.function.exported !== b.function.exported) {
      return a.function.exported ? -1 : 1;
    }
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    return a.function.name.localeCompare(b.function.name);
  });

  return {
    operation: 'find-pattern',
    patterns: normalizedPatterns,
    matchCount: matches.length,
    matches: limit === 0 ? matches : matches.slice(0, limit)
  };
}

module.exports = {
  runPatternSearch
};
