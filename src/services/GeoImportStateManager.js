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

// ─────────────────────────────────────────────────────────────────────────────
// Import Stages Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All stages in the gazetteer import pipeline
 */
const IMPORT_STAGES = [
  { id: 'idle', label: 'Ready', emoji: '⏸️', description: 'Waiting to start' },
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
    
    // Current state (for late-joining clients)
    this._state = {
      status: 'idle',
      stage: getStage('idle'),
      progress: { current: 0, total: 0, percent: 0 },
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
      error: null
    };
    
    // Observable control functions
    this._controls = null;
    
    // Max log entries to keep
    this._maxLogs = 200;
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
    const { source = 'geonames' } = options;
    
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
    
    // Reset state
    this._state = {
      ...this._state,
      status: 'validating',
      stage: getStage('validating'),
      progress: { current: 0, total: 0, percent: 0 },
      stats: { processed: 0, inserted: 0, skipped: 0, namesAdded: 0, errors: 0 },
      logs: [],
      startedAt: Date.now(),
      elapsed: 0,
      error: null
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
    
    // Stage: Counting
    this._setStage('counting');
    
    const total = await new Promise((resolve, reject) => {
      const counter = countLines(citiesFile);
      counter.on('complete', result => resolve(result.total));
      counter.on('error', reject);
    });
    
    this._updateState({ progress: { current: 0, total, percent: 0 } });
    this._log('info', `📊 Found ${total.toLocaleString()} records to import`);
    
    // Stage: Preparing
    this._setStage('preparing');
    this._log('info', '⚙️ Preparing database statements...');
    
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
    
    // Store control functions
    this._controls = null;
    
    await new Promise((resolve, reject) => {
      import$.on('next', progress => {
        // Update state with progress
        this._updateState({
          progress: {
            current: progress.current,
            total: progress.total,
            percent: progress.percent
          },
          stats: progress.stats
        }, 'progress');
        
        // Log periodically (every 5000 records)
        if (progress.current > 0 && progress.current % 5000 === 0) {
          this._log('info', `💾 Processed ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} (${progress.percent}%)`);
        }
      });
      
      import$.on('complete', result => {
        this._log('success', `✅ Imported ${result.stats.inserted.toLocaleString()} places, ${result.stats.namesAdded.toLocaleString()} names`);
        resolve(result);
      });
      
      import$.on('error', err => {
        reject(err);
      });
      
      // Store controls for pause/resume/cancel
      // Note: fnl observables return control functions when subscribed
    });
    
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
  
  /**
   * Handle import error
   * @param {Error} err 
   */
  _handleError(err) {
    this._setStage('error');
    this._updateState({ error: err.message });
    this._log('error', `❌ ${err.message}`);
    this._emitEvent('import-error', { error: err.message });
  }
  
  /**
   * Pause the import
   */
  pause() {
    if (!this.isRunning()) return;
    
    if (this._controls && this._controls[1]) {
      this._controls[1](); // pause function
    }
    
    this._setStage('paused');
    this._log('info', '⏸️ Import paused');
  }
  
  /**
   * Resume the import
   */
  resume() {
    if (this._state.status !== 'paused') return;
    
    if (this._controls && this._controls[2]) {
      this._controls[2](); // resume function
    }
    
    this._setStage('importing');
    this._log('info', '▶️ Import resumed');
  }
  
  /**
   * Cancel the import
   */
  cancel() {
    if (!this.isRunning() && this._state.status !== 'paused') return;
    
    if (this._controls && this._controls[0]) {
      this._controls[0](); // stop function
    }
    
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
