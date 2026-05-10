'use strict';

/**
 * Compatibility wrapper for summary DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createSummaryAdapter` export.
 */

const { createSummaryAdapter } = require('news-crawler-db');

module.exports = {
  createSummaryAdapter
};
