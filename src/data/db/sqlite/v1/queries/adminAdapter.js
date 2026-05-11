'use strict';

/**
 * Compatibility wrapper for admin DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS exports used by copilot-dl-news callers.
 */

const {
  createAdminAdapter,
  ensureAdminSchema,
  createAdminDashboardCheckFixture
} = require('news-crawler-db');

module.exports = {
  createAdminAdapter,
  ensureAdminSchema,
  createAdminDashboardCheckFixture
};
