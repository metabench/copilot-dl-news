'use strict';

/**
 * GazetteerDatabase - Standalone database adapter for geographic place data
 * 
 * This class provides a focused API for working with gazetteer data:
 * - Place CRUD operations
 * - Name management (multilingual)
 * - External ID tracking (GeoNames, Wikidata, OSM)
 * - Import run tracking
 * - Place search and lookup
 * 
 * Can be used standalone with a dedicated gazetteer.db or integrated
 * into the larger news database.
 * 
 * @example
 *   const db = new GazetteerDatabase('data/gazetteer-standalone.db');
 *   
 *   const placeId = db.insertPlace({
 *     kind: 'city',
 *     country_code: 'GB',
 *     population: 8982000,
 *     lat: 51.5074,
 *     lng: -0.1278,
 *     source: 'geonames'
 *   });
 *   
 *   db.insertPlaceName(placeId, {
 *     name: 'London',
 *     lang: 'en',
 *     name_kind: 'official',
 *     is_preferred: true
 *   });
 */

const Database = require('better-sqlite3');
const path = require('path');
const { initializeGazetteerSchema, checkGazetteerSchema, getGazetteerStats } = require('./schema');

// ─────────────────────────────────────────────────────────────────────────────
// GazetteerDatabase Class
// ─────────────────────────────────────────────────────────────────────────────

class GazetteerDatabase {
  /**
   * Create or open a gazetteer database
   * 
   * @param {string|Database} dbPathOrHandle - Path to database file or existing handle
   * @param {Object} options
   * @param {boolean} [options.readonly=false] - Open in read-only mode
   * @param {boolean} [options.verbose=false] - Log operations
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor(dbPathOrHandle, options = {}) {
    const { readonly = false, verbose = false, logger = console } = options;
    
    this._verbose = verbose;
    this._logger = logger;
    
    // Accept either a path or an existing database handle
    if (typeof dbPathOrHandle === 'string') {
      this._ownDb = true;
      this.db = new Database(dbPathOrHandle, { readonly });
      this.dbPath = dbPathOrHandle;
      
      // Enable WAL mode for better concurrency
      if (!readonly) {
        this.db.pragma('journal_mode = WAL');
      }
      
      // Initialize schema if not readonly
      if (!readonly) {
        const check = checkGazetteerSchema(this.db);
        if (!check.exists) {
          this._log('info', 'Initializing gazetteer schema...');
          initializeGazetteerSchema(this.db, { verbose, logger });
        }
      }
    } else {
      // Use provided database handle
      this._ownDb = false;
      this.db = dbPathOrHandle;
      this.dbPath = this.db.name;
    }
    
    // Prepare statements
    this._prepareStatements();
  }
  
  _log(level, message) {
    if (this._verbose) {
      this._logger.log(`[GazetteerDB] ${message}`);
    }
  }
  
  _prepareStatements() {
    const db = this.db;
    
    // Place operations
    this._stmts = {
      // Insert operations
      insertPlace: db.prepare(`
        INSERT INTO places (
          kind, country_code, adm1_code, adm2_code, population, timezone,
          lat, lng, bbox, source, extra, wikidata_qid, osm_type, osm_id,
          area, crawl_depth, status, place_type
        ) VALUES (
          @kind, @country_code, @adm1_code, @adm2_code, @population, @timezone,
          @lat, @lng, @bbox, @source, @extra, @wikidata_qid, @osm_type, @osm_id,
          @area, @crawl_depth, @status, @place_type
        )
      `),
      
      insertPlaceName: db.prepare(`
        INSERT INTO place_names (
          place_id, name, normalized, lang, script, name_kind, is_preferred, is_official, source
        ) VALUES (
          @place_id, @name, @normalized, @lang, @script, @name_kind, @is_preferred, @is_official, @source
        )
      `),
      
      insertExternalId: db.prepare(`
        INSERT OR IGNORE INTO place_external_ids (place_id, source, ext_id, confidence)
        VALUES (@place_id, @source, @ext_id, @confidence)
      `),
      
      insertHierarchy: db.prepare(`
        INSERT OR IGNORE INTO place_hierarchy (parent_id, child_id, relation_type, source)
        VALUES (@parent_id, @child_id, @relation_type, @source)
      `),
      
      // Update operations
      updatePlaceCanonicalName: db.prepare(`
        UPDATE places SET canonical_name_id = ? WHERE id = ?
      `),
      
      updatePlace: db.prepare(`
        UPDATE places SET
          kind = COALESCE(@kind, kind),
          country_code = COALESCE(@country_code, country_code),
          population = COALESCE(@population, population),
          lat = COALESCE(@lat, lat),
          lng = COALESCE(@lng, lng),
          source = COALESCE(@source, source),
          extra = COALESCE(@extra, extra),
          wikidata_qid = COALESCE(@wikidata_qid, wikidata_qid),
          updated_at = datetime('now')
        WHERE id = @id
      `),
      
      // Select operations
      getPlaceById: db.prepare(`
        SELECT p.*, pn.name as canonical_name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.id = ?
      `),
      
      getPlaceByExternalId: db.prepare(`
        SELECT p.*, pn.name as canonical_name
        FROM places p
        JOIN place_external_ids pei ON pei.place_id = p.id
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE pei.source = ? AND pei.ext_id = ?
      `),
      
      getPlaceByWikidata: db.prepare(`
        SELECT p.*, pn.name as canonical_name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.wikidata_qid = ?
      `),
      
      getPlaceNames: db.prepare(`
        SELECT * FROM place_names WHERE place_id = ? ORDER BY is_preferred DESC, is_official DESC
      `),
      
      searchPlacesByName: db.prepare(`
        SELECT DISTINCT p.*, pn.name as matched_name, pn.lang, pn.name_kind
        FROM places p
        JOIN place_names pn ON pn.place_id = p.id
        WHERE pn.normalized LIKE ?
        ORDER BY p.population DESC
        LIMIT ?
      `),
      
      getPlacesByCountry: db.prepare(`
        SELECT p.*, pn.name as canonical_name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.country_code = ?
        ORDER BY p.population DESC
      `),
      
      getPlacesByKind: db.prepare(`
        SELECT p.*, pn.name as canonical_name
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = ?
        ORDER BY p.population DESC
        LIMIT ?
      `),
      
      getExternalIds: db.prepare(`
        SELECT * FROM place_external_ids WHERE place_id = ?
      `),
      
      getChildren: db.prepare(`
        SELECT p.*, pn.name as canonical_name, ph.relation_type
        FROM places p
        JOIN place_hierarchy ph ON ph.child_id = p.id
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE ph.parent_id = ?
        ORDER BY p.population DESC
      `),
      
      getParents: db.prepare(`
        SELECT p.*, pn.name as canonical_name, ph.relation_type
        FROM places p
        JOIN place_hierarchy ph ON ph.parent_id = p.id
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE ph.child_id = ?
      `),
      
      // Count operations
      countPlaces: db.prepare('SELECT COUNT(*) as count FROM places'),
      countPlaceNames: db.prepare('SELECT COUNT(*) as count FROM place_names'),
      countBySource: db.prepare(`
        SELECT source, COUNT(*) as count FROM places GROUP BY source ORDER BY count DESC
      `),
      countByKind: db.prepare(`
        SELECT kind, COUNT(*) as count FROM places GROUP BY kind ORDER BY count DESC
      `),
      
      // Ingestion run tracking
      insertIngestionRun: db.prepare(`
        INSERT INTO ingestion_runs (source, started_at, status, config)
        VALUES (@source, datetime('now'), 'running', @config)
      `),
      
      updateIngestionRun: db.prepare(`
        UPDATE ingestion_runs SET
          status = @status,
          completed_at = datetime('now'),
          records_processed = @records_processed,
          records_inserted = @records_inserted,
          records_updated = @records_updated,
          records_skipped = @records_skipped,
          records_failed = @records_failed,
          error_message = @error_message,
          summary = @summary
        WHERE id = @id
      `),
      
      getLastIngestionRun: db.prepare(`
        SELECT * FROM ingestion_runs WHERE source = ? ORDER BY id DESC LIMIT 1
      `)
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Place Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Insert a new place
   * 
   * @param {Object} place
   * @param {string} place.kind - country | region | city | poi | supranational
   * @param {string} [place.country_code] - ISO-3166 alpha-2
   * @param {number} [place.population]
   * @param {number} [place.lat]
   * @param {number} [place.lng]
   * @param {string} [place.source] - Data source identifier
   * @returns {number} Place ID
   */
  insertPlace(place) {
    const params = {
      kind: place.kind,
      country_code: place.country_code || null,
      adm1_code: place.adm1_code || null,
      adm2_code: place.adm2_code || null,
      population: place.population || null,
      timezone: place.timezone || null,
      lat: place.lat || null,
      lng: place.lng || null,
      bbox: place.bbox ? JSON.stringify(place.bbox) : null,
      source: place.source || null,
      extra: place.extra ? JSON.stringify(place.extra) : null,
      wikidata_qid: place.wikidata_qid || null,
      osm_type: place.osm_type || null,
      osm_id: place.osm_id || null,
      area: place.area || null,
      crawl_depth: place.crawl_depth || 0,
      status: place.status || 'current',
      place_type: place.place_type || null
    };
    
    const result = this._stmts.insertPlace.run(params);
    return result.lastInsertRowid;
  }
  
  /**
   * Insert a place name
   * 
   * @param {number} placeId
   * @param {Object} name
   * @param {string} name.name - The actual name
   * @param {string} [name.lang] - BCP-47 language code
   * @param {string} [name.name_kind] - official | common | alias | etc.
   * @param {boolean} [name.is_preferred]
   * @param {boolean} [name.is_official]
   * @param {string} [name.source]
   * @returns {number} Name ID
   */
  insertPlaceName(placeId, name) {
    // Normalize the name for search
    const normalized = name.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    const params = {
      place_id: placeId,
      name: name.name,
      normalized,
      lang: name.lang || 'und',
      script: name.script || null,
      name_kind: name.name_kind || null,
      is_preferred: name.is_preferred ? 1 : 0,
      is_official: name.is_official ? 1 : 0,
      source: name.source || null
    };
    
    const result = this._stmts.insertPlaceName.run(params);
    return result.lastInsertRowid;
  }
  
  /**
   * Set the canonical name for a place
   * 
   * @param {number} placeId
   * @param {number} nameId
   */
  setCanonicalName(placeId, nameId) {
    this._stmts.updatePlaceCanonicalName.run(nameId, placeId);
  }
  
  /**
   * Insert an external ID mapping
   * 
   * @param {number} placeId
   * @param {string} source - geonames | wikidata | osm | etc.
   * @param {string} extId - External system ID
   * @param {number} [confidence=1.0]
   */
  insertExternalId(placeId, source, extId, confidence = 1.0) {
    this._stmts.insertExternalId.run({
      place_id: placeId,
      source,
      ext_id: extId,
      confidence
    });
  }
  
  /**
   * Insert a hierarchy relationship
   * 
   * @param {number} parentId
   * @param {number} childId
   * @param {string} [relationType='admin_parent']
   * @param {string} [source]
   */
  insertHierarchy(parentId, childId, relationType = 'admin_parent', source = null) {
    this._stmts.insertHierarchy.run({
      parent_id: parentId,
      child_id: childId,
      relation_type: relationType,
      source
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Query Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get place by ID
   * @param {number} id
   * @returns {Object|null}
   */
  getPlaceById(id) {
    return this._stmts.getPlaceById.get(id) || null;
  }
  
  /**
   * Get place by external ID (GeoNames, Wikidata, etc.)
   * @param {string} source
   * @param {string} extId
   * @returns {Object|null}
   */
  getPlaceByExternalId(source, extId) {
    return this._stmts.getPlaceByExternalId.get(source, extId) || null;
  }
  
  /**
   * Get place by Wikidata QID
   * @param {string} qid - e.g., 'Q84' for London
   * @returns {Object|null}
   */
  getPlaceByWikidata(qid) {
    return this._stmts.getPlaceByWikidata.get(qid) || null;
  }
  
  /**
   * Get all names for a place
   * @param {number} placeId
   * @returns {Array}
   */
  getPlaceNames(placeId) {
    return this._stmts.getPlaceNames.all(placeId);
  }
  
  /**
   * Search places by name
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Array}
   */
  searchPlacesByName(query, limit = 20) {
    const normalized = query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    
    return this._stmts.searchPlacesByName.all(`${normalized}%`, limit);
  }
  
  /**
   * Get places by country
   * @param {string} countryCode - ISO-3166 alpha-2
   * @returns {Array}
   */
  getPlacesByCountry(countryCode) {
    return this._stmts.getPlacesByCountry.all(countryCode.toUpperCase());
  }
  
  /**
   * Get places by kind
   * @param {string} kind - country | region | city | etc.
   * @param {number} [limit=100]
   * @returns {Array}
   */
  getPlacesByKind(kind, limit = 100) {
    return this._stmts.getPlacesByKind.all(kind, limit);
  }
  
  /**
   * Get external IDs for a place
   * @param {number} placeId
   * @returns {Array}
   */
  getExternalIds(placeId) {
    return this._stmts.getExternalIds.all(placeId);
  }
  
  /**
   * Get child places
   * @param {number} placeId
   * @returns {Array}
   */
  getChildren(placeId) {
    return this._stmts.getChildren.all(placeId);
  }
  
  /**
   * Get parent places
   * @param {number} placeId
   * @returns {Array}
   */
  getParents(placeId) {
    return this._stmts.getParents.all(placeId);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Statistics
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get gazetteer statistics
   * @returns {Object}
   */
  getStats() {
    return {
      places: this._stmts.countPlaces.get().count,
      place_names: this._stmts.countPlaceNames.get().count,
      by_source: this._stmts.countBySource.all(),
      by_kind: this._stmts.countByKind.all()
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Ingestion Run Tracking
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Start a new ingestion run
   * @param {string} source
   * @param {Object} [config]
   * @returns {number} Run ID
   */
  startIngestionRun(source, config = {}) {
    const result = this._stmts.insertIngestionRun.run({
      source,
      config: JSON.stringify(config)
    });
    return result.lastInsertRowid;
  }
  
  /**
   * Update an ingestion run
   * @param {number} runId
   * @param {Object} update
   */
  updateIngestionRun(runId, update) {
    this._stmts.updateIngestionRun.run({
      id: runId,
      status: update.status || 'completed',
      records_processed: update.records_processed || 0,
      records_inserted: update.records_inserted || 0,
      records_updated: update.records_updated || 0,
      records_skipped: update.records_skipped || 0,
      records_failed: update.records_failed || 0,
      error_message: update.error_message || null,
      summary: update.summary ? JSON.stringify(update.summary) : null
    });
  }
  
  /**
   * Get the last ingestion run for a source
   * @param {string} source
   * @returns {Object|null}
   */
  getLastIngestionRun(source) {
    return this._stmts.getLastIngestionRun.get(source) || null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Batch Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Batch insert places with names
   * 
   * @param {Array<Object>} places - Array of place objects with names
   * @returns {Object} { inserted, skipped, errors }
   */
  batchInsertPlaces(places) {
    const stats = { inserted: 0, skipped: 0, errors: 0, namesAdded: 0 };
    
    const insertBatch = this.db.transaction((batch) => {
      for (const place of batch) {
        try {
          // Check if exists by external ID
          if (place.external_id && place.external_source) {
            const existing = this.getPlaceByExternalId(place.external_source, place.external_id);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          
          // Insert place
          const placeId = this.insertPlace(place);
          
          // Insert external ID
          if (place.external_id && place.external_source) {
            this.insertExternalId(placeId, place.external_source, place.external_id);
          }
          
          // Insert names
          if (place.names && Array.isArray(place.names)) {
            let canonicalNameId = null;
            for (const name of place.names) {
              const nameId = this.insertPlaceName(placeId, name);
              stats.namesAdded++;
              
              if (name.is_preferred && !canonicalNameId) {
                canonicalNameId = nameId;
              }
            }
            
            // Set canonical name
            if (canonicalNameId) {
              this.setCanonicalName(placeId, canonicalNameId);
            }
          }
          
          stats.inserted++;
        } catch (e) {
          stats.errors++;
          this._log('error', `Failed to insert place: ${e.message}`);
        }
      }
    });
    
    insertBatch(places);
    return stats;
  }
  
  /**
   * Create a transaction wrapper
   * @returns {Function}
   */
  transaction(fn) {
    return this.db.transaction(fn);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Close the database connection (if owned)
   */
  close() {
    if (this._ownDb && this.db.open) {
      this.db.close();
    }
  }
  
  /**
   * Get the underlying database handle
   * @returns {Database}
   */
  getHandle() {
    return this.db;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = { GazetteerDatabase };
