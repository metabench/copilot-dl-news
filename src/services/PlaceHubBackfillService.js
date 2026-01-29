'use strict';

/**
 * PlaceHubBackfillService — Automatic backfill of place hub mappings
 * 
 * This service handles:
 * 1. Backfilling 404 candidates from place_hub_candidates → place_page_mappings
 * 2. Resolving place_name → place_id via the gazetteer
 * 3. Syncing verified-present hubs to place_page_mappings
 * 
 * Designed to run automatically at crawl start or as a background task.
 */

const { EventEmitter } = require('events');

/**
 * @typedef {Object} BackfillResult
 * @property {number} absentMappingsCreated - Count of 404 → absent mappings created
 * @property {number} presentMappingsCreated - Count of verified hubs → present mappings created
 * @property {number} skipped - Count of already-existing mappings skipped
 * @property {number} errors - Count of errors encountered
 * @property {number} durationMs - Time taken in milliseconds
 */

class PlaceHubBackfillService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database connection (better-sqlite3)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({ db, logger = console } = {}) {
    super();
    if (!db) throw new Error('PlaceHubBackfillService requires db');
    this.db = db;
    this.logger = logger;
    
    // Prepare statements lazily
    this._stmts = null;
  }

  _getStatements() {
    if (this._stmts) return this._stmts;

    this._stmts = {
      // Get 404 candidates that don't have corresponding place_page_mappings
      get404Candidates: this.db.prepare(`
        SELECT 
          phc.id,
          phc.domain,
          phc.candidate_url,
          phc.place_name,
          phc.place_kind,
          phc.status,
          phc.validation_status,
          phc.updated_at
        FROM place_hub_candidates phc
        WHERE (phc.status IN ('fetched-404', 'head-404', 'cached-404')
               OR phc.validation_status = 'head-404')
        ORDER BY phc.domain, phc.place_name
        LIMIT @limit
      `),

      // Get verified hubs that don't have corresponding place_page_mappings
      // place_id is extracted from the evidence JSON field
      getVerifiedHubsWithoutMappings: this.db.prepare(`
        SELECT 
          ph.id AS hub_id,
          json_extract(ph.evidence, '$.place_id') AS place_id,
          ph.host,
          u.url,
          ph.place_kind AS page_kind,
          ph.last_seen_at AS verified_at
        FROM place_hubs ph
        LEFT JOIN urls u ON u.id = ph.url_id
        WHERE json_extract(ph.evidence, '$.place_id') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM place_page_mappings ppm
            WHERE ppm.place_id = json_extract(ph.evidence, '$.place_id')
              AND ppm.host = ph.host
              AND ppm.page_kind = ph.place_kind
          )
        LIMIT @limit
      `),

      // Resolve place_name to place_id via place_names table
      resolvePlaceId: this.db.prepare(`
        SELECT pn.place_id, p.kind
        FROM place_names pn
        JOIN places p ON p.id = pn.place_id
        WHERE pn.name = @placeName
           OR pn.normalized = LOWER(@placeName)
        ORDER BY pn.is_preferred DESC, p.population DESC
        LIMIT 1
      `),

      // Check if a mapping already exists
      checkMappingExists: this.db.prepare(`
        SELECT id, status, json_extract(evidence, '$.presence') as presence
        FROM place_page_mappings
        WHERE place_id = @placeId
          AND host = @host
          AND page_kind = @pageKind
        LIMIT 1
      `),

      // Insert absent mapping
      insertAbsentMapping: this.db.prepare(`
        INSERT INTO place_page_mappings (
          place_id, host, url, page_kind, status, evidence,
          first_seen_at, last_seen_at, verified_at
        ) VALUES (
          @placeId, @host, @url, @pageKind, 'verified', @evidence,
          @timestamp, @timestamp, @timestamp
        )
        ON CONFLICT(place_id, host, page_kind) DO UPDATE SET
          url = excluded.url,
          status = CASE 
            WHEN place_page_mappings.status = 'verified' 
             AND json_extract(place_page_mappings.evidence, '$.presence') != 'absent'
            THEN place_page_mappings.status
            ELSE excluded.status
          END,
          evidence = CASE
            WHEN place_page_mappings.status = 'verified'
             AND json_extract(place_page_mappings.evidence, '$.presence') != 'absent'
            THEN place_page_mappings.evidence
            ELSE excluded.evidence
          END,
          last_seen_at = excluded.last_seen_at,
          verified_at = CASE
            WHEN place_page_mappings.verified_at IS NULL
            THEN excluded.verified_at
            ELSE place_page_mappings.verified_at
          END
      `),

      // Insert present mapping
      insertPresentMapping: this.db.prepare(`
        INSERT INTO place_page_mappings (
          place_id, host, url, page_kind, status, evidence, hub_id,
          first_seen_at, last_seen_at, verified_at
        ) VALUES (
          @placeId, @host, @url, @pageKind, 'verified', @evidence, @hubId,
          @timestamp, @timestamp, @timestamp
        )
        ON CONFLICT(place_id, host, page_kind) DO UPDATE SET
          url = excluded.url,
          status = excluded.status,
          evidence = excluded.evidence,
          hub_id = excluded.hub_id,
          last_seen_at = excluded.last_seen_at,
          verified_at = excluded.verified_at
      `),

      // Get backfill statistics
      getBackfillStats: this.db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM place_hub_candidates 
           WHERE status IN ('fetched-404', 'head-404', 'cached-404')
              OR validation_status = 'head-404') AS total_404_candidates,
          (SELECT COUNT(*) FROM place_page_mappings 
           WHERE json_extract(evidence, '$.presence') = 'absent') AS absent_mappings,
          (SELECT COUNT(*) FROM place_page_mappings 
           WHERE json_extract(evidence, '$.presence') = 'present') AS present_mappings,
          (SELECT COUNT(*) FROM place_page_mappings 
           WHERE evidence IS NULL OR json_extract(evidence, '$.presence') IS NULL) AS unmigrated_mappings,
          (SELECT COUNT(*) FROM place_hubs 
           WHERE json_extract(evidence, '$.place_id') IS NOT NULL) AS verified_hubs
      `)
    };

    return this._stmts;
  }

  /**
   * Get current backfill statistics
   * @returns {Object} Statistics about the current state
   */
  getStats() {
    const stmts = this._getStatements();
    return stmts.getBackfillStats.get();
  }

  /**
   * Resolve a place name to a place_id using the gazetteer
   * @param {string} placeName - The place name to resolve
   * @returns {Object|null} { place_id, kind } or null if not found
   */
  resolvePlaceName(placeName) {
    if (!placeName) return null;
    const stmts = this._getStatements();
    return stmts.resolvePlaceId.get({ placeName });
  }

  /**
   * Backfill 404 candidates to place_page_mappings with absent status
   * @param {Object} [options]
   * @param {number} [options.limit=1000] - Maximum candidates to process
   * @param {boolean} [options.dryRun=false] - If true, don't actually write
   * @returns {BackfillResult}
   */
  backfill404Candidates({ limit = 1000, dryRun = false } = {}) {
    const startTime = Date.now();
    const stmts = this._getStatements();
    const result = {
      absentMappingsCreated: 0,
      skipped: 0,
      errors: 0,
      unresolvedNames: [],
      durationMs: 0
    };

    const candidates = stmts.get404Candidates.all({ limit });
    this.emit('backfill:start', { type: '404', count: candidates.length, dryRun });

    for (const candidate of candidates) {
      try {
        // Resolve place_name to place_id
        const resolved = this.resolvePlaceName(candidate.place_name);
        if (!resolved) {
          result.unresolvedNames.push(candidate.place_name);
          result.skipped++;
          continue;
        }

        const host = (candidate.domain || '').toLowerCase();
        const pageKind = this._resolvePageKind(candidate.place_kind);

        // Check if mapping already exists with verified-present
        const existing = stmts.checkMappingExists.get({
          placeId: resolved.place_id,
          host,
          pageKind
        });

        if (existing && existing.status === 'verified' && existing.presence === 'present') {
          result.skipped++;
          continue;
        }

        if (!dryRun) {
          const evidence = JSON.stringify({
            presence: 'absent',
            checked_url: candidate.candidate_url,
            http_status: 404,
            source: 'backfill',
            original_status: candidate.status,
            original_validation: candidate.validation_status,
            backfilled_at: new Date().toISOString()
          });

          stmts.insertAbsentMapping.run({
            placeId: resolved.place_id,
            host,
            url: candidate.candidate_url,
            pageKind,
            evidence,
            timestamp: candidate.updated_at || new Date().toISOString()
          });
        }

        result.absentMappingsCreated++;
        this.emit('backfill:progress', { 
          type: '404', 
          processed: result.absentMappingsCreated + result.skipped,
          total: candidates.length 
        });

      } catch (err) {
        result.errors++;
        this.logger.warn(`[PlaceHubBackfill] Error processing candidate ${candidate.id}: ${err.message}`);
      }
    }

    result.durationMs = Date.now() - startTime;
    this.emit('backfill:complete', { type: '404', result });
    return result;
  }

  /**
   * Sync verified hubs to place_page_mappings with present status
   * @param {Object} [options]
   * @param {number} [options.limit=1000] - Maximum hubs to process
   * @param {boolean} [options.dryRun=false] - If true, don't actually write
   * @returns {BackfillResult}
   */
  syncVerifiedHubs({ limit = 1000, dryRun = false } = {}) {
    const startTime = Date.now();
    const stmts = this._getStatements();
    const result = {
      presentMappingsCreated: 0,
      skipped: 0,
      errors: 0,
      durationMs: 0
    };

    const hubs = stmts.getVerifiedHubsWithoutMappings.all({ limit });
    this.emit('backfill:start', { type: 'verified-hubs', count: hubs.length, dryRun });

    for (const hub of hubs) {
      try {
        if (!dryRun) {
          const evidence = JSON.stringify({
            presence: 'present',
            hub_id: hub.hub_id,
            verified_at: hub.verified_at,
            source: 'sync',
            synced_at: new Date().toISOString()
          });

          stmts.insertPresentMapping.run({
            placeId: hub.place_id,
            host: hub.host,
            url: hub.url,
            pageKind: hub.page_kind || 'country-hub',
            evidence,
            hubId: hub.hub_id,
            timestamp: hub.verified_at || new Date().toISOString()
          });
        }

        result.presentMappingsCreated++;
        this.emit('backfill:progress', {
          type: 'verified-hubs',
          processed: result.presentMappingsCreated + result.skipped,
          total: hubs.length
        });

      } catch (err) {
        result.errors++;
        this.logger.warn(`[PlaceHubBackfill] Error syncing hub ${hub.hub_id}: ${err.message}`);
      }
    }

    result.durationMs = Date.now() - startTime;
    this.emit('backfill:complete', { type: 'verified-hubs', result });
    return result;
  }

  /**
   * Run full backfill (404 candidates + verified hubs)
   * @param {Object} [options]
   * @param {number} [options.limit=1000] - Maximum items per category
   * @param {boolean} [options.dryRun=false] - If true, don't actually write
   * @returns {Object} Combined results
   */
  runFullBackfill({ limit = 1000, dryRun = false } = {}) {
    const startTime = Date.now();
    
    this.logger.info(`[PlaceHubBackfill] Starting full backfill (limit=${limit}, dryRun=${dryRun})`);
    
    const absent = this.backfill404Candidates({ limit, dryRun });
    const present = this.syncVerifiedHubs({ limit, dryRun });

    const result = {
      absentMappingsCreated: absent.absentMappingsCreated,
      presentMappingsCreated: present.presentMappingsCreated,
      skipped: absent.skipped + present.skipped,
      errors: absent.errors + present.errors,
      unresolvedNames: absent.unresolvedNames || [],
      durationMs: Date.now() - startTime
    };

    this.logger.info(
      `[PlaceHubBackfill] Complete: ${result.absentMappingsCreated} absent, ` +
      `${result.presentMappingsCreated} present, ${result.skipped} skipped, ` +
      `${result.errors} errors in ${result.durationMs}ms`
    );

    return result;
  }

  _resolvePageKind(placeKind) {
    const mapping = {
      country: 'country-hub',
      region: 'region-hub',
      city: 'city-hub'
    };
    return mapping[placeKind] || 'country-hub';
  }
}

module.exports = { PlaceHubBackfillService };
