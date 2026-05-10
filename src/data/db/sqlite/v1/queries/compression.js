/**
 * Compression analysis queries
 *
 * Provides functions for analyzing compression settings and usage.
 */

/**
 * Find tables that have compression_type_id columns
 * @param {import('better-sqlite3').Database} db
 * @returns {Array} Tables with compression columns
 */
function findTablesWithCompression(db) {
  const stmt = db.prepare(`
    SELECT
      m.name as table_name,
      p.name as column_name
    FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
    WHERE m.type = 'table'
      AND p.name = 'compression_type_id'
    ORDER BY m.name
  `);
  return stmt.all();
}

/**
 * Get total record count for a table
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @returns {number} Total record count
 */
function getTableRecordCount(db, tableName) {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
  return stmt.get().count;
}

/**
 * Get compression statistics for a table
 * @param {import('better-sqlite3').Database} db
 * @param {Object} tableInfo - Table information with tableName and compressionColumn
 * @returns {Array} Compression usage statistics
 */
function getCompressionStats(db, tableInfo) {
  const query = `
    SELECT
      ct.algorithm,
      ct.level,
      ct.window_bits,
      COUNT(*) as count
    FROM ${tableInfo.tableName} t
    JOIN compression_types ct ON t.${tableInfo.compressionColumn} = ct.id
    WHERE t.${tableInfo.compressionColumn} IS NOT NULL
    GROUP BY ct.algorithm, ct.level, ct.window_bits
    ORDER BY COUNT(*) DESC
  `;

  const stmt = db.prepare(query);
  return stmt.all();
}

module.exports = {
  findTablesWithCompression,
  getTableRecordCount,
  getCompressionStats
};