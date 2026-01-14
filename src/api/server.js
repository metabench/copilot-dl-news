#!/usr/bin/env node

/**
 * @server API Server
 * @description Standalone API server providing REST endpoints for crawl management, background tasks, and analysis.
 */

/**
 * API Server with Swagger/OpenAPI Documentation
 *
 * Standalone API server providing comprehensive REST endpoints for:
 * - Crawl management
 * - Background tasks
 * - Article analysis
 * - Place hub discovery and validation
 * - Gazetteer management
 *
 * Swagger UI available at: http://localhost:3000/api-docs
 * OpenAPI spec download: http://localhost:3000/api-docs.json
 */

'use strict';

const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');
const { ensureDb } = require('../data/db/sqlite/ensureDb');
const { createWritableDbAccessor } = require('../deprecated-ui/express/db/writableDb');
const { JobRegistry } = require('../deprecated-ui/express/services/jobRegistry');
const { RealtimeBroadcaster } = require('../deprecated-ui/express/services/realtimeBroadcaster');
const { createHealthRouter } = require('./routes/health');
const { createPlaceHubsRouter } = require('./routes/place-hubs');
const { createBackgroundTasksRouter } = require('./routes/background-tasks');
const { createAnalysisRouter } = require('./routes/analysis');
const { createCrawlsRouter } = require('./routes/crawls');
const { createDecisionConfigSetRoutes } = require('./routes/decisionConfigSetRoutes');
const { createEventsRouter } = require('../deprecated-ui/express/routes/events');
const { renderCrawlStatusPageHtml } = require('../ui/server/crawlStatus/CrawlStatusPage');
const { TelemetryIntegration } = require('../core/crawler/telemetry/TelemetryIntegration');
const { InProcessCrawlJobRegistry } = require('../server/crawl-api/v1/core/InProcessCrawlJobRegistry');

function parseEnvBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function initializeJobInfrastructure({
  jobRegistry: providedJobRegistry,
  broadcastProgress: providedBroadcastProgress,
  broadcastJobs: providedBroadcastJobs,
  allowMultiJobs,
  guardWindowMs,
  verbose = false,
  logger
} = {}) {
  let jobRegistry = providedJobRegistry || null;
  let realtime = null;
  let broadcastProgress = providedBroadcastProgress || null;
  let broadcastJobs = providedBroadcastJobs || null;

  const resolvedAllowMultiJobs = parseEnvBoolean(
    allowMultiJobs,
    parseEnvBoolean(process.env.API_ALLOW_MULTI_JOBS ?? process.env.UI_ALLOW_MULTI_JOBS, false)
  );
  const resolvedGuardWindowMs = parseNumber(
    guardWindowMs ?? process.env.API_JOB_GUARD_MS,
    600
  );

  if (!jobRegistry) {
    try {
      jobRegistry = new JobRegistry({
        allowMultiJobs: resolvedAllowMultiJobs,
        guardWindowMs: resolvedGuardWindowMs
      });
      if (verbose && logger?.log) {
        logger.log('[api] Initialized JobRegistry');
      }
    } catch (error) {
      const log = logger?.error || console.error;
      log('[api] Failed to initialize JobRegistry:', error);
      return {
        jobRegistry: null,
        realtime: null,
        broadcastProgress: broadcastProgress || (() => {}),
        broadcastJobs: broadcastJobs || (() => {})
      };
    }
  }

  if (!broadcastProgress || !broadcastJobs) {
    try {
      realtime = new RealtimeBroadcaster({
        jobRegistry,
        logsMaxPerSec: parseNumber(
          process.env.API_LOGS_MAX_PER_SEC ?? process.env.UI_LOGS_MAX_PER_SEC,
          200
        ),
        logLineMaxChars: parseNumber(
          process.env.API_LOG_LINE_MAX_CHARS ?? process.env.UI_LOG_LINE_MAX_CHARS,
          8192
        )
      });

      if (!jobRegistry.metrics) {
        jobRegistry.metrics = realtime.getMetrics();
      }

      broadcastProgress = broadcastProgress || realtime.getBroadcastProgress();
      broadcastJobs = broadcastJobs || ((force = false) => realtime.broadcastJobs(force));

      if (verbose && logger?.log) {
        logger.log('[api] Initialized RealtimeBroadcaster for crawl jobs');
      }
    } catch (error) {
      const log = logger?.error || console.error;
      log('[api] Failed to initialize RealtimeBroadcaster:', error);
      realtime = null;
    }
  }

  return {
    jobRegistry,
    realtime,
    broadcastProgress: broadcastProgress || (() => {}),
    broadcastJobs: broadcastJobs || (() => {})
  };
}

function initializeBackgroundInfrastructure({
  backgroundTaskManager: providedManager,
  getDbRW,
  dbPath,
  logger,
  verbose = false,
  realtime = null,
  metricsSink = null
} = {}) {
  const isTestEnv = Boolean(process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test');

  // Tests that exercise server wiring (routes, SSE headers, etc.) shouldn't need to load
  // heavyweight background task modules (some depend on jsdom/ESM-only deps).
  // Enable explicitly when a test suite needs it.
  if (isTestEnv && !providedManager && !parseEnvBoolean(process.env.API_ENABLE_BACKGROUND_TASKS_IN_TESTS, false)) {
    return {
      backgroundTaskManager: null,
      compressionWorkerPool: null
    };
  }

  if (providedManager) {
    return {
      backgroundTaskManager: providedManager,
      compressionWorkerPool: null
    };
  }

  if (typeof getDbRW !== 'function') {
    return {
      backgroundTaskManager: null,
      compressionWorkerPool: null
    };
  }

  let db = null;
  try {
    db = getDbRW();
  } catch (error) {
    const log = logger?.error || console.error;
    log('[api] Failed to obtain writable database for background tasks:', error);
    return {
      backgroundTaskManager: null,
      compressionWorkerPool: null
    };
  }

  if (!db) {
    const warn = logger?.warn || console.warn;
    warn('[api] Writable database unavailable; background tasks disabled');
    return {
      backgroundTaskManager: null,
      compressionWorkerPool: null
    };
  }

  const metricsReporter = typeof metricsSink === 'function' ? metricsSink : () => {};

  const { BackgroundTaskManager } = require('../background/BackgroundTaskManager');
  const { CompressionWorkerPool } = require('../background/workers/CompressionWorkerPool');
  const { CompressionTask } = require('../background/tasks/CompressionTask');
  const { AnalysisTask } = require('../background/tasks/AnalysisTask');
  const { CompressionLifecycleTask } = require('../background/tasks/CompressionLifecycleTask');
  const { GuessPlaceHubsTask } = require('../background/tasks/GuessPlaceHubsTask');
  const { BackfillDatesTask } = require('../background/tasks/BackfillDatesTask');
  const { TaskEventWriter } = require('../data/db/TaskEventWriter');

  // Create TaskEventWriter for background task event persistence
  const backgroundTaskEventWriter = new TaskEventWriter(db, { batchWrites: true });

  const manager = new BackgroundTaskManager({
    db,
    broadcastEvent: realtime
      ? (eventType, data) => {
          try {
            realtime.broadcast(eventType, data);
          } catch (error) {
            const log = logger?.error || console.error;
            log('[api] Failed to broadcast background task event:', error);
          }
        }
      : null,
    updateMetrics: (stats) => {
      metricsReporter(stats);
    },
    // Combined emitter: broadcast via realtime + persist to task_events table
    emitTelemetry: (entry) => {
      // Persist to database for AI queryability
      backgroundTaskEventWriter.writeBackgroundTaskEvent(entry);
      // Also broadcast via SSE if available
      if (realtime && typeof realtime.getBroadcastTelemetry === 'function') {
        const broadcaster = realtime.getBroadcastTelemetry();
        if (typeof broadcaster === 'function') {
          broadcaster(entry);
        }
      }
    }
  });

  let compressionWorkerPool = null;

  if (!isTestEnv) {
    compressionWorkerPool = new CompressionWorkerPool({
      poolSize: parseNumber(process.env.API_COMPRESSION_POOL_SIZE, 1),
      brotliQuality: parseNumber(process.env.API_COMPRESSION_BROTLI_QUALITY, 10),
      lgwin: parseNumber(process.env.API_COMPRESSION_LGWIN, 24)
    });

    compressionWorkerPool
      .initialize()
      .then(() => {
        if (verbose && logger?.log) {
          logger.log('[api] Compression worker pool ready (background tasks)');
        }
      })
      .catch((error) => {
        const log = logger?.error || console.error;
        log('[api] Failed to initialize compression worker pool:', error);
      });
  } else if (verbose && logger?.log) {
    logger.log('[api] Skipping compression worker pool in test environment');
  }

  try {
    manager.registerTaskType('article-compression', CompressionTask, compressionWorkerPool ? { workerPool: compressionWorkerPool } : {});
    manager.registerTaskType('analysis-run', AnalysisTask, { dbPath });
    manager.registerTaskType('compression-lifecycle', CompressionLifecycleTask, { dbPath });
    manager.registerTaskType('guess-place-hubs', GuessPlaceHubsTask, { dbPath });
    manager.registerTaskType('backfill-dates', BackfillDatesTask, { dbPath });
  } catch (error) {
    const log = logger?.error || console.error;
    log('[api] Failed to register background task types:', error);
  }

  if (!isTestEnv) {
    const resumeDelay = parseNumber(process.env.API_TASK_RESUME_DELAY_MS, 1000);
    setTimeout(async () => {
      try {
        await manager.resumeAllPausedTasks();
      } catch (error) {
        const log = logger?.error || console.error;
        log('[api] Failed to resume paused background tasks:', error);
      }
    }, resumeDelay);
  }

  return {
    backgroundTaskManager: manager,
    compressionWorkerPool
  };
}

async function cleanupAppResources(app, logger) {
  if (!app || !app.locals) {
    return;
  }

  if (typeof app.locals.destroyCrawlTelemetry === 'function') {
    try {
      app.locals.destroyCrawlTelemetry();
    } catch (error) {
      const warn = logger?.warn || console.warn;
      warn('[api] Failed to shut down crawl telemetry cleanly:', error);
    }
  }

  const pool = app.locals.compressionWorkerPool;
  if (pool && typeof pool.shutdown === 'function') {
    try {
      await pool.shutdown();
    } catch (error) {
      const warn = logger?.warn || console.warn;
      warn('[api] Failed to shut down compression worker pool cleanly:', error);
    }
  }
}

/**
 * Create and configure the API server
 * @param {Object} options - Server configuration options
 * @param {string} options.dbPath - Path to SQLite database
 * @param {number} options.port - Server port (default: 3000)
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {Console} [options.logger=console] - Logger forwarded to request logging and crawl routes
 * @param {Function} [options.createCrawlService] - Factory used to create the crawl service
 * @param {Object} [options.crawlService] - Preconfigured crawl service instance
 * @param {Object} [options.crawlServiceOptions] - Options passed to the crawl service factory
 * @param {string} [options.crawlBasePath='/api/v1/crawl'] - Base path used for crawl API routes
 * @param {Object} [options.backgroundTaskManager] - BackgroundTaskManager instance for task routes
 * @param {Function} [options.getDbRW] - Function returning the writable database handle
 * @param {Object} [options.jobRegistry] - Job registry instance for crawl job routes
 * @param {Function} [options.broadcastProgress] - Broadcast function for crawl job progress updates
 * @param {Function} [options.broadcastJobs] - Broadcast function for crawl job snapshots
 * @returns {express.Application} Configured Express app
 */
function createApiServer(options = {}) {
  const app = express();

  // Shared client modules (plain browser scripts) used by labs and lightweight UIs.
  app.use(
    '/shared-remote-obs',
    express.static(path.join(__dirname, '..', 'ui', 'client', 'remoteObservable', 'browser'))
  );
  const port = options.port || process.env.PORT || 3000;
  const dbPath = options.dbPath || path.join(process.cwd(), 'data', 'news.db');
  const logger = options.logger || console;
  const registerCrawlApiV1Routes = require('./route-loaders/crawl-v1').registerCrawlApiV1Routes;
  const getDbRW = typeof options.getDbRW === 'function'
    ? options.getDbRW
    : createWritableDbAccessor({
        ensureDb,
        urlsDbPath: dbPath,
        verbose: Boolean(options.verbose),
        logger
      });

  // Middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (options.verbose) {
        const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
        if (logger && typeof logger.info === 'function') {
          logger.info(message);
        } else if (logger && typeof logger.log === 'function') {
          logger.log(message);
        } else {
          console.log(message);
        }
      }
    });
    next();
  });

  // CORS headers (allow all origins for now)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Attach database path to app locals
  app.locals.dbPath = dbPath;
  app.locals.verbose = options.verbose || false;
  app.locals.logger = logger;
  app.locals.getDbRW = getDbRW;
  app.locals.backgroundTaskMetrics = null;

  const jobInfrastructure = initializeJobInfrastructure({
    jobRegistry: options.jobRegistry,
    broadcastProgress: options.broadcastProgress,
    broadcastJobs: options.broadcastJobs,
    allowMultiJobs: options.allowMultiJobs,
    guardWindowMs: options.guardWindowMs,
    verbose: app.locals.verbose,
    logger
  });

  app.locals.jobRegistry = jobInfrastructure.jobRegistry;
  app.locals.realtime = jobInfrastructure.realtime;
  app.locals.broadcastProgress = jobInfrastructure.broadcastProgress;
  app.locals.broadcastJobs = jobInfrastructure.broadcastJobs;

  // Canonical crawler telemetry (observable) -> legacy SSE broadcaster (/events).
  // This keeps /events as the "one place" clients can subscribe for crawl status.
  // When db is available, events are also persisted for AI queryability and replay.
  let telemetryDb = null;
  try {
    telemetryDb = getDbRW();
  } catch (_) {
    // DB unavailable - telemetry will still work but events won't persist
  }
  const crawlTelemetry = options.crawlTelemetry instanceof TelemetryIntegration
    ? options.crawlTelemetry
    : new TelemetryIntegration({
        historyLimit: parseNumber(options.crawlTelemetryHistoryLimit, 500),
        db: telemetryDb,
        bridgeOptions: {
          defaultCrawlType: 'standard'
        }
      });

  app.locals.crawlTelemetry = crawlTelemetry;

  // Canonical telemetry SSE (preferred over legacy /events).
  // This endpoint replays telemetry history on connect.
  crawlTelemetry.mountSSE(app, '/api/crawl-telemetry/events');

  // Remote observable bridge for UIs that want an Evented/Rx/async-iterator interface.
  crawlTelemetry.mountRemoteObservable(app, '/api/crawl-telemetry/remote-obs');

  // JSON history snapshot for clients without EventSource.
  app.get('/api/crawl-telemetry/history', (req, res) => {
    const limitRaw = req.query && req.query.limit != null ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.trunc(limitRaw)) : undefined;
    const history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(limit) : [];
    res.json({
      status: 'ok',
      items: history
    });
  });

  // ========== Task Events API (DB-persisted events) ==========
  // These endpoints query persisted events from the task_events table.
  // Useful for AI agents, debugging, and historical analysis.

  // List recent tasks with event counts
  app.get('/api/task-events', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', tasks: [], message: 'Event persistence not configured' });
    }
    const taskType = req.query.taskType || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const tasks = writer.listTasks({ taskType, limit });
    res.json({ status: 'ok', tasks });
  });

  // Get events for a specific task
  app.get('/api/task-events/:taskId', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', events: [], message: 'Event persistence not configured' });
    }
    const { taskId } = req.params;
    const options = {
      eventType: req.query.eventType || undefined,
      category: req.query.category || undefined,
      severity: req.query.severity || undefined,
      scope: req.query.scope || undefined,
      sinceSeq: req.query.sinceSeq ? parseInt(req.query.sinceSeq, 10) : undefined,
      limit: Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500))
    };
    const events = writer.getEvents(taskId, options);
    res.json({ status: 'ok', taskId, events });
  });

  // Get summary for a task
  app.get('/api/task-events/:taskId/summary', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', summary: null, message: 'Event persistence not configured' });
    }
    const { taskId } = req.params;
    const summary = writer.getSummary(taskId);
    res.json({ status: 'ok', taskId, summary });
  });

  // Get problems (errors/warnings) for a task
  app.get('/api/task-events/:taskId/problems', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', problems: [], message: 'Event persistence not configured' });
    }
    const { taskId } = req.params;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const problems = writer.getProblems(taskId, limit);
    res.json({ status: 'ok', taskId, problems });
  });

  // Get timeline (lifecycle events) for a task
  app.get('/api/task-events/:taskId/timeline', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', timeline: [], message: 'Event persistence not configured' });
    }
    const { taskId } = req.params;
    const timeline = writer.getTimeline(taskId);
    res.json({ status: 'ok', taskId, timeline });
  });

  // Get storage stats
  app.get('/api/task-events-stats', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.json({ status: 'ok', stats: null, message: 'Event persistence not configured' });
    }
    const stats = writer.getStorageStats();
    res.json({ status: 'ok', stats });
  });

  // Prune old events (admin endpoint)
  app.delete('/api/task-events/prune', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.status(400).json({ status: 'error', message: 'Event persistence not configured' });
    }
    const days = Math.max(1, parseInt(req.query.days, 10) || 30);
    const completedOnly = req.query.completedOnly === 'true';
    
    let result;
    if (completedOnly) {
      result = writer.pruneCompletedTasks(days);
    } else {
      result = writer.pruneOlderThan(days);
    }
    res.json({ status: 'ok', ...result });
  });

  // Delete events for a specific task
  app.delete('/api/task-events/:taskId', (req, res) => {
    const writer = crawlTelemetry.getEventWriter();
    if (!writer) {
      return res.status(400).json({ status: 'error', message: 'Event persistence not configured' });
    }
    const { taskId } = req.params;
    const result = writer.deleteTask(taskId);
    res.json({ status: 'ok', taskId, ...result });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Download Evidence API - Proof-grade download statistics
  // ═══════════════════════════════════════════════════════════════════════════

  const downloadEvidence = require('../data/db/queries/downloadEvidence');

  // Get global download stats (all-time)
  app.get('/api/downloads/stats', (req, res) => {
    try {
      const stats = downloadEvidence.getGlobalStats(getDbRW());
      res.json({ status: 'ok', stats });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get download stats for a time range
  app.get('/api/downloads/range', (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const stats = downloadEvidence.getDownloadStats(getDbRW(), start, end);
      res.json({ status: 'ok', start, end, stats });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get download timeline for progress visualization
  app.get('/api/downloads/timeline', (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const timeline = downloadEvidence.getDownloadTimeline(getDbRW(), start, end);
      res.json({ status: 'ok', start, end, timeline });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get evidence bundle for downloads
  app.get('/api/downloads/evidence', (req, res) => {
    try {
      const { start, end, limit = '100' } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const evidence = downloadEvidence.getDownloadEvidence(
        getDbRW(), 
        start, 
        end, 
        parseInt(limit, 10)
      );
      res.json({ status: 'ok', start, end, count: evidence.length, evidence });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Verify a download claim (anti-hallucination endpoint)
  app.get('/api/downloads/verify', (req, res) => {
    try {
      const { start, end, claimed } = req.query;
      if (!start || !end || claimed === undefined) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end, claimed' 
        });
      }
      const result = downloadEvidence.verifyDownloadClaim(
        getDbRW(), 
        start, 
        end, 
        parseInt(claimed, 10)
      );
      res.json({ status: 'ok', ...result });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════

  let crawlTelemetryUnsubscribe = null;
  if (app.locals.realtime && typeof app.locals.realtime.broadcastTelemetry === 'function') {
    crawlTelemetryUnsubscribe = crawlTelemetry.subscribe(
      (event) => {
        if (!event || typeof event !== 'object') return;

        const jobId = event.jobId || null;
        const severity = event.severity || 'info';
        const message = event.message || event.type || 'crawl:telemetry';

        app.locals.realtime.broadcastTelemetry({
          source: event.source || 'crawler',
          event: event.type || 'telemetry',
          severity,
          message,
          data: event,
          taskId: jobId,
          taskType: 'crawl',
          status: event.type || undefined
        });
      },
      { replayHistory: false }
    );
  }

  app.locals.destroyCrawlTelemetry = () => {
    try {
      crawlTelemetryUnsubscribe?.();
    } catch (_) {}
    try {
      crawlTelemetry.destroy();
    } catch (_) {}
  };

  const backgroundInfrastructure = initializeBackgroundInfrastructure({
    backgroundTaskManager: options.backgroundTaskManager,
    getDbRW,
    dbPath,
    logger,
    verbose: app.locals.verbose,
    realtime: jobInfrastructure.realtime,
    metricsSink: (stats) => {
      app.locals.backgroundTaskMetrics = stats;
    }
  });

  app.locals.backgroundTaskManager = backgroundInfrastructure.backgroundTaskManager;
  app.locals.compressionWorkerPool = backgroundInfrastructure.compressionWorkerPool;

  const openApiPath = path.join(__dirname, 'openapi.yaml');
  let openApiSpec = null;

  try {
    openApiSpec = YAML.load(fs.readFileSync(openApiPath, 'utf8'));
  } catch (error) {
    const warn = logger?.warn || console.warn;
    warn('[api] Failed to load OpenAPI spec; /api-docs will be limited:', error);
    openApiSpec = {
      openapi: '3.0.0',
      info: { title: 'News Crawler API', version: 'unknown' },
      paths: {}
    };
  }

  // Swagger UI customization options
  const swaggerOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'News Crawler API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true
    }
  };

  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(openApiSpec, swaggerOptions));

  // Serve OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.json(openApiSpec);
  });

  // Serve OpenAPI spec as YAML
  app.get('/api-docs.yaml', (req, res) => {
    res.type('text/yaml');
    res.send(fs.readFileSync(openApiPath, 'utf8'));
  });

  // Mount API routes
  app.use('/api', createHealthRouter({ dbPath }));
  app.use('/api/place-hubs', createPlaceHubsRouter({ dbPath }));
  app.use('/api/background-tasks', createBackgroundTasksRouter({
    taskManager: app.locals.backgroundTaskManager,
    getDbRW,
    logger
  }));
  app.use('/api/decision-config-sets', createDecisionConfigSetRoutes({ dbPath }));
  app.use('/api/analysis', createAnalysisRouter({
    getDbRW,
    logger
  }));
  app.use('/api/crawls', createCrawlsRouter({
    jobRegistry: app.locals.jobRegistry,
    broadcastProgress: app.locals.broadcastProgress,
    broadcastJobs: app.locals.broadcastJobs,
    logger
  }));

  // SSE status stream for crawl jobs and telemetry (reuses the legacy broadcaster).
  if (app.locals.realtime && app.locals.jobRegistry) {
    app.use(
      createEventsRouter({
        realtime: app.locals.realtime,
        jobRegistry: app.locals.jobRegistry,
        QUIET: !app.locals.verbose,
        analysisProgress: null
      })
    );
  }

  // Minimal status UI hosted by the crawl server.
  app.get('/crawl-status', (req, res) => {
    res
      .type('html')
      .send(renderCrawlStatusPageHtml({
        jobsApiPath: '/api/crawls',
        extraJobsApiPath: '/api/v1/crawl/jobs',
        eventsPath: '/api/crawl-telemetry/events',
        telemetryHistoryPath: '/api/crawl-telemetry/history'
      }));
  });

  const crawlServiceOptions = {
    ...(options.crawlServiceOptions && typeof options.crawlServiceOptions === 'object'
      ? options.crawlServiceOptions
      : {}),
    telemetryIntegration: app.locals.crawlTelemetry
  };

  app.locals.inProcessCrawlJobRegistry = options.inProcessCrawlJobRegistry
    ? options.inProcessCrawlJobRegistry
    : new InProcessCrawlJobRegistry({
        createCrawlService: options.createCrawlService,
        serviceOptions: crawlServiceOptions,
        telemetryIntegration: app.locals.crawlTelemetry,
        allowMultiJobs: parseEnvBoolean(
          process.env.API_ALLOW_MULTI_JOBS ?? process.env.UI_ALLOW_MULTI_JOBS,
          false
        ),
        historyLimit: parseNumber(process.env.API_IN_PROCESS_JOB_HISTORY_LIMIT, 200)
      });

  registerCrawlApiV1Routes(app, {
    basePath: options.crawlBasePath || '/api/v1/crawl',
    logger,
    crawlService: options.crawlService,
    createCrawlService: options.createCrawlService,
    serviceOptions: crawlServiceOptions,
    inProcessJobRegistry: app.locals.inProcessCrawlJobRegistry
  });

  // Root endpoint - redirect to API docs
  app.get('/', (req, res) => {
    res.redirect('/api-docs');
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    if (logger && typeof logger.error === 'function') {
      logger.error('API Error:', err);
    } else {
      console.error('API Error:', err);
    }
    res.status(err.status || 500).json({
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}


/**
 * Start the API server
 * @param {Object} options - Server options
 * @returns {Promise<Object>} Server instance with close() method
 */
async function startApiServer(options = {}) {
  const app = createApiServer(options);
  const port = options.port || 3000;
  const autoShutdownSeconds = parseNumber(
    options.autoShutdownSeconds ?? process.env.API_SERVER_TIMEOUT_SECONDS,
    undefined
  );

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err) => {
      if (err) {
        return reject(err);
      }

      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│                                                             │');
      console.log('│  🚀 News Crawler API Server                                │');
      console.log('│                                                             │');
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│  Server:          http://localhost:${port}                        │`);
      console.log(`│  API Docs:        http://localhost:${port}/api-docs              │`);
      console.log(`│  OpenAPI Spec:    http://localhost:${port}/api-docs.json         │`);
      console.log('│                                                             │');
      console.log(`│  Database:        ${options.dbPath || 'data/news.db'}${' '.repeat(Math.max(0, 27 - (options.dbPath || 'data/news.db').length))}│`);
      console.log('└─────────────────────────────────────────────────────────────┘');

      const logger = app.locals?.logger || console;
      let shutdownPromise = null;
      const closeServer = () => {
        if (shutdownPromise) {
          return shutdownPromise;
        }

        shutdownPromise = new Promise((resolveClose, rejectClose) => {
          Promise.resolve()
            .then(() => cleanupAppResources(app, logger))
            .catch((error) => {
              const warn = logger?.warn || console.warn;
              warn('[api] Cleanup encountered an error during shutdown:', error);
            })
            .finally(() => {
              server.close((closeError) => {
                if (closeError) {
                  rejectClose(closeError);
                } else {
                  resolveClose();
                }
              });
            });
        });

        return shutdownPromise;
      };

      const resolvedHandle = {
        app,
        server,
        port,
        jobRegistry: app.locals.jobRegistry || null,
        backgroundTaskManager: app.locals.backgroundTaskManager || null,
        compressionWorkerPool: app.locals.compressionWorkerPool || null,
        realtime: app.locals.realtime || null,
        getDbRW: app.locals.getDbRW,
        close: closeServer
      };

      if (autoShutdownSeconds && autoShutdownSeconds > 0) {
        const timeoutMs = autoShutdownSeconds * 1000;
        const timer = setTimeout(() => {
          const log = logger?.log || console.log;
          log(`[api] Auto shutdown triggered after ${autoShutdownSeconds}s`);
          closeServer()
            .then(() => {
              if (options.exitOnShutdown !== false && require.main === module) {
                process.exit(0);
              }
            })
            .catch((shutdownError) => {
              const errorLog = logger?.error || console.error;
              errorLog('[api] Auto shutdown failed:', shutdownError);
              if (options.exitOnShutdown !== false && require.main === module) {
                process.exit(1);
              }
            });
        }, timeoutMs);

        if (typeof timer.unref === 'function') {
          timer.unref();
        }

        resolvedHandle.autoShutdownTimer = timer;
      }

      resolve(resolvedHandle);
    });
  });
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.PORT || '3000', 10),
    dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    autoShutdownSeconds: parseNumber(process.env.API_SERVER_TIMEOUT_SECONDS, undefined)
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--db' && args[i + 1]) {
      options.dbPath = args[i + 1];
      i++;
    } else if ((args[i] === '--timeout' || args[i] === '--auto-timeout') && args[i + 1]) {
      options.autoShutdownSeconds = parseNumber(args[i + 1], undefined);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
News Crawler API Server

Usage: node src/api/server.js [options]

Options:
  --port <number>     Server port (default: 3000, env: PORT)
  --db <path>         Database path (default: data/news.db, env: DB_PATH)
  --verbose, -v       Enable verbose logging
  --timeout <seconds> Auto shutdown after the specified number of seconds (env: API_SERVER_TIMEOUT_SECONDS)
  --help, -h          Show this help message

Environment Variables:
  PORT                Server port
  DB_PATH             Database file path
  API_SERVER_TIMEOUT_SECONDS  Auto shutdown timer in seconds
  NODE_ENV            Environment (development|production)

Examples:
  node src/api/server.js
  node src/api/server.js --port 8080 --db data/test.db --verbose
  node src/api/server.js --timeout 30
  PORT=3001 DB_PATH=data/news.db API_SERVER_TIMEOUT_SECONDS=45 node src/api/server.js

API Documentation:
  Once started, visit http://localhost:3000/api-docs for interactive API documentation.
`);
      process.exit(0);
    }
  }

  startApiServer(options).catch((err) => {
    console.error('Failed to start API server:', err);
    process.exit(1);
  });
}

module.exports = {
  createApiServer,
  startApiServer
};
