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
const { ensureDb } = require('../db/sqlite/ensureDb');
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
const { TelemetryIntegration } = require('../crawler/telemetry/TelemetryIntegration');
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
    emitTelemetry: realtime ? realtime.getBroadcastTelemetry() : null
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
  const crawlTelemetry = options.crawlTelemetry instanceof TelemetryIntegration
    ? options.crawlTelemetry
    : new TelemetryIntegration({
        historyLimit: parseNumber(options.crawlTelemetryHistoryLimit, 500),
        bridgeOptions: {
          defaultCrawlType: 'standard'
        }
      });

  app.locals.crawlTelemetry = crawlTelemetry;

  // Canonical telemetry SSE (preferred over legacy /events).
  // This endpoint replays telemetry history on connect.
  crawlTelemetry.mountSSE(app, '/api/crawl-telemetry/events');

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
