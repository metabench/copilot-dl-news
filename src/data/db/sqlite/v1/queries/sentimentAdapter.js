'use strict';

/**
 * Compatibility wrapper for sentiment DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createSentimentAdapter` export.
 */

const { createSentimentAdapter } = require('news-crawler-db');

module.exports = {
  createSentimentAdapter
};
