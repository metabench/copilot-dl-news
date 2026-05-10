'use strict';

/**
 * Compatibility wrapper for template review queue DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS helper exports.
 */

const {
  ensureTemplateReviewSchema,
  normalizeReviewRow,
  createTemplateReviewAdapter
} = require('news-crawler-db');

module.exports = {
  ensureTemplateReviewSchema,
  normalizeReviewRow,
  createTemplateReviewAdapter
};
