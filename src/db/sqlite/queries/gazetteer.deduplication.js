'use strict';

/**
 * Gazetteer Deduplication Module
 * 
 * Provides robust deduplication strategies for place ingestion across all sources:
 * - REST Countries API
 * - Wikidata SPARQL
 * - Geography crawls
 * - OSM imports
 * 
 * Key Principles:
 * 1. Use external IDs (Wikidata QID, OSM ID, GeoNames ID) as primary identity
 * 2. Fall back to coordinate proximity matching for unnamed/uncertain places
 * 3. Use normalized names + admin codes as last resort
 * 4. Support multi-parent relationships (e.g., Jerusalem as capital of multiple countries)
 * 5. Track ingestion runs to prevent re-ingestion without --force flag
 */

const { normalizeName } = require('./gazetteer.utils');

/**
 * Create prepared statements for deduplication operations
 * @param {object} db - Better-sqlite3 database handle
 * @returns {object} Prepared statements
 */
function createDeduplicationStatements(db) {
  return {
    // Primary: External ID lookup (strongest identity)
    getPlaceByWikidataQid: db.prepare(`
      SELECT id FROM places WHERE wikidata_qid = ?
    `),
    
    getPlaceByExternalId: db.prepare(`
      SELECT place_id AS id FROM place_external_ids WHERE source = ? AND ext_id = ?
    `),
    
    // Secondary: Admin code-based lookup (for known hierarchies)
    getCountryByCode: db.prepare(`
      SELECT id, source FROM places WHERE kind = 'country' AND country_code = ?
    `),
    
    getRegionByAdm1: db.prepare(`
      SELECT id, source FROM places 
      WHERE kind = 'region' AND country_code = ? AND adm1_code = ?
    `),
    
    getRegionByAdm2: db.prepare(`
      SELECT id, source FROM places
      WHERE kind = 'region' AND country_code = ? AND adm1_code = ? AND adm2_code = ?
    `),
    
    // Tertiary: Name-based lookup (weakest, for backwards compatibility)
    getCityByCountryAndNormName: db.prepare(`
      SELECT p.id, p.source, p.lat, p.lng
      FROM place_names pn
      JOIN places p ON p.id = pn.place_id
      WHERE p.kind = 'city' AND p.country_code = ? AND pn.normalized = ?
      LIMIT 1
    `),
    
    // Quaternary: Coordinate proximity matching (for places with coords but no strong ID)
    findNearbyPlace: db.prepare(`
      SELECT id, lat, lng, source,
             ABS(lat - @lat) as lat_diff,
             ABS(lng - @lng) as lng_diff,
             (ABS(lat - @lat) + ABS(lng - @lng)) as distance
      FROM places
      WHERE kind = @kind
        AND country_code = @country_code
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ABS(lat - @lat) < @threshold
        AND ABS(lng - @lng) < @threshold
      ORDER BY distance ASC
      LIMIT 1
    `),
    
    // Ingestion run tracking
    getLastCompletedRun: db.prepare(`
      SELECT id, completed_at, places_created, places_updated
      FROM ingestion_runs
      WHERE source = ? AND source_version = ? AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `),
    
    createIngestionRun: db.prepare(`
      INSERT INTO ingestion_runs(source, source_version, started_at, status, metadata)
      VALUES (?, ?, ?, 'running', ?)
    `),
    
    updateIngestionRun: db.prepare(`
      UPDATE ingestion_runs
      SET completed_at = ?, status = ?, 
          countries_processed = ?, places_created = ?, places_updated = ?,
          names_added = ?, error_message = ?
      WHERE id = ?
    `),
    
    // Capital city multi-parent support
    addCapitalRelation: db.prepare(`
      INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth, metadata)
      VALUES (?, ?, 'capital_of', 1, ?)
    `),
    
    getCapitalRelations: db.prepare(`
      SELECT parent_id, child_id 
      FROM place_hierarchy 
      WHERE child_id = ? AND relation = 'capital_of'
    `)
  };
}

/**
 * Find or identify existing place using multiple strategies
 * @param {object} statements - Prepared deduplication statements
 * @param {object} placeData - Place identification data
 * @returns {object|null} { id, source, matchStrategy } or null if not found
 */
function findExistingPlace(statements, placeData) {
  const {
    wikidataQid = null,
    osmType = null,
    osmId = null,
    geonamesId = null,
    kind,
    countryCode = null,
    adm1Code = null,
    adm2Code = null,
    normalizedName = null,
    lat = null,
    lng = null,
    coordinateThreshold = 0.05  // ~5.5km at equator
  } = placeData;

  // Strategy 1: Wikidata QID (strongest)
  if (wikidataQid) {
    let existing = statements.getPlaceByWikidataQid.get(wikidataQid);
    if (!existing) {
      existing = statements.getPlaceByExternalId.get('wikidata', wikidataQid);
    }
    if (existing) {
      return { id: existing.id, matchStrategy: 'wikidata_qid' };
    }
  }

  // Strategy 2: OSM ID
  if (osmId) {
    const osmKey = `${osmType || 'relation'}/${osmId}`;
    const existing = statements.getPlaceByExternalId.get('osm', osmKey);
    if (existing) {
      return { id: existing.id, matchStrategy: 'osm_id' };
    }
  }

  // Strategy 3: GeoNames ID
  if (geonamesId) {
    const existing = statements.getPlaceByExternalId.get('geonames', String(geonamesId));
    if (existing) {
      return { id: existing.id, matchStrategy: 'geonames_id' };
    }
  }

  // Strategy 4: Admin codes (for countries and regions)
  if (kind === 'country' && countryCode) {
    const existing = statements.getCountryByCode.get(countryCode);
    if (existing) {
      return { id: existing.id, source: existing.source, matchStrategy: 'country_code' };
    }
  }

  if (kind === 'region' && countryCode && adm1Code) {
    let existing;
    if (adm2Code) {
      existing = statements.getRegionByAdm2.get(countryCode, adm1Code, adm2Code);
    } else {
      existing = statements.getRegionByAdm1.get(countryCode, adm1Code);
    }
    if (existing) {
      return { id: existing.id, source: existing.source, matchStrategy: adm2Code ? 'adm2_code' : 'adm1_code' };
    }
  }

  // Strategy 5: Normalized name + country (weak, for cities)
  if (kind === 'city' && countryCode && normalizedName) {
    const existing = statements.getCityByCountryAndNormName.get(countryCode, normalizedName);
    if (existing) {
      // If existing has no coordinates but we have them, this might not be a duplicate
      // Continue to coordinate check
      if (existing.lat && existing.lng && lat && lng) {
        const latDiff = Math.abs(existing.lat - lat);
        const lngDiff = Math.abs(existing.lng - lng);
        if (latDiff + lngDiff < coordinateThreshold) {
          return { id: existing.id, source: existing.source, matchStrategy: 'name_and_coords' };
        }
        // Coordinates don't match - might be different city with same name
        // Fall through to proximity check
      } else {
        // One or both have no coordinates - assume same city
        return { id: existing.id, source: existing.source, matchStrategy: 'normalized_name' };
      }
    }
  }

  // Strategy 6: Coordinate proximity (for places with coords but no strong ID)
  if (lat && lng && countryCode && kind) {
    const existing = statements.findNearbyPlace.get({
      kind,
      country_code: countryCode,
      lat,
      lng,
      threshold: coordinateThreshold
    });
    if (existing) {
      return { id: existing.id, source: existing.source, matchStrategy: 'coordinate_proximity', distance: existing.distance };
    }
  }

  return null;
}

/**
 * Check if ingestion run already completed for this source
 * @param {object} statements - Deduplication statements
 * @param {string} source - Source name (e.g., 'restcountries', 'wikidata')
 * @param {string} version - Source version (e.g., 'v3.1', 'latest')
 * @param {boolean} force - Force re-ingestion even if already completed
 * @returns {object|null} { shouldSkip: boolean, lastRun: object|null }
 */
function checkIngestionRun(statements, source, version, force = false) {
  const lastRun = statements.getLastCompletedRun.get(source, version);
  
  if (lastRun && !force) {
    return {
      shouldSkip: true,
      lastRun: {
        id: lastRun.id,
        completedAt: lastRun.completed_at,
        placesCreated: lastRun.places_created,
        placesUpdated: lastRun.places_updated
      }
    };
  }

  return { shouldSkip: false, lastRun: null };
}

/**
 * Start an ingestion run
 * @param {object} statements - Deduplication statements
 * @param {string} source - Source name
 * @param {string} version - Source version
 * @param {object} metadata - Additional run metadata
 * @returns {number} Run ID
 */
function startIngestionRun(statements, source, version, metadata = {}) {
  const result = statements.createIngestionRun.run(
    source,
    version,
    Date.now(),
    JSON.stringify(metadata)
  );
  return result.lastInsertRowid;
}

/**
 * Complete an ingestion run
 * @param {object} statements - Deduplication statements
 * @param {number} runId - Run ID
 * @param {object} stats - Run statistics
 */
function completeIngestionRun(statements, runId, stats) {
  statements.updateIngestionRun.run(
    Date.now(), // completed_at
    'completed', // status
    stats.countriesProcessed || 0,
    stats.placesCreated || 0,
    stats.placesUpdated || 0,
    stats.namesAdded || 0,
    null, // error_message
    runId
  );
}

/**
 * Mark ingestion run as failed
 * @param {object} statements - Deduplication statements
 * @param {number} runId - Run ID
 * @param {string} errorMessage - Error description
 */
function failIngestionRun(statements, runId, errorMessage) {
  statements.updateIngestionRun.run(
    Date.now(), // completed_at
    'failed', // status
    0, 0, 0, 0, // stats
    errorMessage,
    runId
  );
}

/**
 * Add or update capital relationship (supports multiple countries for same city)
 * @param {object} statements - Deduplication statements
 * @param {number} countryId - Parent country ID
 * @param {number} cityId - Child city ID
 * @param {object} metadata - Optional metadata (e.g., { role: 'administrative' })
 */
function addCapitalRelationship(statements, countryId, cityId, metadata = {}) {
  try {
    statements.addCapitalRelation.run(
      countryId,
      cityId,
      metadata ? JSON.stringify(metadata) : null
    );
  } catch (err) {
    // Ignore duplicate relation errors
  }
}

/**
 * Get all countries that claim a city as their capital
 * @param {object} statements - Deduplication statements
 * @param {number} cityId - City ID
 * @returns {Array} Array of country IDs
 */
function getCapitalCountries(statements, cityId) {
  const relations = statements.getCapitalRelations.all(cityId);
  return relations.map(r => r.parent_id);
}

/**
 * Generate stable external ID for capital cities
 * Used as fallback when Wikidata/OSM IDs not available
 * @param {string} source - Source name (e.g., 'restcountries')
 * @param {string} countryCode - ISO 3166-1 alpha-2 code
 * @param {string} capitalName - Capital city name
 * @returns {string} External ID (e.g., 'restcountries:capital:GB:london')
 */
function generateCapitalExternalId(source, countryCode, capitalName) {
  const normalized = normalizeName(capitalName);
  return `${source}:capital:${countryCode.toUpperCase()}:${normalized}`;
}

module.exports = {
  createDeduplicationStatements,
  findExistingPlace,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  failIngestionRun,
  addCapitalRelationship,
  getCapitalCountries,
  generateCapitalExternalId
};
