'use strict';

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
  const css = getStyles();
  const dbSelectorStyles = DatabaseSelector.getStyles();
  const clientScript = getClientScript();
  const dbSelectorHtml = dbSelector.all_html_render();
  const controlHtml = dashboard.all_html_render();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🌐 Gazetteer Import Dashboard</title>
  <style>${css}</style>
  <style>${dbSelectorStyles}</style>
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
  <script>${clientScript}</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

function getStyles() {
  return `
    :root {
      --bg-color: #0d1117;
      --surface-color: #161b22;
      --border-color: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --accent-color: #58a6ff;
      --success-color: #3fb950;
      --warning-color: #d29922;
      --error-color: #f85149;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 20px;
    }
    
    .geo-import-dashboard {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .dashboard-header {
      text-align: center;
      margin-bottom: 30px;
    }
    
    .dashboard-header h1 {
      font-size: 2rem;
      margin-bottom: 8px;
    }
    
    .subtitle {
      color: var(--text-secondary);
    }
    
    /* Sections */
    section {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    section h2 {
      font-size: 1.25rem;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    /* Progress Section */
    .progress-content {
      display: flex;
      align-items: center;
      gap: 30px;
    }
    
    .progress-ring-container {
      position: relative;
      width: 140px;
      height: 140px;
    }
    
    .progress-ring {
      transform: rotate(-90deg);
    }
    
    .progress-ring-circle {
      transition: stroke-dashoffset 0.3s ease;
    }
    
    .progress-ring-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 1.5rem;
      font-weight: bold;
    }
    
    .progress-stats {
      flex: 1;
    }
    
    .progress-stat {
      font-size: 1.25rem;
      margin-bottom: 8px;
    }
    
    .stat-value { font-weight: bold; color: var(--accent-color); }
    .stat-total { color: var(--text-secondary); }
    
    .progress-phase {
      color: var(--text-secondary);
    }
    
    /* Sources Grid */
    .sources-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    
    .geo-source-card {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }
    
    .source-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .source-emoji { font-size: 1.5rem; }
    .source-name { font-weight: 600; flex: 1; }
    
    .status-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .status-ready { background: rgba(59, 185, 80, 0.2); color: var(--success-color); }
    .status-running { background: rgba(88, 166, 255, 0.2); color: var(--accent-color); }
    .status-complete { background: rgba(59, 185, 80, 0.2); color: var(--success-color); }
    .status-error { background: rgba(248, 81, 73, 0.2); color: var(--error-color); }
    .status-missing { background: rgba(210, 153, 34, 0.2); color: var(--warning-color); }
    .status-pending { background: rgba(139, 148, 158, 0.2); color: var(--text-secondary); }
    .status-idle { background: rgba(139, 148, 158, 0.2); color: var(--text-secondary); }
    
    .source-description {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 12px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    
    .stat-item {
      display: flex;
      flex-direction: column;
    }
    
    .stat-item .stat-value {
      font-size: 1.25rem;
      font-weight: bold;
    }
    
    .stat-item .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    /* Coverage Grid */
    .coverage-grid {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 30px;
    }
    
    .coverage-column {
      text-align: center;
    }
    
    .coverage-column h3 {
      margin-bottom: 12px;
      color: var(--text-secondary);
    }
    
    .coverage-item {
      margin-bottom: 8px;
    }
    
    .coverage-value {
      display: block;
      font-size: 1.5rem;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .coverage-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    
    .coverage-before .coverage-value { color: var(--text-secondary); }
    .coverage-after .coverage-value { color: var(--success-color); }
    
    .coverage-arrow {
      font-size: 2rem;
    }
    
    /* Live Log */
    .live-log {
      max-height: 300px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .log-header {
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .log-body {
      flex: 1;
      overflow-y: auto;
      font-family: 'Fira Code', 'Consolas', monospace;
      font-size: 0.8rem;
    }
    
    .log-entry {
      padding: 4px 8px;
      border-radius: 4px;
      margin-bottom: 2px;
    }
    
    .log-entry:nth-child(odd) {
      background: rgba(255, 255, 255, 0.02);
    }
    
    .log-timestamp {
      color: var(--text-secondary);
      margin-right: 12px;
    }
    
    .log-info .log-message { color: var(--text-primary); }
    .log-success .log-message { color: var(--success-color); }
    .log-warning .log-message { color: var(--warning-color); }
    .log-error .log-message { color: var(--error-color); }
    
    /* Action Buttons */
    .actions-section {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    
    .action-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-primary {
      background: var(--success-color);
      color: white;
    }
    
    .btn-primary:hover:not(:disabled) {
      background: #2ea043;
    }
    
    .btn-secondary {
      background: var(--border-color);
      color: var(--text-primary);
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: #484f58;
    }
    
    .btn-danger {
      background: var(--error-color);
      color: white;
    }
    
    .btn-danger:hover:not(:disabled) {
      background: #da3633;
    }
    
    /* Stages Stepper */
    .stages-stepper {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 20px 0;
      position: relative;
    }
    
    .stage-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      position: relative;
      z-index: 1;
    }
    
    .stage-marker {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      background: var(--bg-color);
      border: 2px solid var(--border-color);
      margin-bottom: 8px;
      transition: all 0.3s ease;
    }
    
    .stage-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-align: center;
      white-space: nowrap;
    }
    
    .stage-connector {
      position: absolute;
      top: 22px;
      left: calc(50% + 22px);
      width: calc(100% - 44px);
      height: 2px;
      background: var(--border-color);
      z-index: 0;
    }
    
    /* Stage states */
    .stage-completed .stage-marker {
      background: var(--success-color);
      border-color: var(--success-color);
      color: white;
    }
    
    .stage-completed .stage-label {
      color: var(--success-color);
    }
    
    .stage-completed .stage-connector,
    .connector-completed {
      background: var(--success-color);
    }
    
    .stage-current .stage-marker {
      background: var(--accent-color);
      border-color: var(--accent-color);
      color: white;
      box-shadow: 0 0 10px rgba(88, 166, 255, 0.5);
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    .stage-current .stage-label {
      color: var(--accent-color);
      font-weight: 600;
    }
    
    .stage-pending .stage-marker {
      background: var(--bg-color);
      border-color: var(--border-color);
      color: var(--text-secondary);
    }
    
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 10px rgba(88, 166, 255, 0.5); }
      50% { box-shadow: 0 0 20px rgba(88, 166, 255, 0.8); }
    }
    
    /* Connection status */
    .connection-status {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .connection-status.connected {
      background: rgba(59, 185, 80, 0.2);
      color: var(--success-color);
    }
    
    .connection-status.disconnected {
      background: rgba(248, 81, 73, 0.2);
      color: var(--error-color);
    }
    
    /* Enhanced progress metrics */
    .progress-metrics {
      display: flex;
      gap: 24px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
    
    .metric-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .metric-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .metric-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    .metric-value.eta { color: var(--success-color); }
    .metric-value.speed { color: var(--warning-color); }
    
    /* Stage duration badges */
    .stage-duration {
      font-size: 0.65rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    
    .stage-completed .stage-duration { color: var(--success-color); }
    
    /* Toast notifications */
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
    }
    
    .toast {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .toast.success { border-color: var(--success-color); }
    .toast.error { border-color: var(--error-color); }
    .toast.warning { border-color: var(--warning-color); }
    
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(100px); }
      to { opacity: 1; transform: translateX(0); }
    }
    
    /* Records counter animation */
    .stat-value.counting {
      animation: countPulse 0.5s ease;
    }
    
    @keyframes countPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    /* Database Selector */
    .database-selector {
      margin-bottom: 24px;
    }
    
    .database-selector section {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }
    
    .database-selector h3 {
      font-size: 1rem;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .db-quick-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .db-quick-actions .btn {
      padding: 6px 12px;
      font-size: 0.8rem;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      background: var(--bg-color);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .db-quick-actions .btn:hover {
      border-color: var(--accent-color);
      color: var(--accent-color);
    }
    
    .db-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-color);
    }
    
    .db-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-color);
      transition: background 0.2s;
    }
    
    .db-item:last-child {
      border-bottom: none;
    }
    
    .db-item:hover {
      background: rgba(88, 166, 255, 0.1);
    }
    
    .db-item.selected {
      background: rgba(88, 166, 255, 0.2);
      border-left: 3px solid var(--accent-color);
    }
    
    .db-item.new-db {
      color: var(--accent-color);
      border-top: 1px dashed var(--border-color);
    }
    
    .db-icon {
      font-size: 1.2rem;
    }
    
    .db-info {
      flex: 1;
      min-width: 0;
    }
    
    .db-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .db-name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .db-badge {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(255, 193, 7, 0.2);
      color: var(--warning-color);
    }
    
    .db-stats-row {
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      gap: 12px;
      margin-top: 2px;
    }
    
    .db-check {
      color: var(--success-color);
      font-weight: bold;
    }
    
    .db-new-input-group {
      display: none;
      padding: 10px 12px;
      background: var(--bg-color);
      border-top: 1px solid var(--border-color);
    }
    
    .db-new-input-group[data-visible="true"] {
      display: flex;
      gap: 8px;
    }
    
    .db-new-input-group input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--surface-color);
      color: var(--text-primary);
      font-size: 0.9rem;
    }
    
    .db-new-input-group input:focus {
      outline: none;
      border-color: var(--accent-color);
    }
    
    .db-new-input-group .btn {
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      background: var(--accent-color);
      color: white;
      cursor: pointer;
      font-weight: 500;
    }
    
    .db-new-input-group .btn:hover {
      opacity: 0.9;
    }
    
    .db-info-panel {
      margin-top: 12px;
      padding: 12px;
      background: var(--bg-color);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }
    
    .info-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .info-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 8px;
    }
    
    .info-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    
    .info-stat .stat-emoji {
      font-size: 1.2rem;
    }
    
    .info-stat .stat-value {
      font-size: 1.1rem;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .info-stat .stat-label {
      font-size: 0.7rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    .info-path {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    
    .info-path code {
      background: var(--surface-color);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Script
// ─────────────────────────────────────────────────────────────────────────────

function getClientScript() {
  return `
(function() {
  'use strict';
  
  // DOM references
  const dashboard = document.querySelector('.geo-import-dashboard');
  const progressRing = document.querySelector('.progress-ring-circle');
  const progressText = document.querySelector('.progress-ring-text');
  const progressStat = document.querySelector('.progress-stat');
  const progressPhase = document.querySelector('.progress-phase');
  const logBody = document.querySelector('.log-body');
  const startBtn = document.querySelector('[data-action="start-import"]');
  const pauseBtn = document.querySelector('[data-action="pause-import"]');
  const cancelBtn = document.querySelector('[data-action="cancel-import"]');
  
  // Connection status indicator
  const statusEl = document.createElement('div');
  statusEl.className = 'connection-status disconnected';
  statusEl.textContent = '⚡ Connecting...';
  document.body.appendChild(statusEl);
  
  // State
  let currentState = null;
  let eventSource = null;
  
  // Metrics tracking
  let metricsHistory = [];
  let stageTimes = {};
  let lastProgressUpdate = Date.now();
  let recordsPerSecond = 0;
  
  // Toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  
  // ─────────────────────────────────────────────────────────────────────────
  // SSE Connection
  // ─────────────────────────────────────────────────────────────────────────
  
  function connectSSE() {
    eventSource = new EventSource('/api/geo-import/events');
    
    eventSource.onopen = () => {
      statusEl.className = 'connection-status connected';
      statusEl.textContent = '🟢 Connected';
      console.log('[GeoImport] SSE connected');
    };
    
    eventSource.onerror = (err) => {
      statusEl.className = 'connection-status disconnected';
      statusEl.textContent = '🔴 Disconnected';
      console.error('[GeoImport] SSE error:', err);
      
      // Reconnect after delay
      setTimeout(connectSSE, 3000);
    };
    
    // Initial state
    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
      console.log('[GeoImport] Initial state:', currentState);
    });
    
    // Progress updates
    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateProgress(currentState);
    });
    
    // Stage changes
    eventSource.addEventListener('stage-change', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
    });
    
    // Log entries
    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      appendLog(data.entry);
    });
    
    // State changes
    eventSource.addEventListener('state-change', (e) => {
      const data = JSON.parse(e.data);
      currentState = data.state;
      updateUI(currentState);
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // UI Updates
  // ─────────────────────────────────────────────────────────────────────────
  
  function updateUI(state) {
    updateProgress(state);
    updateStagesStepper(state);
    updateButtons(state);
    updateSourceCards(state);
  }
  
  function updateStagesStepper(state) {
    const stepper = document.querySelector('.stages-stepper');
    if (!stepper) return;
    
    const currentStageId = state.status || state.stage?.id || 'idle';
    const prevStageId = stepper.getAttribute('data-current-stage');
    stepper.setAttribute('data-current-stage', currentStageId);
    
    // Track stage timing
    const now = Date.now();
    if (currentStageId !== prevStageId) {
      // Stage changed - record duration of previous stage
      if (prevStageId && stageTimes[prevStageId]?.start) {
        stageTimes[prevStageId].end = now;
        stageTimes[prevStageId].duration = now - stageTimes[prevStageId].start;
      }
      // Start timing new stage
      stageTimes[currentStageId] = { start: now };
      
      // Show toast notification for stage change
      if (currentStageId !== 'idle') {
        showToast(getStageEmoji(currentStageId) + ' ' + getStageLabel(currentStageId), 'info');
      }
      if (currentStageId === 'complete') {
        showToast('🎉 Import completed successfully!', 'success');
        playCompletionSound();
      }
    }
    
    const stages = stepper.querySelectorAll('.stage-item');
    const stageIds = ['idle', 'validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying', 'complete'];
    const currentIndex = stageIds.indexOf(currentStageId);
    
    stages.forEach((stageEl, index) => {
      const stageId = stageIds[index];
      stageEl.classList.remove('stage-completed', 'stage-current', 'stage-pending');
      
      const connector = stageEl.querySelector('.stage-connector');
      if (connector) {
        connector.classList.remove('connector-completed');
      }
      
      if (index < currentIndex) {
        stageEl.classList.add('stage-completed');
        if (connector) connector.classList.add('connector-completed');
        
        // Add duration badge for completed stages
        addStageDuration(stageEl, stageId);
      } else if (index === currentIndex) {
        stageEl.classList.add('stage-current');
        // Show live duration for current stage
        updateLiveStageDuration(stageEl, stageId);
      } else {
        stageEl.classList.add('stage-pending');
      }
    });
  }
  
  function addStageDuration(stageEl, stageId) {
    let durationEl = stageEl.querySelector('.stage-duration');
    if (!durationEl) {
      durationEl = document.createElement('div');
      durationEl.className = 'stage-duration';
      stageEl.appendChild(durationEl);
    }
    
    const timing = stageTimes[stageId];
    if (timing?.duration) {
      durationEl.textContent = formatDuration(Math.floor(timing.duration / 1000));
    }
  }
  
  function updateLiveStageDuration(stageEl, stageId) {
    let durationEl = stageEl.querySelector('.stage-duration');
    if (!durationEl) {
      durationEl = document.createElement('div');
      durationEl.className = 'stage-duration';
      stageEl.appendChild(durationEl);
    }
    
    const timing = stageTimes[stageId];
    if (timing?.start) {
      const elapsed = Math.floor((Date.now() - timing.start) / 1000);
      durationEl.textContent = formatDuration(elapsed) + '...';
    }
  }
  
  function getStageEmoji(stageId) {
    const emojis = {
      'idle': '⏸️', 'validating': '🔍', 'counting': '📊', 'preparing': '⚙️',
      'importing': '💾', 'indexing': '🗂️', 'verifying': '✅', 'complete': '🎉'
    };
    return emojis[stageId] || '•';
  }
  
  function getStageLabel(stageId) {
    const labels = {
      'idle': 'Ready', 'validating': 'Validating files...', 'counting': 'Counting records...',
      'preparing': 'Preparing database...', 'importing': 'Importing records...',
      'indexing': 'Building indexes...', 'verifying': 'Verifying data...', 'complete': 'Complete'
    };
    return labels[stageId] || stageId;
  }
  
  function updateProgress(state) {
    const { progress, stage } = state;
    const percent = progress.percent || 0;
    const now = Date.now();
    
    // Calculate speed (records per second)
    if (progress.current > 0) {
      const timeDiff = (now - lastProgressUpdate) / 1000;
      if (timeDiff > 0 && metricsHistory.length > 0) {
        const lastProgress = metricsHistory[metricsHistory.length - 1];
        const recordsDiff = progress.current - lastProgress.current;
        if (recordsDiff > 0) {
          recordsPerSecond = Math.round(recordsDiff / timeDiff);
        }
      }
      metricsHistory.push({ current: progress.current, time: now });
      // Keep only last 10 entries
      if (metricsHistory.length > 10) metricsHistory.shift();
      lastProgressUpdate = now;
    }
    
    // Calculate ETA
    const remaining = (progress.total || 0) - (progress.current || 0);
    const etaSeconds = recordsPerSecond > 0 ? Math.ceil(remaining / recordsPerSecond) : 0;
    const etaFormatted = formatDuration(etaSeconds);
    
    // Update ring
    if (progressRing) {
      const radius = progressRing.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percent / 100) * circumference;
      progressRing.style.strokeDashoffset = offset;
    }
    
    // Update text
    if (progressText) {
      progressText.textContent = percent + '%';
    }
    
    // Update stats with animation
    if (progressStat) {
      progressStat.innerHTML = 
        '<span class="stat-value counting">' + formatNumber(progress.current) + '</span> / ' +
        '<span class="stat-total">' + formatNumber(progress.total) + '</span> records';
    }
    
    // Update phase
    if (progressPhase && stage) {
      progressPhase.textContent = stage.emoji + ' ' + stage.description;
    }
    
    // Update metrics (ETA & Speed)
    updateMetrics(etaFormatted, recordsPerSecond, state.elapsed);
  }
  
  function updateMetrics(eta, speed, elapsed) {
    let metricsEl = document.querySelector('.progress-metrics');
    if (!metricsEl) {
      // Create metrics section if it doesn't exist
      metricsEl = document.createElement('div');
      metricsEl.className = 'progress-metrics';
      metricsEl.innerHTML = 
        '<div class="metric-item">' +
          '<span class="metric-value speed" data-metric="speed">0</span>' +
          '<span class="metric-label">Records/sec</span>' +
        '</div>' +
        '<div class="metric-item">' +
          '<span class="metric-value eta" data-metric="eta">--:--</span>' +
          '<span class="metric-label">ETA</span>' +
        '</div>' +
        '<div class="metric-item">' +
          '<span class="metric-value" data-metric="elapsed">00:00</span>' +
          '<span class="metric-label">Elapsed</span>' +
        '</div>';
      const progressStats = document.querySelector('.progress-stats');
      if (progressStats) progressStats.appendChild(metricsEl);
    }
    
    const speedEl = metricsEl.querySelector('[data-metric="speed"]');
    const etaEl = metricsEl.querySelector('[data-metric="eta"]');
    const elapsedEl = metricsEl.querySelector('[data-metric="elapsed"]');
    
    if (speedEl) speedEl.textContent = formatNumber(speed);
    if (etaEl) etaEl.textContent = eta || '--:--';
    if (elapsedEl) elapsedEl.textContent = formatDuration(Math.floor((elapsed || 0) / 1000));
  }
  
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '--:--';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  
  function updateButtons(state) {
    const { status } = state;
    const isRunning = ['validating', 'counting', 'preparing', 'importing', 'indexing', 'verifying'].includes(status);
    const isPaused = status === 'paused';
    
    if (startBtn) {
      startBtn.disabled = isRunning || isPaused;
      startBtn.textContent = isRunning ? '🔄 Running...' : '🚀 Start Import';
    }
    
    if (pauseBtn) {
      pauseBtn.disabled = !isRunning && !isPaused;
      pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
    }
    
    if (cancelBtn) {
      cancelBtn.disabled = !isRunning && !isPaused;
    }
  }
  
  function updateSourceCards(state) {
    // Update GeoNames card
    const geonamesCard = document.querySelector('.source-geonames');
    if (geonamesCard && state.sources.geonames) {
      const badge = geonamesCard.querySelector('.status-badge');
      if (badge) {
        const status = state.sources.geonames.status;
        badge.className = 'status-badge status-' + status;
        badge.textContent = getStatusLabel(status);
      }
      
      // Update stats
      const statsGrid = geonamesCard.querySelector('.stats-grid');
      if (statsGrid && state.stats) {
        const statItems = statsGrid.querySelectorAll('.stat-item');
        if (statItems[1]) {
          statItems[1].querySelector('.stat-value').textContent = formatNumber(state.stats.processed);
        }
        if (statItems[2]) {
          statItems[2].querySelector('.stat-value').textContent = formatNumber(state.stats.inserted);
        }
      }
    }
  }
  
  function appendLog(entry) {
    if (!logBody) return;
    
    const row = document.createElement('div');
    row.className = 'log-entry log-' + (entry.level || 'info');
    
    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = entry.time;
    row.appendChild(timestamp);
    
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = entry.message;
    row.appendChild(message);
    
    logBody.appendChild(row);
    logBody.scrollTop = logBody.scrollHeight;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Button Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  function handleStart() {
    // First do a preflight check
    fetch('/api/geo-import/preflight')
      .then(r => r.json())
      .then(preflight => {
        if (!preflight.ready) {
          // Show download instructions
          showMissingFileAlert(preflight);
          return;
        }
        
        // File exists, start the import
        return fetch('/api/geo-import/start', { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              if (data.instructions) {
                showMissingFileAlert(data);
              } else {
                addLogEntry({ time: new Date().toLocaleTimeString(), level: 'error', message: data.error });
              }
            } else {
              console.log('[GeoImport] Start:', data);
            }
          });
      })
      .catch(err => {
        console.error('[GeoImport] Start error:', err);
        addLogEntry({ time: new Date().toLocaleTimeString(), level: 'error', message: 'Failed to start import: ' + err.message });
      });
  }
  
  function showMissingFileAlert(info) {
    const instructions = info.instructions || [
      '1. Download cities15000.zip from ' + info.downloadUrl,
      '2. Extract cities15000.txt to data/geonames/',
      '3. Click "Start Import" again'
    ];
    
    // Add to log
    addLogEntry({ time: new Date().toLocaleTimeString(), level: 'warning', message: '⚠️ GeoNames data file not found' });
    instructions.forEach(step => {
      addLogEntry({ time: new Date().toLocaleTimeString(), level: 'info', message: step });
    });
    
    // Show alert with download link
    const alertMsg = 'GeoNames data file not found!\\n\\n' + 
      instructions.join('\\n') + '\\n\\n' +
      'Download URL: ' + info.downloadUrl;
    
    if (confirm(alertMsg + '\\n\\nOpen download page?')) {
      window.open(info.downloadUrl, '_blank');
    }
  }
  
  function handlePause() {
    const isPaused = currentState?.status === 'paused';
    const endpoint = isPaused ? '/api/geo-import/resume' : '/api/geo-import/pause';
    
    fetch(endpoint, { method: 'POST' })
      .then(r => r.json())
      .then(data => console.log('[GeoImport] Pause/Resume:', data))
      .catch(err => console.error('[GeoImport] Pause/Resume error:', err));
  }
  
  function handleCancel() {
    if (confirm('Cancel the import?')) {
      fetch('/api/geo-import/cancel', { method: 'POST' })
        .then(r => r.json())
        .then(data => console.log('[GeoImport] Cancel:', data))
        .catch(err => console.error('[GeoImport] Cancel error:', err));
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────
  
  function formatNumber(n) {
    return typeof n === 'number' ? n.toLocaleString() : (n || '0');
  }
  
  function getStatusLabel(status) {
    const labels = {
      'idle': '⏸️ Idle',
      'ready': '✅ Ready',
      'running': '🔄 Running',
      'validating': '🔍 Validating',
      'importing': '💾 Importing',
      'complete': '✅ Complete',
      'error': '❌ Error',
      'pending': '⏳ Pending'
    };
    return labels[status] || status;
  }
  
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  
  function playCompletionSound() {
    // Use Web Audio API for a simple completion chime
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 523.25; // C5
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
      
      // Second note (E5) for a pleasant chime
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 659.25; // E5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);
      }, 150);
    } catch (e) {
      // Audio not supported, fail silently
      console.log('[GeoImport] Audio notification not available');
    }
  }
  
  function addLogEntry(entry) {
    appendLog(entry);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────────────────
  
  // Bind buttons
  if (startBtn) startBtn.addEventListener('click', handleStart);
  if (pauseBtn) pauseBtn.addEventListener('click', handlePause);
  if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
  
  // Connect SSE
  connectSSE();
  
  // ─────────────────────────────────────────────────────────────────────────
  // Database Selector Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  const dbSelector = document.querySelector('.database-selector');
  
  function initDatabaseSelector() {
    if (!dbSelector) return;
    
    // Handle database item clicks
    dbSelector.addEventListener('click', function(e) {
      const item = e.target.closest('.db-item');
      if (item) {
        const dbPath = item.getAttribute('data-db-path');
        if (dbPath === '__new__') {
          toggleNewDbInput(true);
        } else {
          selectDatabase(dbPath);
        }
        return;
      }
      
      // Handle action buttons
      const action = e.target.getAttribute('data-action');
      if (action === 'select-default') {
        selectDefaultDatabase();
      } else if (action === 'refresh-list') {
        refreshDatabaseList();
      } else if (action === 'create-new-db') {
        createNewDatabase();
      }
    });
    
    // Handle Enter key in new db input
    const newDbInput = dbSelector.querySelector('[data-input="new-db-name"]');
    if (newDbInput) {
      newDbInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          createNewDatabase();
        }
      });
    }
  }
  
  function selectDatabase(dbPath) {
    showToast('Switching to ' + dbPath.split('/').pop() + '...', 'info');
    
    fetch('/api/databases/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dbPath })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        return;
      }
      
      showToast('Switched to ' + data.path.split(/[\\\\\\/]/).pop(), 'success');
      
      // Update UI
      updateSelectedDatabase(dbPath, data.stats);
      
      // Reload page to get fresh state
      setTimeout(() => location.reload(), 500);
    })
    .catch(err => {
      showToast('Failed to switch: ' + err.message, 'error');
    });
  }
  
  function selectDefaultDatabase() {
    // Find default in the list
    const defaultItem = dbSelector.querySelector('.db-item.default');
    if (defaultItem) {
      const dbPath = defaultItem.getAttribute('data-db-path');
      selectDatabase(dbPath);
    }
  }
  
  function refreshDatabaseList() {
    showToast('Refreshing database list...', 'info');
    
    fetch('/api/databases')
      .then(r => r.json())
      .then(data => {
        updateDatabaseList(data.databases, data.current);
        showToast('Found ' + data.databases.length + ' databases', 'success');
      })
      .catch(err => {
        showToast('Failed to refresh: ' + err.message, 'error');
      });
  }
  
  function createNewDatabase() {
    const input = dbSelector.querySelector('[data-input="new-db-name"]');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) {
      showToast('Please enter a database name', 'warning');
      input.focus();
      return;
    }
    
    showToast('Creating ' + name + '...', 'info');
    
    fetch('/api/databases/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        return;
      }
      
      showToast('Created ' + data.name, 'success');
      input.value = '';
      toggleNewDbInput(false);
      
      // Refresh and select new database
      refreshDatabaseList();
      setTimeout(() => selectDatabase(data.path), 500);
    })
    .catch(err => {
      showToast('Failed to create: ' + err.message, 'error');
    });
  }
  
  function toggleNewDbInput(visible) {
    const inputGroup = dbSelector.querySelector('.db-new-input-group');
    const newItem = dbSelector.querySelector('.db-item.new-db');
    
    if (inputGroup) {
      inputGroup.setAttribute('data-visible', visible ? 'true' : 'false');
    }
    if (newItem) {
      newItem.classList.toggle('selected', visible);
    }
    
    if (visible) {
      const input = inputGroup?.querySelector('input');
      if (input) input.focus();
    }
  }
  
  function updateSelectedDatabase(dbPath, stats) {
    // Update selected state in list
    dbSelector.querySelectorAll('.db-item').forEach(item => {
      const isSelected = item.getAttribute('data-db-path') === dbPath;
      item.classList.toggle('selected', isSelected);
      const check = item.querySelector('.db-check');
      if (check) check.textContent = isSelected ? '✓' : '';
    });
    
    // Update info panel
    const infoPanel = dbSelector.querySelector('[data-panel="selected-info"]');
    if (infoPanel && stats) {
      infoPanel.innerHTML = 
        '<div class="info-title">📊 ' + dbPath.split(/[\\\\\\/]/).pop() + '</div>' +
        '<div class="info-stats-grid">' +
          '<div class="info-stat"><span class="stat-emoji">📍</span><span class="stat-value">' + formatNumber(stats.places) + '</span><span class="stat-label">Places</span></div>' +
          '<div class="info-stat"><span class="stat-emoji">🏷️</span><span class="stat-value">' + formatNumber(stats.names) + '</span><span class="stat-label">Names</span></div>' +
          '<div class="info-stat"><span class="stat-emoji">💾</span><span class="stat-value">' + formatFileSize(stats.size) + '</span><span class="stat-label">Size</span></div>' +
        '</div>' +
        '<div class="info-path"><span class="path-label">Path: </span><code class="path-value">' + dbPath + '</code></div>';
    }
    
    // Update coverage section totals
    const coverageBefore = document.querySelector('.coverage-before');
    if (coverageBefore && stats) {
      const placesBefore = coverageBefore.querySelector('.coverage-item:first-child .coverage-value');
      const namesBefore = coverageBefore.querySelector('.coverage-item:nth-child(2) .coverage-value');
      if (placesBefore) placesBefore.textContent = formatNumber(stats.places);
      if (namesBefore) namesBefore.textContent = formatNumber(stats.names);
    }
  }
  
  function updateDatabaseList(databases, currentPath) {
    const list = dbSelector.querySelector('[data-list="databases"]');
    if (!list) return;
    
    // Clear existing items (except empty state)
    list.querySelectorAll('.db-item').forEach(item => item.remove());
    
    // Add new items
    databases.forEach(db => {
      const item = document.createElement('div');
      item.className = 'db-item' + (db.path === currentPath ? ' selected' : '') + (db.isDefault ? ' default' : '');
      item.setAttribute('data-db-path', db.path);
      
      item.innerHTML = 
        '<span class="db-icon">🗄️</span>' +
        '<div class="db-info">' +
          '<div class="db-name-row">' +
            '<span class="db-name">' + db.name + '</span>' +
            (db.isDefault ? '<span class="db-badge default-badge">⭐ Default</span>' : '') +
          '</div>' +
          '<div class="db-stats-row">' +
            '<span class="db-stat">📍 ' + formatNumber(db.places) + ' places</span>' +
            '<span class="db-stat">🏷️ ' + formatNumber(db.names) + ' names</span>' +
            '<span class="db-stat">💾 ' + formatFileSize(db.size) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="db-check">' + (db.path === currentPath ? '✓' : '') + '</span>';
      
      list.appendChild(item);
    });
  }
  
  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }
  
  // Initialize database selector
  initDatabaseSelector();
  
  console.log('[GeoImport] Dashboard initialized');
})();
  `;
}

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
