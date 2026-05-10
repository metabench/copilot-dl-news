'use strict';

/**
 * Compatibility wrapper for story coverage DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createCoverageAdapter` export.
 */

const { createCoverageAdapter } = require('news-crawler-db');

module.exports = {
  createCoverageAdapter
};
