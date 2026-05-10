/**
 * Telemetry queries
 *
 * Provides functions for managing query telemetry data.
 */

/**
 * Clear all query telemetry data
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Result of the delete operation
 */
function clearQueryTelemetry(db) {
  const stmt = db.prepare('DELETE FROM query_telemetry');
  return stmt.run();
}

/**
 * Get telemetry statistics
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Statistics about telemetry data
 */
function getTelemetryStats(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM query_telemetry').get();
  return { totalRecords: count.count };
}

module.exports = {
  clearQueryTelemetry,
  getTelemetryStats
};