const http = require('http');
const express = require('express');
const compression = require('compression');
const path = require('path');
const {
  spawn
} = require('child_process');
const fs = require('fs');
const os = require('os');
const {
  EventEmitter
} = require('events');
const {
  evaluateDomainFromDb
} = require('../../is_this_a_news_website');
const {
  buildArgs
} = require('./services/buildArgs');
const {
  newJobIdFactory,
  computeJobsSummary
} = require('./services/jobs');
const {
  createBroadcaster
} = require('./services/broadcast');
const {
  createProgressBroadcaster
} = require('./services/progress');
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
  fetchProblems
} = require('./data/problems');
const {
  fetchMilestones
} = require('./data/milestones');
const {
  createWritableDbAccessor
} = require('./db/writableDb');
const {
  ConfigManager
} = require('../../config/ConfigManager');
const {
  ensureDb
} = require('../../ensure_db');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('./services/analysisRuns');
// Quiet test mode: suppress certain async logs that can fire after Jest completes
const QUIET = !!process.env.JEST_WORKER_ID || ['1', 'true', 'yes', 'on'].includes(String(process.env.UI_TEST_QUIET || '').toLowerCase());

// Rudimentary severity mapping for problem kinds (kept out of DB schema for now to stay normalized)
function deriveProblemSeverity(kind) {
  switch (kind) {
    case 'missing-hub':
      return 'warn';
    case 'unknown-pattern':
      return 'info';
    default:
      return 'info';
  }
}

// buildArgs is now provided by ./services/buildArgs

function defaultRunner() {
  // Allow switching to a lightweight fake runner for E2E via env
  if (String(process.env.UI_FORCE_SPAWN_FAIL || '').toLowerCase() === '1') {
    // Simulate a spawn error path to validate error surfacing in SSE and HTTP
    return {
      start() {
        const ee = new EventEmitter();
        // Use a small timeout to avoid races with SSE listener attachment
        setTimeout(() => {
          try {
            ee.emit('error', new Error('simulated spawn failure'));
          } catch (_) {}
        }, 30);
        return ee;
      }
    };
  }
  if (String(process.env.UI_FAKE_RUNNER || '').toLowerCase() === '1') {
    return {
      start(args = []) {
        const ee = new EventEmitter();
        // Provide stdout/stderr event emitters
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        // Provide a stub stdin so /api/pause and /api/resume can function in tests
        ee.stdin = {
          write: () => true
        };
        ee.pid = 424242;
        ee.kill = () => {
          try {
            ee.emit('exit', null, 'SIGTERM');
          } catch (_) {}
        };
        const plannerFlag = String(process.env.UI_FAKE_PLANNER || '').trim().toLowerCase();
        const envPlannerEnabled = ['1', 'true', 'yes', 'on'].includes(plannerFlag);
        const argsPlannerEnabled = Array.isArray(args) && args.some((arg) => typeof arg === 'string' && arg.includes('--crawl-type=intelligent'));
        const fakePlannerEnabled = envPlannerEnabled || argsPlannerEnabled;
        // Emit a quick sequence of logs and progress frames so the UI updates immediately
        setTimeout(() => {
          try {
            ee.stderr.emit('data', Buffer.from(`[fake-runner] planner-enabled=${fakePlannerEnabled}\n`, 'utf8'));
          } catch (_) {}
          try {
            ee.stdout.emit('data', Buffer.from('Starting fake crawler\n', 'utf8'));
          } catch (_) {}
          // Optional: emit a very long log line to exercise truncation code path
          try {
            if (String(process.env.UI_FAKE_LONGLOG || process.env.UI_FAKE_RUNNER_LONGLOG || '').toLowerCase() === '1') {
              const longLine = 'X'.repeat(12000) + '\n';
              ee.stdout.emit('data', Buffer.from(longLine, 'utf8'));
            }
          } catch (_) {}
          // seed progress frames
          const frames = [{
              visited: 0,
              downloaded: 0,
              found: 0,
              saved: 0,
              errors: 0,
              queueSize: 1,
              robotsLoaded: true
            },
            {
              visited: 1,
              downloaded: 1,
              found: 0,
              saved: 0,
              errors: 0,
              queueSize: 0,
              robotsLoaded: true
            }
          ];
          for (const p of frames) {
            try {
              ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(p) + '\n', 'utf8'));
            } catch (_) {}
          }
          // Optionally emit queue lifecycle events for tests
          try {
            if (String(process.env.UI_FAKE_QUEUE || '').toLowerCase() === '1') {
              const qEvents = [{
                  action: 'enqueued',
                  url: 'https://ex.com/',
                  depth: 0,
                  host: 'ex.com',
                  queueSize: 1
                },
                {
                  action: 'dequeued',
                  url: 'https://ex.com/',
                  depth: 0,
                  host: 'ex.com',
                  queueSize: 0
                },
                {
                  action: 'drop',
                  url: 'https://ex.com/bad',
                  reason: 'off-domain',
                  queueSize: 0
                }
              ];
              for (const ev of qEvents) {
                ee.stdout.emit('data', Buffer.from('QUEUE ' + JSON.stringify(ev) + '\n', 'utf8'));
              }
            }
          } catch (_) {}
          // Optionally emit problem diagnostics
          try {
            if (String(process.env.UI_FAKE_PROBLEMS || '').toLowerCase() === '1') {
              const problems = [{
                  kind: 'missing-hub',
                  scope: 'guardian',
                  target: '/world/france',
                  message: 'Country hub not found in sitemap',
                  details: {
                    slug: 'france'
                  }
                },
                {
                  kind: 'unknown-pattern',
                  scope: 'guardian',
                  target: '/p/abc123',
                  message: 'Unrecognized shortlink pattern'
                }
              ];
              for (const p of problems) {
                ee.stdout.emit('data', Buffer.from('PROBLEM ' + JSON.stringify(p) + '\n', 'utf8'));
              }
            }
          } catch (_) {}
          // Optionally emit milestones
          try {
            if (String(process.env.UI_FAKE_MILESTONES || '').toLowerCase() === '1') {
              const milestones = [{
                  kind: 'patterns-learned',
                  scope: 'guardian',
                  message: 'Homepage sections inferred',
                  details: {
                    sections: ['world', 'sport']
                  }
                },
                {
                  kind: 'hubs-seeded',
                  scope: 'guardian',
                  message: 'Seeded 10 hubs',
                  details: {
                    count: 10
                  }
                }
              ];
              for (const m of milestones) {
                ee.stdout.emit('data', Buffer.from('MILESTONE ' + JSON.stringify(m) + '\n', 'utf8'));
              }
            }
          } catch (_) {}
          // Optionally emit planner telemetry and completion milestone
          if (fakePlannerEnabled) {
            const emitPlanner = () => {
              try {
                const nowIso = () => new Date().toISOString();
                const stageEvents = [{
                    stage: 'bootstrap',
                    status: 'started',
                    sequence: 1,
                    ts: nowIso(),
                    details: {
                      context: {
                        host: 'example.com'
                      }
                    }
                  },
                  {
                    stage: 'bootstrap',
                    status: 'completed',
                    sequence: 1,
                    ts: nowIso(),
                    durationMs: 8,
                    details: {
                      context: {
                        host: 'example.com'
                      },
                      result: {
                        allowed: true
                      }
                    }
                  },
                  {
                    stage: 'infer-patterns',
                    status: 'started',
                    sequence: 2,
                    ts: nowIso(),
                    details: {
                      context: {
                        startUrl: 'https://example.com'
                      }
                    }
                  },
                  {
                    stage: 'infer-patterns',
                    status: 'completed',
                    sequence: 2,
                    ts: nowIso(),
                    durationMs: 12,
                    details: {
                      context: {
                        startUrl: 'https://example.com'
                      },
                      result: {
                        sectionCount: 3,
                        sectionsPreview: ['world', 'sport', 'culture']
                      }
                    }
                  },
                  {
                    stage: 'seed-hubs',
                    status: 'started',
                    sequence: 3,
                    ts: nowIso(),
                    details: {
                      context: {
                        sectionsFromPatterns: 3
                      }
                    }
                  },
                  {
                    stage: 'seed-hubs',
                    status: 'completed',
                    sequence: 3,
                    ts: nowIso(),
                    durationMs: 20,
                    details: {
                      context: {
                        sectionsFromPatterns: 3
                      },
                      result: {
                        seededCount: 2,
                        sampleSeeded: ['https://example.com/world/', 'https://example.com/sport/']
                      }
                    }
                  }
                ];
                for (const ev of stageEvents) {
                  ee.stdout.emit('data', Buffer.from('PLANNER_STAGE ' + JSON.stringify(ev) + '\n', 'utf8'));
                }
                const completion = {
                  kind: 'intelligent-completion',
                  scope: 'example.com',
                  message: 'Intelligent crawl completed',
                  details: {
                    outcome: 'completed',
                    seededHubs: {
                      unique: 2,
                      requested: 3,
                      sectionsFromPatterns: 3,
                      countryCandidates: 1,
                      sample: ['https://example.com/world/', 'https://example.com/sport/']
                    },
                    coverage: {
                      expected: 3,
                      seeded: 2,
                      coveragePct: 2 / 3
                    },
                    problems: [{
                      kind: 'missing-hub',
                      count: 1,
                      sample: {
                        scope: 'example.com',
                        target: '/world/mars'
                      }
                    }],
                    stats: {
                      visited: 1,
                      downloaded: 1,
                      articlesFound: 0,
                      articlesSaved: 0,
                      errors: 0
                    }
                  }
                };
                ee.stdout.emit('data', Buffer.from('MILESTONE ' + JSON.stringify(completion) + '\n', 'utf8'));
              } catch (err) {
                try {
                  ee.stderr.emit('data', Buffer.from(`[fake-runner] planner error: ${err && err.message || err}\n`, 'utf8'));
                } catch (_) {}
              }
            };
            const plannerDelay = Number(process.env.UI_FAKE_PLANNER_DELAY_MS || 60);
            if (plannerDelay > 0) {
              const timer = setTimeout(emitPlanner, plannerDelay);
              timer.unref?.();
            } else {
              emitPlanner();
            }
          }
          try {
            ee.stdout.emit('data', Buffer.from('Final stats: 1 pages visited, 1 pages downloaded, 0 articles found, 0 articles saved\n', 'utf8'));
          } catch (_) {}
          // Give a little more time so pause/resume API broadcasts can be observed in SSE before exit
          setTimeout(() => {
            try {
              ee.emit('exit', 0, null);
            } catch (_) {}
          }, 200);
        }, 20);
        return ee;
      }
    };
  }
  return {
    start(args) {
      const node = process.execPath;
      // Ensure we run from repo root so relative 'src/crawl.js' resolves
      const repoRoot = path.join(__dirname, '..', '..', '..');
      const cp = spawn(node, args, {
        cwd: repoRoot,
        env: process.env
      });
      return cp;
    }
  };
}

function defaultAnalysisRunner() {
  return {
    start(args = []) {
      const node = process.execPath;
      const repoRoot = path.join(__dirname, '..', '..', '..');
      const script = path.join(repoRoot, 'src', 'tools', 'analysis-run.js');
      const cliArgs = Array.isArray(args) ? args : [];
      const cp = spawn(node, [script, ...cliArgs], {
        cwd: repoRoot,
        env: process.env
      });
      return cp;
    }
  };
}

function createApp(options = {}) {
  const runner = options.runner || defaultRunner();
  const analysisRunner = options.analysisRunner || defaultAnalysisRunner();
  // Allow overriding DB path via options or environment for test isolation
  const envDb = process.env.DB_PATH || process.env.UI_DB_PATH || '';
  let urlsDbPath = options.dbPath || (envDb ? envDb : path.join(__dirname, '..', '..', '..', 'data', 'news.db'));
  let tempDbCleanup = null;
  if (!options.dbPath && !envDb) {
    const isFakeRunner = ['1', 'true', 'yes', 'on'].includes(String(process.env.UI_FAKE_RUNNER || '').toLowerCase());
    if (isFakeRunner) {
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
  }
  // Verbose logging (disabled by default). Enable with options.verbose=true or UI_VERBOSE=1|true
  const verbose = options.verbose === true || String(process.env.UI_VERBOSE || '').toLowerCase() === '1' || String(process.env.UI_VERBOSE || '').toLowerCase() === 'true';
  const queueDebug = verbose || isTruthyFlag(process.env.UI_QUEUE_DEBUG);
  const ensureDbFactory = typeof options.ensureDb === 'function' ? options.ensureDb : ensureDb;
  const app = express();
  const priorityConfigPath = options.priorityConfigPath || process.env.UI_PRIORITY_CONFIG || process.env.UI_PRIORITY_CONFIG_PATH || null;
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
  // Per-request timing logs (method, path, status, duration ms)
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const t1 = process.hrtime.bigint();
        const ms = Number(t1 - t0) / 1e6;
        // Use originalUrl when available to include query string
        const url = req.originalUrl || req.url;
        console.log(`[req] ${req.method} ${url} -> ${res.statusCode} ${ms.toFixed(1)}ms`);
      } catch (_) {
        /* noop */ }
    });
    next();
  });
  const sseClients = new Set(); // stores { res, logsEnabled, jobFilter }
  // Multi-job state: allow multiple concurrent crawler children
  const jobs = new Map(); // jobId -> { child, args, url, startedAt, lastExit, paused, stdoutBuf, stderrBuf, metrics, lastProgressStr, lastProgressSentAt, killTimer }
  const analysisRuns = new Map(); // runId -> { child, startedAt }
  // Legacy aggregated metrics (kept for /metrics & /health); reflect first active job
  const allowMultiJobs = (options.allowMultiJobs === true) || ['1', 'true', 'yes', 'on'].includes(String(process.env.UI_ALLOW_MULTI_JOBS || '').toLowerCase());
  // Optional: detailed start-path tracing, logs timing for key steps in POST /api/crawl
  const traceStart = options.traceStart === true || ['1', 'true', 'yes', 'on'].includes(String(process.env.UI_TRACE_START || '').toLowerCase());

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
  // Small guard window after a start to avoid immediate double-start races in single-job mode
  const crawlState = {
    jobStartGuardUntil: 0,
    startedAt: null,
    lastExit: null,
    paused: false
  };
  let childKillTimer = null; // kept for legacy single-job controls (first job)
  // Helper to generate lightweight unique job ids
  const newJobId = newJobIdFactory();
  const getFirstJob = () => (jobs.size ? jobs.values().next().value : null);
  const getJob = (jobId) => (jobId ? jobs.get(jobId) : null);
  const countRunning = () => jobs.size;
  // Log flood controls
  // Centralize log truncation and rate limiting in broadcaster
  const broadcaster = createBroadcaster(sseClients, {
    logsMaxPerSec: Number(process.env.UI_LOGS_MAX_PER_SEC || 200),
    logLineMaxChars: Number(process.env.UI_LOG_LINE_MAX_CHARS || 8192)
  });
  app.locals._sseClients = sseClients;
  app.locals._broadcaster = broadcaster;

  const broadcast = (event, data, forcedJobId = null) => broadcaster.broadcast(event, data, forcedJobId);

  function generateAnalysisRunId(explicit) {
    if (explicit) {
      const trimmed = String(explicit).trim();
      if (trimmed) return trimmed;
    }
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    return `analysis-${iso}`;
  }

  function isTruthyFlag(value) {
    if (value === true) return true;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return ['1', 'true', 'yes', 'on'].includes(v);
    }
    return false;
  }

  // Tiny in-memory TTL cache for expensive aggregates
  const summaryCache = {
    ttlMs: 60 * 1000,
    at: 0,
    data: null
  };
  const getDbRW = createWritableDbAccessor({
    ensureDb: ensureDbFactory,
    urlsDbPath,
    queueDebug,
    verbose,
    logger: console
  });

  // metrics snapshot populated from PROGRESS events (legacy aggregate)
  const progress = createProgressBroadcaster({
    broadcast,
    getPaused: () => crawlState.paused,
    setPaused: (v) => {
      crawlState.paused = !!v;
    },
    legacyMetrics: {
      visited: 0,
      downloaded: 0,
      found: 0,
      saved: 0,
      errors: 0,
      queueSize: 0,
      running: 0,
      stage: 'idle',
      _lastSampleTime: 0,
      _lastVisited: 0,
      _lastDownloaded: 0,
      requestsPerSec: 0,
      downloadsPerSec: 0,
      errorRatePerMin: 0,
      bytesPerSec: 0,
      cacheHitRatio1m: 0
    }
  });
  const metrics = progress.metrics;
  const broadcastProgress = progress.broadcastProgress;
  // Throttle for jobs list SSE
  let jobsLastSentAt = 0;

  const summaryJobs = () => computeJobsSummary(jobs);

  function broadcastJobs(force = false) {
    const now = Date.now();
    if (!force && now - jobsLastSentAt < 200) return; // ~5 Hz
    jobsLastSentAt = now;
    const payload = summaryJobs();
    try {
      broadcast('jobs', payload);
    } catch (_) {}
  }

  function updateJobStage(job, stage) {
    if (!job) return;
    const next = stage || 'running';
    if (job.stage === next) {
      broadcastJobs(true);
      return;
    }
    job.stage = next;
    try {
      job.stageChangedAt = Date.now();
    } catch (_) {}
    if (job.metrics) {
      try {
        job.metrics.stage = next;
      } catch (_) {}
    }
    try {
      const first = getFirstJob();
      if (!first || first.id === job.id) {
        metrics.stage = next;
      }
    } catch (_) {}
    broadcastJobs(true);
  }

  function clearJobWatchdogs(job) {
    if (!job || !Array.isArray(job.watchdogTimers) || job.watchdogTimers.length === 0) return;
    for (const timer of job.watchdogTimers.splice(0)) {
      try {
        clearTimeout(timer);
      } catch (_) {}
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
  // Serve shared UI assets (CSS/JS) from src/ui/public at /assets
  app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }));

  // Mount SSE events router (keeps path '/events')
  app.use(createEventsRouter({
    sseClients,
    jobs,
    broadcaster,
    progress,
    QUIET
  }));
  app.use(createCrawlStartRouter({
    allowMultiJobs,
    jobs,
    crawlState,
    urlsDbPath,
    runner,
    buildArgs,
    newJobId,
    broadcast,
    broadcastJobs,
    broadcastProgress: (...args) => progress.broadcastProgress(...args),
    getDbRW,
    queueDebug,
    updateJobStage,
    clearJobWatchdogs,
    getFirstJob,
    metrics,
    QUIET,
    traceStart
  }));
  // Mount crawls API router (list, detail, and job-scoped controls)
  app.use(createCrawlsApiRouter({
    jobs,
    broadcastProgress: (...args) => progress.broadcastProgress(...args),
    QUIET
  }));
  // Mount queues API router
  app.use(createQueuesApiRouter({
    getDbRW: getDbRW
  }));
  // Mount misc API router (status, crawl-types, health, metrics)
  app.use(createMiscApiRouter({
    jobs,
    getLegacy: () => ({
      startedAt: crawlState.startedAt,
      lastExit: crawlState.lastExit,
      paused: crawlState.paused
    }),
    getMetrics: () => metrics,
    getDbRW: getDbRW,
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
    renderNav
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
  app.post('/api/analysis/start', (req, res) => {
    const body = req.body || {};
    const runId = generateAnalysisRunId(body.runId);
    const args = [];
    if (!args.some((a) => a.startsWith('--db='))) {
      args.push(`--db=${urlsDbPath}`);
    }
    args.push(`--run-id=${runId}`);
    if (body.analysisVersion != null && body.analysisVersion !== '') {
      const v = Number(body.analysisVersion);
      if (Number.isFinite(v)) args.push(`--analysis-version=${v}`);
    }
    if (body.pageLimit != null && body.pageLimit !== '') {
      const v = Number(body.pageLimit);
      if (Number.isFinite(v)) args.push(`--limit=${v}`);
    }
    if (body.domainLimit != null && body.domainLimit !== '') {
      const v = Number(body.domainLimit);
      if (Number.isFinite(v)) args.push(`--domain-limit=${v}`);
    }
    if (isTruthyFlag(body.skipPages)) args.push('--skip-pages');
    if (isTruthyFlag(body.skipDomains)) args.push('--skip-domains');
    if (isTruthyFlag(body.dryRun)) args.push('--dry-run');
    if (isTruthyFlag(body.verbose)) args.push('--verbose');
    try {
      const child = analysisRunner.start(args);
      if (!child || typeof child.on !== 'function') {
        throw new Error('analysis runner did not return a child process');
      }
      if (!child.stdout) child.stdout = new EventEmitter();
      if (!child.stderr) child.stderr = new EventEmitter();
      analysisRuns.set(runId, {
        child,
        startedAt: new Date().toISOString()
      });
      const cleanup = () => {
        analysisRuns.delete(runId);
      };
      child.on('exit', cleanup);
      child.on('close', cleanup);
      child.on('error', cleanup);
      res.status(202).json({
        runId,
        detailUrl: `/analysis/${runId}/ssr`,
        apiUrl: `/api/analysis/${runId}`
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post('/api/stop', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    if (jobs.size === 0) return res.status(200).json({ stopped: false });
    if (!jobId && jobs.size > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({ error: 'Job not found' });
      const target = job.child;
      if (typeof target?.kill === 'function') target.kill('SIGTERM');
      try {
        if (job.killTimer) {
          clearTimeout(job.killTimer);
          job.killTimer = null;
        }
      } catch (_) {}
      job.killTimer = setTimeout(() => {
        try {
          if (target && !target.killed) {
            try {
              target.kill('SIGKILL');
            } catch (_) {}
            if (process.platform === 'win32' && target.pid) {
              try {
                const { exec } = require('child_process');
                exec(`taskkill /PID ${target.pid} /T /F`);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }, 800);
      try {
        job.killTimer?.unref?.();
      } catch (_) {}
      try {
        console.log(`[api] POST /api/stop -> 202 stop requested jobId=${jobId || job.id} pid=${target?.pid || 'n/a'}`);
      } catch (_) {}
      res.status(202).json({ stopped: true, escalatesInMs: 800 });
    } catch (e) {
      try {
        console.log(`[api] POST /api/stop -> 500 ${e?.message || e}`);
      } catch (_) {}
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/pause', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    if (jobs.size === 0) return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
    if (!jobId && jobs.size > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({ error: 'Job not found' });
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('PAUSE\n');
        job.paused = true;
        broadcastProgress({ ...job.metrics, stage: job.stage, paused: true }, job.id, job.metrics);
        try {
          console.log(`[api] POST /api/pause -> paused=true jobId=${job.id}`);
        } catch (_) {}
        return res.json({ ok: true, paused: true });
      }
      try {
        console.log('[api] POST /api/pause -> stdin unavailable');
      } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try {
        console.log(`[api] POST /api/pause -> 500 ${e?.message || e}`);
      } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/resume', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    if (jobs.size === 0) return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
    if (!jobId && jobs.size > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({ error: 'Job not found' });
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('RESUME\n');
        job.paused = false;
        broadcastProgress({ ...job.metrics, stage: job.stage, paused: false }, job.id, job.metrics);
        try {
          console.log(`[api] POST /api/resume -> paused=false jobId=${job.id}`);
        } catch (_) {}
        return res.json({ ok: true, paused: false });
      }
      try {
        console.log('[api] POST /api/resume -> stdin unavailable');
      } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try {
        console.log(`[api] POST /api/resume -> 500 ${e?.message || e}`);
      } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

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

  // Expose a shutdown helper so the outer server can close cleanly on Ctrl-C
  app.locals._attachSignalHandlers = (httpServer) => {
    const sockets = new Set();
    try {
      httpServer.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
    } catch (_) {}
    const shutdown = (signal) => {
      // Stop child crawler if running
      try {
        if (child && typeof child.kill === 'function') child.kill('SIGTERM');
      } catch (_) {}
      try {
  configManager?.close?.();
      } catch (_) {}
      try {
        app.locals?._cleanupTempDb?.();
      } catch (_) {}
      // End SSE clients to unblock server.close
      try {
        for (const client of sseClients) {
          try {
            client.res.end();
          } catch (_) {}
        }
      } catch (_) {}
      // Attempt graceful close, then force-destroy lingering sockets
      try {
        httpServer.close(() => process.exit(0));
        const t = setTimeout(() => {
          try {
            for (const s of sockets) {
              try {
                s.destroy();
              } catch (_) {}
            }
          } catch (_) {}
          try {
            process.exit(0);
          } catch (_) {
            /* noop */ }
        }, 500);
        try {
          t.unref?.();
        } catch (_) {}
      } catch (_) {
        process.exit(0);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  };

  return app;
}

function parsePort(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const port = Math.trunc(n);
  if (port < 0 || port > 65535) return null;
  return port;
}

function buildPortCandidates() {
  const candidates = [];
  const seen = new Set();
  const envPort = parsePort(process.env.PORT);

  if (envPort !== null) {
    candidates.push(envPort);
    seen.add(envPort);
    if (envPort === 0) {
      return candidates;
    }
  }

  const HIGH_PORT_BASE = 41000;
  const HIGH_PORT_END = 61000;
  for (let port = HIGH_PORT_BASE; port <= HIGH_PORT_END; port++) {
    if (seen.has(port)) continue;
    candidates.push(port);
    seen.add(port);
  }

  if (!seen.has(0)) {
    candidates.push(0);
  }

  return candidates;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const configManager = app.locals?.configManager;
  server.on('close', () => {
    try {
      configManager?.close?.();
    } catch (_) {}
    try {
      app.locals?._cleanupTempDb?.();
    } catch (_) {}
  });
  const candidates = buildPortCandidates();

  let attemptIndex = 0;
  let lastRequestedPort = null;
  let listeningLogged = false;

  const tryListen = () => {
    if (attemptIndex >= candidates.length) {
      const err = new Error('Unable to find an available port');
      if (!QUIET) console.error(`[server] ${err.message}`);
      server.emit('error', err);
      return;
    }
    const nextPort = candidates[attemptIndex++];
    lastRequestedPort = nextPort;
    try {
      server.listen(nextPort);
    } catch (err) {
      if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attemptIndex < candidates.length) {
        if (!QUIET) {
          console.warn(`[server] Port ${nextPort} unavailable (${err.code}); retrying with ${candidates[attemptIndex]}${candidates[attemptIndex] === 0 ? ' (ephemeral)' : ''}`);
        }
        tryListen();
        return;
      }
      throw err;
    }
  };

  server.on('error', (err) => {
    if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attemptIndex < candidates.length) {
      if (!QUIET) {
        const fallbackPort = candidates[attemptIndex];
        console.warn(`[server] Port ${lastRequestedPort} unavailable (${err.code}); retrying with ${fallbackPort}${fallbackPort === 0 ? ' (ephemeral)' : ''}`);
      }
      tryListen();
      return;
    }
    if (!QUIET) {
      console.error(`[server] Failed to start: ${err.message || err}`);
    }
  });

  server.on('listening', () => {
    if (listeningLogged) return;
    listeningLogged = true;
    try {
      const addr = server.address();
      const port = (addr && typeof addr === 'object') ? addr.port : lastRequestedPort;
      console.log(`GUI server listening on http://localhost:${port}`);
    } catch (_) {
      if (lastRequestedPort != null) {
        console.log(`GUI server listening on http://localhost:${lastRequestedPort}`);
      } else {
        console.log('GUI server listening');
      }
    }
  });

  tryListen();

  // Install foreground signal handlers (Ctrl-C will close server and child)
  app.locals._attachSignalHandlers?.(server);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};