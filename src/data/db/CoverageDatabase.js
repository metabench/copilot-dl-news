'use strict';

/**
 * Deprecated compatibility wrapper for coverage telemetry DB operations.
 *
 * SQL and schema ownership live in news-crawler-db. New analysis consumers
 * should still prefer news-db-analysis CoverageAnalysisService.
 */

const { CoverageDatabase } = require('news-crawler-db');

module.exports = { CoverageDatabase };
