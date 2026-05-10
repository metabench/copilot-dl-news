'use strict';

/**
 * Compatibility wrapper for enhanced queue DB operations.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical `QueueDatabase` class export used by copilot-dl-news.
 */

const { QueueDatabase } = require('news-crawler-db');

module.exports = { QueueDatabase };
