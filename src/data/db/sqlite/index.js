/**
 * SQLite Database Module
 *
 * Compatibility barrel for the many src/core + tests consumers. The v1
 * core it used to bridge is retired (B10c): DB mechanics live in
 * news-crawler-db; project wiring lives in src/db/ensureNewsDb.js.
 * ensureGazetteer is newly exported here — NewsCrawler always destructured
 * it from this barrel and silently got undefined before.
 */

const {
  ensureDb,
  ensureDatabase,
  createSQLiteDatabase,
  ensureGazetteer
} = require('../../../db/ensureNewsDb');
const { wrapWithTelemetry, createInstrumentedDb } = require('../queryTelemetry');

module.exports = {
  ensureDb,
  createSQLiteDatabase,
  ensureDatabase,
  wrapWithTelemetry,
  createInstrumentedDb,
  ensureGazetteer
};
