'use strict';

/**
 * Gazetteer Database Module - v1
 * 
 * Standalone database adapter for geographic place data.
 * Can be used independently or integrated into larger database systems.
 * 
 * @example
 *   // Standalone usage
 *   const { createGazetteerDatabase } = require('./db/sqlite/gazetteer/v1');
 *   const gazetteer = createGazetteerDatabase('data/gazetteer-standalone.db');
 *   
 *   // Query
 *   const london = gazetteer.searchPlacesByName('london')[0];
 *   
 *   // Integrated usage (with existing news.db)
 *   const { GazetteerDatabase } = require('./db/sqlite/gazetteer/v1');
 *   const newsDb = require('better-sqlite3')('data/news.db');
 *   const gazetteer = new GazetteerDatabase(newsDb);
 */

const path = require('path');
const Database = require('better-sqlite3');
const { GazetteerDatabase } = require('./GazetteerDatabase');
const { 
  initializeGazetteerSchema, 
  checkGazetteerSchema, 
  getGazetteerStats,
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS
} = require('./schema');
const {
  GAZETTEER_TARGETS
} = require('./schema-definitions');

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new standalone gazetteer database
 * 
 * @param {string} dbPath - Path to database file
 * @param {Object} options
 * @param {boolean} [options.verbose=false] - Log operations
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {GazetteerDatabase}
 */
function createGazetteerDatabase(dbPath, options = {}) {
  return new GazetteerDatabase(dbPath, options);
}

/**
 * Open an existing gazetteer database (read-only)
 * 
 * @param {string} dbPath - Path to database file
 * @returns {GazetteerDatabase}
 */
function openGazetteerReadOnly(dbPath) {
  return new GazetteerDatabase(dbPath, { readonly: true });
}

/**
 * Wrap an existing database handle with gazetteer functionality
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options
 * @returns {GazetteerDatabase}
 */
function wrapWithGazetteer(db, options = {}) {
  // Ensure schema exists
  const check = checkGazetteerSchema(db);
  if (!check.exists) {
    initializeGazetteerSchema(db, options);
  }
  
  return new GazetteerDatabase(db, options);
}

/**
 * Get the default gazetteer database path
 * @param {string} [dataDir='data'] - Data directory
 * @returns {string}
 */
function getDefaultGazetteerPath(dataDir = 'data') {
  return path.join(dataDir, 'gazetteer-standalone.db');
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Main class
  GazetteerDatabase,
  
  // Factory functions
  createGazetteerDatabase,
  openGazetteerReadOnly,
  wrapWithGazetteer,
  getDefaultGazetteerPath,
  
  // Schema management
  initializeGazetteerSchema,
  checkGazetteerSchema,
  getGazetteerStats,
  
  // Schema definitions (for advanced use)
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS,
  GAZETTEER_TARGETS
};
