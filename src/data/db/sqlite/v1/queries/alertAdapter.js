'use strict';

/**
 * Compatibility wrapper for alert rule, alert history, notification, and
 * breaking-news DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS exports used by copilot-dl-news alert services.
 */

const {
  createSqliteAlertAdapter,
  ensureSqliteAlertSchema
} = require('news-crawler-db');

function createAlertAdapter(db) {
  return createSqliteAlertAdapter(db);
}

function ensureAlertSchema(db) {
  return ensureSqliteAlertSchema(db);
}

module.exports = {
  createAlertAdapter,
  ensureAlertSchema
};
