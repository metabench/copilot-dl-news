'use strict';

const {
  ensurePostgresArticleXPathPatternSchema,
  getPostgresArticleXPathPatternsForDomain,
  upsertPostgresArticleXPathPattern,
  recordPostgresArticleXPathPatternUsage,
  getPostgresArticleXPathPatternCount,
  normalizePostgresPatternDomain,
  getTopPostgresArticleXPathPatternDomains
} = require('news-crawler-db');

module.exports = {
  ensureArticleXPathPatternSchema: ensurePostgresArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain: getPostgresArticleXPathPatternsForDomain,
  upsertArticleXPathPattern: upsertPostgresArticleXPathPattern,
  recordArticleXPathPatternUsage: recordPostgresArticleXPathPatternUsage,
  getArticleXPathPatternCount: getPostgresArticleXPathPatternCount,
  normalizePatternDomain: normalizePostgresPatternDomain,
  getTopDomains: getTopPostgresArticleXPathPatternDomains
};
