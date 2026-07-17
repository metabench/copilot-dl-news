'use strict';

/**
 * Search Module - Full-Text Search for Articles
 * 
 * Exports:
 *   - SearchService: High-level search API
 *   - createSearchAdapter: Low-level database adapter
 */

const { SearchService } = require('./SearchService');
// (direct from news-crawler-db; aliases preserve the retired searchAdapter
// shim's historical renames)
const {
  createSqliteArticleSearchAdapter: createSearchAdapter,
  SQLITE_ARTICLE_SEARCH_BM25_WEIGHTS: BM25_WEIGHTS,
  sanitizeSqliteArticleSearchQuery: sanitizeFtsQuery
} = require('news-crawler-db');

module.exports = {
  SearchService,
  createSearchAdapter,
  BM25_WEIGHTS,
  sanitizeFtsQuery
};
