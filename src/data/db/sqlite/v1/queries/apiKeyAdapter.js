'use strict';

/**
 * Compatibility wrapper for API key DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS API key adapter exports.
 */

const {
  createApiKeyAdapter,
  ensureApiKeysSchema,
  generateApiKey,
  hashApiKey,
  TIER_RATE_LIMITS
} = require('news-crawler-db');

module.exports = {
  createApiKeyAdapter,
  ensureApiKeysSchema,
  generateApiKey,
  hashApiKey,
  TIER_RATE_LIMITS
};
