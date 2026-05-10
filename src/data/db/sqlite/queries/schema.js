/**
 * Schema inspection queries
 *
 * Provides functions for inspecting database schema.
 */

/**
 * Get table information using PRAGMA table_info
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {Array} Table column information
 */
function getTableInfo(db, tableName) {
  const stmt = db.prepare(`PRAGMA table_info('${tableName}')`);
  return stmt.all();
}

/**
 * Get all indexes for a table
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {Array} Index information
 */
function getTableIndexes(db, tableName) {
  const stmt = db.prepare(`PRAGMA index_list('${tableName}')`);
  return stmt.all();
}

/**
 * Get detailed index information
 * @param {import('better-sqlite3').Database} db
 * @param {string} indexName
 * @returns {Array} Index details
 */
function getIndexInfo(db, indexName) {
  const stmt = db.prepare(`PRAGMA index_info('${indexName}')`);
  return stmt.all();
}

/**
 * Get all indexes on a table by name
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {Array} Index names
 */
function getTableIndexNames(db, tableName) {
  const stmt = db.prepare(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='index' AND tbl_name='${tableName}'
  `);
  return stmt.all();
}

module.exports = {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getTableIndexNames
};