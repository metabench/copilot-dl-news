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

/**
 * Get all tables and views
 * @param {import('better-sqlite3').Database} db
 * @returns {Array} Tables and views
 */
function getAllTablesAndViews(db) {
  const stmt = db.prepare(`
    SELECT name, type 
    FROM sqlite_master 
    WHERE type IN ('table', 'view') 
    ORDER BY type, name
  `);
  return stmt.all();
}

/**
 * Check if table exists
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {Object|null} Table info or null
 */
function tableExists(db, tableName) {
  const stmt = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name=?
  `);
  return stmt.get(tableName);
}

/**
 * Get all indexes
 * @param {import('better-sqlite3').Database} db
 * @returns {Array} All indexes
 */
function getAllIndexes(db) {
  const stmt = db.prepare(`
    SELECT name, tbl_name, sql 
    FROM sqlite_master 
    WHERE type='index' AND sql IS NOT NULL
    ORDER BY tbl_name, name
  `);
  return stmt.all();
}

/**
 * Get foreign keys for a table
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {Array} Foreign key information
 */
function getForeignKeys(db, tableName) {
  const stmt = db.prepare(`PRAGMA foreign_key_list('${tableName}')`);
  return stmt.all();
}

/**
 * Get all tables
 * @param {import('better-sqlite3').Database} db
 * @returns {Array} All tables
 */
function getAllTables(db) {
  const stmt = db.prepare(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `);
  return stmt.all();
}

/**
 * Get row count for a table
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {number} Row count
 */
function getTableRowCount(db, tableName) {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`);
  return stmt.get().count;
}

module.exports = {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getTableIndexNames,
  getAllTablesAndViews,
  tableExists,
  getAllIndexes,
  getForeignKeys,
  getAllTables,
  getTableRowCount
};