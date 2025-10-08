const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  evaluateDomainFromDb
} = require('../../is_this_a_news_website');
const {
  buildArgs
} = require('./services/buildArgs');
const {
  computeJobsSummary
} = require('./services/jobs');
const {
  createEventsRouter
} = require('./routes/events');
const {
  createCrawlsApiRouter
} = require('./routes/api.crawls');
const {
  createCrawlStartRouter
} = require('./routes/api.crawl');
const {
  createQueuesApiRouter
} = require('./routes/api.queues');
const {
  createProblemsApiRouter
} = require('./routes/api.problems');
const {
  createMiscApiRouter
} = require('./routes/api.misc');
const {
  createUrlsApiRouter
} = require('./routes/api.urls');
const {
  createAnalysisApiRouter
} = require('./routes/api.analysis');
const {
  createAnalysisSsrRouter
} = require('./routes/ssr.analysis');
const {
  createCoverageApiRouter
} = require('./routes/coverage');
const {
  createConfigApiRouter
} = require('./routes/config');
const {
  createNavigationApiRouter
} = require('./routes/api.navigation');
const {
  createRecentDomainsApiRouter
} = require('./routes/api.recent-domains');
const {
  createDomainSummaryApiRouter
} = require('./routes/api.domain-summary');
const {
  createNewsWebsitesRouter
} = require('./routes/api.news-websites');
const {
  createGazetteerApiRouter
} = require('./routes/api.gazetteer');
const {
  createGazetteerPlacesApiRouter
} = require('./routes/api.gazetteer.places');
const {
  createGazetteerPlaceApiRouter
} = require('./routes/api.gazetteer.place');
const {
  createGazetteerProgressRouter
} = require('./routes/api.gazetteer.progress');
const {
  createGazetteerRouter
} = require('./routes/ssr.gazetteer');
const {
  createGazetteerPlacesRouter
} = require('./routes/ssr.gazetteer.places');
const {
  createGazetteerPlaceRouter
} = require('./routes/ssr.gazetteer.place');
const {
  createGazetteerProgressSsrRouter
} = require('./routes/ssr.gazetteer.progress');
const {
  createBootstrapDbApiRouter
} = require('./routes/api.bootstrapDb');
const {
  createBootstrapDbRouter
} = require('./routes/ssr.bootstrapDb');
const {
  createGazetteerCountriesRouter
} = require('./routes/ssr.gazetteer.countries');
const {
  createGazetteerCountryRouter
} = require('./routes/ssr.gazetteer.country');
const {
  createGazetteerKindRouter
} = require('./routes/ssr.gazetteer.kind');
const {
  createQueuesSsrRouter
} = require('./routes/ssr.queues');
const {
  createProblemsSsrRouter
} = require('./routes/ssr.problems');
const {
  createMilestonesSsrRouter
} = require('./routes/ssr.milestones');
const {
  createBenchmarksApiRouter
} = require('./routes/api.benchmarks');
const {
  createBenchmarksSsrRouter
} = require('./routes/ssr.benchmarks');
const {
  renderNav
} = require('./services/navigation');
const {
  fetchCountryMinimalData
} = require('./data/gazetteerCountry');
const {
  createWritableDbAccessor
} = require('./db/writableDb');
const {
  ConfigManager
} = require('../../config/ConfigManager');
const {
  ensureDb
} = require('../../db/sqlite');
const {
  createRunnerFactory,
  isTruthyFlag
} = require('./services/runnerFactory');
const {
  autoBuild
} = require('./auto-build-components');
const {
  JobRegistry
} = require('./services/jobRegistry');
const {
  IntelligentCrawlerManager
} = require('./services/IntelligentCrawlerManager');
const {
  RealtimeBroadcaster
} = require('./services/realtimeBroadcaster');
const {
  createMetricsFormatter
} = require('./services/metricsFormatter');
const {
  BenchmarkManager
} = require('./services/benchmarkManager');
const {
  GazetteerPriorityScheduler
} = require('../../crawler/gazetteer/GazetteerPriorityScheduler');
const {
  createRequestTimingMiddleware
} = require('./middleware/requestTiming');
const {
  errorHandler,
  notFoundHandler
} = require('./middleware/errorHandler');
const {
  startServer: bootstrapServer
} = require('./services/shutdown');
const {
  createAnalysisControlRouter
} = require('./routes/api.analysis-control');
const {
  createJobControlRouter
} = require('./routes/api.job-control');
const {
  createResumeAllRouter
} = require('./routes/api.resume-all');
const {
  createBackgroundTasksRouter
} = require('./routes/api.background-tasks');
const {
  BackgroundTaskManager
} = require('../../background/BackgroundTaskManager');
const {
  CompressionTask
} = require('../../background/tasks/CompressionTask');
const {
  AnalysisTask
} = require('../../background/tasks/AnalysisTask');
const {
  CompressionWorkerPool
} = require('../../background/workers/CompressionWorkerPool');
const {
  AnalysisRunManager
} = require('./services/AnalysisRunManager');

// Quiet test mode: suppress certain async logs that can fire after Jest completes
const QUIET = !!process.env.JEST_WORKER_ID || ['1', 'true', 'yes', 'on'].includes(String(process.env.UI_TEST_QUIET || '').toLowerCase());

function createApp(options = {}) {
  const env = options.env || process.env;
  const repoRoot = path.join(__dirname, '..', '..', '..');

  const runnerFactory = options.runnerFactory || createRunnerFactory({
    env,
    repoRoot,
    spawnImpl: options.spawnImpl,
    runner: options.runner || null,
    analysisRunner: options.analysisRunner || null
  });
  const runner = options.runner || runnerFactory.getCrawlerRunner();
  const analysisRunner = options.analysisRunner || runnerFactory.getAnalysisRunner();

  // Allow overriding DB path via options or environment for test isolation
  const envDb = env.DB_PATH || env.UI_DB_PATH || '';
  let urlsDbPath = options.dbPath || (envDb ? envDb : path.join(repoRoot, 'data', 'news.db'));
  let tempDbCleanup = null;
  if (!options.dbPath && !envDb && isTruthyFlag(env.UI_FAKE_RUNNER)) {
    const tmpDir = path.join(os.tmpdir(), 'copilot-ui-tests');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (_) {}
    const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    urlsDbPath = path.join(tmpDir, `ui-fake-${unique}.db`);
    tempDbCleanup = () => {
      const suffixes = ['', '-shm', '-wal'];
      for (const suffix of suffixes) {
        try {
          fs.unlinkSync(urlsDbPath + suffix);
        } catch (_) {}
      }
    };
    process.once('exit', tempDbCleanup);
  }

  // Verbose logging (disabled by default). Enable with options.verbose=true or UI_VERBOSE=1|true
  const verbose = options.verbose === true || isTruthyFlag(env.UI_VERBOSE);
  const queueDebug = options.queueDebug === true || verbose || isTruthyFlag(env.UI_QUEUE_DEBUG);
  const ensureDbFactory = typeof options.ensureDb === 'function' ? options.ensureDb : ensureDb;
  const app = express();
  const priorityConfigPath = options.priorityConfigPath || env.UI_PRIORITY_CONFIG || env.UI_PRIORITY_CONFIG_PATH || null;
  const shouldWatchConfig = options.watchPriorityConfig !== undefined ?
    !!options.watchPriorityConfig :
    !process.env.JEST_WORKER_ID;
  const configManager = options.configManager || new ConfigManager(priorityConfigPath, {
    watch: shouldWatchConfig
  });
  const bootstrapDatasetPath = options.bootstrapDatasetPath || env.UI_BOOTSTRAP_DATASET_PATH || env.UI_BOOTSTRAP_DATASET || null;
  app.locals.configManager = configManager;
  if (tempDbCleanup) {
    app.locals._cleanupTempDb = tempDbCleanup;
  }

  if (options.requestTiming !== false) {
    const requestLogger = options.requestLogger || console;
    app.use(createRequestTimingMiddleware({ logger: requestLogger }));
  }

  const analysisRuns = options.analysisRuns && typeof options.analysisRuns.set === 'function' ? options.analysisRuns : new Map();
  const analysisProgress = options.analysisProgress && typeof options.analysisProgress === 'object' ? options.analysisProgress : {};
  analysisProgress.historyLimit = Number.isFinite(options.analysisProgress?.historyLimit) ? options.analysisProgress.historyLimit : (Number.isFinite(analysisProgress.historyLimit) ? analysisProgress.historyLimit : 20);
  analysisProgress.history = Array.isArray(analysisProgress.history) ? analysisProgress.history : [];
  analysisProgress.lastPayload = analysisProgress.lastPayload || null;
  analysisProgress.lastRunId = analysisProgress.lastRunId || null;
  analysisProgress.runs = analysisRuns;
  const allowMultiJobs = (options.allowMultiJobs === true) || isTruthyFlag(env.UI_ALLOW_MULTI_JOBS);
  const traceStart = options.traceStart === true || isTruthyFlag(env.UI_TRACE_START);

  const providedJobRegistry = options.jobRegistry instanceof JobRegistry ? options.jobRegistry : null;
  const originalSummaryFn = providedJobRegistry && typeof providedJobRegistry.summaryFn === 'function'
    ? providedJobRegistry.summaryFn.bind(providedJobRegistry)
    : computeJobsSummary;

  const baseSummaryFn = options.crawlerManager instanceof IntelligentCrawlerManager
    ? options.crawlerManager.baseSummaryFn || ((jobs) => originalSummaryFn(jobs))
    : (jobs) => originalSummaryFn(jobs);

  const crawlerManager = options.crawlerManager instanceof IntelligentCrawlerManager
    ? options.crawlerManager
    : new IntelligentCrawlerManager({
        baseSummaryFn
      });

  let jobRegistry;
  if (providedJobRegistry) {
    jobRegistry = providedJobRegistry;
  } else {
    jobRegistry = new JobRegistry({
      allowMultiJobs,
      guardWindowMs: options.guardWindowMs,
      summaryFn: (jobs) => crawlerManager.buildJobsSummary(jobs)
    });
  }

  jobRegistry.summaryFn = (jobs) => crawlerManager.buildJobsSummary(jobs);

  crawlerManager.setJobRegistry(jobRegistry);
  const realtime = options.realtime instanceof RealtimeBroadcaster ? options.realtime : new RealtimeBroadcaster({
    jobRegistry,
    logsMaxPerSec: Number(env.UI_LOGS_MAX_PER_SEC || 200),
    logLineMaxChars: Number(env.UI_LOG_LINE_MAX_CHARS || 8192)
  });
  if (!jobRegistry.metrics) {
    jobRegistry.metrics = realtime.getMetrics();
  }

  const sseClients = realtime.getSseClients();
  const jobs = jobRegistry.getJobs();
  const crawlState = jobRegistry.getCrawlState();
  const progress = realtime.getProgress();
  const metrics = jobRegistry.metrics || realtime.getMetrics();
  const metricsFormatter = createMetricsFormatter({
    getMetrics: () => metrics,
    getLegacy: () => ({
      paused: jobRegistry.isPaused()
    })
  });
  const broadcast = (...args) => realtime.broadcast(...args);
  const broadcastJobs = (force = false) => realtime.broadcastJobs(force);
  const broadcastProgress = realtime.getBroadcastProgress();

  app.locals._sseClients = sseClients;
  app.locals._broadcaster = realtime.getBroadcaster();
  app.locals.realtime = realtime;
  app.locals.jobRegistry = jobRegistry;
  app.locals.analysisProgress = analysisProgress;
  app.locals.crawlerManager = crawlerManager;

  // Initialize benchmark manager
  const benchmarkManager = options.benchmarkManager || new BenchmarkManager({
    repoRoot,
    logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
  });
  app.locals.benchmarkManager = benchmarkManager;

  function startTrace(req, tag = 'gazetteer') {
    if (!verbose) {
      const noop = () => {};
      return { pre: () => noop, end: noop };
    }
    const start = Date.now();
    try {
      console.log(`[${tag}] request ${req.method} ${req.originalUrl || req.url}`);
    } catch (_) {}
    const pre = (name) => {
      const t = Date.now();
      try {
        console.log(`pre[${name}]`);
      } catch (_) {}
      return () => {
        try {
          console.log(`post[${name}] (+${Date.now() - t}ms)`);
        } catch (_) {}
      };
    };
    const end = () => {
      try {
        console.log(`[${tag}] done (+${Date.now() - start}ms)`);
      } catch (_) {}
    };
    return { pre, end };
  }
  const getDbRW = createWritableDbAccessor({
    ensureDb: ensureDbFactory,
    urlsDbPath,
    queueDebug,
    verbose,
    logger: console
  });
  
  // Alias for read-only access (same connection can be used for reading)
  const getDbRO = getDbRW;
  
  // Initialize gazetteer priority scheduler
  let gazetteerScheduler = null;
  try {
    const db = getDbRO();
    gazetteerScheduler = new GazetteerPriorityScheduler({ 
      db, 
      logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
    });
    app.locals.gazetteerScheduler = gazetteerScheduler;
  } catch (err) {
    // Only log in verbose mode or non-test environments to reduce test noise
    if (verbose || !process.env.JEST_WORKER_ID) {
      console.error('[server] Failed to initialize gazetteerScheduler:', err.message);
    }
  }

  // Initialize background task manager
  let backgroundTaskManager = null;
  let compressionWorkerPool = null;
  
  try {
    // Get database handle and verify it's valid
    const taskDb = getDbRW();
    
    if (!taskDb) {
      // Database failed to initialize - log more details
      console.warn('[server] Database initialization returned null - BackgroundTaskManager will not be available');
      console.warn('[server] Database path:', urlsDbPath);
      console.warn('[server] Check if the database file exists and is readable');
      throw new Error('Database not available');
    }
    
    if (verbose) {
      console.log('[server] Database initialized successfully for background tasks');
    }
    
    // Skip worker pool initialization in test environment to prevent hanging
    const isTestEnv = process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
    
    if (!isTestEnv) {
      // Initialize worker pool for compression tasks (async initialization deferred)
      compressionWorkerPool = new CompressionWorkerPool({
        poolSize: 1, // Start with 1 worker as requested
        brotliQuality: 10, // High quality Brotli compression
        lgwin: 24 // 256MB window size for best compression
      });
      
      // Initialize pool asynchronously (don't block app creation)
      compressionWorkerPool.initialize().then(() => {
        if (verbose) {
          console.log('[server] Initialized compression worker pool with 1 worker');
        }
      }).catch(err => {
        console.error('[server] Failed to initialize compression worker pool:', err.message);
      });
    } else {
      if (verbose) {
        console.log('[server] Skipping CompressionWorkerPool initialization in test environment');
      }
    }
    
    // Only initialize BackgroundTaskManager if we have a valid database
    if (!taskDb) {
      throw new Error('Database not available - cannot initialize BackgroundTaskManager');
    }
    
    backgroundTaskManager = new BackgroundTaskManager({
      db: taskDb,
      broadcastEvent: (eventType, data) => {
        // Broadcast background task events via SSE with specific event types
        // This allows clients to listen for 'task-progress', 'task-created', etc.
        broadcast(eventType, data);
      },
      updateMetrics: (stats) => {
        // Update metrics object with background task stats
        if (metrics && metrics.backgroundTasks) {
          Object.assign(metrics.backgroundTasks, stats);
        } else if (metrics) {
          metrics.backgroundTasks = stats;
        }
      }
    });

    // Register task types with worker pool injected (only if worker pool exists)
    if (compressionWorkerPool) {
      backgroundTaskManager.registerTaskType('article-compression', CompressionTask, {
        workerPool: compressionWorkerPool
      });
    } else if (verbose) {
      console.log('[server] Skipping compression task registration (no worker pool in test environment)');
    }

    // Register analysis task type (no worker pool needed - analysis is CPU-light)
    backgroundTaskManager.registerTaskType('analysis-run', AnalysisTask, {
      dbPath: urlsDbPath
    });
    
    if (verbose) {
      console.log('[server] Registered analysis-run task type');
    }

    // Resume paused tasks on startup (after a delay to ensure server is ready)
    if (!process.env.JEST_WORKER_ID) {
      setTimeout(async () => {
        try {
          // Double-check backgroundTaskManager exists before calling
          if (backgroundTaskManager) {
            await backgroundTaskManager.resumeAllPausedTasks();
            if (verbose) {
              console.log('[server] Resumed paused background tasks');
            }
          }
        } catch (err) {
          console.error('[server] Failed to resume paused tasks:', err);
        }
      }, 1000);
    }

    app.locals.backgroundTaskManager = backgroundTaskManager;
    app.locals.compressionWorkerPool = compressionWorkerPool;
  } catch (err) {
    // Only log in verbose mode or non-test environments to reduce test noise
    if (verbose || !process.env.JEST_WORKER_ID) {
      console.error('[server] Failed to initialize backgroundTaskManager:', err.message);
    }
  }

  // Initialize Analysis Run Manager
  let analysisRunManager = null;
  try {
    if (!process.env.JEST_WORKER_ID) {
      analysisRunManager = new AnalysisRunManager({
        getDbRW,
        logger: verbose ? console : { 
          log: () => {}, 
          warn: console.warn, 
          error: console.error 
        },
        autoStart: true
      });
      
      app.locals.analysisRunManager = analysisRunManager;
      
      if (verbose) {
        console.log('[server] Initialized AnalysisRunManager with stuck run monitoring');
      }
    }
  } catch (err) {
    if (verbose || !process.env.JEST_WORKER_ID) {
      console.error('[server] Failed to initialize AnalysisRunManager:', err.message);
    }
  }

  app.use(express.json());
  // Enable gzip compression for most responses, but explicitly skip SSE (/events)
  app.use(compression({
    filter: (req, res) => {
      try {
        // Never compress Server-Sent Events; compression can break streaming
        if (req.path === '/events') return false;
        // Also skip compression for API control hot paths to minimize latency
        if (req.method === 'POST' && typeof req.path === 'string' && req.path.startsWith('/api/')) return false;
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      } catch (_) {
        return false;
      }
    }
  }));
  // Static assets with cache headers
  const builtAssetsDir = path.join(__dirname, 'public', 'assets');
  if (fs.existsSync(builtAssetsDir)) {
    app.use('/assets', express.static(builtAssetsDir, {
      maxAge: '1h',
      etag: true,
      lastModified: true
    }));
  }

  // Serve shared UI assets (CSS/JS) from src/ui/public at /assets (fallback)
  app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }));

  app.use('/api/config', createConfigApiRouter(configManager));

  const generateAnalysisRunId = (explicit) => {
    if (explicit) {
      const trimmed = String(explicit).trim();
      if (trimmed) return trimmed;
    }
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    return `analysis-${iso}`;
  };

  // Mount SSE events router (keeps path '/events')
  app.use(createEventsRouter({
    realtime,
    jobRegistry,
    analysisProgress,
    QUIET
  }));
  app.use(createCrawlStartRouter({
    jobRegistry,
    allowMultiJobs,
    urlsDbPath,
    runner,
    buildArgs,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    getDbRW,
    queueDebug,
    metrics,
    QUIET,
    traceStart,
    crawlerManager
  }));
  // Mount crawls API router (list, detail, and job-scoped controls)
  app.use(createCrawlsApiRouter({
    jobRegistry,
    broadcastProgress,
    broadcastJobs,
    QUIET
  }));
  // Mount queues API router
  app.use(createQueuesApiRouter({
    getDbRW: getDbRW,
    jobRegistry,
    logger: queueDebug ? console : null
  }));
  // Mount misc API router (status, crawl-types, health, metrics)
  app.use(createMiscApiRouter({
    getLegacy: () => ({
      startedAt: crawlState.startedAt,
      lastExit: crawlState.lastExit,
      paused: crawlState.paused
    }),
    getMetrics: () => metrics,
    getDbRW: getDbRW,
    metricsFormatter,
    QUIET
  }));
  app.use(createJobControlRouter({
    jobRegistry,
    broadcastProgress,
    broadcast,
    broadcastJobs,
    quiet: QUIET
  }));
  app.use(createResumeAllRouter({
    jobRegistry,
    getDbRW,
    runner,
    buildArgs,
    broadcast,
    broadcastJobs,
    broadcastProgress,
    urlsDbPath,
    queueDebug,
    metrics,
    QUIET,
    crawlerManager
  }));
  app.use(createAnalysisControlRouter({
    analysisRunner,
    analysisRuns,
    urlsDbPath,
    generateRunId: generateAnalysisRunId,
    broadcast,
    analysisProgress,
    QUIET
  }));
  // Mount background tasks API router
  if (backgroundTaskManager) {
    app.use('/api/background-tasks', createBackgroundTasksRouter(backgroundTaskManager, getDbRW));
    
    // Serve background tasks UI page
    app.get('/background-tasks', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'background-tasks.html'));
    });
  }
  // Mount URLs APIs (list, details, fetch-body)
  app.use(createUrlsApiRouter({
    urlsDbPath
  }));
  app.use(createRecentDomainsApiRouter({
    urlsDbPath
  }));
  app.use(createDomainSummaryApiRouter({
    urlsDbPath
  }));
  // Mount News Websites API
  app.use(createNewsWebsitesRouter({
    getDbRW
  }));
  // Mount Analysis APIs (read-only history)
  app.use(createAnalysisApiRouter({
    getDbRW: getDbRW
  }));
  app.use(createAnalysisSsrRouter({
    getDbRW: getDbRW,
    renderNav
  }));
  // Mount Benchmark APIs and SSR pages
  app.use(createBenchmarksApiRouter({
    benchmarkManager
  }));
  app.use(createBenchmarksSsrRouter({
    benchmarkManager,
    renderNav
  }));
  // Mount Problems APIs (read-only)
  app.use(createProblemsApiRouter({
    getDbRW: getDbRW
  }));
  app.use(createProblemsSsrRouter({
    getDbRW: getDbRW,
    renderNav
  }));
  // Mount shared navigation API for clients needing link metadata
  app.use(createNavigationApiRouter());
  app.use(createGazetteerApiRouter({
    urlsDbPath
  }));
  app.use(createGazetteerPlacesApiRouter({
    urlsDbPath
  }));
  app.use(createGazetteerPlaceApiRouter({
    urlsDbPath
  }));
  // Mount gazetteer progress routes
  if (gazetteerScheduler) {
    app.use(createGazetteerProgressRouter({ 
      getDbRO, 
      gazetteerScheduler 
    }));
  }
  app.use(createBootstrapDbApiRouter({
    getDbRW: getDbRW,
    datasetPath: bootstrapDatasetPath
  }));
  // Queues SSR pages (list, detail, latest redirect)
  app.use(createQueuesSsrRouter({
    getDbRW: getDbRW,
    renderNav,
    jobRegistry,
    logger: queueDebug ? console : null
  }));
  // Gazetteer SSR surface
  app.use(createGazetteerRouter({
    urlsDbPath,
    startTrace
  }));
  app.use(createGazetteerPlacesRouter({
    urlsDbPath,
    startTrace
  }));
  app.use(createGazetteerPlaceRouter({
    urlsDbPath,
    startTrace
  }));
  // Mount gazetteer progress SSR route
  if (gazetteerScheduler) {
    app.use(createGazetteerProgressSsrRouter({
      getDbRO,
      renderNav,
      gazetteerScheduler
    }));
  }
  app.use(createBootstrapDbRouter({
    getDbRW: getDbRW,
    renderNav,
    datasetPath: bootstrapDatasetPath
  }));
  app.use(createGazetteerCountriesRouter({
    urlsDbPath,
    startTrace,
    renderNav
  }));
  app.use(createGazetteerCountryRouter({
    urlsDbPath,
    startTrace
  }));

  if (!process.env.UI_SKIP_GAZETTEER_WARMUP) {
    const warmupCode = process.env.UI_GAZETTEER_WARMUP_CODE || 'ID';
    try {
      if (urlsDbPath && fs.existsSync(urlsDbPath)) {
        fetchCountryMinimalData({ dbPath: urlsDbPath, countryCode: warmupCode });
      }
    } catch (_) {
      // warmup best-effort only
    }
  }
  app.use(createGazetteerKindRouter({ urlsDbPath, startTrace }));

  app.use(createMilestonesSsrRouter({ getDbRW: getDbRW, renderNav }));

  // /api/evaluate: now in createMiscApiRouter

  // Static assets with cache headers (mounted after SSR routers so dynamic pages win)
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    extensions: ['html']
  }));

  // Fallback: serve index.html (robust across legacy and new layouts) with diagnostics
  app.use((req, res) => {
    const candidates = [
      path.join(__dirname, 'public', 'index.html'), // canonical: src/ui/express/public/index.html
      path.join(__dirname, '..', 'public', 'index.html'), // mirror:   src/ui/public/index.html
      path.join(process.cwd(), 'src', 'ui', 'public', 'index.html'), // cwd-based canonical (if launched from repo root)
      path.join(process.cwd(), 'ui', 'public', 'index.html') // legacy root ui/public/index.html
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          if (!QUIET) console.log(`[server] Serving index from ${p}`);
          return res.sendFile(p);
        }
      } catch (e) {
        /* ignore individual stat errors */ }
    }
    if (!QUIET) console.warn('[server] index.html not found in any candidate paths');
    const candidateMarkup = candidates
      .map((candidate) => candidate.replace(/</g, '&lt;'))
      .join('\n');
    res.status(200).type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Crawler UI (fallback)</title>
  <link rel="stylesheet" href="/ui.css" />
  <link rel="stylesheet" href="/ui-dark.css" />
</head>
<body class="fallback-page">
  <main class="fallback-page__container">
    <h1 class="fallback-page__title">UI Fallback Page</h1>
    <p class="fallback-page__intro">The expected <code>index.html</code> was not found. We looked in these locations:</p>
    <pre class="fallback-page__paths">${candidateMarkup}</pre>
    <p class="fallback-page__note">Create or restore <code>src/ui/express/public/index.html</code> (preferred) or place an <code>index.html</code> into one of the checked legacy locations.</p>
  </main>
</body>
</html>`);
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Parse command-line arguments for server configuration
 */
function parseServerArgs(argv = process.argv) {
  const args = {
    detached: false,
    autoShutdownMs: null
  };
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--detached') {
      args.detached = true;
    } else if (arg === '--auto-shutdown') {
      const nextArg = argv[i + 1];
      if (nextArg) {
        const ms = parseInt(nextArg, 10);
        if (Number.isFinite(ms) && ms > 0) {
          args.autoShutdownMs = ms;
          i++; // skip next arg since we consumed it
        }
      }
    } else if (arg === '--auto-shutdown-seconds') {
      const nextArg = argv[i + 1];
      if (nextArg) {
        const seconds = parseInt(nextArg, 10);
        if (Number.isFinite(seconds) && seconds > 0) {
          args.autoShutdownMs = seconds * 1000;
          i++; // skip next arg
        }
      }
    }
  }
  
  return args;
}

async function startServer(appOptions = {}) {
  // Auto-build components if needed (fast check, only rebuilds if sources are newer)
  try {
    await autoBuild();
  } catch (err) {
    console.error('[server] Failed to auto-build components:', err);
    // Continue anyway - components might already be built
  }

  const app = createApp(appOptions);
  const serverArgs = parseServerArgs(appOptions.argv);
  
  const server = bootstrapServer(app, {
    quiet: QUIET,
    jobRegistry: app.locals?.jobRegistry || null,
    realtime: app.locals?.realtime || null,
    configManager: app.locals?.configManager || null,
    benchmarkManager: app.locals?.benchmarkManager || null,
    compressionWorkerPool: app.locals?.compressionWorkerPool || null,
    analysisRunManager: app.locals?.analysisRunManager || null,
    cleanupTempDb: app.locals?._cleanupTempDb || null,
    detached: serverArgs.detached,
    autoShutdownMs: serverArgs.autoShutdownMs
  });
  
  return server;
}

if (require.main === module) {
  const serverArgs = parseServerArgs();
  startServer({ argv: process.argv });
  
  // In detached mode, prevent the process from exiting immediately
  if (serverArgs.detached) {
    console.log('[server] Running in detached mode');
    if (serverArgs.autoShutdownMs) {
      console.log(`[server] Auto-shutdown scheduled in ${serverArgs.autoShutdownMs / 1000}s`);
    }
  }
}

module.exports = {
  createApp,
  startServer
};