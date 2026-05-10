/**
 * Database queries for analysis operations
 * Separated from UI and business logic for modularity
 */

const { NewsDatabase } = require('../sqlite/v1');

function resolveNewsDatabase(dbish) {
  if (!dbish) {
    throw new Error('Database handle is required');
  }
  if (dbish instanceof NewsDatabase) {
    return dbish;
  }
  if (dbish.newsDatabase instanceof NewsDatabase) {
    return dbish.newsDatabase;
  }
  if (dbish.db instanceof NewsDatabase) {
    return dbish.db;
  }
  if (dbish.db && typeof dbish.db.prepare === 'function' && !(dbish instanceof NewsDatabase)) {
    return new NewsDatabase(dbish.db);
  }
  if (typeof dbish.prepare === 'function') {
    return new NewsDatabase(dbish);
  }
  throw new Error('Unsupported database handle provided to analysis queries');
}

function normalizeOptions(input, defaults = {}) {
  if (input == null) return { ...defaults };
  if (typeof input === 'number') {
    return { ...defaults, analysisVersion: input };
  }
  if (typeof input === 'object') {
    return { ...defaults, ...input };
  }
  return { ...defaults };
}

function countArticlesNeedingAnalysis(dbish, options) {
  const adapter = resolveNewsDatabase(dbish);
  const normalized = normalizeOptions(options, { analysisVersion: 1, limit: null });
  return adapter.countArticlesNeedingAnalysis(normalized);
}

function getAnalysisStatusCounts(dbish) {
  const adapter = resolveNewsDatabase(dbish);
  return adapter.getAnalysisStatusCounts();
}

function getArticlesNeedingAnalysis(dbish, options) {
  const adapter = resolveNewsDatabase(dbish);
  const normalized = normalizeOptions(options, { analysisVersion: 1, limit: 100, offset: 0 });
  return adapter.getArticlesNeedingAnalysis(normalized);
}

module.exports = {
  countArticlesNeedingAnalysis,
  getAnalysisStatusCounts,
  getArticlesNeedingAnalysis
};
