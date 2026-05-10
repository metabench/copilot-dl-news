'use strict';

/**
 * Compatibility wrapper for legacy crawl helpers.
 *
 * SQL ownership lives in news-crawler-db. This file preserves the historical
 * CommonJS helper names used by older copilot-dl-news callers.
 */

const {
  createSqliteCrawl,
  createSqliteCrawlType,
  getSqliteCrawl,
  getSqliteCrawlLogs
} = require('news-crawler-db');

function createCrawl(db, input) {
  return createSqliteCrawl(db, input);
}

function createCrawlType(db, input) {
  return createSqliteCrawlType(db, input);
}

function getCrawl(db, id) {
  return getSqliteCrawl(db, id);
}

function getCrawlLogs(db, id) {
  return getSqliteCrawlLogs(db, id);
}

module.exports = {
  createCrawl,
  createCrawlType,
  getCrawl,
  getCrawlLogs
};
