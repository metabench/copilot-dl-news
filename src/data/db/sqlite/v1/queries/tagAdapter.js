'use strict';

/**
 * Compatibility wrapper for tagging DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createTagAdapter` export.
 */

const { createTagAdapter } = require('news-crawler-db');

module.exports = {
  createTagAdapter
};
