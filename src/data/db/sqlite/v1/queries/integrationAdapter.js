'use strict';

/**
 * Compatibility wrapper for webhook and integration DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createIntegrationAdapter` export.
 */

const {
  createIntegrationAdapter,
  createAsyncSqliteIntegrationDb,
  createIntegrationAdapterFromSqliteHandle
} = require('news-crawler-db');

module.exports = {
  createIntegrationAdapter,
  createAsyncSqliteIntegrationDb,
  createIntegrationAdapterFromSqliteHandle
};
