/**
 * SQLite Database Module
 * 
 * Main entry point for SQLite database functionality.
 * This bridges the old API to the new v1 structure.
 */

const { ensureDb } = require('./v1/ensureDb');
const { createSQLiteDatabase } = require('./v1/index');
const { ensureDatabase, wrapWithTelemetry, createInstrumentedDb } = require('./v1');

module.exports = {
  ensureDb,
  createSQLiteDatabase,
  ensureDatabase,
  wrapWithTelemetry,
  createInstrumentedDb
};