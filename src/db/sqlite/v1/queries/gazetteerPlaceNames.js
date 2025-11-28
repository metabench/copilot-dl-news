/**
 * Gazetteer place names query functions
 */

/**
 * Normalize a name to URL-slug format.
 * Used by the in-memory matching engine, NOT stored in the database.
 * @param {string} name 
 * @returns {string|null}
 */
function toUrlSlug(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing hyphens
    .replace(/-+/g, '-');            // Collapse multiple hyphens
}

/**
 * Get all place names (canonical and alternate) for place hub verification
 * @param {import('better-sqlite3').Database} db
 * @returns {Set<string>} Set of lowercase place names
 */
function getAllPlaceNames(db) {
  const placeNames = new Set();
  
  try {
    const rows = db.prepare(`
      SELECT name 
      FROM place_names
    `).all();
    
    rows.forEach(row => {
      if (row.name) {
        placeNames.add(row.name.toLowerCase());
      }
    });
  } catch (err) {
    console.error('Failed to load gazetteer place names:', err.message);
  }
  
  return placeNames;
}

/**
 * Find places by normalized name
 * @param {import('better-sqlite3').Database} db
 * @param {string} normalized - Normalized name to search for
 * @returns {Array<{placeId: number, name: string, kind: string, placeType: string, countryCode: string}>}
 */
function findPlacesByNormalized(db, normalized) {
  try {
    return db.prepare(`
      SELECT DISTINCT
        p.id as placeId,
        pn.name,
        p.kind,
        p.place_type as placeType,
        p.country_code as countryCode,
        p.population
      FROM place_names pn
      JOIN places p ON pn.place_id = p.id
      WHERE pn.normalized = ?
      ORDER BY p.population DESC NULLS LAST
    `).all(normalized);
  } catch (err) {
    console.error('Failed to find places by normalized name:', err.message);
    return [];
  }
}

/**
 * Get or insert an alias mapping
 * @param {import('better-sqlite3').Database} db
 * @param {string} alias - Alias string (e.g., 'nyc', 'la')
 * @param {number} placeId - Place ID to map to
 * @param {string} [source='manual'] - Source of the alias
 * @returns {{id: number, created: boolean}}
 */
function upsertAliasMapping(db, alias, placeId, source = 'manual') {
  const normalizedAlias = alias.toLowerCase().trim();
  
  try {
    // Check if exists
    const existing = db.prepare(`
      SELECT id FROM alias_mappings WHERE alias = ?
    `).get(normalizedAlias);
    
    if (existing) {
      return { id: existing.id, created: false };
    }
    
    // Insert new
    const result = db.prepare(`
      INSERT INTO alias_mappings (alias, place_id, source)
      VALUES (?, ?, ?)
    `).run(normalizedAlias, placeId, source);
    
    return { id: result.lastInsertRowid, created: true };
  } catch (err) {
    console.error('Failed to upsert alias mapping:', err.message);
    return { id: null, created: false };
  }
}

/**
 * Find place by alias
 * @param {import('better-sqlite3').Database} db
 * @param {string} alias - Alias to look up
 * @returns {{placeId: number, alias: string, source: string}|null}
 */
function findPlaceByAlias(db, alias) {
  const normalizedAlias = alias.toLowerCase().trim();
  
  try {
    const row = db.prepare(`
      SELECT am.place_id as placeId, am.alias, am.source,
             p.kind, p.place_type as placeType, p.country_code as countryCode
      FROM alias_mappings am
      JOIN places p ON am.place_id = p.id
      WHERE am.alias = ?
    `).get(normalizedAlias);
    
    return row || null;
  } catch (err) {
    console.error('Failed to find place by alias:', err.message);
    return null;
  }
}

/**
 * Get all alias mappings
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{alias: string, placeId: number, source: string}>}
 */
function getAllAliasMappings(db) {
  try {
    return db.prepare(`
      SELECT alias, place_id as placeId, source
      FROM alias_mappings
      ORDER BY alias
    `).all();
  } catch (err) {
    console.error('Failed to get alias mappings:', err.message);
    return [];
  }
}

module.exports = {
  getAllPlaceNames,
  findPlacesByNormalized,
  upsertAliasMapping,
  findPlaceByAlias,
  getAllAliasMappings,
  toUrlSlug
};
