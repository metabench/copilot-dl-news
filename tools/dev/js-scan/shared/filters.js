'use strict';

const path = require('path');

const NORMALIZED_KINDS = Object.freeze({
  function: ['function-declaration', 'function-expression', 'arrow-function'],
  method: ['class-method'],
  class: ['class'],
  constructor: ['constructor']
});

function expandKindAliases(kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) {
    return null;
  }
  const results = new Set();
  kinds.forEach((kind) => {
    if (typeof kind !== 'string' || kind.length === 0) {
      return;
    }
    const normalized = kind.toLowerCase();
    if (NORMALIZED_KINDS[normalized]) {
      NORMALIZED_KINDS[normalized].forEach((item) => results.add(item));
      return;
    }
    results.add(kind);
  });
  return Array.from(results);
}

function matchesKind(record, kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0) {
    return true;
  }
  return kinds.includes(record.kind);
}

function matchesFile(record, includePaths) {
  if (!Array.isArray(includePaths) || includePaths.length === 0) {
    return true;
  }
  return includePaths.some((fragment) => record.relativePath.includes(fragment) || record.filePath.includes(fragment));
}

function filterFunctions(functions, options = {}) {
  if (!Array.isArray(functions) || functions.length === 0) {
    return [];
  }

  const kindList = expandKindAliases(options.kinds);

  return functions.filter((fn) => {
    if (options.exportedOnly && !fn.exported) {
      return false;
    }
    if (options.internalOnly && fn.exported) {
      return false;
    }
    if (options.asyncOnly && !fn.isAsync) {
      return false;
    }
    if (options.generatorOnly && !fn.isGenerator) {
      return false;
    }
    if (!matchesKind(fn, kindList)) {
      return false;
    }
    if (!matchesFile(fn, options.includePaths)) {
      return false;
    }
    if (Array.isArray(options.excludePaths) && options.excludePaths.some((fragment) => fn.relativePath.includes(fragment))) {
      return false;
    }
    return true;
  });
}

function globToRegExp(pattern) {
  const escaped = pattern.split('').map((char) => {
    switch (char) {
      case '*':
        return '.*';
      case '?':
        return '.';
      case '.':
        return '\\.';
      default:
        return /[+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
    }
  }).join('');
  return new RegExp(`^${escaped}$`, 'i');
}

function createPatternMatcher(patterns = []) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return () => true;
  }

  const matchers = patterns.map((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern;
    }
    if (typeof pattern === 'string' && pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      const lastSlash = pattern.lastIndexOf('/');
      const body = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      try {
        return new RegExp(body, flags || 'i');
      } catch (error) {
        return globToRegExp(pattern.slice(1, lastSlash));
      }
    }
    if (typeof pattern === 'string') {
      return globToRegExp(pattern);
    }
    return globToRegExp(String(pattern));
  });

  return (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    return matchers.some((matcher) => matcher.test(value));
  };
}

function normalizeTerm(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function createTermMatcher(terms = []) {
  const normalizedTerms = terms
    .map((term) => normalizeTerm(term))
    .filter((term) => term.length > 0);

  if (normalizedTerms.length === 0) {
    return () => true;
  }

  return (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    const lower = value.toLowerCase();
    return normalizedTerms.every((term) => lower.includes(term));
  };
}

module.exports = {
  filterFunctions,
  createPatternMatcher,
  createTermMatcher,
  expandKindAliases
};
