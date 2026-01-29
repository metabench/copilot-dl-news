'use strict';

/**
 * IntelligentCrawlServer — HTTP server for continuous intelligent crawling
 * 
 * Features:
 * - Runs as a long-lived background server
 * - Automatic backfills at startup and periodically
 * - CLI-controllable via HTTP API
 * - SSE streaming for UI integration (minimal console logging)
 * - Coordinates with CrawlScheduler for prioritization
 * - Multi-database support via DualDatabaseFacade
 * - Database export capabilities (SQLite → PostgreSQL)
 * 
 * Usage:
 *   node src/services/IntelligentCrawlServer.js --start
 *   node src/services/IntelligentCrawlServer.js --start --port 3150
 *   node src/services/IntelligentCrawlServer.js --start --db-mode dual-write
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

// Configuration defaults
const DEFAULT_PORT = 3150;
const DEFAULT_HOST = '127.0.0.1';

// Log levels for quiet mode
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * @typedef {Object} ServerConfig
 * @property {number} port - HTTP port
 * @property {string} host - Bind address
 * @property {boolean} autoBackfillOnStart - Run backfill on startup
 * @property {number} backfillIntervalMs - Interval for periodic backfills (0 = disabled)
 * @property {number} crawlBatchSize - Pages per crawl batch
 * @property {number} crawlConcurrency - Concurrent crawl operations
 * @property {boolean} quietMode - Minimize console logging
 * @property {string} logLevel - 'error', 'warn', 'info', 'debug'
 * @property {Object} database - Database configuration
 * @property {string} database.mode - 'single', 'primary', 'dual-write', 'export'
 * @property {Object} database.primary - Primary DB config
 * @property {Object} [database.secondary] - Secondary DB config for dual modes
 */

class IntelligentCrawlServer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database connection (or DualDatabaseFacade)
   * @param {Object} [options.crawlOperations] - CrawlOperations facade
   * @param {Object} [options.scheduler] - CrawlScheduler instance
   * @param {Object} [options.backfillService] - PlaceHubBackfillService instance
   * @param {Object} [options.orchestrator] - MultiModalCrawlOrchestrator instance
   * @param {ServerConfig} [options.config] - Server configuration
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({
    db,
    crawlOperations = null,
    scheduler = null,
    backfillService = null,
    orchestrator = null,
    config = {},
    logger = null
  } = {}) {
    super();
    if (!db) throw new Error('IntelligentCrawlServer requires db');
    
    this.db = db;
    this.crawlOperations = crawlOperations;
    this.scheduler = scheduler;
    this.backfillService = backfillService;
    this.orchestrator = orchestrator;
    
    // Quiet-mode aware logger
    this.config = {
      port: config.port || DEFAULT_PORT,
      host: config.host || DEFAULT_HOST,
      autoBackfillOnStart: config.autoBackfillOnStart ?? true,
      backfillIntervalMs: config.backfillIntervalMs ?? (60 * 60 * 1000), // 1 hour default
      crawlBatchSize: config.crawlBatchSize ?? 1000,
      crawlConcurrency: config.crawlConcurrency ?? 1,
      quietMode: config.quietMode ?? true, // Default to quiet
      logLevel: config.logLevel || 'warn', // Default to warn (minimal output)
      database: config.database || null,
      ...config
    };
    
    // Set up logger with quiet mode support
    this.logger = logger || this._createQuietLogger();

    // State
    this.server = null;
    this.isRunning = false;
    this.sseClients = new Set();
    this.backfillTimer = null;
    this.lastBackfillResult = null;
    this.lastBackfillTime = null;
    
    // Database facade (if using dual-database)
    this.dbFacade = null;
    this.exporter = null;
    this.exportProgress = null;

    // Current crawl state
    this.currentCrawl = null;
    this.crawlHistory = [];
    this.stats = {
      startTime: null,
      totalBatches: 0,
      totalPagesDownloaded: 0,
      totalBackfills: 0,
      lastError: null
    };

    // Bind handlers
    this._handleRequest = this._handleRequest.bind(this);
  }
  
  /**
   * Create a quiet-mode aware logger
   */
  _createQuietLogger() {
    const level = LOG_LEVELS[this.config.logLevel] ?? LOG_LEVELS.warn;
    const broadcast = (eventType, msg, data = {}) => {
      this.emit('log', { level: eventType, message: msg, ...data, timestamp: new Date().toISOString() });
      this._broadcastSSE('log', { level: eventType, message: msg, ...data });
    };
    
    return {
      error: (msg) => { 
        if (level >= LOG_LEVELS.error) console.error(msg); 
        broadcast('error', msg);
      },
      warn: (msg) => { 
        if (level >= LOG_LEVELS.warn) console.warn(msg); 
        broadcast('warn', msg);
      },
      info: (msg) => { 
        if (!this.config.quietMode && level >= LOG_LEVELS.info) console.log(msg);
        broadcast('info', msg);
      },
      debug: (msg) => { 
        if (!this.config.quietMode && level >= LOG_LEVELS.debug) console.log(msg);
        broadcast('debug', msg);
      }
    };
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server already running');
    }

    // Initialize services if not provided
    await this._initializeServices();

    // Create HTTP server
    this.server = http.createServer(this._handleRequest);

    await new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    this.isRunning = true;
    this.stats.startTime = new Date().toISOString();
    this.logger.info(`[IntelligentCrawlServer] Started on http://${this.config.host}:${this.config.port}`);

    // Run initial backfill if configured
    if (this.config.autoBackfillOnStart) {
      setImmediate(() => this._runBackfill());
    }

    // Set up periodic backfill
    if (this.config.backfillIntervalMs > 0) {
      this.backfillTimer = setInterval(
        () => this._runBackfill(),
        this.config.backfillIntervalMs
      );
      this.backfillTimer.unref();
    }

    this.emit('started', { port: this.config.port });
    return this;
  }

  /**
   * Stop the server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) return;

    // Clear timers
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer);
      this.backfillTimer = null;
    }

    // Stop any running crawl
    if (this.currentCrawl) {
      await this._stopCurrentCrawl();
    }

    // Close SSE clients
    for (const client of this.sseClients) {
      try { client.res.end(); } catch (_) {}
    }
    this.sseClients.clear();

    // Close server
    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });

    this.isRunning = false;
    this.logger.info('[IntelligentCrawlServer] Stopped');
    this.emit('stopped');
  }

  // ─────────────────────────────────────────────────────────────
  // HTTP Request Handler
  // ─────────────────────────────────────────────────────────────

  async _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    try {
      // Route handlers
      if (pathname === '/health' && method === 'GET') {
        return this._handleHealth(req, res);
      }
      if (pathname === '/status' && method === 'GET') {
        return this._handleStatus(req, res);
      }
      if (pathname === '/events' && method === 'GET') {
        return this._handleSSE(req, res);
      }
      if (pathname === '/api/backfill' && method === 'POST') {
        return this._handleBackfillTrigger(req, res);
      }
      if (pathname === '/api/backfill/stats' && method === 'GET') {
        return this._handleBackfillStats(req, res);
      }
      if (pathname === '/api/crawl/start' && method === 'POST') {
        return this._handleCrawlStart(req, res);
      }
      if (pathname === '/api/crawl/stop' && method === 'POST') {
        return this._handleCrawlStop(req, res);
      }
      if (pathname === '/api/crawl/status' && method === 'GET') {
        return this._handleCrawlStatus(req, res);
      }
      
      // Database API endpoints
      if (pathname === '/api/db/status' && method === 'GET') {
        return this._handleDbStatus(req, res);
      }
      if (pathname === '/api/db/mode' && method === 'POST') {
        return this._handleDbModeChange(req, res);
      }
      if (pathname === '/api/db/export' && method === 'POST') {
        return this._handleDbExport(req, res);
      }
      if (pathname === '/api/db/export/status' && method === 'GET') {
        return this._handleDbExportStatus(req, res);
      }
      if (pathname === '/api/config' && method === 'GET') {
        return this._handleGetConfig(req, res);
      }

      // Hub Archive API endpoints
      if (pathname === '/api/hub-archive/probe' && method === 'POST') {
        return this._handleHubArchiveProbe(req, res);
      }
      if (pathname === '/api/hub-archive/tasks' && method === 'POST') {
        return this._handleHubArchiveGenerateTasks(req, res);
      }
      if (pathname === '/api/hub-archive/stats' && method === 'GET') {
        return this._handleHubArchiveStats(req, res);
      }
      if (pathname === '/api/hub-archive/hubs' && method === 'GET') {
        return this._handleHubArchiveListHubs(req, res, url);
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path: pathname }));

    } catch (err) {
      this.logger.error(`[IntelligentCrawlServer] Request error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleHealth(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      uptime: this.stats.startTime ? Date.now() - new Date(this.stats.startTime).getTime() : 0 
    }));
  }

  _handleStatus(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      isRunning: this.isRunning,
      stats: this.stats,
      currentCrawl: this.currentCrawl ? {
        startTime: this.currentCrawl.startTime,
        phase: this.currentCrawl.phase,
        pagesDownloaded: this.currentCrawl.pagesDownloaded
      } : null,
      lastBackfill: this.lastBackfillResult ? {
        time: this.lastBackfillTime,
        result: this.lastBackfillResult
      } : null,
      database: this._getDatabaseStatus(),
      config: {
        port: this.config.port,
        autoBackfillOnStart: this.config.autoBackfillOnStart,
        backfillIntervalMs: this.config.backfillIntervalMs,
        quietMode: this.config.quietMode,
        logLevel: this.config.logLevel
      }
    }));
  }
  
  /**
   * Get database status summary
   */
  _getDatabaseStatus() {
    if (this.dbFacade) {
      return this.dbFacade.getStatus();
    }
    
    // Fallback for simple db connection
    return {
      mode: 'single',
      initialized: true,
      primary: {
        engine: 'sqlite',
        connected: !!this.db
      },
      secondary: null,
      exportInProgress: this.exportProgress?.status === 'running',
      exportStats: this.exportProgress
    };
  }

  _handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const client = { res, connectedAt: Date.now() };
    this.sseClients.add(client);

    // Send initial status
    this._sendSSE(client, 'connected', { timestamp: new Date().toISOString() });

    req.on('close', () => {
      this.sseClients.delete(client);
    });
  }

  async _handleBackfillTrigger(req, res) {
    const body = await this._readBody(req);
    const { dryRun = false, limit = 1000 } = body;

    this._broadcastSSE('backfill:triggered', { dryRun, limit });

    // Run backfill asynchronously
    setImmediate(async () => {
      try {
        await this._runBackfill({ dryRun, limit });
      } catch (err) {
        this.logger.error(`[IntelligentCrawlServer] Backfill error: ${err.message}`);
      }
    });

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'accepted',
      message: 'Backfill started',
      dryRun,
      limit
    }));
  }

  _handleBackfillStats(req, res) {
    const stats = this.backfillService ? this.backfillService.getStats() : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      stats,
      lastBackfill: this.lastBackfillResult,
      lastBackfillTime: this.lastBackfillTime
    }));
  }

  async _handleCrawlStart(req, res) {
    if (this.currentCrawl) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ 
        error: 'Crawl already in progress',
        currentCrawl: this.currentCrawl.startTime
      }));
    }

    const body = await this._readBody(req);
    const { 
      url,
      batchSize = this.config.crawlBatchSize,
      maxBatches = null,
      hubDiscovery = true
    } = body;

    // Start crawl asynchronously
    setImmediate(async () => {
      try {
        await this._startCrawl({ url, batchSize, maxBatches, hubDiscovery });
      } catch (err) {
        this.logger.error(`[IntelligentCrawlServer] Crawl error: ${err.message}`);
        this._broadcastSSE('crawl:error', { error: err.message });
      }
    });

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'accepted',
      message: 'Crawl started',
      config: { batchSize, maxBatches, hubDiscovery }
    }));
  }

  async _handleCrawlStop(req, res) {
    if (!this.currentCrawl) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No crawl in progress' }));
    }

    await this._stopCurrentCrawl();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'stopped' }));
  }

  _handleCrawlStatus(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      isActive: !!this.currentCrawl,
      currentCrawl: this.currentCrawl,
      recentHistory: this.crawlHistory.slice(-10)
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Database API Handlers
  // ─────────────────────────────────────────────────────────────

  _handleDbStatus(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...this._getDatabaseStatus(),
      availableEngines: ['sqlite', 'postgres'],
      availableModes: ['single', 'primary', 'dual-write', 'export']
    }));
  }

  async _handleDbModeChange(req, res) {
    const body = await this._readBody(req);
    const { mode, secondary } = body;
    
    if (!mode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'mode is required' }));
    }
    
    if (!this.dbFacade) {
      // Need to upgrade to facade
      try {
        const { DualDatabaseFacade } = require('../data/db/DualDatabaseFacade');
        this.dbFacade = new DualDatabaseFacade({
          mode,
          primary: this.config.database?.primary || { engine: 'sqlite', dbPath: 'data/news.db' },
          secondary: secondary || this.config.database?.secondary,
          quietLogging: this.config.quietMode
        });
        await this.dbFacade.initialize();
        this.db = this.dbFacade;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    } else {
      try {
        await this.dbFacade.setMode(mode, { secondary });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }
    
    this._broadcastSSE('db:mode-changed', { mode, secondary: !!secondary });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      mode,
      status: this._getDatabaseStatus()
    }));
  }

  async _handleDbExport(req, res) {
    const body = await this._readBody(req);
    const {
      target, // { engine: 'postgres', connectionString: '...' }
      tables = null,
      batchSize = 1000,
      dryRun = false,
      truncateFirst = false
    } = body;
    
    if (!target || !target.connectionString) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'target.connectionString is required' }));
    }
    
    if (this.exportProgress?.status === 'running') {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Export already in progress' }));
    }
    
    // Create exporter
    const { DatabaseExporter } = require('../data/db/DatabaseExporter');
    this.exporter = new DatabaseExporter({
      source: { engine: 'sqlite', dbPath: process.env.NEWS_DB_PATH || 'data/news.db' },
      target: { engine: 'postgres', ...target },
      batchSize,
      quiet: this.config.quietMode
    });
    
    // Wire up events
    this.exporter.on('export:start', (data) => this._broadcastSSE('export:start', data));
    this.exporter.on('export:progress', (data) => {
      this.exportProgress = data;
      this._broadcastSSE('export:progress', data);
    });
    this.exporter.on('export:table-complete', (data) => this._broadcastSSE('export:table-complete', data));
    this.exporter.on('export:complete', (data) => {
      this.exportProgress = data;
      this._broadcastSSE('export:complete', data);
    });
    
    // Start export asynchronously
    setImmediate(async () => {
      try {
        await this.exporter.export({ tables, dryRun, truncateFirst });
      } catch (err) {
        this.logger.error(`Export failed: ${err.message}`);
        this._broadcastSSE('export:error', { error: err.message });
      } finally {
        await this.exporter.close();
        this.exporter = null;
      }
    });
    
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'accepted',
      message: 'Export started',
      dryRun,
      tables: tables || 'all'
    }));
  }

  _handleDbExportStatus(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      exportInProgress: this.exportProgress?.status === 'running',
      progress: this.exportProgress
    }));
  }

  _handleGetConfig(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      server: {
        port: this.config.port,
        host: this.config.host,
        quietMode: this.config.quietMode,
        logLevel: this.config.logLevel
      },
      backfill: {
        autoBackfillOnStart: this.config.autoBackfillOnStart,
        backfillIntervalMs: this.config.backfillIntervalMs
      },
      crawl: {
        batchSize: this.config.crawlBatchSize,
        concurrency: this.config.crawlConcurrency
      },
      database: this._getDatabaseStatus()
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Hub Archive API Handlers
  // ─────────────────────────────────────────────────────────────

  async _handleHubArchiveProbe(req, res) {
    const body = await this._readBody(req);
    const {
      host = null,
      hubLimit = 50,
      pageKind = 'country-hub',
      probeDelayMs = 500,
      depthCheckMaxAgeHours = 168
    } = body;

    // Check if already running
    if (this.hubTaskGenerator?.isRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Hub probe already in progress' }));
    }

    // Initialize task generator if needed
    if (!this.hubTaskGenerator) {
      const { HubTaskGenerator } = require('./HubTaskGenerator');
      const fetcher = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
      this.hubTaskGenerator = new HubTaskGenerator({
        db: this.db,
        fetcher,
        logger: this.logger
      });

      // Wire up events to SSE
      this.hubTaskGenerator.on('probe:start', (data) => this._broadcastSSE('hub-probe:start', data));
      this.hubTaskGenerator.on('probe:hub:start', (data) => this._broadcastSSE('hub-probe:hub-start', data));
      this.hubTaskGenerator.on('probe:page', (data) => this._broadcastSSE('hub-probe:page', data));
      this.hubTaskGenerator.on('probe:hub:complete', (data) => this._broadcastSSE('hub-probe:hub-complete', data));
      this.hubTaskGenerator.on('probe:finish', (data) => this._broadcastSSE('hub-probe:finish', data));
      this.hubTaskGenerator.on('probe:error', (data) => this._broadcastSSE('hub-probe:error', data));
    }

    // Start probe asynchronously
    setImmediate(async () => {
      try {
        await this.hubTaskGenerator.runDepthProbe({
          host,
          hubLimit,
          pageKind,
          probeDelayMs,
          depthCheckMaxAgeHours
        });
      } catch (err) {
        this.logger.error(`[IntelligentCrawlServer] Hub probe error: ${err.message}`);
        this._broadcastSSE('hub-probe:error', { error: err.message });
      }
    });

    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'accepted',
      message: 'Hub depth probe started',
      config: { host, hubLimit, pageKind, depthCheckMaxAgeHours }
    }));
  }

  async _handleHubArchiveGenerateTasks(req, res) {
    const body = await this._readBody(req);
    const {
      host = null,
      hubLimit = 10,
      minDepth = 2,
      pagesPerHub = 100,
      startPage = 2,
      jobId = null
    } = body;

    // Initialize task generator if needed
    if (!this.hubTaskGenerator) {
      const { HubTaskGenerator } = require('./HubTaskGenerator');
      const fetcher = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
      this.hubTaskGenerator = new HubTaskGenerator({
        db: this.db,
        fetcher,
        logger: this.logger
      });
    }

    try {
      const result = await this.hubTaskGenerator.generateAndPersistTasks({
        host,
        hubLimit,
        minDepth,
        pagesPerHub,
        startPage,
        jobId
      });

      this._broadcastSSE('hub-archive:tasks-generated', result);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        ...result
      }));

    } catch (err) {
      this.logger.error(`[IntelligentCrawlServer] Task generation error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleHubArchiveStats(req, res) {
    const { getArchiveCrawlStats } = require('../data/db/sqlite/v1/queries/placePageMappings');

    // Get stats for all hosts or aggregate
    try {
      // Get list of hosts with verified hubs
      const hosts = this.db.prepare(`
        SELECT DISTINCT host, COUNT(*) as hubCount
        FROM place_page_mappings
        WHERE status = 'verified'
        GROUP BY host
        ORDER BY hubCount DESC
        LIMIT 20
      `).all();

      const hostStats = hosts.map(h => ({
        host: h.host,
        hubCount: h.hubCount,
        ...getArchiveCrawlStats(this.db, h.host)
      }));

      // Aggregate totals
      const totals = hostStats.reduce((acc, s) => ({
        totalHubs: acc.totalHubs + (s.verifiedPresent || 0),
        depthChecked: acc.depthChecked + (s.depthChecked || 0),
        hasMultiplePages: acc.hasMultiplePages + (s.hasMultiplePages || 0),
        avgMaxDepth: acc.avgMaxDepth + (s.maxPageDepth || 0)
      }), { totalHubs: 0, depthChecked: 0, hasMultiplePages: 0, avgMaxDepth: 0 });

      totals.avgMaxDepth = hostStats.length > 0 ? Math.round(totals.avgMaxDepth / hostStats.length) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totals,
        byHost: hostStats
      }));

    } catch (err) {
      this.logger.error(`[IntelligentCrawlServer] Stats error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleHubArchiveListHubs(req, res, url) {
    const { getVerifiedHubsForArchive, getHubsNeedingArchive } = require('../data/db/sqlite/v1/queries/placePageMappings');

    const host = url.searchParams.get('host');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const mode = url.searchParams.get('mode') || 'verified'; // 'verified' or 'needs-archive'
    const orderBy = url.searchParams.get('orderBy') || 'priority';

    try {
      let hubs;
      if (mode === 'needs-archive') {
        hubs = getHubsNeedingArchive(this.db, { host, limit });
      } else {
        hubs = getVerifiedHubsForArchive(this.db, { host, limit, orderBy });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mode,
        host: host || 'all',
        count: hubs.length,
        hubs
      }));

    } catch (err) {
      this.logger.error(`[IntelligentCrawlServer] List hubs error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────────

  async _initializeServices() {
    // Initialize backfill service if not provided
    if (!this.backfillService) {
      const { PlaceHubBackfillService } = require('./PlaceHubBackfillService');
      this.backfillService = new PlaceHubBackfillService({ 
        db: this.db, 
        logger: this.logger 
      });

      // Wire up backfill events to SSE
      this.backfillService.on('backfill:start', (data) => {
        this._broadcastSSE('backfill:start', data);
      });
      this.backfillService.on('backfill:progress', (data) => {
        this._broadcastSSE('backfill:progress', data);
      });
      this.backfillService.on('backfill:complete', (data) => {
        this._broadcastSSE('backfill:complete', data);
      });
    }

    // Initialize scheduler if not provided
    if (!this.scheduler) {
      try {
        const { CrawlScheduler } = require('../core/crawler/scheduler');
        this.scheduler = new CrawlScheduler({ db: this.db });
      } catch (err) {
        this.logger.warn(`[IntelligentCrawlServer] CrawlScheduler not available: ${err.message}`);
      }
    }

    // Initialize orchestrator if not provided
    if (!this.orchestrator && this.crawlOperations) {
      try {
        const { MultiModalCrawlOrchestrator } = require('../core/crawler/multimodal/MultiModalCrawlOrchestrator');
        this.orchestrator = new MultiModalCrawlOrchestrator({
          db: this.db,
          crawlOperations: this.crawlOperations,
          logger: this.logger
        });

        // Wire up orchestrator events
        this.orchestrator.on('phase-change', (data) => {
          this._broadcastSSE('crawl:phase', data);
        });
        this.orchestrator.on('progress', (data) => {
          this._broadcastSSE('crawl:progress', data);
        });
        this.orchestrator.on('batch-complete', (data) => {
          this._broadcastSSE('crawl:batch-complete', data);
        });
      } catch (err) {
        this.logger.warn(`[IntelligentCrawlServer] MultiModalCrawlOrchestrator not available: ${err.message}`);
      }
    }
  }

  async _runBackfill(options = {}) {
    if (!this.backfillService) {
      this.logger.warn('[IntelligentCrawlServer] No backfill service available');
      return null;
    }

    const { dryRun = false, limit = 1000 } = options;

    this.logger.info(`[IntelligentCrawlServer] Running backfill (dryRun=${dryRun}, limit=${limit})`);
    this._broadcastSSE('backfill:running', { dryRun, limit });

    try {
      const result = this.backfillService.runFullBackfill({ dryRun, limit });
      this.lastBackfillResult = result;
      this.lastBackfillTime = new Date().toISOString();
      this.stats.totalBackfills++;

      this._broadcastSSE('backfill:finished', result);
      return result;

    } catch (err) {
      this.logger.error(`[IntelligentCrawlServer] Backfill failed: ${err.message}`);
      this._broadcastSSE('backfill:error', { error: err.message });
      throw err;
    }
  }

  async _startCrawl(options = {}) {
    const { url, batchSize, maxBatches, hubDiscovery } = options;

    this.currentCrawl = {
      startTime: new Date().toISOString(),
      phase: 'initializing',
      pagesDownloaded: 0,
      batchesCompleted: 0,
      config: { url, batchSize, maxBatches, hubDiscovery }
    };

    this._broadcastSSE('crawl:started', this.currentCrawl);

    // Run backfill before starting crawl
    if (this.backfillService) {
      this.currentCrawl.phase = 'backfill';
      this._broadcastSSE('crawl:phase', { phase: 'backfill' });
      await this._runBackfill({ limit: 500 });
    }

    // Start the orchestrator if available
    if (this.orchestrator) {
      this.currentCrawl.phase = 'crawling';
      this._broadcastSSE('crawl:phase', { phase: 'crawling' });

      try {
        await this.orchestrator.start({
          batchSize,
          maxTotalBatches: maxBatches,
          hubDiscoveryPerBatch: hubDiscovery
        });

        this.currentCrawl.phase = 'complete';
        this._broadcastSSE('crawl:complete', this.currentCrawl);

      } catch (err) {
        this.currentCrawl.phase = 'error';
        this.currentCrawl.error = err.message;
        this._broadcastSSE('crawl:error', { error: err.message });
        throw err;
      }

    } else {
      this.logger.warn('[IntelligentCrawlServer] No orchestrator available for crawling');
      this.currentCrawl.phase = 'no-orchestrator';
    }

    // Archive crawl
    this.crawlHistory.push({ ...this.currentCrawl, endTime: new Date().toISOString() });
    if (this.crawlHistory.length > 100) {
      this.crawlHistory.shift();
    }

    this.currentCrawl = null;
  }

  async _stopCurrentCrawl() {
    if (!this.currentCrawl) return;

    if (this.orchestrator) {
      await this.orchestrator.stop();
    }

    this.currentCrawl.phase = 'stopped';
    this.crawlHistory.push({ ...this.currentCrawl, endTime: new Date().toISOString() });
    this.currentCrawl = null;

    this._broadcastSSE('crawl:stopped', { timestamp: new Date().toISOString() });
  }

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────

  _sendSSE(client, event, data) {
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      this.sseClients.delete(client);
    }
  }

  _broadcastSSE(event, data) {
    for (const client of this.sseClients) {
      this._sendSSE(client, event, data);
    }
  }

  async _readBody(req) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (_) {
          resolve({});
        }
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Entry Point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const getArg = (name, defaultValue = null) => {
    const prefix = `--${name}=`;
    const arg = args.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
  };
  
  const port = parseInt(getArg('port', DEFAULT_PORT), 10);
  const help = args.includes('--help') || args.includes('-h');
  const quietMode = !args.includes('--verbose');
  const logLevel = getArg('log-level', 'warn');
  const dbMode = getArg('db-mode', 'single');

  if (help) {
    console.log(`
IntelligentCrawlServer — Long-running intelligent crawl server

USAGE:
  node src/services/IntelligentCrawlServer.js [options]

OPTIONS:
  --port=<n>          Port to listen on (default: ${DEFAULT_PORT})
  --no-auto-backfill  Disable automatic backfill on startup
  --verbose           Enable verbose console output (default: quiet mode)
  --log-level=<lvl>   Log level: error, warn, info, debug (default: warn)
  --db-mode=<mode>    Database mode: single, dual-write (default: single)
  --help, -h          Show this help

DATABASE MODES:
  single      - Use SQLite only (default)
  dual-write  - Write to both SQLite and PostgreSQL
                Requires DB_SECONDARY_CONNECTION env var

ENDPOINTS:
  GET  /health              Health check
  GET  /status              Server status (includes database info)
  GET  /events              SSE event stream (all logs and events)
  GET  /api/config          Full server configuration

  POST /api/backfill        Trigger manual backfill
  GET  /api/backfill/stats  Get backfill statistics

  POST /api/crawl/start     Start intelligent crawl
  POST /api/crawl/stop      Stop current crawl
  GET  /api/crawl/status    Get crawl status

  GET  /api/db/status       Database status and available modes
  POST /api/db/mode         Change database mode
  POST /api/db/export       Start SQLite → PostgreSQL export
  GET  /api/db/export/status  Get export progress

  # Hub Archive (Place Hub Historical Crawling)
  POST /api/hub-archive/probe   Probe verified hubs for pagination depth
  POST /api/hub-archive/tasks   Generate crawl tasks for hub archives
  GET  /api/hub-archive/stats   Get archive coverage statistics
  GET  /api/hub-archive/hubs    List verified hubs (?mode=verified|needs-archive)

ENVIRONMENT:
  NEWS_DB_PATH              SQLite database path (default: data/news.db)
  DB_SECONDARY_CONNECTION   PostgreSQL connection string for dual-write

EXAMPLE:
  # Start server in quiet mode (default)
  node src/services/IntelligentCrawlServer.js --port=3150

  # Start with verbose logging
  node src/services/IntelligentCrawlServer.js --verbose --log-level=info

  # Start with dual-write to PostgreSQL
  DB_SECONDARY_CONNECTION="postgres://user:pass@localhost/news" \\
    node src/services/IntelligentCrawlServer.js --db-mode=dual-write

  # Monitor via SSE (all events streamed here instead of console)
  curl -N http://localhost:3150/events

  # Trigger database export
  curl -X POST http://localhost:3150/api/db/export \\
    -H "Content-Type: application/json" \\
    -d '{"target": {"connectionString": "postgres://..."}, "dryRun": true}'
`);
    process.exit(0);
  }

  const autoBackfillOnStart = !args.includes('--no-auto-backfill');

  // Database configuration
  const dbPath = process.env.NEWS_DB_PATH || 'data/news.db';
  const dbConfig = {
    mode: dbMode,
    primary: { engine: 'sqlite', dbPath }
  };
  
  // Add secondary if configured
  if (process.env.DB_SECONDARY_CONNECTION || dbMode === 'dual-write') {
    dbConfig.secondary = {
      engine: 'postgres',
      connectionString: process.env.DB_SECONDARY_CONNECTION
    };
  }

  // Initialize database
  let db;
  if (dbMode === 'single') {
    // Simple SQLite connection
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
  } else {
    // Use DualDatabaseFacade (will be initialized async)
    const { DualDatabaseFacade } = require('../data/db/DualDatabaseFacade');
    db = new DualDatabaseFacade(dbConfig);
  }

  const server = new IntelligentCrawlServer({
    db,
    config: {
      port,
      autoBackfillOnStart,
      quietMode,
      logLevel,
      database: dbConfig
    }
  });

  // Initialize and start
  (async () => {
    try {
      // Initialize facade if needed
      if (db.initialize) {
        await db.initialize();
      }
      
      await server.start();
      
      // Only one startup message
      if (!quietMode) {
        console.log(`[IntelligentCrawlServer] Started on http://127.0.0.1:${port}`);
        console.log(`[IntelligentCrawlServer] Mode: ${dbMode}, Quiet: ${quietMode}`);
      } else {
        // Even in quiet mode, one line to confirm startup
        console.log(`IntelligentCrawlServer running → http://127.0.0.1:${port}/status`);
      }
    } catch (err) {
      console.error(`[IntelligentCrawlServer] Failed to start: ${err.message}`);
      process.exit(1);
    }
  })();

  // Graceful shutdown
  const shutdown = async () => {
    if (!quietMode) console.log('\n[IntelligentCrawlServer] Shutting down...');
    await server.stop();
    if (db.close) await Promise.resolve(db.close());
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { IntelligentCrawlServer };
