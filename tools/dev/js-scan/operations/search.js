'use strict';

const { filterFunctions } = require('../shared/filters');
const { computeRelevanceScore, scoreToStars } = require('../shared/ranker');
const { buildGuidance } = require('../shared/guidance');

function normalizeTerms(terms) {
  if (!Array.isArray(terms)) {
    return [];
  }
  return terms
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter((term) => term.length > 0)
    .map((term) => term.toLowerCase());
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function buildMatchRecord(fileRecord, functionRecord, normalizedTerms, options = {}) {
  const nameLower = (functionRecord.name || '').toLowerCase();
  const snippetLower = (functionRecord.snippet || '').toLowerCase();

  const nameHits = [];
  const bodyHits = [];

  normalizedTerms.forEach((term) => {
    if (nameLower.includes(term)) {
      nameHits.push(term);
    }
    const occurrences = countOccurrences(snippetLower, term);
    if (occurrences > 0) {
      for (let i = 0; i < occurrences; i += 1) {
        bodyHits.push(term);
      }
    }
  });

  if (nameHits.length === 0 && bodyHits.length === 0) {
    return null;
  }

  const lines = typeof functionRecord.snippet === 'string'
    ? functionRecord.snippet.split(/\r?\n/).length
    : 0;
  const depth = fileRecord.relativePath.split('/').length - 1;

  const score = computeRelevanceScore({
    nameHits,
    bodyHits,
    exported: functionRecord.exported,
    async: functionRecord.isAsync,
    lines,
    depth
  });

  const stars = scoreToStars(score);

  const snippet = options.noSnippets ? undefined : functionRecord.snippetPreview;

  return {
    rank: stars,
    score,
    file: fileRecord.relativePath,
    function: {
      name: functionRecord.name,
      canonicalName: functionRecord.canonicalName,
      kind: functionRecord.kind,
      exportKind: functionRecord.exportKind,
      line: functionRecord.line,
      column: functionRecord.column,
      hash: functionRecord.hash,
      span: functionRecord.span,
      exported: functionRecord.exported,
      isAsync: functionRecord.isAsync,
      isGenerator: functionRecord.isGenerator
    },
    context: {
      snippet,
      matchTerms: Array.from(new Set([...nameHits, ...bodyHits])),
      nameHits,
      bodyHits
    }
  };
}

function runSearch(files, terms, options = {}) {
  const normalizedTerms = normalizeTerms(terms);
  if (normalizedTerms.length === 0) {
    throw new Error('Search requires at least one term.');
  }

  const flattenedFunctions = files.flatMap((file) =>
    filterFunctions(file.functions, {
      exportedOnly: options.exportedOnly,
      internalOnly: options.internalOnly,
      asyncOnly: options.asyncOnly,
      generatorOnly: options.generatorOnly,
      kinds: options.kinds,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths
    }).map((fn) => ({ file, fn }))
  );

  const matches = [];

  flattenedFunctions.forEach(({ file, fn }) => {
    const match = buildMatchRecord(file, fn, normalizedTerms, options);
    if (match) {
      matches.push(match);
    }
  });

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.function.exported !== b.function.exported) {
      return b.function.exported ? 1 : -1;
    }
    if (a.function.isAsync !== b.function.isAsync) {
      return b.function.isAsync ? 1 : -1;
    }
    if (a.function.line !== b.function.line) {
      return a.function.line - b.function.line;
    }
    return a.function.name.localeCompare(b.function.name);
  });

  const limit = typeof options.limit === 'number' && options.limit >= 0 ? options.limit : 20;
  const limitedMatches = limit === 0 ? matches : matches.slice(0, limit);

  const exportedCount = matches.filter((match) => match.function.exported).length;
  const asyncCount = matches.filter((match) => match.function.isAsync).length;
  const topDirectory = matches.length > 0
    ? matches.reduce((acc, match) => {
        const dir = match.file.includes('/') ? match.file.split('/').slice(0, -1).join('/') : '.';
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      }, {})
    : {};

  let leadingDirectory = null;
  let leadingCount = 0;
  Object.entries(topDirectory).forEach(([dir, count]) => {
    if (count > leadingCount) {
      leadingDirectory = dir;
      leadingCount = count;
    }
  });

  const averageStars = matches.length === 0
    ? 0
    : matches.reduce((sum, match) => sum + match.rank, 0) / matches.length;

  const guidance = options.noGuidance
    ? { triggered: false, suggestions: [] }
    : buildGuidance({
        totalMatches: matches.length,
        displayed: limitedMatches.length,
        averageStars,
        exportedRatio: matches.length === 0 ? 0 : exportedCount / matches.length,
        asyncRatio: matches.length === 0 ? 0 : asyncCount / matches.length,
        topDirectory: leadingDirectory
      });

  return {
    operation: 'search',
    terms: normalizedTerms,
    stats: {
      filesConsidered: files.length,
      functionsConsidered: flattenedFunctions.length,
      matchCount: matches.length,
      exportedMatches: exportedCount,
      asyncMatches: asyncCount,
      limit
    },
    matches: limitedMatches,
    guidance
  };
}

module.exports = {
  runSearch
};
