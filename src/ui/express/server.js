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
  createGazetteerApiRouter
} = require('./routes/api.gazetteer');
const {
  createGazetteerPlacesApiRouter
} = require('./routes/api.gazetteer.places');
const {
  createGazetteerPlaceApiRouter
} = require('./routes/api.gazetteer.place');
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
  renderNav
} = require('./services/navigation');
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
  JobRegistry
} = require('./services/jobRegistry');
const {
  RealtimeBroadcaster
} = require('./services/realtimeBroadcaster');
const {
  createMetricsFormatter
} = require('./services/metricsFormatter');
const {
  createRequestTimingMiddleware
} = require('./middleware/requestTiming');
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

  const jobRegistry = options.jobRegistry instanceof JobRegistry ? options.jobRegistry : new JobRegistry({
    allowMultiJobs,
    guardWindowMs: options.guardWindowMs,
    summaryFn: computeJobsSummary
  });
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
  // Serve shared UI assets (CSS/JS) from src/ui/public at /assets
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
    traceStart
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
    QUIET
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
  // Mount Analysis APIs (read-only history)
  app.use(createAnalysisApiRouter({
    getDbRW: getDbRW
  }));
  app.use(createAnalysisSsrRouter({
    getDbRW: getDbRW,
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
  app.use(createGazetteerCountriesRouter({
    urlsDbPath,
    startTrace,
    renderNav
  }));
  app.use(createGazetteerCountryRouter({
    urlsDbPath,
    startTrace
  }));
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
    res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"/><title>Crawler UI (fallback)</title><body style="font-family:system-ui;padding:24px;max-width:720px;margin:0 auto;">\n<h1>UI Fallback Page</h1>\n<p>The expected <code>index.html</code> was not found. Checked paths:</p><pre style="background:#111;color:#0f0;padding:10px;white-space:pre-wrap;">${candidates.map(c=>c.replace(/</g,'&lt;')).join('\n')}</pre>\n<p>Create or restore <code>src/ui/express/public/index.html</code> (preferred) or place an <code>index.html</code> into one of the checked legacy locations.</p>\n</body>`);
  });

  return app;
}
function startServer(appOptions = {}) {
  const app = createApp(appOptions);
  return bootstrapServer(app, {
    quiet: QUIET,
    jobRegistry: app.locals?.jobRegistry || null,
    realtime: app.locals?.realtime || null,
    configManager: app.locals?.configManager || null,
    cleanupTempDb: app.locals?._cleanupTempDb || null
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};