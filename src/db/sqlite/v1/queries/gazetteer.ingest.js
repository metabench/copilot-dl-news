'use strict';

const { is_array } = require('lang-tools');
const { normalizeName } = require('./gazetteer.utils');
const {
  createAttributeStatements,
  recordAttributes
} = require('./gazetteer.attributes');
const {
  findExistingPlace,
  generateCapitalExternalId
} = require('./gazetteer.deduplication');

/**
 * Gazetteer data ingestion queries
 * 
 * Handles upserts and lookups for places, names, external IDs, and per-source attributes during ingestion
 * Now integrated with robust deduplication strategies
 */

/**
 * Create prepared statements for ingestion operations
 * @param {object} db - Better-sqlite3 database handle
 * @returns {object} Object with prepared statement functions
 */
function createIngestionStatements(db) {
  const debugEnabled = global.__COPILOT_GAZETTEER_VERBOSE === true;
  const debugLog = (message) => {
    if (debugEnabled) {
      process.stderr.write(`${message}\n`);
    }
  };

  debugLog('[createIngestionStatements] Starting to create prepared statements...');
  const attributeStatements = createAttributeStatements(db);
  debugLog('[createIngestionStatements] Attribute statements created');
  const statements = {
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

    getRegionByAdm1: db.prepare(`
      SELECT id, source FROM places
      WHERE kind = 'region' AND country_code = ? AND adm1_code = ? AND adm2_code IS NULL
    `),

    getRegionByAdm2: db.prepare(`
      SELECT id, source FROM places
      WHERE kind = 'region' AND country_code = ? AND adm1_code = ? AND adm2_code = ?
    `),

    getCityByCountryAndNormName: db.prepare(`
      SELECT p.id, p.source, p.lat, p.lng
      FROM places p
      JOIN place_names pn ON p.canonical_name_id = pn.id
      WHERE p.kind = 'city' AND p.country_code = ? AND pn.normalized = ?
      LIMIT 1
    `),

    findNearbyPlace: db.prepare(`
      SELECT id, source,
        ABS(lat - @lat) + ABS(lng - @lng) AS distance
      FROM places
      WHERE kind = @kind AND country_code = @country_code
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ABS(lat - @lat) + ABS(lng - @lng) < @threshold
      ORDER BY distance
      LIMIT 1
    `),
    
    insertPlace: db.prepare(`
      INSERT INTO places (
        kind, country_code, adm1_code, adm2_code, population, timezone, lat, lng, bbox,
        canonical_name_id, source, extra,
        wikidata_qid, osm_type, osm_id, area, gdp_usd, wikidata_admin_level, wikidata_props, osm_tags,
        crawl_depth, priority_score, last_crawled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updatePlace: db.prepare(`
      UPDATE places SET
        adm1_code = COALESCE(adm1_code, ?),
        adm2_code = COALESCE(adm2_code, ?),
        population = COALESCE(population, ?),
        timezone = COALESCE(timezone, ?),
        lat = COALESCE(lat, ?),
        lng = COALESCE(lng, ?),
        bbox = COALESCE(bbox, ?),
        osm_type = COALESCE(osm_type, ?),
        osm_id = COALESCE(osm_id, ?),
        area = COALESCE(area, ?),
  gdp_usd = COALESCE(gdp_usd, ?),
  wikidata_admin_level = COALESCE(wikidata_admin_level, ?),
        wikidata_props = COALESCE(wikidata_props, ?),
        osm_tags = COALESCE(osm_tags, ?),
        crawl_depth = COALESCE(crawl_depth, ?),
        priority_score = COALESCE(priority_score, ?),
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
  debugLog('[createIngestionStatements] All statements created successfully');
  return statements;
}

/**
 * Upsert a place (insert if new, update if exists)
 * Now uses robust deduplication strategies to find existing places
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} statements - Prepared statements from createIngestionStatements
 * @param {object} placeData - Place data to upsert
 * @returns {object} { placeId, created: boolean }
 */
function upsertPlace(db, statements, placeData) {
  const {
    wikidataQid = null,
    kind,
    countryCode = null,
    adm1Code = null,
    adm2Code = null,
    population = null,
    timezone = null,
    lat = null,
    lng = null,
    bbox = null,
    source = 'wikidata',
    extra = null,
    area = null,
    gdpUsd = null,
  wikidataAdminLevel = null,
  adminLevel = null,
    wikidataProps = null,
    crawlDepth = null,
    priorityScore = null,
    osmType = null,
    osmId = null,
    osmTags = null,
    geonamesId = null,
    attributes = []
  } = placeData;

  const now = Date.now();
  const normalizedSource = source || 'unknown';
  const resolvedWikidataAdminLevel = wikidataAdminLevel != null ? wikidataAdminLevel : adminLevel;
  
  // Use robust deduplication to find existing place
  const existingMatch = findExistingPlace(statements, {
    wikidataQid,
    osmType,
    osmId,
    geonamesId,
    kind,
    countryCode,
    adm1Code,
    adm2Code,
    normalizedName: placeData.normalizedName, // Can be passed explicitly
    lat,
    lng
  });

  let placeId;
  let created = false;

  if (existingMatch) {
    // Update existing place
    placeId = existingMatch.id;
    statements.updatePlace.run(
      adm1Code,
      adm2Code,
      population,
      timezone,
      lat,
      lng,
      bbox,
      osmType || null,
      osmId || null,
  area,
  gdpUsd,
  resolvedWikidataAdminLevel,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      osmTags ? JSON.stringify(osmTags) : null,
      crawlDepth,
      priorityScore,
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
    if (geonamesId) {
      statements.insertExternalId.run('geonames', String(geonamesId), placeId);
    }
  } else {
    // Create new place
    const insertResult = statements.insertPlace.run(
      kind,
      countryCode,
      adm1Code,
      adm2Code,
      population,
      timezone,
      lat,
      lng,
      bbox,
      null, // canonical_name_id
      normalizedSource,
      extra,
      wikidataQid,
      osmType || null,
      osmId || null,
  area,
  gdpUsd,
  resolvedWikidataAdminLevel,
      wikidataProps ? JSON.stringify(wikidataProps) : null,
      osmTags ? JSON.stringify(osmTags) : null,
      crawlDepth,
      priorityScore,
      now
    );
    placeId = insertResult.lastInsertRowid;
    created = true;
    
    if (wikidataQid) {
      statements.insertExternalId.run('wikidata', wikidataQid, placeId);
    }
    if (osmId) {
      statements.insertExternalId.run('osm', `${osmType || 'relation'}/${osmId}`, placeId);
    }
    if (geonamesId) {
      statements.insertExternalId.run('geonames', String(geonamesId), placeId);
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

  return { placeId, created };
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

module.exports = {
  createIngestionStatements,
  upsertPlace,
  insertPlaceName,
  insertExternalId,
  setCanonicalName,
  normalizeName,  // Re-export from utils for backward compatibility
  // Re-export deduplication utilities for convenience
  findExistingPlace,
  generateCapitalExternalId
};
