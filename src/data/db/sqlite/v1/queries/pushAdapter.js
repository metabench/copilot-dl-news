'use strict';

/**
 * Compatibility wrapper for web push subscription DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createPushAdapter` export.
 */

const { createPushAdapter } = require('news-crawler-db');

module.exports = {
  createPushAdapter
};
