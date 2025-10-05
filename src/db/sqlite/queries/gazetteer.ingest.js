'use strict';

/**
 * Gazetteer data ingestion queries
 * 
 * Handles upserts and lookups for places, names, and external IDs during ingestion
 */

/**
 * Create prepared statements for ingestion operations
 * @param {object} db - Better-sqlite3 database handle
 * @returns {object} Object with prepared statement functions
 */
function createIngestionStatements(db) {
  return {
    getPlaceByWikidataQid: db.prepare(`
      SELECT id FROM places WHERE wikidata_qid = ?
    `),
    
    insertPlace: db.prepare(`
      INSERT INTO places (
        kind, country_code, population, timezone, lat, lng, bbox,
        canonical_name_id, source, extra,
        wikidata_qid, area, gdp_usd, admin_level, wikidata_props,
        crawl_depth, priority_score, last_crawled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updatePlace: db.prepare(`
      UPDATE places SET
        population = COALESCE(?, population),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng),
        area = COALESCE(?, area),
        gdp_usd = COALESCE(?, gdp_usd),
        wikidata_props = COALESCE(?, wikidata_props),
        last_crawled_at = ?
      WHERE id = ?
    `),
    
    insertName: db.prepare(`
      INSERT OR IGNORE INTO place_names (
        place_id, name, normalized, lang, script, name_kind, 
        is_preferred, is_official, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    insertExternalId: db.prepare(`
      INSERT OR IGNORE INTO place_external_ids (source, ext_id, place_id)
      VALUES (?, ?, ?)
    `),
    
    updateCanonicalName: db.prepare(`
      UPDATE places SET canonical_name_id = ? WHERE id = ?
    `),
    
    getBestName: db.prepare(`
      SELECT id FROM place_names 
      WHERE place_id = ? 
      ORDER BY is_official DESC, is_preferred DESC, (lang='en') DESC, id ASC 
      LIMIT 1
    `),
    
    getByExternalId: db.prepare(`
      SELECT place_id AS id FROM place_external_ids 
      WHERE source = ? AND ext_id = ?
    `)
  };
}

/**
 * Upsert a place (insert if new, update if exists)
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} statements - Prepared statements from createIngestionStatements
 * @param {object} placeData - Place data to upsert
 * @returns {number} Place ID
 */
function upsertPlace(db, statements, placeData) {
  const {
    wikidataQid,
    kind,
    countryCode,
    population,
    timezone,
    lat,
    lng,
    bbox,
    source,
    extra,
    area,
    gdpUsd,
    adminLevel,
    wikidataProps,
    crawlDepth,
    priorityScore
  } = placeData;

  const existing = statements.getPlaceByWikidataQid.get(wikidataQid);
  const now = Date.now();

  if (existing) {
    statements.updatePlace.run(
      population,
      lat,
      lng,
      area,
      gdpUsd,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      now,
      existing.id
    );
    return existing.id;
  } else {
    const result = statements.insertPlace.run(
      kind,
      countryCode,
      population,
      timezone,
      lat,
      lng,
      bbox,
      null, // canonical_name_id
      source,
      extra,
      wikidataQid,
      area,
      gdpUsd,
      adminLevel,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      crawlDepth,
      priorityScore,
      now
    );
    return result.lastInsertRowid;
  }
}

/**
 * Insert a name for a place
 * @param {object} statements - Prepared statements
 * @param {number} placeId
 * @param {object} nameData - { text, lang, kind, isPreferred, isOfficial, source }
 */
function insertPlaceName(statements, placeId, nameData) {
  const normalized = normalizeName(nameData.text);
  
  try {
    statements.insertName.run(
      placeId,
      nameData.text,
      normalized,
      nameData.lang || 'und',
      null, // script
      nameData.kind || 'endonym',
      nameData.isPreferred ? 1 : 0,
      nameData.isOfficial ? 1 : 0,
      nameData.source || 'wikidata'
    );
  } catch (err) {
    // Ignore duplicate name errors
  }
}

/**
 * Insert an external ID mapping
 * @param {object} statements - Prepared statements
 * @param {string} source - External source (wikidata, osm, geonames)
 * @param {string} extId - External ID
 * @param {number} placeId - Place ID
 */
function insertExternalId(statements, source, extId, placeId) {
  try {
    statements.insertExternalId.run(source, extId, placeId);
  } catch (err) {
    // Ignore duplicate errors
  }
}

/**
 * Set the canonical name for a place (best name)
 * @param {object} statements - Prepared statements
 * @param {number} placeId
 */
function setCanonicalName(statements, placeId) {
  try {
    const bestName = statements.getBestName.get(placeId);
    if (bestName) {
      statements.updateCanonicalName.run(bestName.id, placeId);
    }
  } catch (err) {
    // Ignore errors
  }
}

/**
 * Normalize a name for matching (remove diacritics, lowercase)
 * @param {string} text
 * @returns {string|null}
 */
function normalizeName(text) {
  if (!text) return null;
  return text.normalize('NFD').replace(/\p{Diacritic}+/gu, '').toLowerCase();
}

module.exports = {
  createIngestionStatements,
  upsertPlace,
  insertPlaceName,
  insertExternalId,
  setCanonicalName,
  normalizeName
};
