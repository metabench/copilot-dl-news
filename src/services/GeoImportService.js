'use strict';

/**
 * GeoImportService - Observable-powered geographic data import
 * 
 * Uses fnl observables for reactive progress tracking and stage management.
 * Each import phase emits progress events that the UI can subscribe to.
 * 
 * @example
 * const { importGeoNames } = require('./GeoImportService');
 * 
 * const import$ = importGeoNames({ citiesFile: 'data/geonames/cities15000.txt' });
 * 
 * import$.on('next', progress => {
 *   console.log(`${progress.phase}: ${progress.current}/${progress.total}`);
 * });
 * 
 * import$.on('stage', evt => {
 *   console.log(`Stage ${evt.stage_name} at ${evt.ms}ms`);
 * });
 * 
 * import$.on('complete', result => {
 *   console.log(`Done: ${result.inserted} places inserted`);
 * });
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const fnl = require('fnl');
const { observable, stages } = fnl;

// ─────────────────────────────────────────────────────────────────────────────
// GeoNames Column Mapping
// ─────────────────────────────────────────────────────────────────────────────

const GEONAMES_COLUMNS = {
  geonameid: 0,
  name: 1,
  asciiname: 2,
  alternatenames: 3,
  latitude: 4,
  longitude: 5,
  feature_class: 6,
  feature_code: 7,
  country_code: 8,
  cc2: 9,
  admin1_code: 10,
  admin2_code: 11,
  admin3_code: 12,
  admin4_code: 13,
  population: 14,
  elevation: 15,
  dem: 16,
  timezone: 17,
  modification_date: 18
};

const FEATURE_CODE_MAP = {
  'PPLC': 'capital',
  'PPLA': 'admin_capital',
  'PPLA2': 'admin2_capital',
  'PPL': 'city',
  'PPLX': 'section',
  'PPLL': 'village'
};

const ALTERNATE_NAMES_COLUMNS = {
  alternateNameId: 0,
  geonameid: 1,
  isolanguage: 2,
  alternateName: 3,
  isPreferredName: 4,
  isShortName: 5,
  isColloquial: 6,
  isHistoric: 7,
  from: 8,
  to: 9
};

// ─────────────────────────────────────────────────────────────────────────────
// File Counting Observable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count lines in a file (for progress calculation)
 * @param {string} filePath 
 * @returns {Observable} Emits { total: number }
 */
function countLines(filePath) {
  return observable((next, complete, error) => {
    let count = 0;
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', chunk => {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 10) count++; // newline
      }
    });
    
    stream.on('end', () => {
      next({ total: count });
      complete({ total: count });
    });
    
    stream.on('error', err => error(err));
    
    return [
      () => stream.destroy(),  // stop
      () => stream.pause(),    // pause
      () => stream.resume()    // resume
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoNames Import Observable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Import cities from GeoNames file
 * 
 * Emits progress events: { phase, current, total, message, stats }
 * 
 * @param {Object} options
 * @param {string} options.citiesFile - Path to cities15000.txt
 * @param {Object} options.db - better-sqlite3 database instance
 * @param {number} [options.batchSize=1000] - Records per batch
 * @param {number} [options.maxAltNames=20] - Max alternate names per place
 * @returns {Observable}
 */
function importGeoNames(options) {
  const { citiesFile, db, batchSize = 1000, maxAltNames = 20 } = options;
  
  return observable((next, complete, error, status, log) => {
    let stopped = false;
    let paused = false;
    let pauseResolve = null;
    
    const checkPaused = () => {
      if (paused) {
        return new Promise(resolve => { pauseResolve = resolve; });
      }
      return Promise.resolve();
    };
    
    const stats = {
      processed: 0,
      inserted: 0,
      skipped: 0,
      namesAdded: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    // Progress emission helper
    const emitProgress = (phase, message, extra = {}) => {
      next({
        phase,
        message,
        current: stats.processed,
        total: stats.total || 0,
        percent: stats.total ? Math.round((stats.processed / stats.total) * 100) : 0,
        stats: { ...stats },
        elapsed: Date.now() - stats.startTime,
        ...extra
      });
    };
    
    // Main import logic
    (async () => {
      try {
        // Phase 1: Validate file
        emitProgress('validating', `Checking ${path.basename(citiesFile)}...`);
        
        if (!fs.existsSync(citiesFile)) {
          throw new Error(`File not found: ${citiesFile}`);
        }
        
        const fileStats = fs.statSync(citiesFile);
        emitProgress('validating', `File size: ${(fileStats.size / 1024 / 1024).toFixed(1)} MB`);
        
        // Phase 2: Count lines
        emitProgress('counting', 'Counting records...');
        
        const countResult = await new Promise((resolve, reject) => {
          const counter = countLines(citiesFile);
          counter.on('complete', resolve);
          counter.on('error', reject);
        });
        
        stats.total = countResult.total;
        emitProgress('counting', `Found ${stats.total.toLocaleString()} records`);
        
        // Phase 3: Prepare statements
        emitProgress('preparing', 'Preparing database statements...');
        
        const stmts = {
          insertPlace: db.prepare(`
            INSERT INTO places (kind, country_code, population, lat, lng, source, adm1_code, timezone)
            VALUES (?, ?, ?, ?, ?, 'geonames', ?, ?)
          `),
          insertName: db.prepare(`
            INSERT INTO place_names (place_id, name, normalized, lang, name_kind, is_preferred, source)
            VALUES (?, ?, ?, ?, ?, ?, 'geonames')
          `),
          insertExternalId: db.prepare(`
            INSERT OR IGNORE INTO place_external_ids (place_id, source, ext_id)
            VALUES (?, 'geonames', ?)
          `),
          findByGeonameId: db.prepare(`
            SELECT place_id FROM place_external_ids WHERE source = 'geonames' AND ext_id = ?
          `),
          updateCanonical: db.prepare(`
            UPDATE places SET canonical_name_id = ? WHERE id = ?
          `)
        };
        
        // Phase 4: Import
        emitProgress('importing', 'Starting import...');
        
        const rl = readline.createInterface({
          input: fs.createReadStream(citiesFile),
          crlfDelay: Infinity
        });
        
        let batch = [];
        
        const processBatch = db.transaction((rows) => {
          for (const row of rows) {
            if (stopped) return;
            
            const cols = row.split('\t');
            const geonameId = cols[GEONAMES_COLUMNS.geonameid];
            
            // Check if exists
            const existing = stmts.findByGeonameId.get(geonameId);
            if (existing) {
              stats.skipped++;
              stats.processed++;
              continue;
            }
            
            const name = cols[GEONAMES_COLUMNS.name];
            const asciiName = cols[GEONAMES_COLUMNS.asciiname];
            const altNames = cols[GEONAMES_COLUMNS.alternatenames]?.split(',') || [];
            const lat = parseFloat(cols[GEONAMES_COLUMNS.latitude]);
            const lng = parseFloat(cols[GEONAMES_COLUMNS.longitude]);
            const countryCode = cols[GEONAMES_COLUMNS.country_code];
            const featureCode = cols[GEONAMES_COLUMNS.feature_code];
            const adm1Code = cols[GEONAMES_COLUMNS.admin1_code];
            const population = parseInt(cols[GEONAMES_COLUMNS.population], 10) || 0;
            const timezone = cols[GEONAMES_COLUMNS.timezone];
            
            const placeType = FEATURE_CODE_MAP[featureCode] || 'city';
            
            // Insert place
            const result = stmts.insertPlace.run(
              placeType, countryCode, population, lat, lng, adm1Code, timezone
            );
            const placeId = result.lastInsertRowid;
            
            // Insert external ID
            stmts.insertExternalId.run(placeId, geonameId);
            
            // Insert primary name
            const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const nameResult = stmts.insertName.run(placeId, name, normalized, 'und', 'official', 1);
            const canonicalNameId = nameResult.lastInsertRowid;
            stats.namesAdded++;
            
            // Update canonical name
            stmts.updateCanonical.run(canonicalNameId, placeId);
            
            // Insert ASCII name if different
            if (asciiName && asciiName !== name) {
              const asciiNorm = asciiName.toLowerCase();
              stmts.insertName.run(placeId, asciiName, asciiNorm, 'en', 'ascii', 0);
              stats.namesAdded++;
            }
            
            // Insert unique alternate names (limited)
            const uniqueAlts = [...new Set(
              altNames.filter(n => n && n !== name && n !== asciiName)
            )].slice(0, maxAltNames);
            
            for (const alt of uniqueAlts) {
              const altNorm = alt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              stmts.insertName.run(placeId, alt, altNorm, 'und', 'alternate', 0);
              stats.namesAdded++;
            }
            
            stats.inserted++;
            stats.processed++;
          }
        });
        
        for await (const line of rl) {
          if (stopped) break;
          await checkPaused();
          
          if (!line.trim()) continue;
          batch.push(line);
          
          if (batch.length >= batchSize) {
            processBatch(batch);
            emitProgress('importing', `Processed ${stats.processed.toLocaleString()} records`);
            batch = [];
          }
        }
        
        // Final batch
        if (batch.length > 0 && !stopped) {
          processBatch(batch);
        }
        
        // Phase 5: Complete
        emitProgress('complete', 'Import complete!', {
          duration: Date.now() - stats.startTime
        });
        
        complete({
          success: true,
          stats,
          duration: Date.now() - stats.startTime
        });
        
      } catch (err) {
        stats.errors++;
        emitProgress('error', err.message, { error: err });
        error(err);
      }
    })();
    
    // Return control functions
    return [
      () => { stopped = true; },  // stop
      () => { paused = true; },   // pause
      () => {                      // resume
        paused = false;
        if (pauseResolve) {
          pauseResolve();
          pauseResolve = null;
        }
      }
    ];
  });
}

/**
 * Import alternate names from GeoNames file
 * 
 * Filters to only import names for places that exist in the DB.
 * 
 * @param {Object} options
 * @param {string} options.alternateNamesFile - Path to alternateNames.txt
 * @param {Object} options.db - better-sqlite3 database instance
 * @param {number} [options.batchSize=1000] - Records per batch
 */
function importAlternateNames(options) {
  const { alternateNamesFile, db, batchSize = 1000 } = options;
  
  return observable((next, complete, error, status, log) => {
    let stopped = false;
    let paused = false;
    let pauseResolve = null;
    
    const checkPaused = () => {
      if (paused) {
        return new Promise(resolve => { pauseResolve = resolve; });
      }
      return Promise.resolve();
    };
    
    const stats = {
      processed: 0,
      inserted: 0,
      skipped: 0, // Not matching a known place
      duplicates: 0, // Hit unique constraint
      errors: 0,
      startTime: Date.now()
    };
    
    const emitProgress = (phase, message, extra = {}) => {
      next({
        phase,
        message,
        current: stats.processed,
        total: stats.total || 0, // Might be null for streaming large file
        percent: stats.total ? Math.round((stats.processed / stats.total) * 100) : 0,
        stats: { ...stats },
        elapsed: Date.now() - stats.startTime,
        ...extra
      });
    };
    
    (async () => {
      try {
        // Phase 1: Validate
        emitProgress('validating', `Checking ${path.basename(alternateNamesFile)}...`);
        if (!fs.existsSync(alternateNamesFile)) {
          throw new Error(`File not found: ${alternateNamesFile}`);
        }
        
        // Phase 2: Build Lookup Map
        emitProgress('preparing', 'Building place ID lookup map...');
        const lookupStart = Date.now();
        
        // We only want names for places we have imported (from cities15000)
        // Fetch valid geoname_ids (stored as ext_id in place_external_ids)
        const rows = db.prepare(`
          SELECT place_id, ext_id 
          FROM place_external_ids 
          WHERE source = 'geonames'
        `).all();
        
        // Map<geonameId(string), placeId(number)>
        const validPlaces = new Map();
        for (const row of rows) {
          validPlaces.set(String(row.ext_id), row.place_id);
        }
        
        emitProgress('preparing', `Loaded ${validPlaces.size.toLocaleString()} target places in ${(Date.now() - lookupStart)}ms`);
        
        // Phase 3: Prepare Statements
        const insertName = db.prepare(`
          INSERT OR IGNORE INTO place_names (place_id, name, normalized, lang, name_kind, is_preferred, source, is_official)
          VALUES (?, ?, ?, ?, ?, ?, 'geonames_alt', 0)
        `);
        
        // Phase 4: Import
        emitProgress('importing', 'Starting import of alternate names...');
        
        // Count total lines mainly for progress (optional, can be slow for huge file)
        // For alternateNames.txt (huge), maybe skip exact count or use stat size estimation?
        // Let's do a rough size estimation or just skip total if it takes too long.
        // We'll skip pre-counting for speed, or user can run separate count stage.
        // For now, let's just proceed.
        
        const rl = readline.createInterface({
          input: fs.createReadStream(alternateNamesFile),
          crlfDelay: Infinity
        });
        
        let batch = [];
        const processBatch = db.transaction((lines) => {
          for (const line of lines) {
            if (stopped) return;
            stats.processed++;
            
            const cols = line.split('\t');
            if (cols.length < 4) continue;
            
            const geonameId = cols[ALTERNATE_NAMES_COLUMNS.geonameid];
            const placeId = validPlaces.get(geonameId);
            
            if (!placeId) {
              stats.skipped++;
              continue;
            }
            
            const name = cols[ALTERNATE_NAMES_COLUMNS.alternateName];
            if (!name) continue;
            
            const lang = cols[ALTERNATE_NAMES_COLUMNS.isolanguage] || 'und';
            const isPreferred = cols[ALTERNATE_NAMES_COLUMNS.isPreferredName] === '1' ? 1 : 0;
            const isShort = cols[ALTERNATE_NAMES_COLUMNS.isShortName] === '1';
            const isColloquial = cols[ALTERNATE_NAMES_COLUMNS.isColloquial] === '1';
            const isHistoric = cols[ALTERNATE_NAMES_COLUMNS.isHistoric] === '1';
            
            let nameKind = 'alias';
            if (isHistoric) nameKind = 'historic';
            else if (isColloquial) nameKind = 'colloquial';
            else if (isShort) nameKind = 'abbrev';
            else if (lang === 'post') nameKind = 'postal_code';
            else if (['iata', 'icao', 'faac'].includes(lang)) nameKind = 'code';
            else if (lang === 'link') nameKind = 'link'; // GeoNames has wikipedia links etc
            
            // Skip links for now, we want names
            if (nameKind === 'link') continue;
            
            const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            
            const result = insertName.run(placeId, name, normalized, lang, nameKind, isPreferred);
            if (result.changes > 0) {
              stats.inserted++;
            } else {
              stats.duplicates++;
            }
          }
        });
        
        for await (const line of rl) {
          if (stopped) break;
          await checkPaused();
          
          if (!line.trim()) continue;
          batch.push(line);
          
          if (batch.length >= batchSize) {
            processBatch(batch);
            emitProgress('importing', `Processed ${stats.processed.toLocaleString()} lines`);
            batch = [];
          }
        }
        
        if (batch.length > 0 && !stopped) {
          processBatch(batch);
        }
        
        emitProgress('complete', 'Alternate names import complete!', {
          duration: Date.now() - stats.startTime
        });
        
        complete({
          success: true,
          stats,
          duration: Date.now() - stats.startTime
        });
        
      } catch (err) {
        stats.errors++;
        emitProgress('error', err.message, { error: err });
        error(err);
      }
    })();
    
    return [
      () => { stopped = true; },
      () => { paused = true; },
      () => {
        paused = false;
        if (pauseResolve) {
          pauseResolve();
          pauseResolve = null;
        }
      }
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Staged Import (Full Pipeline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full gazetteer import pipeline with stages
 * 
 * Stages: download → validate → import → index → verify
 * 
 * @param {Object} options
 * @returns {Observable} Staged observable with stage events
 */
function createImportPipeline(options) {
  const { db, dataDir = 'data/geonames' } = options;
  
  return stages((raiseStageEvent) => ({
    
    // Stage 1: Validate prerequisites
    validate: (config) => {
      raiseStageEvent('validate-start');
      
      const citiesFile = path.join(dataDir, 'cities15000.txt');
      const exists = fs.existsSync(citiesFile);
      
      raiseStageEvent('validate-complete', { exists, citiesFile });
      
      return {
        ...config,
        citiesFile,
        fileExists: exists
      };
    },
    
    // Stage 2: Import (returns observable for async handling)
    import: (prev) => {
      if (!prev.fileExists) {
        return { skipped: true, reason: 'File not found' };
      }
      
      raiseStageEvent('import-start');
      
      // This stage returns a promise that resolves when import completes
      return new Promise((resolve, reject) => {
        const import$ = importGeoNames({
          citiesFile: prev.citiesFile,
          db,
          batchSize: prev.batchSize || 1000
        });
        
        import$.on('next', progress => {
          raiseStageEvent('import-progress', progress);
        });
        
        import$.on('complete', result => {
          raiseStageEvent('import-complete', result);
          resolve(result);
        });
        
        import$.on('error', err => {
          raiseStageEvent('import-error', { error: err.message });
          reject(err);
        });
      });
    },
    
    // Stage 3: Build indexes
    index: (prev) => {
      if (prev.skipped) return prev;
      
      raiseStageEvent('index-start');
      
      // Ensure indexes exist
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_place_names_normalized ON place_names(normalized);
        CREATE INDEX IF NOT EXISTS idx_place_names_place ON place_names(place_id);
        CREATE INDEX IF NOT EXISTS idx_places_country ON places(country_code);
        CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
      `);
      
      raiseStageEvent('index-complete');
      
      return { ...prev, indexed: true };
    },
    
    // Stage 4: Verify coverage
    verify: (prev) => {
      if (prev.skipped) return prev;
      
      raiseStageEvent('verify-start');
      
      const counts = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM places WHERE source = 'geonames') as places,
          (SELECT COUNT(*) FROM place_names WHERE source = 'geonames') as names
      `).get();
      
      // Test some known cities
      const testCities = ['chicago', 'manchester', 'birmingham', 'tokyo', 'paris'];
      const found = {};
      
      for (const city of testCities) {
        const result = db.prepare(`
          SELECT p.id, pn.name 
          FROM places p
          JOIN place_names pn ON pn.place_id = p.id
          WHERE pn.normalized = ?
          LIMIT 1
        `).get(city);
        found[city] = !!result;
      }
      
      raiseStageEvent('verify-complete', { counts, testCities: found });
      
      return {
        ...prev,
        verified: true,
        counts,
        testCities: found
      };
    }
    
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress Event Types (for TypeScript-like documentation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ImportProgress
 * @property {string} phase - Current phase: 'validating'|'counting'|'preparing'|'importing'|'complete'|'error'
 * @property {string} message - Human-readable status message
 * @property {number} current - Current record number
 * @property {number} total - Total records to process
 * @property {number} percent - Progress percentage (0-100)
 * @property {ImportStats} stats - Detailed statistics
 * @property {number} elapsed - Milliseconds since start
 */

/**
 * @typedef {Object} ImportStats
 * @property {number} processed - Records processed
 * @property {number} inserted - New places inserted
 * @property {number} skipped - Duplicates skipped
 * @property {number} namesAdded - Place names added
 * @property {number} errors - Error count
 */

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  importGeoNames,
  importAlternateNames,
  createImportPipeline,
  countLines,
  GEONAMES_COLUMNS,
  ALTERNATE_NAMES_COLUMNS,
  FEATURE_CODE_MAP
};
