'use strict';

/**
 * Compatibility wrapper for learned place-hub URL pattern persistence.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS `createPlaceHubUrlPatternsStore` export.
 */

const { createSqlitePlaceHubUrlPatternsStore } = require('news-crawler-db');

function createPlaceHubUrlPatternsStore(db) {
  return createSqlitePlaceHubUrlPatternsStore(db);
}

module.exports = {
  createPlaceHubUrlPatternsStore
};
