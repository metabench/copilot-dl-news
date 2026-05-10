'use strict';

/**
 * Compatibility wrapper for recommendation DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createRecommendationAdapter` export.
 */

const { createRecommendationAdapter } = require('news-crawler-db');

module.exports = {
  createRecommendationAdapter
};
