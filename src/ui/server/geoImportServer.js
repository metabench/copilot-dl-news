'use strict';

/**
 * @server Geo Import Dashboard
 * @description Provides a dashboard for managing and monitoring geographical data imports.
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

const jsgui = require('jsgui3-html');
const { GeoImportDashboard } = require('../controls/GeoImportDashboard');
const { DatabaseSelector } = require('../controls/DatabaseSelector');
const { GeoImportStateManager, IMPORT_STAGES } = require('../../services/GeoImportStateManager');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PORT = 4900;
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ─────────────────────────────────────────────────────────────────────────────
// Database Access
// ─────────────────────────────────────────────────────────────────────────────

const { 
  createGazetteerDatabase, 
  getDefaultGazetteerPath,
  initializeGazetteerSchema
} = require('../../db/sqlite/gazetteer/v1');

/**
 * Open or create a standalone gazetteer database
 * @param {string} dbPath 
 * @param {Object} options
 * @param {boolean} options.standalone - If true, creates isolated gazetteer.db
 * @returns {Object} { db, gazetteer }
 */
function openDatabase(dbPath, options = {}) {
  const Database = require('better-sqlite3');
  
  if (options.standalone) {
    // Create standalone gazetteer database with GazetteerDatabase wrapper
    const gazetteer = createGazetteerDatabase(dbPath, { verbose: true });
    return { db: gazetteer.db, gazetteer };
  }
  
  // Standard mode - open existing database
  const db = new Database(dbPath);
  // Ensure gazetteer schema exists
  initializeGazetteerSchema(db, { verbose: true });
  return { db, gazetteer: null };
}

function getDefaultDbPath(standalone = false) {
  if (standalone) {
    return path.join(PROJECT_ROOT, 'data', 'gazetteer-standalone.db');
  }
  return path.join(PROJECT_ROOT, 'data', 'gazetteer.db');
}

/**
 * List all .db files in the data directory that appear to be gazetteer databases
 * @param {string} projectRoot
 * @returns {Array<Object>}
 */
function listGazetteerDatabases(projectRoot) {
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
    const stats = fs.statSync(filePath);
    
    // Skip if it's a directory or WAL/SHM file
    if (stats.isDirectory()) continue;
    if (file.endsWith('-wal') || file.endsWith('-shm')) continue;
    
    // Check if it contains gazetteer tables
    const dbInfo = getBasicDbInfo(filePath);
    if (!dbInfo.hasGazetteerTables) continue;
    
    databases.push({
      path: filePath,
      relativePath: `data/${file}`,
      name: file,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      places: dbInfo.places,
      names: dbInfo.names,
      isDefault: filePath === defaultPath,
      sources: dbInfo.sources
    });
  }
  
  // Sort: default first, then by name
  databases.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return databases;
}

/**
 * Get basic info from a database (quick check)
 * @param {string} dbPath
 * @returns {Object}
 */
function getBasicDbInfo(dbPath) {
  const Database = require('better-sqlite3');
  let db;
  
  try {
    db = new Database(dbPath, { readonly: true });
    
    // Check if it has places table
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('places', 'place_names')"
    ).all();
    
    if (tables.length === 0) {
      return { hasGazetteerTables: false, places: 0, names: 0, sources: [] };
    }
    
    // Count places and names
    let places = 0, names = 0, sources = [];
    
    try {
      places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
    } catch (e) { /* table might not exist */ }
    
    try {
      names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
    } catch (e) { /* table might not exist */ }
    
    try {
      sources = db.prepare('SELECT DISTINCT source FROM places WHERE source IS NOT NULL').all()
        .map(r => r.source);
    } catch (e) { /* table might not exist */ }
    
    return { hasGazetteerTables: true, places, names, sources };
  } catch (err) {
    return { hasGazetteerTables: false, places: 0, names: 0, sources: [], error: err.message };
  } finally {
    if (db) db.close();
  }
}

/**
 * Get detailed stats for a database
 * @param {string} dbPath
 * @returns {Object}
 */
function getDatabaseStats(dbPath) {
  const Database = require('better-sqlite3');
  let db;
  
  try {
    db = new Database(dbPath, { readonly: true });
    const stats = fs.statSync(dbPath);
    
    let places = 0, names = 0, bySource = [], byKind = [], lastImport = null;
    
    try {
      places = db.prepare('SELECT COUNT(*) as count FROM places').get()?.count || 0;
    } catch (e) { /* ignore */ }
    
    try {
      names = db.prepare('SELECT COUNT(*) as count FROM place_names').get()?.count || 0;
    } catch (e) { /* ignore */ }
    
    try {
      bySource = db.prepare('SELECT source, COUNT(*) as count FROM places GROUP BY source').all();
    } catch (e) { /* ignore */ }
    
    try {
      byKind = db.prepare('SELECT kind, COUNT(*) as count FROM places GROUP BY kind ORDER BY count DESC LIMIT 10').all();
    } catch (e) { /* ignore */ }
    
    try {
      const lastRun = db.prepare('SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1').get();
      if (lastRun) {
        lastImport = {
          source: lastRun.source,
          date: lastRun.started_at,
          status: lastRun.status,
          recordsInserted: lastRun.records_inserted
        };
      }
    } catch (e) { /* ignore */ }
    
    return {
      places,
      names,
      bySource,
      byKind,
      lastImport,
      size: stats.size,
      modified: stats.mtime.toISOString()
    };
  } catch (err) {
    return { error: err.message, places: 0, names: 0 };
  } finally {
    if (db) db.close();
  }
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
  
  // Start import
  app.post('/api/geo-import/start', async (req, res) => {
    try {
      const { source = 'geonames' } = req.body || {};
      
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
      stateManager.startImport({ source }).catch(err => {
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
   * List available gazetteer databases in the data directory
   */
  app.get('/api/databases', (req, res) => {
    try {
      const databases = listGazetteerDatabases(PROJECT_ROOT);
      res.json({ 
        databases,
        current: dbPath,
        dataDir: path.join(PROJECT_ROOT, 'data')
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
        ...stats
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
            status: 'pending',
            description: 'SPARQL queries for metadata enrichment'
          },
          osm: {
            id: 'osm',
            name: 'OpenStreetMap',
            emoji: '🗺️',
            status: 'pending',
            description: 'Local PostGIS database for boundaries'
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
    
    const html = renderPage(dbSelector, dashboard, context, { dbPath, currentDbStats });
    res.send(html);
  });
  
  // Serve static client bundle
  app.use('/assets', express.static(path.join(PROJECT_ROOT, 'public', 'assets')));
  
  return { app, stateManager, db, gazetteer };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderPage(dbSelector, dashboard, context, dbInfo = {}) {
  const dbSelectorHtml = dbSelector.all_html_render();
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
    ${dbSelectorHtml}
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

// Main
if (require.main === module) {
  const options = parseArgs();
  
  if (options.stop || options.status) {
    // Handle stop/status via PID file
    const pidFile = path.join(PROJECT_ROOT, 'tmp', 'geo-import-server.pid');
    
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
