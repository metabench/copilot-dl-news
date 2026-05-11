'use strict';

const { resolveNewsCrawlerDbModule } = require('../../db/openNewsCrawlerDb');

function getDbModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (!dbModule || typeof dbModule.recordQuery !== 'function') {
    throw new Error('news-crawler-db query telemetry helpers are unavailable. Rebuild news-crawler-db.');
  }
  return dbModule;
}

function recordQuery(db, params = {}) {
  return getDbModule().recordQuery(db, params);
}

function getQueryStats(db, options = {}) {
  return getDbModule().getQueryStats(db, options);
}

function getRecentQueries(db, queryType, limit = 50) {
  return getDbModule().getRecentQueries(db, queryType, limit);
}

function wrapWithTelemetry(db, options = {}) {
  return getDbModule().wrapWithTelemetry(db, options);
}

function createInstrumentedDb(db, options = {}) {
  return getDbModule().createInstrumentedDb(db, options);
}

function _getWriterForDb(db, logger) {
  return getDbModule()._getWriterForDb(db, logger);
}

module.exports = {
  recordQuery,
  getQueryStats,
  getRecentQueries,
  wrapWithTelemetry,
  createInstrumentedDb,
  _getWriterForDb
};
