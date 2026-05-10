'use strict';

/**
 * Compatibility wrapper for read-only database/gazetteer introspection.
 *
 * SQL and SQLite connection ownership live in news-crawler-db. This file keeps
 * the historical helper names used by the geo import UI.
 */

const {
  getBasicSqliteDatabaseInfo,
  getSqliteDatabaseStats
} = require('news-crawler-db');

function getBasicDbInfo(dbPath) {
  return getBasicSqliteDatabaseInfo(dbPath);
}

function getDatabaseStats(dbPath) {
  return getSqliteDatabaseStats(dbPath);
}

module.exports = {
  getBasicDbInfo,
  getDatabaseStats
};
