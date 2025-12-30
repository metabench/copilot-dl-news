'use strict';

/**
 * GeoImportStateManager - Observable state management for geo import pipeline
 * 
 * Provides a singleton-like state manager that:
 * 1. Wraps fnl observables with a clean subscription API
 * 2. Maintains current state for late-joining subscribers (SSE clients)
 * 3. Emits stage/progress events that the UI can consume
 * 
 * @example
 *   const manager = new GeoImportStateManager({ db });
 *   
 *   // Subscribe to all events
 *   manager.subscribe(event => {
 *     console.log(`[${event.type}]`, event.data);
 *   });
 *   
 *   // Start import
 *   manager.startImport({ dataDir: 'data/geonames' });
 *   
 *   // Control
 *   manager.pause();
 *   manager.resume();
 *   manager.cancel();
 */

const EventEmitter = require('events');
const fnl = require('fnl');
const { observable } = fnl;
const { importGeoNames, createImportPipeline, countLines } = require('./GeoImportService');
const { StepGate } = require('./StepGate');

// ─────────────────────────────────────────────────────────────────────────────
// Import Stages Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All stages in the gazetteer import pipeline
 */
const IMPORT_STAGES = [
  { id: 'idle', label: 'Ready', emoji: '⏸️', description: 'Waiting to start' },
  { id: 'awaiting', label: 'Awaiting', emoji: '⏭️', description: 'Waiting for user to proceed' },
  { id: 'validating', label: 'Validating', emoji: '🔍', description: 'Checking source files' },
  { id: 'counting', label: 'Counting', emoji: '📊', description: 'Counting records' },
  { id: 'preparing', label: 'Preparing', emoji: '⚙️', description: 'Setting up database' },
  { id: 'importing', label: 'Importing', emoji: '💾', description: 'Importing records' },
  { id: 'indexing', label: 'Indexing', emoji: '🗂️', description: 'Building indexes' },
  { id: 'verifying', label: 'Verifying', emoji: '✅', description: 'Validating coverage' },
  { id: 'complete', label: 'Complete', emoji: '🎉', description: 'Import finished' },
  { id: 'error', label: 'Error', emoji: '❌', description: 'Error occurred' },
  { id: 'paused', label: 'Paused', emoji: '⏸️', description: 'Import paused' },
  { id: 'cancelled', label: 'Cancelled', emoji: '🛑', description: 'Import cancelled' }
];

/**
 * Get stage definition by ID
 * @param {string} stageId 
 * @returns {Object|undefined}
 */
function getStage(stageId) {
  return IMPORT_STAGES.find(s => s.id === stageId);
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoImportStateManager Class
// ─────────────────────────────────────────────────────────────────────────────

class GeoImportStateManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.db - better-sqlite3 database instance
   */
  constructor(options = {}) {
    super();
    
    const fs = require('fs');
    const path = require('path');
    
    this._db = options.db;
    this._dataDir = options.dataDir || 'data/geonames';
    
    // Check for GeoNames file
    const citiesFile = path.join(this._dataDir, 'cities15000.txt');
    const fileExists = fs.existsSync(citiesFile);
    let fileSize = 0;
    if (fileExists) {
      fileSize = fs.statSync(citiesFile).size;
    }
    
    this._stepGate = new StepGate();
    this._cancelRequested = false;

    // Current state (for late-joining clients)
    this._state = {
      status: 'idle',
      stage: getStage('idle'),
      progress: { current: 0, total: 0, percent: 0 },
      stall: { stale: false, lastProgressAt: null, msSinceProgress: 0 },
      pausePending: false,
      step: this._stepGate.getState(),
      stats: {
        processed: 0,
        inserted: 0,
        skipped: 0,
        namesAdded: 0,
        errors: 0
      },
      logs: [],
      sources: {
        geonames: { 
          status: fileExists ? 'ready' : 'missing', 
          file: citiesFile, 
          exists: fileExists,
          fileSize,
          downloadUrl: 'https://download.geonames.org/export/dump/cities15000.zip'
        },
        wikidata: { status: 'pending' },
        osm: { status: 'pending' }
      },
      startedAt: null,
      elapsed: 0,
      error: null,
      pausedFrom: null
    };
    
    // Observable control functions
    this._controls = null;

    // Pause can be requested before the observable wires pause/resume controls.
    // We keep a pending flag and apply it as soon as controls are available.
    this._pauseRequested = false;

    // Currently running observable (for control + lifecycle)
    this._import$ = null;

    // Stall detection
    this._lastProgressAt = null;
    this._stallTimer = null;
    this._stallThresholdMs = Number.isFinite(options.stallThresholdMs) ? options.stallThresholdMs : 15000;
    this._stallPollMs = Number.isFinite(options.stallPollMs) ? options.stallPollMs : 1000;
    
    // Max log entries to keep
    this._maxLogs = 200;
  }

  _extractControlsFromObservable(obs) {
    if (!obs || typeof obs !== 'object') return null;

    const stop = typeof obs.stop === 'function' ? obs.stop : null;
    const pause = typeof obs.pause === 'function' ? obs.pause : null;
    const resume = typeof obs.resume === 'function' ? obs.resume : null;

    if (!stop && !pause && !resume) {
      return null;
    }

    return [stop, pause, resume];
  }

  _ensureControls() {
    if (this._controls && (this._controls[0] || this._controls[1] || this._controls[2])) {
      return;
    }
    if (!this._import$) {
      return;
    }
    const controls = this._extractControlsFromObservable(this._import$);
    if (controls) {
      this._controls = controls;

      // If the user hit pause early, apply it immediately once pause control exists.
      if (this._pauseRequested && this._controls[1] && this.isRunning()) {
        try {
          this._controls[1]();
        } catch {
          // ignore
        }
        this._pauseRequested = false;
        this._updateState({ pausePending: false });
        this._setStage('paused');
        this._log('info', '⏸️ Import paused');
      }
    }
  }

  _startStallTimer() {
    this._stopStallTimer();
    this._lastProgressAt = Date.now();
    this._state.stall = { stale: false, lastProgressAt: this._lastProgressAt, msSinceProgress: 0 };

    this._stallTimer = setInterval(() => {
      if (!this.isRunning()) {
        return;
      }

      const last = this._lastProgressAt || this._state.stall?.lastProgressAt || Date.now();
      const msSince = Date.now() - last;
      const stale = msSince >= this._stallThresholdMs;

      const prevStale = !!this._state.stall?.stale;
      this._state.stall = {
        stale,
        lastProgressAt: last,
        msSinceProgress: msSince
      };

      if (stale && !prevStale) {
        this._emitEvent('stall', { stale: true, msSinceProgress: msSince });
        this._log('warning', `⚠️ No progress for ${(msSince / 1000).toFixed(0)}s (still running)`);
      }

      if (!stale && prevStale) {
        this._emitEvent('stall', { stale: false, msSinceProgress: msSince });
        this._log('info', '✅ Progress resumed');
      }
    }, this._stallPollMs);

    // Don't keep the process alive just for the timer.
    if (this._stallTimer && typeof this._stallTimer.unref === 'function') {
      this._stallTimer.unref();
    }
  }

  _stopStallTimer() {
    if (this._stallTimer) {
      clearInterval(this._stallTimer);
      this._stallTimer = null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // State Accessors
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current state snapshot (for SSE initial payload)
   * @returns {Object}
   */
  getState() {
    return { ...this._state };
  }
  
  /**
   * Get all stage definitions
   * @returns {Array}
   */
  getStages() {
    return IMPORT_STAGES;
  }
  
  /**
   * Check if import is running
   * @returns {boolean}
   */
  isRunning() {
    return ['validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying'].includes(this._state.status);
  }
  
  /**
   * Check if import can be started
   * @returns {boolean}
   */
  canStart() {
    return ['idle', 'complete', 'error', 'cancelled'].includes(this._state.status);
  }
  
  /**
   * Set/switch the database instance
   * @param {Object} db - better-sqlite3 database instance
   */
  setDatabase(db) {
    if (this.isRunning()) {
      throw new Error('Cannot switch database while import is running');
    }
    this._db = db;
    
    // Reset state when switching databases
    this._state.status = 'idle';
    this._state.stage = getStage('idle');
    this._state.progress = { current: 0, total: 0, percent: 0 };
    this._state.stats = {
      processed: 0,
      inserted: 0,
      skipped: 0,
      namesAdded: 0,
      errors: 0
    };
    this._state.startedAt = null;
    this._state.elapsed = 0;
    this._state.error = null;
    
    this._emitEvent('database-changed', { database: db ? 'connected' : null });
  }
  
  /**
   * Get the current database instance
   * @returns {Object|null}
   */
  getDatabase() {
    return this._db;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Plan Preview (Dry Run)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build a dry-run plan describing what the import would do without starting it.
   *
   * @param {Object} [options]
   * @param {string} [options.source='geonames']
   * @param {'fast'|'full'} [options.detail='full'] - When 'full' and the file exists, counts lines.
   * @returns {Promise<Object>} plan
   */
  async getPlan(options = {}) {
    const { source = 'geonames', detail = 'full' } = options;

    const normalizedSource = typeof source === 'string' ? source.trim().toLowerCase() : 'geonames';
    const normalizedDetail = detail === 'fast' ? 'fast' : 'full';

    const resolveDbHandle = () => {
      if (!this._db) return null;
      if (typeof this._db.prepare === 'function') return this._db;
      if (typeof this._db.getHandle === 'function') {
        try {
          const handle = this._db.getHandle();
          if (handle && typeof handle.prepare === 'function') return handle;
        } catch (_) {
          return null;
        }
      }
      return null;
    };

    const safeDbScalar = (db, sql, params = []) => {
      if (!db || typeof db.prepare !== 'function') return null;
      try {
        const row = db.prepare(sql).get(...params);
        if (!row || typeof row !== 'object') return null;
        const key = Object.keys(row)[0];
        const value = row[key];
        return Number.isFinite(Number(value)) ? Number(value) : null;
      } catch (_) {
        return null;
      }
    };

    const fs = require('fs');
    const path = require('path');

    if (normalizedSource === 'geonames') {
      const prerequisite = this.checkGeoNamesReady();
      const citiesFile = path.join(this._dataDir, 'cities15000.txt');

      let lineCount = null;
      let fileSize = null;

      if (fs.existsSync(citiesFile)) {
        try {
          fileSize = fs.statSync(citiesFile).size;
        } catch {
          fileSize = null;
        }
      }

      if (normalizedDetail === 'full' && prerequisite.ready) {
        lineCount = await new Promise((resolve, reject) => {
          const counter = countLines(citiesFile);
          counter.on('complete', result => resolve(result.total));
          counter.on('error', reject);
        });
      }

      const downloads = prerequisite.ready
        ? []
        : [
          {
            url: prerequisite.downloadUrl || 'https://download.geonames.org/export/dump/cities15000.zip',
            targetDir: this._dataDir,
            expectedFile: citiesFile,
            note: 'Download and extract cities15000.txt (manual prerequisite).'
          }
        ];

      const targets = {
        tables: ['places', 'place_names', 'place_external_ids'],
        indexes: [
          'idx_place_names_normalized on place_names(normalized)',
          'idx_place_names_place on place_names(place_id)',
          'idx_places_country on places(country_code)',
          'idx_places_kind on places(kind)'
        ]
      };

      const stages = [
        {
          id: 'validating',
          label: 'Validate source file',
          reads: [{ kind: 'file-exists', path: citiesFile }],
          requests: [],
          writes: []
        },
        {
          id: 'counting',
          label: 'Count records (for determinate progress)',
          reads: [{ kind: 'file-scan', path: citiesFile, produces: 'lineCount' }],
          requests: [],
          writes: []
        },
        {
          id: 'preparing',
          label: 'Prepare DB statements',
          reads: [],
          requests: [],
          writes: [{ kind: 'prepare-statements', tables: targets.tables }]
        },
        {
          id: 'importing',
          label: 'Parse and insert rows',
          reads: [{ kind: 'file-stream', path: citiesFile }],
          requests: [],
          writes: [
            { kind: 'insert', table: 'places', source: 'geonames' },
            { kind: 'insert', table: 'place_names', source: 'geonames' },
            { kind: 'insert-or-ignore', table: 'place_external_ids', source: 'geonames' },
            { kind: 'update', table: 'places', note: 'Set canonical_name_id' }
          ]
        },
        {
          id: 'indexing',
          label: 'Ensure indexes',
          reads: [],
          requests: [],
          writes: [{ kind: 'create-indexes', indexes: targets.indexes }]
        },
        {
          id: 'verifying',
          label: 'Verify coverage (counts + sample lookups)',
          reads: [{ kind: 'select-counts', tables: ['places', 'place_names'] }],
          requests: [],
          writes: []
        }
      ];

      return {
        source: normalizedSource,
        detail: normalizedDetail,
        generatedAt: new Date().toISOString(),
        dataDir: this._dataDir,
        prerequisite,
        expected: {
          networkRequests: downloads.length,
          downloads,
          inputs: [
            {
              kind: 'file',
              id: 'cities15000.txt',
              path: citiesFile,
              exists: prerequisite.ready,
              sizeBytes: fileSize,
              lineCount
            }
          ],
          file: {
            path: citiesFile,
            exists: prerequisite.ready,
            sizeBytes: fileSize,
            lineCount
          }
        },
        targets,
        algorithm: {
          summary: 'Imports GeoNames cities15000.txt into gazetteer tables with deduplication via place_external_ids and builds lookup indexes.',
          stages
        }
      };
    }

    if (normalizedSource === 'wikidata') {
      const db = resolveDbHandle();
      const now = Date.now();
      const freshnessIntervalMs = 7 * 24 * 60 * 60 * 1000;
      const freshCutoff = now - freshnessIntervalMs;

      const existingCountryCount = safeDbScalar(
        db,
        `SELECT COUNT(*) AS count
         FROM places p
         JOIN place_external_ids pei ON pei.place_id = p.id
         WHERE p.kind = 'country' AND pei.source = 'wikidata'`
      );

      const freshCountryCount = safeDbScalar(
        db,
        `SELECT SUM(CASE WHEN p.last_crawled_at IS NOT NULL AND p.last_crawled_at >= ? THEN 1 ELSE 0 END) AS count
         FROM places p
         JOIN place_external_ids pei ON pei.place_id = p.id
         WHERE p.kind = 'country' AND pei.source = 'wikidata'`,
        [freshCutoff]
      );

      const estimatedCountriesToFetch = Number.isFinite(existingCountryCount)
        ? Math.max(0, existingCountryCount - (Number.isFinite(freshCountryCount) ? freshCountryCount : 0))
        : null;

      const entityBatchSize = 50;
      const estimatedEntityBatches = Number.isFinite(estimatedCountriesToFetch)
        ? Math.ceil(estimatedCountriesToFetch / entityBatchSize)
        : null;

      // Minimum one request for SPARQL discovery (cache may reduce this, but we don't assume it).
      const minRequests = 1;
      const estimatedRequests = Number.isFinite(estimatedEntityBatches) ? minRequests + estimatedEntityBatches : null;

      const { buildCountryDiscoveryQuery } = require('../crawler/gazetteer/queries/geographyQueries');
      const countryDiscoveryQuery = buildCountryDiscoveryQuery({ limit: null });

      const prerequisite = {
        ready: true,
        note: 'Requires network access to Wikidata SPARQL + Wikidata API. Requests may be reduced by HTTP cache and freshness window.'
      };

      const targets = {
        tables: ['places', 'place_names', 'place_external_ids', 'place_attributes', 'place_attribute_values'],
        indexes: [
          'idx_place_external_place on place_external_ids(place_id)',
          'idx_place_names_norm on place_names(normalized)',
          'idx_place_attr_attr on place_attribute_values(attr)',
          'idx_places_kind on places(kind)'
        ]
      };

      const stages = [
        {
          id: 'discovery',
          label: 'Discover country QIDs via SPARQL',
          reads: [{ kind: 'remote', endpoint: 'https://query.wikidata.org/sparql' }],
          requests: [
            {
              kind: 'http',
              method: 'GET',
              endpoint: 'https://query.wikidata.org/sparql',
              note: 'SPARQL discovery query (format=json&query=...)',
              queryPreview: normalizedDetail === 'full' ? countryDiscoveryQuery.slice(0, 400) : countryDiscoveryQuery.slice(0, 160)
            }
          ],
          writes: []
        },
        {
          id: 'fetching-entities',
          label: 'Fetch full country entities (batched)',
          reads: [],
          requests: [
            {
              kind: 'http',
              method: 'GET',
              endpoint: 'https://www.wikidata.org/w/api.php',
              note: `Wikidata API wbgetentities in batches of <= ${entityBatchSize} IDs`,
              batchSize: entityBatchSize,
              estimate: {
                entitiesToFetch: estimatedCountriesToFetch,
                batches: estimatedEntityBatches,
                formula: 'ceil(entitiesToFetch / 50)'
              }
            }
          ],
          writes: []
        },
        {
          id: 'upserting',
          label: 'Upsert places + names + attributes',
          reads: [],
          requests: [],
          writes: [
            { kind: 'upsert', table: 'places', source: 'wikidata' },
            { kind: 'upsert', table: 'place_names', source: 'wikidata' },
            { kind: 'insert-or-replace', table: 'place_external_ids', source: 'wikidata' },
            { kind: 'insert-or-replace', table: 'place_attribute_values', source: 'wikidata' },
            { kind: 'update', table: 'places', note: 'Set last_crawled_at for freshness window' }
          ]
        }
      ];

      return {
        source: normalizedSource,
        detail: normalizedDetail,
        generatedAt: new Date().toISOString(),
        dataDir: this._dataDir,
        prerequisite,
        expected: {
          networkRequests: Number.isFinite(estimatedRequests) ? estimatedRequests : null,
          networkRequestsEstimate: {
            min: minRequests,
            expected: estimatedRequests,
            max: null,
            note: 'At least 1 SPARQL request, plus Wikidata API batches (<=50 entities per request). Cache/freshness can reduce this.'
          },
          downloads: [],
          inputs: [
            {
              kind: 'db',
              id: 'existing.wikidata.countries',
              note: 'Counts derived from current DB (if available)',
              existingCountries: existingCountryCount,
              freshWithinWindow: freshCountryCount,
              freshnessWindowDays: Math.round(freshnessIntervalMs / (24 * 60 * 60 * 1000))
            }
          ],
          endpoints: [
            'https://query.wikidata.org/sparql',
            'https://www.wikidata.org/w/api.php?action=wbgetentities'
          ]
        },
        targets,
        algorithm: {
          summary: 'Discovers countries via Wikidata SPARQL, then fetches full entities via wbgetentities and upserts countries + multilingual names + attributes into gazetteer tables.',
          stages
        }
      };
    }

    if (normalizedSource === 'osm') {
      const db = resolveDbHandle();
      const now = Date.now();
      const freshnessIntervalMs = 7 * 24 * 60 * 60 * 1000;
      const freshCutoff = now - freshnessIntervalMs;
      const maxBatchSize = 5;

      const totalCandidates = safeDbScalar(
        db,
        `SELECT COUNT(*) AS count
         FROM places p
         LEFT JOIN place_attribute_values pav
           ON pav.place_id = p.id AND pav.attr = 'osm.relation'
         WHERE (p.osm_id IS NOT NULL OR pav.value_json IS NOT NULL)
           AND (p.osm_tags IS NULL OR p.bbox IS NULL)
           AND p.kind IN ('country', 'region')`
      );

      const freshCandidates = safeDbScalar(
        db,
        `SELECT SUM(CASE WHEN p.last_crawled_at IS NOT NULL AND p.last_crawled_at >= ? THEN 1 ELSE 0 END) AS count
         FROM places p
         LEFT JOIN place_attribute_values pav
           ON pav.place_id = p.id AND pav.attr = 'osm.relation'
         WHERE (p.osm_id IS NOT NULL OR pav.value_json IS NOT NULL)
           AND (p.osm_tags IS NULL OR p.bbox IS NULL)
           AND p.kind IN ('country', 'region')`,
        [freshCutoff]
      );

      const estimatedToFetch = Number.isFinite(totalCandidates)
        ? Math.max(0, totalCandidates - (Number.isFinite(freshCandidates) ? freshCandidates : 0))
        : null;

      const estimatedBatchRequests = Number.isFinite(estimatedToFetch)
        ? Math.ceil(estimatedToFetch / maxBatchSize)
        : null;

      const prerequisite = {
        ready: true,
        note: 'Requires network access to Overpass API. Individual candidates may be skipped within freshness window.'
      };

      const targets = {
        tables: ['places', 'place_attributes', 'place_attribute_values'],
        indexes: [
          'idx_place_attr_attr on place_attribute_values(attr)',
          'idx_place_attr_source on place_attribute_values(source)',
          'idx_places_kind on places(kind)'
        ]
      };

      const stages = [
        {
          id: 'discovery',
          label: 'Find candidates needing boundaries',
          reads: [
            {
              kind: 'select-count',
              note: 'places with osm_id or osm.relation attribute but missing bbox/osm_tags'
            }
          ],
          requests: [],
          writes: []
        },
        {
          id: 'fetching',
          label: 'Fetch boundary data from Overpass (batched)',
          reads: [],
          requests: [
            {
              kind: 'http',
              method: 'POST',
              endpoint: 'https://overpass-api.de/api/interpreter',
              note: `Batched Overpass queries (up to ${maxBatchSize} candidates per request; fallback may request per-candidate)`,
              estimate: {
                candidatesToFetch: estimatedToFetch,
                batchSize: maxBatchSize,
                expectedRequests: estimatedBatchRequests,
                worstCaseRequests: Number.isFinite(estimatedToFetch) ? estimatedToFetch : null,
                formula: 'ceil(candidatesToFetch / 5) (plus possible per-candidate fallbacks)'
              },
              queryTemplate: `[out:json][timeout:60];\n(\n  relation(<osmId>);\n  way(<osmId>);\n  relation(<osmId>);\n);\nout body geom;`
            }
          ],
          writes: []
        },
        {
          id: 'persist',
          label: 'Persist bbox/tags + attributes',
          reads: [],
          requests: [],
          writes: [
            { kind: 'update', table: 'places', fields: ['bbox', 'osm_tags', 'area', 'last_crawled_at'], source: 'osm.overpass' },
            { kind: 'insert-or-replace', table: 'place_attribute_values', source: 'osm.overpass' }
          ]
        }
      ];

      return {
        source: normalizedSource,
        detail: normalizedDetail,
        generatedAt: new Date().toISOString(),
        dataDir: this._dataDir,
        prerequisite,
        expected: {
          networkRequests: Number.isFinite(estimatedBatchRequests) ? estimatedBatchRequests : null,
          networkRequestsEstimate: {
            min: 0,
            expected: estimatedBatchRequests,
            max: Number.isFinite(estimatedToFetch) ? estimatedToFetch : null,
            note: '0 if no candidates; otherwise batched Overpass requests. Worst-case one request per candidate if batch fallback triggers.'
          },
          downloads: [],
          inputs: [
            {
              kind: 'db',
              id: 'osm.boundary.candidates',
              candidates: totalCandidates,
              freshWithinWindow: freshCandidates,
              freshnessWindowDays: Math.round(freshnessIntervalMs / (24 * 60 * 60 * 1000))
            }
          ],
          endpoints: ['https://overpass-api.de/api/interpreter']
        },
        targets,
        algorithm: {
          summary: 'Finds country/region places with known OSM identifiers but missing boundary metadata, fetches boundary geometry/tags from Overpass (batched), then stores bbox + tags + boundary payload attributes.',
          stages
        }
      };
    }

    throw new Error(`Unknown source: ${normalizedSource}`);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Event Emission
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Emit a state change event
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  _emitEvent(type, data = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      data: {
        ...data,
        state: this.getState()
      }
    };
    
    this.emit('event', event);
    this.emit(type, event);
  }
  
  /**
   * Update state and emit event
   * @param {Object} updates - State updates
   * @param {string} eventType - Event type to emit
   */
  _updateState(updates, eventType = 'state-change') {
    Object.assign(this._state, updates);
    
    // Update elapsed time if running
    if (this._state.startedAt && this.isRunning()) {
      this._state.elapsed = Date.now() - this._state.startedAt;
    }
    
    this._emitEvent(eventType, updates);
  }
  
  /**
   * Add a log entry
   * @param {string} level - 'info', 'success', 'warning', 'error'
   * @param {string} message - Log message
   */
  _log(level, message) {
    const entry = {
      time: new Date().toLocaleTimeString(),
      level,
      message
    };
    
    this._state.logs.push(entry);
    if (this._state.logs.length > this._maxLogs) {
      this._state.logs.shift();
    }
    
    this._emitEvent('log', { entry });
  }
  
  /**
   * Set current stage
   * @param {string} stageId 
   */
  _setStage(stageId) {
    const stage = getStage(stageId);
    if (stage) {
      this._updateState({ status: stageId, stage }, 'stage-change');
      this._log('info', `${stage.emoji} ${stage.description}`);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Import Control
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Check if GeoNames file exists and is valid
   * @returns {Object} { ready, file, error, downloadUrl }
   */
  checkGeoNamesReady() {
    const fs = require('fs');
    const path = require('path');
    
    const citiesFile = path.join(this._dataDir, 'cities15000.txt');
    const exists = fs.existsSync(citiesFile);
    
    if (!exists) {
      return {
        ready: false,
        file: citiesFile,
        error: `GeoNames file not found: ${citiesFile}`,
        downloadUrl: 'https://download.geonames.org/export/dump/cities15000.zip',
        instructions: [
          '1. Download cities15000.zip from https://download.geonames.org/export/dump/cities15000.zip',
          `2. Extract cities15000.txt to ${this._dataDir}/`,
          '3. Click "Start Import" again'
        ]
      };
    }
    
    const stats = fs.statSync(citiesFile);
    if (stats.size < 1000) {
      return {
        ready: false,
        file: citiesFile,
        error: `GeoNames file appears empty or corrupted (${stats.size} bytes)`,
        downloadUrl: 'https://download.geonames.org/export/dump/cities15000.zip'
      };
    }
    
    return {
      ready: true,
      file: citiesFile,
      fileSize: stats.size,
      fileSizeMB: (stats.size / 1024 / 1024).toFixed(1)
    };
  }
  
  /**
   * Start the import process
   * @param {Object} options
   * @param {string} [options.source='geonames'] - Source to import
   * @returns {Promise}
   */
  async startImport(options = {}) {
    const { source = 'geonames', stepMode = false } = options;
    
    if (!this.canStart()) {
      throw new Error(`Cannot start import: current status is ${this._state.status}`);
    }
    
    if (!this._db) {
      throw new Error('Database not configured');
    }
    
    // Check prerequisites
    if (source === 'geonames') {
      const check = this.checkGeoNamesReady();
      if (!check.ready) {
        const err = new Error(check.error);
        err.downloadUrl = check.downloadUrl;
        err.instructions = check.instructions;
        throw err;
      }
    }
    
    this._cancelRequested = false;
    this._stepGate.enable(!!stepMode);

    // Reset state
    this._state = {
      ...this._state,
      status: 'validating',
      stage: getStage('validating'),
      progress: { current: 0, total: 0, percent: 0 },
      stall: { stale: false, lastProgressAt: Date.now(), msSinceProgress: 0 },
      stats: { processed: 0, inserted: 0, skipped: 0, namesAdded: 0, errors: 0 },
      logs: [],
      step: this._stepGate.getState(),
      startedAt: Date.now(),
      elapsed: 0,
      error: null,
      pausedFrom: null
    };
    
    this._emitEvent('import-start', { source });
    this._log('info', `🚀 Starting ${source} import...`);
    
    try {
      if (source === 'geonames') {
        await this._runGeoNamesImport();
      } else {
        throw new Error(`Unknown source: ${source}`);
      }
    } catch (err) {
      this._handleError(err);
    }
  }
  
  /**
   * Run the GeoNames import pipeline
   */
  async _runGeoNamesImport() {
    const fs = require('fs');
    const path = require('path');
    
    // Stage: Validating
    this._setStage('validating');
    
    const citiesFile = path.join(this._dataDir, 'cities15000.txt');
    const exists = fs.existsSync(citiesFile);
    
    this._updateState({
      sources: {
        ...this._state.sources,
        geonames: { status: 'validating', file: citiesFile, exists }
      }
    });
    
    if (!exists) {
      throw new Error(`GeoNames file not found: ${citiesFile}`);
    }
    
    const fileStats = fs.statSync(citiesFile);
    this._log('success', `✅ Found ${path.basename(citiesFile)} (${(fileStats.size / 1024 / 1024).toFixed(1)} MB)`);
    
    await this._awaitUserToProceed({ nextStageId: 'counting', detail: { file: citiesFile, fileSize: fileStats.size } });
    if (this._cancelRequested) return;

    // Stage: Counting
    this._setStage('counting');
    
    const total = await new Promise((resolve, reject) => {
      const counter = countLines(citiesFile);
      counter.on('complete', result => resolve(result.total));
      counter.on('error', reject);
    });
    
    this._updateState({ progress: { current: 0, total, percent: 0 } });
    this._log('info', `📊 Found ${total.toLocaleString()} records to import`);
    
    await this._awaitUserToProceed({ nextStageId: 'preparing', detail: { totalRecords: total } });
    if (this._cancelRequested) return;

    // Stage: Preparing
    this._setStage('preparing');
    this._log('info', '⚙️ Preparing database statements...');
    
    await this._awaitUserToProceed({ nextStageId: 'importing', detail: { batchSize: 1000 } });
    if (this._cancelRequested) return;

    // Stage: Importing
    this._setStage('importing');
    
    this._updateState({
      sources: {
        ...this._state.sources,
        geonames: { status: 'running', file: citiesFile, exists: true }
      }
    });
    
    // Create the import observable
    const import$ = importGeoNames({
      citiesFile,
      db: this._db,
      batchSize: 1000
    });
    
    // Store observable + reset controls
    this._import$ = import$;
    this._controls = null;
    this._ensureControls();
    // fnl wires stop/pause/resume on next tick
    setTimeout(() => this._ensureControls(), 0);

    // Start stall detection while running
    this._startStallTimer();
    
    await new Promise((resolve, reject) => {
      import$.on('next', progress => {
        this._ensureControls();
        this._lastProgressAt = Date.now();

        // Update state with progress
        this._updateState({
          progress: {
            current: progress.current,
            total: progress.total,
            percent: progress.percent
          },
          stall: {
            stale: false,
            lastProgressAt: this._lastProgressAt,
            msSinceProgress: 0
          },
          stats: progress.stats
        }, 'progress');
        
        // Log periodically (every 5000 records)
        if (progress.current > 0 && progress.current % 5000 === 0) {
          this._log('info', `💾 Processed ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} (${progress.percent}%)`);
        }
      });
      
      import$.on('complete', result => {
        this._stopStallTimer();
        this._log('success', `✅ Imported ${result.stats.inserted.toLocaleString()} places, ${result.stats.namesAdded.toLocaleString()} names`);
        resolve(result);
      });
      
      import$.on('error', err => {
        this._stopStallTimer();
        reject(err);
      });
      
      // Controls are wired by fnl on the observable instance (next tick).
    });

    this._import$ = null;
    this._controls = null;
    
    await this._awaitUserToProceed({ nextStageId: 'indexing', detail: { imported: true } });
    if (this._cancelRequested) return;

    // Stage: Indexing
    this._setStage('indexing');
    this._log('info', '🗂️ Building database indexes...');
    
    this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_place_names_normalized ON place_names(normalized);
      CREATE INDEX IF NOT EXISTS idx_place_names_place ON place_names(place_id);
      CREATE INDEX IF NOT EXISTS idx_places_country ON places(country_code);
      CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
    `);
    
    this._log('success', '✅ Indexes created');
    
    await this._awaitUserToProceed({ nextStageId: 'verifying', detail: { indexesCreated: true } });
    if (this._cancelRequested) return;

    // Stage: Verifying
    this._setStage('verifying');
    this._log('info', '🔍 Verifying coverage...');
    
    const counts = this._db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM places WHERE source = 'geonames') as places,
        (SELECT COUNT(*) FROM place_names WHERE source = 'geonames') as names
    `).get();
    
    this._log('success', `✅ Verified: ${counts.places.toLocaleString()} places, ${counts.names.toLocaleString()} names`);
    
    // Test some cities
    const testCities = ['london', 'paris', 'tokyo', 'new york', 'sydney'];
    for (const city of testCities) {
      const result = this._db.prepare(`
        SELECT p.id, pn.name, p.country_code
        FROM places p
        JOIN place_names pn ON pn.place_id = p.id
        WHERE pn.normalized LIKE ?
        LIMIT 1
      `).get(`${city}%`);
      
      if (result) {
        this._log('info', `  ✓ Found ${result.name} (${result.country_code})`);
      }
    }
    
    await this._awaitUserToProceed({ nextStageId: 'complete', detail: { counts } });
    if (this._cancelRequested) return;

    // Complete
    this._setStage('complete');
    this._updateState({
      sources: {
        ...this._state.sources,
        geonames: { status: 'complete', file: citiesFile, exists: true }
      },
      elapsed: Date.now() - this._state.startedAt
    });
    
    this._log('success', `🎉 Import complete in ${((Date.now() - this._state.startedAt) / 1000).toFixed(1)}s`);
    this._emitEvent('import-complete', { counts });
  }

  async _awaitUserToProceed({ nextStageId, detail } = {}) {
    if (!this._stepGate.enabled) return;

    if (this._cancelRequested) return;

    const fromStageId = this._state.status;
    if (!fromStageId || fromStageId === 'awaiting') return;

    const waitPromise = this._stepGate.beginAwait({
      fromStageId,
      nextStageId: typeof nextStageId === 'string' ? nextStageId : null,
      detail
    });

    if (!waitPromise) return;

    this._setStage('awaiting');
    this._updateState({ step: this._stepGate.getState() }, 'awaiting-step');
    this._log('info', `⏭️ Awaiting user: ${fromStageId} → ${nextStageId}`);
    this._emitEvent('awaiting-step', { fromStageId, nextStageId, detail });

    try {
      await waitPromise;
    } finally {
      this._updateState({ step: this._stepGate.getState() }, 'step-state');
    }
  }

  nextStep() {
    const ok = this._stepGate.next();
    if (!ok) {
      return { ok: false, error: 'Not awaiting a step' };
    }

    this._updateState({ step: this._stepGate.getState() }, 'step-next');
    this._emitEvent('step-next', { token: this._state.step?.token });
    return { ok: true };
  }
  
  /**
   * Handle import error
   * @param {Error} err 
   */
  _handleError(err) {
    this._stopStallTimer();
    this._import$ = null;
    this._controls = null;
    this._setStage('error');
    this._updateState({ error: err.message });
    this._log('error', `❌ ${err.message}`);
    this._emitEvent('import-error', { error: err.message });
  }
  
  /**
   * Pause the import
   */
  pause() {
    if (this._state.status === 'awaiting') return;
    if (!this.isRunning()) return;

    this._ensureControls();

    // Remember which stage we paused from so resume returns there.
    this._state.pausedFrom = this._state.status;

    if (this._controls && this._controls[1]) {
      this._controls[1]();
      this._pauseRequested = false;
      this._updateState({ pausePending: false });

      this._setStage('paused');
      this._log('info', '⏸️ Import paused');
      return;
    }

    // Controls not ready yet – mark pause pending and apply as soon as they exist.
    this._pauseRequested = true;
    this._updateState({ pausePending: true }, 'state-change');
    this._log('info', '⏳ Pause requested (waiting for pipeline controls to attach)');
  }
  
  /**
   * Resume the import
   */
  resume() {
    if (this._state.status !== 'paused') return;

    this._ensureControls();

    if (this._controls && this._controls[2]) {
      this._controls[2]();
    } else {
      this._log('warning', '⚠️ Resume requested, but resume control not available');
    }

    this._pauseRequested = false;
    this._updateState({ pausePending: false }, 'state-change');

    const resumeStage = this._state.pausedFrom && typeof this._state.pausedFrom === 'string'
      ? this._state.pausedFrom
      : 'importing';
    this._state.pausedFrom = null;
    
    this._setStage(resumeStage);
    this._log('info', '▶️ Import resumed');
  }
  
  /**
   * Cancel the import
   */
  cancel() {
    if (!this.isRunning() && this._state.status !== 'paused' && this._state.status !== 'awaiting') return;

    this._cancelRequested = true;
    this._stepGate.next();

    this._ensureControls();

    if (this._controls && this._controls[0]) {
      this._controls[0]();
    } else {
      this._log('warning', '⚠️ Cancel requested, but stop control not available');
    }

    this._stopStallTimer();
    this._import$ = null;
    this._controls = null;
    
    this._setStage('cancelled');
    this._log('warning', '🛑 Import cancelled');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  GeoImportStateManager,
  IMPORT_STAGES,
  getStage
};
