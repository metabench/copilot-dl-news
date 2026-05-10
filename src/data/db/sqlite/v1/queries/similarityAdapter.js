'use strict';

/**
 * Compatibility wrapper for article similarity DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createSimilarityAdapter` export.
 */

const { createSimilarityAdapter } = require('news-crawler-db');

module.exports = {
  createSimilarityAdapter
};
