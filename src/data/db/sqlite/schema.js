/**
 * SQLite Schema Module
 * 
 * Main entry point for schema initialization functions.
 * This bridges the old API to the new v1 structure.
 */

const { initializeSchema, initGazetteerTables, initCompressionTables } = require('./v1/schema');

module.exports = {
  initializeSchema,
  initGazetteerTables,
  initCompressionTables
};