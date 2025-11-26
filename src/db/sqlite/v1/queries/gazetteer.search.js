/**
 * Gazetteer search query functions
 *
 * Database access layer for searching places by name and other criteria.
 */

/**
 * Search places by name (fuzzy match)
 * @param {import('better-sqlite3').Database} db
 * @param {string} term - Search term
 * @param {object} options - Search options
 * @param {number} [options.limit=50] - Max results
 * @param {string} [options.kind] - Filter by kind
 * @param {string} [options.countryCode] - Filter by country code
 * @returns {Array} Array of place objects
 */
function searchPlacesByName(db, term, options = {}) {
  const { limit = 50, kind, countryCode, includeIncomplete = false } = options;
  const searchTerm = `%${term}%`;
  
  let query = `
    SELECT 
      p.id,
      p.kind,
      p.country_code,
      p.adm1_code,
      COALESCE(p.population, 0) as population,
      COALESCE(p.priority_score, 0) as priority,
      p.wikidata_qid,
      p.source,
      pn.name as matched_name,
      pn.name_kind,
      pn.lang,
      pn.valid_from,
      pn.valid_to,
      COALESCE(
        (SELECT name FROM place_names WHERE id = p.canonical_name_id),
        pn.name
      ) as canonical_name,
      (SELECT COUNT(*) FROM place_names WHERE place_id = p.id) as name_count
    FROM places p
    JOIN place_names pn ON p.id = pn.place_id
    WHERE pn.name LIKE ?
  `;
  
  const params = [searchTerm];
  
  // By default, filter out incomplete records (no population AND no wikidata_qid AND only 1 name)
  // These are typically low-quality imports. Use gazetteer-cleanup.js --all to merge/remove them.
  // Pass includeIncomplete: true to see all records including low-quality ones.
  if (!includeIncomplete) {
    query += ` AND (p.population IS NOT NULL OR p.wikidata_qid IS NOT NULL OR (SELECT COUNT(*) FROM place_names WHERE place_id = p.id) > 1)`;
  }
  
  if (kind) {
    query += ` AND p.kind = ?`;
    params.push(kind);
  }
  
  if (countryCode) {
    query += ` AND p.country_code = ?`;
    params.push(countryCode);
  }
  
  query += `
    GROUP BY p.id
    ORDER BY 
      (CASE WHEN pn.name = ? THEN 1 ELSE 0 END) DESC,
      (CASE WHEN p.wikidata_qid IS NOT NULL THEN 1 ELSE 0 END) DESC,
      p.population DESC, 
      p.priority_score DESC
    LIMIT ?
  `;
  
  params.push(term, limit);
  
  try {
    return db.prepare(query).all(...params);
  } catch (err) {
    console.error('[gazetteer.search] Error searching places:', err.message);
    return [];
  }
}

/**
 * Get full place details by ID
 * @param {import('better-sqlite3').Database} db
 * @param {number} id - Place ID
 * @returns {object|null} Place details
 */
function getPlaceDetails(db, id) {
  try {
    const place = db.prepare(`
      SELECT 
        p.*,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names WHERE place_id = p.id LIMIT 1)
        ) as name
      FROM places p
      WHERE p.id = ?
    `).get(id);
    
    if (!place) return null;
    
    // Get all names
    const names = db.prepare(`
      SELECT * FROM place_names WHERE place_id = ? ORDER BY is_preferred DESC, is_official DESC
    `).all(id);
    
    // Get hierarchy (parents)
    const parents = db.prepare(`
      SELECT 
        ph.parent_id,
        ph.depth,
        ph.relation,
        p.kind,
        p.country_code,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names WHERE place_id = p.id LIMIT 1)
        ) as name
      FROM place_hierarchy ph
      JOIN places p ON ph.parent_id = p.id
      WHERE ph.child_id = ?
      ORDER BY ph.depth ASC
    `).all(id);
    
    // Get hierarchy (children - limited)
    const children = db.prepare(`
      SELECT 
        ph.child_id,
        ph.depth,
        ph.relation,
        p.kind,
        p.country_code,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names WHERE place_id = p.id LIMIT 1)
        ) as name
      FROM place_hierarchy ph
      JOIN places p ON ph.child_id = p.id
      WHERE ph.parent_id = ?
      ORDER BY p.population DESC
      LIMIT 20
    `).all(id);

    // Get attributes
    const attributes = db.prepare(`
      SELECT * FROM place_attributes WHERE place_id = ? ORDER BY attribute_kind
    `).all(id);
    
    return {
      ...place,
      names,
      parents,
      children,
      attributes
    };
  } catch (err) {
    console.error('[gazetteer.search] Error getting place details:', err.message);
    return null;
  }
}

module.exports = {
  searchPlacesByName,
  getPlaceDetails
};
