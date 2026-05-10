/**
 * SQLite Database Ensure Module
 * 
 * Main entry point for database initialization.
 * This bridges the old API to the new v1 structure.
 */

const { ensureDb } = require('./v1/ensureDb');

module.exports = {
  ensureDb
};