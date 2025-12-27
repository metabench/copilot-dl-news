'use strict';

/**
 * @server Geo Import Dashboard
 * @description Provides a dashboard for managing and monitoring geographical data imports.
 * @ui true
 * @port 4850
 */

/**
 * geoImportServer.js - Express server for Geo Import Dashboard
 * 
 * Provides:
 * - SSE endpoint for real-time import progress
 * - REST API for import control (start/pause/resume/cancel)
 * - Dashboard page rendering with jsgui3
 * 
 * @example
 *   node src/ui/server/geoImportServer.js --port 4900
 *   node src/ui/server/geoImportServer.js --detached
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const jsgui = require('jsgui3-html');
const { GeoImportDashboard } = require('../controls/GeoImportDashboard');
const { DatabaseSelector } = require('../controls/DatabaseSelector');
const { GeoImportStateManager, IMPORT_STAGES } = require('../../services/GeoImportStateManager');
const {
  getBasicDbInfo,
  getDatabaseStats
} = require('../../db/sqlite/tools/databaseIntrospection');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 4900;
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Database Listing Cache (avoids slow re-scanning on every request)
// ─────────────────────────────────────────────────────────────────────────────

const DB_CACHE_TTL_MS = 30000; // 30 seconds
let _dbListCache = null;
let _dbListCacheTime = 0;

function invalidateDbCache() {
  _dbListCache = null;
  _dbListCacheTime = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Access
// ─────────────────────────────────────────────────────────────────────────────

const { 
  createGazetteerDatabase, 
  getDefaultGazetteerPath,
} = require('../../db/sqlite/gazetteer/v1');

/**
 * Open or create a standalone gazetteer database
 * @param {string} dbPath 
 * @param {Object} options
 * @param {boolean} options.standalone - If true, creates isolated gazetteer.db
 * @returns {Object} { db, gazetteer }
 */
function openDatabase(dbPath, options = {}) {
  // Always open via the gazetteer adapter (in src/db) to keep UI code free of
  // direct sqlite driver usage. The adapter accepts either a path or a handle.
  const gazetteer = createGazetteerDatabase(dbPath, { verbose: true });
  return { db: gazetteer.db, gazetteer };
}

function getDefaultDbPath(standalone = false) {
  if (standalone) {
    return path.join(PROJECT_ROOT, 'data', 'gazetteer-standalone.db');
  }
  return path.join(PROJECT_ROOT, 'data', 'gazetteer.db');
}

// ─────────────────────────────────────────────────────────────────────────────
// Database listing cache (avoids slow re-scan on every page load)
// ─────────────────────────────────────────────────────────────────────────────
const dbListCache = {
  data: null,
  timestamp: 0,
  TTL: 30000  // 30 seconds cache
};

/**
 * List ALL .db files in the data directory
 * Shows all databases so user can add gazetteer features to any of them
 * Uses caching to avoid slow re-scans on every page load
 * 
 * @param {string} projectRoot
 * @param {Object} options
 * @param {boolean} options.forceRefresh - Bypass cache
 * @returns {Array<Object>}
 */
function listGazetteerDatabases(projectRoot, options = {}) {
  const now = Date.now();
  
  // Return cached data if fresh
  if (!options.forceRefresh && dbListCache.data && (now - dbListCache.timestamp) < dbListCache.TTL) {
    return dbListCache.data;
  }
  
  const dataDir = path.join(projectRoot, 'data');
  const databases = [];
  const defaultPath = getDefaultDbPath();
  
  if (!fs.existsSync(dataDir)) {
    return databases;
  }
  
  const files = fs.readdirSync(dataDir);
  
  for (const file of files) {
    if (!file.endsWith('.db')) continue;
    
    const filePath = path.join(dataDir, file);
    
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (e) {
      continue; // Skip files we can't stat
    }
    
    // Skip if it's a directory or WAL/SHM file
    if (stats.isDirectory()) continue;
    if (file.endsWith('-wal') || file.endsWith('-shm')) continue;
    
    // Get database info (uses fast queries)
    const dbInfo = getBasicDbInfo(filePath);
    
    databases.push({
      path: filePath,
      relativePath: `data/${file}`,
      name: file,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      places: dbInfo.places,
      names: dbInfo.names,
      hasGazetteerTables: dbInfo.hasGazetteerTables,
      isDefault: filePath === defaultPath,
      sources: dbInfo.sources
    });
  }
  
  // Sort: default first, then gazetteer DBs, then by name
  databases.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    if (a.hasGazetteerTables && !b.hasGazetteerTables) return -1;
    if (!a.hasGazetteerTables && b.hasGazetteerTables) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Update cache
  dbListCache.data = databases;
  dbListCache.timestamp = now;
  
  return databases;
}

/**
 * Invalidate database list cache (call after creating/deleting databases)
 */
function invalidateDbListCache() {
  dbListCache.data = null;
  dbListCache.timestamp = 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// Server Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the Express app with all routes
 * @param {Object} options
 * @param {Object} [options.db] - Database instance (if not standalone)
 * @param {Object} [options.gazetteer] - GazetteerDatabase instance (if standalone)
 * @param {string} [options.dbPath] - Path to database
 * @param {boolean} [options.standalone] - If true, uses standalone gazetteer.db
 * @param {string} options.dataDir - GeoNames data directory
 * @returns {Object} { app, stateManager, gazetteer }
 */
function createServer(options = {}) {
  const app = express();
  
  // Parse JSON bodies
  app.use(express.json());
  
  // Database - support standalone mode
  const standalone = options.standalone || false;
  const dbPath = options.dbPath || getDefaultDbPath(standalone);
  
  let db, gazetteer;
  
  if (options.db) {
    db = options.db;
    gazetteer = options.gazetteer;
  } else {
    const opened = openDatabase(dbPath, { standalone });
    db = opened.db;
    gazetteer = opened.gazetteer;
  }
  
  const dataDir = options.dataDir || path.join(PROJECT_ROOT, 'data', 'geonames');
  
  // State manager (singleton for this server instance)
  const stateManager = new GeoImportStateManager({ db, dataDir });
  
  // SSE clients
  const sseClients = new Set();
  
  // ─────────────────────────────────────────────────────────────────────────
  // SSE Endpoint
  // ─────────────────────────────────────────────────────────────────────────
  
  app.get('/api/geo-import/events', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    
    // Send initial state
    const initialState = stateManager.getState();
    res.write(`event: init\ndata: ${JSON.stringify({ state: initialState, stages: IMPORT_STAGES })}\n\n`);
    
    // Track this client
    sseClients.add(res);
    
    // Forward events to this client
    const eventHandler = (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    stateManager.on('event', eventHandler);
    
    // Heartbeat
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);
    
    // Cleanup on disconnect
    req.on('close', () => {
      sseClients.delete(res);
      stateManager.off('event', eventHandler);
      clearInterval(heartbeat);
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // REST API
  // ─────────────────────────────────────────────────────────────────────────
  
  // Get current state
  app.get('/api/geo-import/state', (req, res) => {
    res.json({
      state: stateManager.getState(),
      stages: IMPORT_STAGES
    });
  });
  
  // Preflight check - verify prerequisites before import
  app.get('/api/geo-import/preflight', (req, res) => {
    const check = stateManager.checkGeoNamesReady();
    res.json(check);
  });

  // Plan preview (dry-run) - explain what would happen without running the import
  app.get('/api/geo-import/plan', async (req, res) => {
    try {
      const source = typeof req.query.source === 'string' ? req.query.source : 'geonames';
      const detail = req.query.detail === 'fast' ? 'fast' : 'full';
      const plan = await stateManager.getPlan({ source, detail });
      res.json({ ok: true, plan });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });
  
  // Start import
  app.post('/api/geo-import/start', async (req, res) => {
    try {
      const { source = 'geonames', stepMode = false } = req.body || {};
      
      if (!stateManager.canStart()) {
        return res.status(400).json({
          error: `Cannot start: import is ${stateManager.getState().status}`
        });
      }
      
      // Check prerequisites first
      if (source === 'geonames') {
        const check = stateManager.checkGeoNamesReady();
        if (!check.ready) {
          return res.status(400).json({
            error: check.error,
            downloadUrl: check.downloadUrl,
            instructions: check.instructions,
            file: check.file
          });
        }
      }
      
      // Start asynchronously (don't await)
      stateManager.startImport({ source, stepMode: !!stepMode }).catch(err => {
        console.error('[GeoImportServer] Import error:', err);
      });
      
      res.json({ success: true, message: 'Import started' });
    } catch (err) {
      res.status(500).json({ 
        error: err.message,
        downloadUrl: err.downloadUrl,
        instructions: err.instructions
      });
    }
  });

  // Step-by-step: advance to next stage when awaiting user input
  app.post('/api/geo-import/next', (req, res) => {
    const result = stateManager.nextStep();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  });
  
  // Pause import
  app.post('/api/geo-import/pause', (req, res) => {
    stateManager.pause();
    res.json({ success: true, message: 'Import paused' });
  });
  
  // Resume import
  app.post('/api/geo-import/resume', (req, res) => {
    stateManager.resume();
    res.json({ success: true, message: 'Import resumed' });
  });
  
  // Cancel import
  app.post('/api/geo-import/cancel', (req, res) => {
    stateManager.cancel();
    res.json({ success: true, message: 'Import cancelled' });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Database Management API
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * List available databases in the data directory
   * Supports ?refresh=true to bypass cache
   */
  app.get('/api/databases', (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const databases = listGazetteerDatabases(PROJECT_ROOT, { forceRefresh });
      res.json({ 
        databases,
        current: dbPath,
        dataDir: path.join(PROJECT_ROOT, 'data'),
        cached: !forceRefresh && dbListCache.data !== null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  /**
   * Get stats for a specific database
   */
  app.get('/api/databases/stats', (req, res) => {
    try {
      const targetPath = req.query.path || dbPath;
      const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(PROJECT_ROOT, targetPath);
      
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Database not found', path: fullPath });
      }
      
      const stats = getDatabaseStats(fullPath);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  /**
   * Create a new gazetteer database
   */
  app.post('/api/databases/create', (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Database name is required' });
      }
      
      // Sanitize name and ensure .db extension
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
      const dbName = safeName.endsWith('.db') ? safeName : `${safeName}.db`;
      const newDbPath = path.join(PROJECT_ROOT, 'data', dbName);
      
      if (fs.existsSync(newDbPath)) {
        return res.status(400).json({ error: 'Database already exists', path: newDbPath });
      }
      
      // Create the new database with gazetteer schema
      const newGazetteer = createGazetteerDatabase(newDbPath, { verbose: true });
      newGazetteer.close();
      
      // Invalidate cache so new DB shows up
      invalidateDbListCache();
      
      res.json({ 
        success: true, 
        path: newDbPath,
        name: dbName,
        message: `Created new database: ${dbName}`
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  /**
   * Switch to a different database
   */
  app.post('/api/databases/switch', (req, res) => {
    try {
      const { path: newPath } = req.body;
      if (!newPath) {
        return res.status(400).json({ error: 'Database path is required' });
      }
      
      const fullPath = path.isAbsolute(newPath) ? newPath : path.join(PROJECT_ROOT, newPath);
      
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Database not found', path: fullPath });
      }
      
      // Close current database if we own it
      if (gazetteer && gazetteer._ownDb) {
        gazetteer.close();
      } else if (db) {
        db.close();
      }
      
      // Open the new database
      const opened = openDatabase(fullPath, { standalone: true });
      db = opened.db;
      gazetteer = opened.gazetteer;
      
      // Update state manager with new db
      stateManager.setDatabase(db);
      
      // Get stats for the new database
      const stats = getDatabaseStats(fullPath);
      
      res.json({ 
        success: true, 
        path: fullPath,
        stats,
        message: `Switched to database: ${path.basename(fullPath)}`
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  /**
   * Get current database info
   */
  app.get('/api/databases/current', (req, res) => {
    try {
      const stats = getDatabaseStats(dbPath);
      res.json({
        path: dbPath,
        name: path.basename(dbPath),
        stats
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard Page
  // ─────────────────────────────────────────────────────────────────────────
  
  app.get('/', (req, res) => {
    const context = new jsgui.Page_Context();
    
    // Get active view from query param (default to 'pipeline')
    const activeView = req.query.view || 'pipeline';
    
    // Get current state for initial render
    const state = stateManager.getState();
    
    // Get database list for selector
    const databases = listGazetteerDatabases(PROJECT_ROOT);
    const currentDbStats = getDatabaseStats(dbPath);
    
    // Create database selector
    const dbSelector = new DatabaseSelector({
      context,
      databases,
      selected: dbPath,
      dataDir: path.join(PROJECT_ROOT, 'data')
    });
    
    // Create dashboard with current state
    // Get file status from state
    const geonamesSource = state.sources.geonames || {};
    const fileStatus = geonamesSource.exists ? 'ready' : 'missing';
    const fileSizeMB = geonamesSource.fileSize ? 
      (geonamesSource.fileSize / 1024 / 1024).toFixed(1) + ' MB' : 'Not found';
    
    const dashboard = new GeoImportDashboard({
      context,
      activeView,
      dbSelector,
      importState: {
        phase: state.status,
        progress: state.progress,
        currentDb: {
          path: dbPath,
          name: path.basename(dbPath),
          places: currentDbStats.places,
          names: currentDbStats.names
        },
        sources: {
          geonames: {
            id: 'geonames',
            name: 'GeoNames',
            emoji: '🌍',
            status: fileStatus,
            description: geonamesSource.exists 
              ? `cities15000.txt (${fileSizeMB}): ~25,000 cities with population >15K`
              : '⚠️ cities15000.txt not found - download required',
            stats: { 
              expected_cities: 25000, 
              processed: state.stats.processed,
              inserted: state.stats.inserted
            },
            downloadUrl: geonamesSource.downloadUrl
          },
          wikidata: {
            id: 'wikidata',
            name: 'Wikidata',
            emoji: '📚',
            status: 'coming-soon',
            description: 'SPARQL queries for Wikidata IDs, population updates, and multilingual names',
            available: false,
            comingSoon: true,
            plannedFeatures: [
              'Wikidata entity linking',
              'Population synchronization',
              'Multilingual place labels',
              'Administrative hierarchy'
            ]
          },
          osm: {
            id: 'osm',
            name: 'OpenStreetMap',
            emoji: '🗺️',
            status: 'coming-soon',
            description: 'Local PostGIS database for boundaries and precise geometries',
            available: false,
            comingSoon: true,
            plannedFeatures: [
              'Administrative boundaries',
              'Place polygons',
              'Coastline data',
              'POI enrichment'
            ]
          }
        },
        logs: state.logs,
        totals: {
          places_before: currentDbStats.places || 0,
          places_after: state.stats.inserted,
          names_before: currentDbStats.names || 0,
          names_after: state.stats.namesAdded
        }
      }
    });
    
    const html = renderPage(dashboard, context, { dbPath, currentDbStats });
    res.send(html);
  });
  
  // Serve static client bundle
  app.use('/assets', express.static(path.join(PROJECT_ROOT, 'public', 'assets')));
  
  return { app, stateManager, db, gazetteer };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderPage(dashboard, context, dbInfo = {}) {
  const controlHtml = dashboard.all_html_render();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🌐 Gazetteer Import Dashboard</title>
  <link rel="stylesheet" href="/assets/controls.css">
</head>
<body>
  <div class="page-container">
    ${controlHtml}
  </div>
  <script>
    // Initial database info
    window.__currentDb = ${JSON.stringify(dbInfo)};
  </script>
  <script src="/assets/geo-import.js"></script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

// Styles are now loaded from src/ui/server/geoImport/styles.css via /assets/controls.css

// ─────────────────────────────────────────────────────────────────────────────
// Client Script
// ─────────────────────────────────────────────────────────────────────────────

// Client script is now loaded from src/ui/client/geoImport/index.js via /assets/geo-import.js

// ─────────────────────────────────────────────────────────────────────────────
// CLI Entry Point
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: DEFAULT_PORT,
    detached: false,
    stop: false,
    status: false,
    dbPath: null,
    standalone: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        options.port = parseInt(args[++i], 10) || DEFAULT_PORT;
        break;
      case '--detached':
      case '-d':
        options.detached = true;
        break;
      case '--stop':
        options.stop = true;
        break;
      case '--status':
        options.status = true;
        break;
      case '--db':
        options.dbPath = args[++i];
        break;
      case '--standalone':
      case '-s':
        options.standalone = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Geo Import Dashboard Server

Usage:
  node geoImportServer.js [options]

Options:
  --port, -p <port>  Port number (default: ${DEFAULT_PORT})
  --standalone, -s   Use standalone gazetteer.db (isolated from news.db)
  --db <path>        Custom database path
  --detached, -d     Run in background
  --stop             Stop background server
  --status           Check server status
  --help, -h         Show help

Standalone Mode:
  When --standalone is specified, the server creates and uses a completely
  isolated gazetteer database at data/gazetteer-standalone.db. This is useful
  for testing the import process without affecting the production news.db.

Examples:
  # Development: standalone gazetteer database
  node geoImportServer.js --standalone --port 4900

  # Production: use existing news.db gazetteer tables  
  node geoImportServer.js --db data/news.db --port 4900
`);
        process.exit(0);
    }
  }
  
  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detached Process Spawning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spawn server as detached background process
 */
function spawnDetached(options) {
  const scriptPath = __filename;
  const childArgs = [scriptPath, '--port', String(options.port)];
  
  if (options.standalone) childArgs.push('--standalone');
  if (options.dbPath) childArgs.push('--db', options.dbPath);
  
  // Spawn detached process with stdio ignored
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env, GEO_IMPORT_DETACHED: '1' }
  });
  
  // Write PID to file for later stop command
  const pidDir = path.join(PROJECT_ROOT, 'tmp');
  if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
  fs.writeFileSync(path.join(pidDir, 'geo-import-server.pid'), String(child.pid), 'utf-8');
  
  // Unref so parent can exit
  child.unref();
  
  const modeLabel = options.standalone ? '🧪 STANDALONE' : '🔗 INTEGRATED';
  console.log(`🌐 Geo Import Dashboard started in background (PID: ${child.pid})`);
  console.log(`   URL: http://localhost:${options.port}`);
  console.log(`   Mode: ${modeLabel}`);
  console.log(`   Stop with: node ${path.relative(process.cwd(), scriptPath)} --stop`);
}

// Main
if (require.main === module) {
  const options = parseArgs();
  
  // Handle stop/status via PID file
  const pidFile = path.join(PROJECT_ROOT, 'tmp', 'geo-import-server.pid');
  
  if (options.stop || options.status) {
    
    if (options.status) {
      if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf8').trim();
        console.log(`✅ Server running (PID: ${pid})`);
      } else {
        console.log('❌ Server not running');
      }
      process.exit(0);
    }
    
    if (options.stop) {
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        try {
          process.kill(pid);
          fs.unlinkSync(pidFile);
          console.log(`✅ Stopped server (PID: ${pid})`);
        } catch (err) {
          console.log(`⚠️ Could not stop server: ${err.message}`);
          fs.unlinkSync(pidFile);
        }
      } else {
        console.log('❌ Server not running');
      }
      process.exit(0);
    }
  }
  
  // Handle --detached flag: spawn background process and exit
  if (options.detached) {
    spawnDetached(options);
    process.exit(0);
  }
  
  // Start server
  const { app, stateManager, gazetteer } = createServer({ 
    dbPath: options.dbPath,
    standalone: options.standalone
  });
  
  const server = app.listen(options.port, () => {
    const modeLabel = options.standalone ? '🧪 STANDALONE' : '🔗 INTEGRATED';
    console.log(`🌐 Geo Import Dashboard: http://localhost:${options.port}`);
    console.log(`   Mode: ${modeLabel}`);
    if (options.standalone) {
      console.log(`   Database: ${options.dbPath || getDefaultDbPath(true)}`);
    }
    
    // Write PID file
    const pidDir = path.join(PROJECT_ROOT, 'tmp');
    if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(path.join(pidDir, 'geo-import-server.pid'), String(process.pid));
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    server.close();
    process.exit(0);
  });
}

module.exports = { createServer, renderPage };
