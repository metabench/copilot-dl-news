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

module.exports = {
  vacuumDatabase,
  getDatabaseSize
};