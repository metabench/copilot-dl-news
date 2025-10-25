'use strict';

const Database = require('better-sqlite3');
const schema = require('./schema');
const schemaMetadata = require('./schemaMetadata');
const { seedCrawlTypes } = require('./seeders');

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
    const logger = options.logger || console;
    const verbose = options.verbose || false;

    let usedFastPath = false;
    let fastPathReason = null;

    try {
      schemaMetadata.ensureSchemaMetadataTable(db);
      const evaluation = schemaMetadata.shouldUseFastPath(db, { fingerprint: schemaMetadata.CURRENT_SCHEMA_FINGERPRINT });
      if (evaluation.useFastPath) {
        usedFastPath = true;
        if (verbose) {
          logger.log('[schema] Fast path: schema fingerprint verified; skipping full initialization.');
        }
      } else {
        fastPathReason = evaluation.reason || 'fingerprint unavailable';
      }
    } catch (error) {
      fastPathReason = error?.message || String(error);
    }

    if (!usedFastPath) {
      if (verbose && fastPathReason) {
        logger.log(`[schema] Fast path unavailable (${fastPathReason}); running full initialization...`);
      }
      schema.initializeSchema(db, { logger, verbose });
      try {
        schemaMetadata.recordSchemaFingerprint(db, { fingerprint: schemaMetadata.CURRENT_SCHEMA_FINGERPRINT });
      } catch (error) {
        logger.warn?.('[schema] Unable to record schema fingerprint:', error.message);
      }
    }

    seedCrawlTypes(db, { logger });

    // Bootstrap data
    try {
      const path = require('path');
      const fs = require('fs');
      const { findProjectRoot } = require('../../../utils/project-root');
      const { seedData } = require('./seed-utils');
      const projectRoot = findProjectRoot(__dirname);
      const bootstrapPath = path.join(projectRoot, 'data', 'bootstrap', 'bootstrap-db.json');
      if (fs.existsSync(bootstrapPath)) {
        const bootstrapData = JSON.parse(fs.readFileSync(bootstrapPath, 'utf-8'));
        seedData(db, bootstrapData);
      }
    } catch (error) {
      (options.logger || console).error('Failed to seed bootstrap data:', error);
    }
  }
  
  return db;
}

module.exports = {
  openDatabase,    // Low-level: just open connection
  ensureDatabase   // High-level: open + initialize schema
};
