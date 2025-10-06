'use strict';

const { is_array } = require('lang-tools');
const {
  createAttributeStatements,
  recordAttributes
} = require('./gazetteer.attributes');

/**
 * Gazetteer data ingestion queries
 * 
 * Handles upserts and lookups for places, names, external IDs, and per-source attributes during ingestion
 */

/**
 * Create prepared statements for ingestion operations
 * @param {object} db - Better-sqlite3 database handle
 * @returns {object} Object with prepared statement functions
 */
function createIngestionStatements(db) {
  const attributeStatements = createAttributeStatements(db);
  return {
    getPlaceByWikidataQid: db.prepare(`
      SELECT id FROM places WHERE wikidata_qid = ?
    `),

    getPlaceByExternalId: db.prepare(`
      SELECT place_id AS id FROM place_external_ids WHERE source = ? AND ext_id = ?
    `),

    getCountryByCode: db.prepare(`
      SELECT id FROM places WHERE kind = 'country' AND country_code = ?
    `),

    getRegionByCodes: db.prepare(`
      SELECT id FROM places
      WHERE kind = 'region' AND country_code = ? AND adm1_code = ?
    `),
    
    insertPlace: db.prepare(`
      INSERT INTO places (
        kind, country_code, population, timezone, lat, lng, bbox,
        canonical_name_id, source, extra,
        wikidata_qid, area, gdp_usd, admin_level, wikidata_props,
        crawl_depth, priority_score, last_crawled_at,
        osm_type, osm_id, osm_tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updatePlace: db.prepare(`
      UPDATE places SET
        population = COALESCE(population, ?),
        timezone = COALESCE(timezone, ?),
        lat = COALESCE(lat, ?),
        lng = COALESCE(lng, ?),
        bbox = COALESCE(bbox, ?),
        area = COALESCE(area, ?),
        gdp_usd = COALESCE(gdp_usd, ?),
        wikidata_props = COALESCE(wikidata_props, ?),
        admin_level = COALESCE(admin_level, ?),
        crawl_depth = COALESCE(crawl_depth, ?),
        priority_score = COALESCE(priority_score, ?),
        osm_type = COALESCE(osm_type, ?),
        osm_id = COALESCE(osm_id, ?),
        osm_tags = COALESCE(osm_tags, ?),
        last_crawled_at = ?
      WHERE id = ?
    `),

    attachWikidata: db.prepare(`
      UPDATE places SET
        wikidata_qid = COALESCE(wikidata_qid, ?),
        wikidata_props = COALESCE(wikidata_props, ?)
      WHERE id = ?
    `),

    attachSourceIfMissing: db.prepare(`
      UPDATE places SET source = COALESCE(NULLIF(source, ''), ?) WHERE id = ?
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

    attributeStatements
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
    wikidataQid = null,
    kind,
    countryCode = null,
    population = null,
    timezone = null,
    lat = null,
    lng = null,
    bbox = null,
    source = 'wikidata',
    extra = null,
    area = null,
    gdpUsd = null,
    adminLevel = null,
    wikidataProps = null,
    crawlDepth = null,
    priorityScore = null,
    osmType = null,
    osmId = null,
    osmTags = null,
    attributes = [],
    adm1Code = null
  } = placeData;

  const now = Date.now();
  const normalizedSource = source || 'unknown';
  let existing = null;

  if (wikidataQid) {
    existing = statements.getPlaceByWikidataQid.get(wikidataQid);
    if (!existing) {
      existing = statements.getPlaceByExternalId.get('wikidata', wikidataQid);
    }
  }

  if (!existing && osmId) {
    const osmKey = `${osmType || 'relation'}/${osmId}`;
    existing = statements.getPlaceByExternalId.get('osm', osmKey);
  }

  if (!existing && kind === 'country' && countryCode) {
    existing = statements.getCountryByCode.get(countryCode);
  }

  if (!existing && kind === 'region' && countryCode && adm1Code) {
    existing = statements.getRegionByCodes.get(countryCode, adm1Code);
  }

  let placeId;

  if (existing) {
    placeId = existing.id;
    statements.updatePlace.run(
      population,
      timezone,
      lat,
      lng,
      bbox,
      area,
      gdpUsd,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      adminLevel,
      crawlDepth,
      priorityScore,
      osmType || null,
      osmId || null,
      osmTags ? JSON.stringify(osmTags) : null,
      now,
      placeId
    );
    if (wikidataQid) {
      statements.attachWikidata.run(wikidataQid, wikidataProps ? JSON.stringify(wikidataProps) : null, placeId);
      statements.insertExternalId.run('wikidata', wikidataQid, placeId);
    }
    if (osmId) {
      statements.insertExternalId.run('osm', `${osmType || 'relation'}/${osmId}`, placeId);
    }
  } else {
    const insertResult = statements.insertPlace.run(
      kind,
      countryCode,
      population,
      timezone,
      lat,
      lng,
      bbox,
      null, // canonical_name_id
      normalizedSource,
      extra,
      wikidataQid,
      area,
      gdpUsd,
      adminLevel,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      crawlDepth,
      priorityScore,
      now,
      osmType || null,
      osmId || null,
      osmTags ? JSON.stringify(osmTags) : null
    );
    placeId = insertResult.lastInsertRowid;
    if (wikidataQid) {
      statements.insertExternalId.run('wikidata', wikidataQid, placeId);
    }
    if (osmId) {
      statements.insertExternalId.run('osm', `${osmType || 'relation'}/${osmId}`, placeId);
    }
  }

  statements.attachSourceIfMissing.run(normalizedSource, placeId);

  if (is_array(attributes) && attributes.length) {
    recordAttributes(
      statements.attributeStatements,
      placeId,
      attributes.map((entry) => ({
        source: entry.source || normalizedSource,
        attr: entry.attr,
        value: entry.value,
        confidence: entry.confidence ?? null,
        fetchedAt: entry.fetchedAt ?? now,
        metadata: entry.metadata ?? null
      }))
    );
  }

  return placeId;
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
