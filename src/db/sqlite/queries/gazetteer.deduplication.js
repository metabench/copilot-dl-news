/**
 * Gazetteer deduplication utilities
 *
 * Provides robust deduplication strategies for gazetteer data ingestion,
 * preventing duplicate places while maintaining data integrity.
 */

/**
 * Create prepared statements for deduplication operations
 * @param {import('better-sqlite3').Database} db
 * @returns {object} Object with prepared statement functions
 */
function createDeduplicationStatements(db) {
  return {
    // Ingestion run tracking
    getIngestionRun: db.prepare(`
      SELECT id, started_at, completed_at, status, metadata
      FROM ingestion_runs
      WHERE source = ? AND version = ?
      ORDER BY started_at DESC
      LIMIT 1
    `),

    insertIngestionRun: db.prepare(`
      INSERT INTO ingestion_runs (source, version, started_at, status, metadata)
      VALUES (?, ?, datetime('now'), 'running', ?)
    `),

    updateIngestionRun: db.prepare(`
      UPDATE ingestion_runs
      SET completed_at = datetime('now'), status = ?, metadata = ?
      WHERE id = ?
    `),

    // Place deduplication queries
    getPlaceByWikidataQid: db.prepare(`
      SELECT id FROM places WHERE wikidata_qid = ?
    `),

    getPlaceByOsmId: db.prepare(`
      SELECT id FROM places WHERE osm_type = ? AND osm_id = ?
    `),

    getPlaceByGeonamesId: db.prepare(`
      SELECT place_id AS id FROM place_external_ids WHERE source = 'geonames' AND ext_id = ?
    `),

    getPlaceByCountryAndName: db.prepare(`
      SELECT p.id
      FROM places p
      JOIN place_names pn ON p.canonical_name_id = pn.id
      WHERE p.kind = ? AND p.country_code = ? AND pn.normalized = ?
      LIMIT 1
    `),

    getNearbyPlace: db.prepare(`
      SELECT id,
        ABS(lat - @lat) + ABS(lng - @lng) AS distance
      FROM places
      WHERE kind = @kind AND country_code = @country_code
        AND lat IS NOT NULL AND lng IS NOT NULL
        AND ABS(lat - @lat) + ABS(lng - @lng) < @threshold
      ORDER BY distance
      LIMIT 1
    `),

    // Capital relationship management
    insertCapitalRelationship: db.prepare(`
      INSERT OR IGNORE INTO place_hierarchy (parent_id, child_id, relation, depth, metadata)
      VALUES (?, ?, 'capital_of', 1, ?)
    `)
  };
}

/**
 * Check if an ingestion run already exists and is complete
 * @param {object} statements - Prepared statements from createDeduplicationStatements
 * @param {string} source - Data source (e.g., 'restcountries')
 * @param {string} version - Source version (e.g., 'v3.1')
 * @param {boolean} force - Force re-ingestion even if complete
 * @returns {object|null} Existing run if found and complete, null otherwise
 */
function checkIngestionRun(statements, source, version, force = false) {
  try {
    const run = statements.getIngestionRun.get(source, version);
    if (!run) return null;

    // If forcing re-run, ignore existing runs
    if (force) return null;

    // Check if run is complete
    if (run.status === 'completed' && run.completed_at) {
      return run;
    }

    return null; // Run exists but not complete
  } catch (err) {
    console.warn('[deduplication] Error checking ingestion run:', err.message);
    return null;
  }
}

/**
 * Start a new ingestion run
 * @param {object} statements - Prepared statements from createDeduplicationStatements
 * @param {string} source - Data source
 * @param {string} version - Source version
 * @param {object} options - Additional metadata
 * @returns {number} Run ID
 */
function startIngestionRun(statements, source, version, options = {}) {
  try {
    const metadata = JSON.stringify(options);
    const result = statements.insertIngestionRun.run(source, version, metadata);
    return result.lastInsertRowid;
  } catch (err) {
    console.error('[deduplication] Error starting ingestion run:', err.message);
    throw err;
  }
}

/**
 * Complete an ingestion run
 * @param {object} statements - Prepared statements from createDeduplicationStatements
 * @param {number} runId - Run ID to complete
 * @param {object} stats - Completion statistics
 */
function completeIngestionRun(statements, runId, stats = {}) {
  try {
    const metadata = JSON.stringify(stats);
    statements.updateIngestionRun.run('completed', metadata, runId);
  } catch (err) {
    console.error('[deduplication] Error completing ingestion run:', err.message);
    throw err;
  }
}

/**
 * Find existing place using robust deduplication strategies
 * @param {object} statements - Prepared statements from createDeduplicationStatements
 * @param {object} criteria - Search criteria
 * @param {string} [criteria.wikidataQid] - Wikidata QID
 * @param {string} [criteria.osmType] - OSM type (node, way, relation)
 * @param {number} [criteria.osmId] - OSM ID
 * @param {number} [criteria.geonamesId] - GeoNames ID
 * @param {string} criteria.kind - Place kind (country, region, city)
 * @param {string} [criteria.countryCode] - Country code
 * @param {string} [criteria.adm1Code] - ADM1 code
 * @param {string} [criteria.adm2Code] - ADM2 code
 * @param {string} [criteria.normalizedName] - Normalized name
 * @param {number} [criteria.lat] - Latitude
 * @param {number} [criteria.lng] - Longitude
 * @returns {object|null} Object with id property if found, null otherwise
 */
function findExistingPlace(statements, criteria) {
  const {
    wikidataQid,
    osmType,
    osmId,
    geonamesId,
    kind,
    countryCode,
    adm1Code,
    adm2Code,
    normalizedName,
    lat,
    lng
  } = criteria;

  try {
    // Priority 1: Exact Wikidata QID match
    if (wikidataQid) {
      const result = statements.getPlaceByWikidataQid.get(wikidataQid);
      if (result) return result;
    }

    // Priority 2: Exact OSM ID match
    if (osmType && osmId) {
      const result = statements.getPlaceByOsmId.get(osmType, osmId);
      if (result) return result;
    }

    // Priority 3: GeoNames ID match
    if (geonamesId) {
      const result = statements.getPlaceByGeonamesId.get(String(geonamesId));
      if (result) return result;
    }

    // Priority 4: Country + normalized name match (for cities/regions)
    if (kind && countryCode && normalizedName) {
      const result = statements.getPlaceByCountryAndName.get(kind, countryCode, normalizedName);
      if (result) return result;
    }

    // Priority 5: Coordinate proximity match (if coordinates provided)
    if (kind && countryCode && lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
      const result = statements.getNearbyPlace.get({
        kind,
        country_code: countryCode,
        lat,
        lng,
        threshold: 0.01 // ~1km proximity threshold
      });
      if (result) return result;
    }

    return null; // No existing place found
  } catch (err) {
    console.warn('[deduplication] Error finding existing place:', err.message);
    return null;
  }
}

/**
 * Generate a stable external ID for capitals to prevent duplicates
 * @param {string} source - Data source (e.g., 'restcountries')
 * @param {string} countryCode - ISO country code
 * @param {string} normalizedName - Normalized capital name
 * @returns {string} Stable external ID
 */
function generateCapitalExternalId(source, countryCode, normalizedName) {
  // Create a stable, predictable ID based on source, country, and normalized name
  // This ensures the same capital always gets the same external ID
  const components = [source, countryCode.toLowerCase(), normalizedName.toLowerCase()];
  return components.join(':').replace(/[^a-z0-9:]/g, '_');
}

/**
 * Add capital relationship between country and capital city
 * @param {object} statements - Prepared statements from createDeduplicationStatements
 * @param {number} countryId - Country place ID
 * @param {number} capitalId - Capital city place ID
 * @param {object} metadata - Additional metadata
 */
function addCapitalRelationship(statements, countryId, capitalId, metadata = {}) {
  try {
    const metadataJson = JSON.stringify(metadata);
    statements.insertCapitalRelationship.run(countryId, capitalId, metadataJson);
  } catch (err) {
    console.warn('[deduplication] Error adding capital relationship:', err.message);
    // Don't throw - relationship is optional
  }
}

module.exports = {
  createDeduplicationStatements,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  findExistingPlace,
  generateCapitalExternalId,
  addCapitalRelationship
};