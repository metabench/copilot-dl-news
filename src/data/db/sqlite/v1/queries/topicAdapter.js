'use strict';

/**
 * Compatibility wrapper for topic modeling, story cluster, and trend DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createTopicAdapter` export used by copilot-dl-news.
 */

const { createSqliteTopicAdapter } = require('news-crawler-db');

function createTopicAdapter(db) {
  return createSqliteTopicAdapter(db);
}

module.exports = { createTopicAdapter };
