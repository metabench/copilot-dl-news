/**
 * Gazetteer Place Names Queries
 *
 * Database access layer for querying place names for verification and matching.
 */

/**
 * Get all place names from gazetteer as a Set for fast lookup
 * @param {import('better-sqlite3').Database} db
 * @returns {Set<string>} Set of normalized place names
 */
function getAllPlaceNames(db) {
  try {
    const names = db.prepare(`
      SELECT DISTINCT normalized
      FROM place_names
      WHERE normalized IS NOT NULL AND normalized != ''
    `).all();

    return new Set(names.map(row => row.normalized));
  } catch (err) {
    console.error('[gazetteerPlaceNames] Error fetching place names:', err.message);
    return new Set();
  }
}

module.exports = {
  getAllPlaceNames
};