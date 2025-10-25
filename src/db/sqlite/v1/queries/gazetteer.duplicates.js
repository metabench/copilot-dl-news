/**
 * Gazetteer duplicate detection queries
 *
 * Provides functions for detecting various types of duplicate places.
 */

/**
 * Find Wikidata duplicates (same QID)
 * @param {import('better-sqlite3').Database} db
 * @param {string} baseWhere - Base WHERE clause
 * @param {number} resultLimit - Result limit
 * @returns {Array} Duplicate groups
 */
function findWikidataDuplicates(db, baseWhere, resultLimit) {
  const wikidataQuery = `
    SELECT
      p.wikidata_qid,
      GROUP_CONCAT(DISTINCT p.id) as ids,
      COUNT(DISTINCT p.id) as count,
      GROUP_CONCAT(DISTINCT p.kind) as kinds,
      GROUP_CONCAT(DISTINCT p.country_code) as countries,
      MIN(COALESCE(pn.name, 'unnamed')) as example_name
    FROM places p
    LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
    ${baseWhere} ${baseWhere ? 'AND' : 'WHERE'} p.wikidata_qid IS NOT NULL
    GROUP BY p.wikidata_qid
    HAVING count > 1
    ORDER BY count DESC
    LIMIT ${resultLimit}
  `;

  const stmt = db.prepare(wikidataQuery);
  return stmt.all();
}

/**
 * Find OSM duplicates (same type + ID)
 * @param {import('better-sqlite3').Database} db
 * @param {string} baseWhere - Base WHERE clause
 * @param {number} resultLimit - Result limit
 * @returns {Array} Duplicate groups
 */
function findOSMDuplicates(db, baseWhere, resultLimit) {
  const osmQuery = `
    SELECT
      p.osm_type || ':' || p.osm_id as osm_key,
      GROUP_CONCAT(DISTINCT p.id) as ids,
      COUNT(DISTINCT p.id) as count,
      GROUP_CONCAT(DISTINCT p.kind) as kinds,
      GROUP_CONCAT(DISTINCT p.country_code) as countries,
      MIN(COALESCE(pn.name, 'unnamed')) as example_name
    FROM places p
    LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
    ${baseWhere} ${baseWhere ? 'AND' : 'WHERE'} p.osm_type IS NOT NULL AND p.osm_id IS NOT NULL
    GROUP BY p.osm_type, p.osm_id
    HAVING count > 1
    ORDER BY count DESC
    LIMIT ${resultLimit}
  `;

  const stmt = db.prepare(osmQuery);
  return stmt.all();
}

/**
 * Find external ID duplicates
 * @param {import('better-sqlite3').Database} db
 * @param {string} externalWhere - WHERE clause for external IDs
 * @param {number} resultLimit - Result limit
 * @returns {Array} Duplicate groups
 */
function findExternalIDDupes(db, externalWhere, resultLimit) {
  const externalQuery = `
    SELECT
      pe.source || ':' || pe.ext_id as ext_key,
      GROUP_CONCAT(DISTINCT pe.place_id) as ids,
      COUNT(DISTINCT pe.place_id) as count,
      GROUP_CONCAT(DISTINCT p.kind) as kinds,
      GROUP_CONCAT(DISTINCT p.country_code) as countries,
      MIN(COALESCE(pn.name, 'unnamed')) as example_name
    FROM place_external_ids pe
    JOIN places p ON pe.place_id = p.id
    LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
    ${externalWhere}
    GROUP BY pe.source, pe.ext_id
    HAVING count > 1
    ORDER BY count DESC
    LIMIT ${resultLimit}
  `;

  const stmt = db.prepare(externalQuery);
  return stmt.all();
}

/**
 * Find places with coordinates for proximity analysis
 * @param {import('better-sqlite3').Database} db
 * @param {string} baseWhere - Base WHERE clause
 * @returns {Array} Places with coordinates
 */
function findPlacesWithCoords(db, baseWhere) {
  const coordsQuery = `
    SELECT id, lat, lng, kind, country_code,
           (SELECT name FROM place_names WHERE place_id = p.id AND is_preferred = 1 LIMIT 1) as name
    FROM places p
    ${baseWhere} ${baseWhere ? 'AND' : 'WHERE'} lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY lat, lng
  `;

  const stmt = db.prepare(coordsQuery);
  return stmt.all();
}

/**
 * Find name-based duplicates
 * @param {import('better-sqlite3').Database} db
 * @param {string} baseWhere - Base WHERE clause
 * @param {number} resultLimit - Result limit
 * @returns {Array} Duplicate groups
 */
function findNameDuplicates(db, baseWhere, resultLimit) {
  const namesQuery = `
    SELECT
      p.country_code || ':' || p.kind || ':' || pn.normalized as name_key,
      GROUP_CONCAT(DISTINCT p.id) as ids,
      COUNT(DISTINCT p.id) as count,
      GROUP_CONCAT(DISTINCT p.kind) as kinds,
      GROUP_CONCAT(DISTINCT p.country_code) as countries,
      pn.normalized as example_name
    FROM places p
    JOIN place_names pn ON p.id = pn.place_id
    ${baseWhere}
    GROUP BY p.country_code, p.kind, pn.normalized
    HAVING count > 1
    ORDER BY count DESC
    LIMIT ${resultLimit}
  `;

  const stmt = db.prepare(namesQuery);
  return stmt.all();
}

/**
 * Get total places count with filters
 * @param {import('better-sqlite3').Database} db
 * @param {string} summaryWhere - WHERE clause for summary
 * @returns {number} Total count
 */
function getTotalPlacesCount(db, summaryWhere) {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM places ${summaryWhere}`);
  return stmt.get().count;
}

module.exports = {
  findWikidataDuplicates,
  findOSMDuplicates,
  findExternalIDDupes,
  findPlacesWithCoords,
  findNameDuplicates,
  getTotalPlacesCount
};