'use strict';

/**
 * Compatibility wrapper for planner knowledge DB operations.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical `PlannerDatabase` class export used by copilot-dl-news.
 */

const { PlannerDatabase } = require('news-crawler-db');

module.exports = { PlannerDatabase };
