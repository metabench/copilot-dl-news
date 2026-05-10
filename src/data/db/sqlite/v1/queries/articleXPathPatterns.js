'use strict';

const {
  ensureArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain,
  upsertArticleXPathPattern,
  recordArticleXPathPatternUsage,
  getArticleXPathPatternCount,
  normalizePatternDomain,
  getTopDomains
} = require('news-crawler-db');

module.exports = {
  ensureArticleXPathPatternSchema,
  getArticleXPathPatternsForDomain,
  upsertArticleXPathPattern,
  recordArticleXPathPatternUsage,
  getArticleXPathPatternCount,
  normalizePatternDomain,
  getTopDomains
};
