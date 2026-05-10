'use strict';

/**
 * Compatibility wrapper for place-hub candidate persistence.
 *
 * SQL ownership lives in news-crawler-db. This file preserves the historical
 * CommonJS `createPlaceHubCandidatesStore` export used by orchestration.
 */

const { createSqlitePlaceHubCandidatesStore } = require('news-crawler-db');

function createPlaceHubCandidatesStore(db) {
  return createSqlitePlaceHubCandidatesStore(db);
}

module.exports = {
  createPlaceHubCandidatesStore
};
