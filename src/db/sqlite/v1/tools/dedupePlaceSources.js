/**
 * Deduplicate place_sources table and enforce unique index
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @returns {Object} Results with deleted count and errors
 */
function dedupePlaceSources(db) {
  const results = { deleted: 0, errors: [] };
  
  try {
    // Delete duplicates keeping the lowest id
    const deleteResult = db.prepare(`
      WITH grouped AS (
        SELECT name, version, url, license, MIN(id) AS keep_id, COUNT(*) AS cnt
        FROM place_sources
        GROUP BY name, version, url, license
        HAVING cnt > 1
      )
      DELETE FROM place_sources
      WHERE EXISTS (
        SELECT 1 FROM grouped g
        WHERE place_sources.name = g.name
          AND IFNULL(place_sources.version,'') = IFNULL(g.version,'')
          AND IFNULL(place_sources.url,'') = IFNULL(g.url,'')
          AND IFNULL(place_sources.license,'') = IFNULL(g.license,'')
          AND place_sources.id <> g.keep_id
      )
    `).run();
    results.deleted = deleteResult.changes || 0;
  } catch (err) {
    results.errors.push({ step: 'delete_duplicates', error: err.message });
  }
  
  try {
    // Create unique index to prevent future duplicates
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_sources ON place_sources(name, version, url, license)`);
  } catch (err) {
    // Index might already exist, not critical
    if (!err.message.includes('already exists')) {
      results.errors.push({ step: 'create_index', error: err.message });
    }
  }
  
  return results;
}

module.exports = { dedupePlaceSources };
