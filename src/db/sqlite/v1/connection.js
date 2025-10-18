'use strict';

const Database = require('better-sqlite3');
const { initializeSchema } = require('./schema');

/**
 * Open database connection with minimal setup
 * 
 * This is the LOW-LEVEL function - just opens a connection.
 * For most use cases, use ensureDatabase() instead.
 * 
 * @param {string} dbPath - Path to SQLite database file
 * @param {Object} options - Connection options
 * @param {boolean} [options.readonly=false] - Open in read-only mode
 * @returns {Database} better-sqlite3 Database instance
 */
function openDatabase(dbPath, options = {}) {
  const db = new Database(dbPath, {
    readonly: options.readonly || false,
    fileMustExist: options.fileMustExist || false
  });
  
  // Set pragmas (always needed for proper operation)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  
  return db;
}

/**
 * Ensure database exists with schema initialized
 * 
 * This is the HIGH-LEVEL function - use this in most cases.
 * 
 * Separation of concerns:
 * - openDatabase() just opens a connection
 * - initializeSchema() creates tables/indexes
 * 
 * @param {string} dbPath - Path to SQLite database file
 * @param {Object} options - Initialization options
 * @param {boolean} [options.skipSchema=false] - Skip schema initialization
 * @param {boolean} [options.readonly=false] - Open in read-only mode
 * @param {boolean} [options.verbose=false] - Log table creation
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {Database} Database instance with schema initialized
 */
function ensureDatabase(dbPath, options = {}) {
  const db = openDatabase(dbPath, {
    readonly: options.readonly,
    fileMustExist: options.fileMustExist
  });
  
  if (!options.skipSchema && !options.readonly) {
    initializeSchema(db, {
      logger: options.logger || console,
      verbose: options.verbose || false
    });
  }
  
  return db;
}

module.exports = {
  openDatabase,    // Low-level: just open connection
  ensureDatabase   // High-level: open + initialize schema
};
