/**
 * Database maintenance queries
 *
 * Provides functions for database maintenance operations.
 */

/**
 * Run VACUUM to reclaim unused disk space
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Result of the vacuum operation
 */
function vacuumDatabase(db) {
  const stmt = db.prepare('VACUUM');
  return stmt.run();
}

/**
 * Get database file size information
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Size information
 */
function getDatabaseSize(db) {
  const fs = require('fs');
  const path = db.name;
  if (fs.existsSync(path)) {
    const stats = fs.statSync(path);
    return {
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
    };
  }
  return { size: 0, sizeMB: '0.00' };
}

/**
 * Drop legacy tables after migration
 * @param {import('better-sqlite3').Database} db
 * @param {object} options - Drop options
 * @param {boolean} options.dryRun - If true, only preview changes
 * @returns {object} Drop results { legacyTables }
 */
function dropLegacyTables(db, options = {}) {
  const { dryRun = true } = options;

  // Check if legacy tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('articles', 'fetches', 'latest_fetch')
  `).all();

  if (!dryRun && tables.length > 0) {
    for (const table of tables) {
      db.prepare(`DROP TABLE ${table.name}`).run();
    }
  }

  return { legacyTables: tables };
}

module.exports = {
  vacuumDatabase,
  getDatabaseSize,
  dropLegacyTables
};