'use strict';

/**
 * Compatibility wrapper for article full-text search.
 *
 * SQL ownership lives in news-crawler-db. This file preserves the historical
 * CommonJS export names used by copilot-dl-news routes and services.
 */

const {
  createSqliteArticleSearchAdapter,
  sanitizeSqliteArticleSearchQuery,
  SQLITE_ARTICLE_SEARCH_BM25_WEIGHTS
} = require('news-crawler-db');

function createSearchAdapter(db) {
  return createSqliteArticleSearchAdapter(db);
}

module.exports = {
  createSearchAdapter,
  sanitizeFtsQuery: sanitizeSqliteArticleSearchQuery,
  BM25_WEIGHTS: SQLITE_ARTICLE_SEARCH_BM25_WEIGHTS
};