'use strict';

/**
 * Gazetteer Schema - Schema initialization for gazetteer-only databases
 * 
 * This module can initialize a standalone gazetteer database or 
 * add gazetteer tables to an existing database.
 */

const {
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS
} = require('./schema-definitions');

const DEFAULT_LOGGER = console;

// ─────────────────────────────────────────────────────────────────────────────
// Schema Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeOptions(options = {}) {
  const { verbose = false, logger = DEFAULT_LOGGER } = options;
  return { verbose, logger };
}

function runStatements(db, statements, type, ctx) {
  const { verbose, logger } = ctx;
  for (const { name, sql } of statements) {
    try {
      db.exec(sql);
      if (verbose) {
        logger.log(`[gazetteer-schema]     ${type}: ${name}`);
      }
    } catch (error) {
      throw new Error(`${type} "${name}" failed: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the complete gazetteer schema
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options
 * @param {boolean} [options.verbose=false] - Log progress
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {Object} { success, tables, indexes, triggers }
 */
function initializeGazetteerSchema(db, options = {}) {
  const ctx = normalizeOptions(options);
  const { verbose, logger } = ctx;
  
  if (verbose) {
    logger.log('[gazetteer-schema] Initializing gazetteer database schema...');
  }
  
  const results = {
    success: true,
    tables: 0,
    indexes: 0,
    triggers: 0
  };
  
  try {
    const apply = db.transaction(() => {
      // Tables
      runStatements(db, TABLE_DEFINITIONS, 'table', ctx);
      results.tables = TABLE_DEFINITIONS.length;
      
      // Indexes
      runStatements(db, INDEX_DEFINITIONS, 'index', ctx);
      results.indexes = INDEX_DEFINITIONS.length;
      
      // Triggers
      runStatements(db, TRIGGER_DEFINITIONS, 'trigger', ctx);
      results.triggers = TRIGGER_DEFINITIONS.length;
    });
    
    apply();
    
    if (verbose) {
      logger.log(`[gazetteer-schema] ✓ Schema initialized (${results.tables} tables, ${results.indexes} indexes, ${results.triggers} triggers)`);
    }
  } catch (error) {
    results.success = false;
    results.error = error.message;
    logger.error(`[gazetteer-schema] ✗ Schema initialization failed: ${error.message}`);
  }
  
  return results;
}

/**
 * Check if gazetteer schema exists in database
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Object} { exists, tables }
 */
function checkGazetteerSchema(db) {
  const requiredTables = ['places', 'place_names', 'place_external_ids'];
  const existingTables = [];
  
  for (const table of requiredTables) {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    
    if (exists) {
      existingTables.push(table);
    }
  }
  
  return {
    exists: existingTables.length === requiredTables.length,
    tables: existingTables,
    missing: requiredTables.filter(t => !existingTables.includes(t))
  };
}

/**
 * Get gazetteer schema statistics
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Object} { places, place_names, sources }
 */
function getGazetteerStats(db) {
  const stats = {};
  
  try {
    stats.places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
    stats.place_names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
    stats.external_ids = db.prepare('SELECT COUNT(*) as count FROM place_external_ids').get()?.count || 0;
    
    // Get counts by source
    stats.by_source = db.prepare(`
      SELECT source, COUNT(*) as count 
      FROM places 
      GROUP BY source 
      ORDER BY count DESC
    `).all();
    
    // Get counts by kind
    stats.by_kind = db.prepare(`
      SELECT kind, COUNT(*) as count 
      FROM places 
      GROUP BY kind 
      ORDER BY count DESC
    `).all();
  } catch (e) {
    stats.error = e.message;
  }
  
  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  initializeGazetteerSchema,
  checkGazetteerSchema,
  getGazetteerStats,
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS
};
