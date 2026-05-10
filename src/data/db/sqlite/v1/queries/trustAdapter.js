'use strict';

/**
 * Compatibility wrapper for trust and credibility DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createTrustAdapter` export.
 */

const { createTrustAdapter } = require('news-crawler-db');

module.exports = {
  createTrustAdapter
};
