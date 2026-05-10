'use strict';

/**
 * Compatibility wrapper for the legacy SQLite NewsDatabase facade.
 *
 * SQL and facade ownership live in news-crawler-db. This file preserves the
 * historical default CommonJS export used by copilot-dl-news callers.
 */

const { NewsDatabase, SQLiteNewsDatabase } = require('news-crawler-db');

module.exports = NewsDatabase || SQLiteNewsDatabase;
