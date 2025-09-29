const http = require('http');
const express = require('express');
const compression = require('compression');
const path = require('path');
const {
  spawn
} = require('child_process');
const fs = require('fs');
const {
  EventEmitter
} = require('events');
const {
  performance
} = require('perf_hooks');
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
  createGazetteerApiRouter
} = require('./routes/api.gazetteer');
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
  createGazetteerCountryRouter
} = require('./routes/ssr.gazetteer.country');
const {
  createQueuesSsrRouter
} = require('./routes/ssr.queues');
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
  ConfigManager
} = require('../../config/ConfigManager');
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
  const urlsDbPath = options.dbPath || (envDb ? envDb : path.join(__dirname, '..', '..', '..', 'data', 'news.db'));
  // Verbose logging (disabled by default). Enable with options.verbose=true or UI_VERBOSE=1|true
  const verbose = options.verbose === true || String(process.env.UI_VERBOSE || '').toLowerCase() === '1' || String(process.env.UI_VERBOSE || '').toLowerCase() === 'true';
  const app = express();
  const priorityConfigPath = options.priorityConfigPath || process.env.UI_PRIORITY_CONFIG || process.env.UI_PRIORITY_CONFIG_PATH || null;
  const shouldWatchConfig = options.watchPriorityConfig !== undefined ?
    !!options.watchPriorityConfig :
    !process.env.JEST_WORKER_ID;
  const configManager = options.configManager || new ConfigManager(priorityConfigPath, {
    watch: shouldWatchConfig
  });
  app.locals.configManager = configManager;
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
  // Small guard window after a start to avoid immediate double-start races in single-job mode
  let jobStartGuardUntil = 0;
  let startedAt = null;
  let lastExit = null;
  let paused = false;
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
  // Tiny in-memory TTL cache for expensive aggregates
  const summaryCache = {
    ttlMs: 60 * 1000,
    at: 0,
    data: null
  };
  // Writable DB handle (lazy). Used for queue/job persistence and read APIs.
  let _dbRW = null;

  function getDbRW() {
    if (_dbRW) return _dbRW;
    try {
      const {
        ensureDb
      } = require('../../ensure_db');
      const db = ensureDb(urlsDbPath);
      // Ensure minimal queue persistence schema (idempotent)
      db.exec(`
        CREATE TABLE IF NOT EXISTS crawl_jobs (
          id TEXT PRIMARY KEY,
          url TEXT,
          args TEXT,
          pid INTEGER,
          started_at TEXT,
          ended_at TEXT,
          status TEXT
        );
        CREATE TABLE IF NOT EXISTS queue_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          action TEXT NOT NULL,
          url TEXT,
          depth INTEGER,
          host TEXT,
          reason TEXT,
          queue_size INTEGER,
          FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_queue_events_job_ts ON queue_events(job_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_events_action ON queue_events(action);
        CREATE INDEX IF NOT EXISTS idx_queue_events_host ON queue_events(host);
        -- Crawl types catalog (name, description, json declaration)
        CREATE TABLE IF NOT EXISTS crawl_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          declaration TEXT NOT NULL -- JSON string describing flags/behavior
        );
        CREATE TABLE IF NOT EXISTS crawler_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS crawl_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          host TEXT,
          kind TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          url TEXT,
          payload TEXT,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_crawl_tasks_job_status ON crawl_tasks(job_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_crawl_tasks_status ON crawl_tasks(status, created_at DESC);

        CREATE TABLE IF NOT EXISTS analysis_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          status TEXT NOT NULL,
          stage TEXT,
          analysis_version INTEGER,
          page_limit INTEGER,
          domain_limit INTEGER,
          skip_pages INTEGER,
          skip_domains INTEGER,
          dry_run INTEGER,
          verbose INTEGER,
          summary TEXT,
          last_progress TEXT,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_runs_started_at ON analysis_runs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status, started_at DESC);

        CREATE TABLE IF NOT EXISTS analysis_run_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          ts TEXT NOT NULL,
          stage TEXT,
          message TEXT,
          details TEXT,
          FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_run_events_run_ts ON analysis_run_events(run_id, ts DESC);
      `);
      // Seed default crawl types if table is empty
      try {
        const count = db.prepare('SELECT COUNT(*) AS c FROM crawl_types').get().c;
        if (!count) {
          const ins = db.prepare('INSERT INTO crawl_types(name, description, declaration) VALUES (?, ?, ?)');
          ins.run('basic', 'Follow links only (no sitemap)', JSON.stringify({
            crawlType: 'basic',
            useSitemap: false,
            sitemapOnly: false
          }));
          ins.run('sitemap-only', 'Use only the sitemap to discover pages', JSON.stringify({
            crawlType: 'sitemap-only',
            useSitemap: true,
            sitemapOnly: true
          }));
          ins.run('basic-with-sitemap', 'Follow links and also use the sitemap', JSON.stringify({
            crawlType: 'basic-with-sitemap',
            useSitemap: true,
            sitemapOnly: false
          }));
          // Intelligent variant (planner-enabled) – inherits sitemap behavior of basic-with-sitemap
          ins.run('intelligent', 'Intelligent planning (hubs + sitemap + heuristics)', JSON.stringify({
            crawlType: 'intelligent',
            useSitemap: true,
            sitemapOnly: false
          }));
        }
      } catch (_) {}
      // Indexes to keep large queue scans fast (keyset pagination by id)
      try {
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_queue_events_job_id_desc ON queue_events(job_id, id DESC);
          CREATE INDEX IF NOT EXISTS idx_queue_events_job_action_id_desc ON queue_events(job_id, action, id DESC);
          -- Problems raised by intelligent mode or heuristics
          CREATE TABLE IF NOT EXISTS crawl_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_crawl_problems_job_ts ON crawl_problems(job_id, ts DESC);
          -- Milestones (positive achievements/learned patterns)
          CREATE TABLE IF NOT EXISTS crawl_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            scope TEXT,
            target TEXT,
            message TEXT,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_crawl_milestones_job_ts ON crawl_milestones(job_id, ts DESC);
          CREATE TABLE IF NOT EXISTS planner_stage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            stage TEXT,
            status TEXT,
            sequence INTEGER,
            duration_ms INTEGER,
            details TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_planner_stage_events_job_ts ON planner_stage_events(job_id, ts DESC);
        `);
      } catch (_) {
        /* ignore index create errors */ }
      _dbRW = db;
    } catch (_) {
      _dbRW = null; // gracefully disable persistence if unavailable
    }
    return _dbRW;
  }

  // metrics snapshot populated from PROGRESS events (legacy aggregate)
  const progress = createProgressBroadcaster({
    broadcast,
    getPaused: () => paused,
    setPaused: (v) => {
      paused = !!v;
    },
    legacyMetrics: {
      visited: 0,
      downloaded: 0,
      found: 0,
      saved: 0,
      errors: 0,
      queueSize: 0,
      running: 0,
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
  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    extensions: ['html']
  }));

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
  // Mount crawls API router (list, detail, and job-scoped controls)
  app.use(createCrawlsApiRouter({
    jobs,
    broadcastProgress: (...args) => progress.broadcastProgress(...args),
    QUIET
  }));
  // Mount queues API router
  app.use(createQueuesApiRouter({
    getDbRW
  }));
  // Mount misc API router (status, crawl-types, health, metrics)
  app.use(createMiscApiRouter({
    jobs,
    getLegacy: () => ({
      startedAt,
      lastExit,
      paused
    }),
    getMetrics: () => metrics,
    getDbRW,
    QUIET
  }));
  // Mount URLs APIs (list, details, fetch-body)
  app.use(createUrlsApiRouter({
    urlsDbPath
  }));
  app.use(createRecentDomainsApiRouter({
    urlsDbPath
  }));
  // Mount Analysis APIs (read-only history)
  app.use(createAnalysisApiRouter({
    getDbRW
  }));
  // Mount Problems APIs (read-only)
  app.use(createProblemsApiRouter({
    getDbRW
  }));
  // Mount shared navigation API for clients needing link metadata
  app.use(createNavigationApiRouter());
  app.use(createGazetteerApiRouter({
    urlsDbPath
  }));
  // Queues SSR pages (list, detail, latest redirect)
  app.use(createQueuesSsrRouter({
    getDbRW,
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
  app.use(createGazetteerCountryRouter({
    urlsDbPath,
    startTrace
  }));
  // Mount Coverage Analytics APIs
  app.use(createCoverageApiRouter({
    getDbRW
  }));
  // Mount Configuration APIs
  app.use('/api/config', createConfigApiRouter(configManager));

  function formatDuration(ms) {
    if (ms == null) return '';
    const num = Number(ms);
    if (!Number.isFinite(num) || num < 0) return '';
    const totalSeconds = Math.floor(num / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!parts.length || seconds || (!hours && !minutes)) parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  function formatPagesStep(step) {
    if (!step) return '';
    if (step.skipped) return 'skipped';
    const parts = [];
    if (Number.isFinite(step.analysed)) parts.push(`${step.analysed} analysed`);
    if (Number.isFinite(step.updated)) parts.push(`${step.updated} updated`);
    if (Number.isFinite(step.placesInserted)) parts.push(`${step.placesInserted} places`);
    return parts.join(', ');
  }

  function formatDomainsStep(step) {
    if (!step) return '';
    if (step.skipped) return 'skipped';
    const parts = [];
    if (step.completed) parts.push('completed');
    if (Number.isFinite(step.limit)) parts.push(`limit ${step.limit}`);
    return parts.join(', ');
  }

  function formatMilestonesStep(step) {
    if (!step) return '';
    if (step.skipped) return 'skipped';
    if (Number.isFinite(step.count)) {
      const suffix = step.dryRun ? ' (dry-run)' : '';
      return `${step.count} awarded${suffix}`;
    }
    if (step.dryRun) return 'dry-run';
    return '';
  }

  // Simple tracing helper for SSR pages (gated by verbose)
  function startTrace(req, tag = 'gazetteer') {
    if (!verbose) {
      // No-op tracer
      const noop = () => {};
      return {
        pre: () => noop,
        end: noop
      };
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
    return {
      pre,
      end
    };
  }

  function broadcast(event, data, forcedJobId = null) {
    return broadcaster.broadcast(event, data, forcedJobId);
  }

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

  const broadcastProgress = progress.broadcastProgress;

  // /api/crawl-types moved to routes/api.misc.js

  app.post('/api/crawl', (req, res) => {
    const t0 = Date.now();
    const perfStart = performance.now();
    try {
      console.log(`[api] POST /api/crawl received (runningJobs=${jobs.size})`);
    } catch (_) {}
    const now = Date.now();
    if (!allowMultiJobs && (jobs.size > 0 || now < jobStartGuardUntil)) {
      try {
        console.log(`[api] POST /api/crawl -> 409 already-running`);
      } catch (_) {}
      return res.status(409).json({
        error: 'Crawler already running'
      });
    }
    const t1 = Date.now();
    const args = buildArgs(req.body || {});
    const jobId = newJobId();
    const t2 = Date.now();
    // Ensure crawler child uses the same DB as the UI server unless explicitly overridden
    if (!args.some(a => /^--db=/.test(a))) {
      args.push(`--db=${urlsDbPath}`);
    }
    if (!args.some(a => /^--job-id=/.test(a))) {
      args.push(`--job-id=${jobId}`);
    }
    const child = runner.start(args);
    const t3 = Date.now();
    // Create job record
    const job = {
      id: jobId,
      child,
      args: [...args],
      url: (Array.isArray(args) && args.length > 1 ? args[1] : null),
      startedAt: new Date().toISOString(),
      lastExit: null,
      paused: false,
      stdoutBuf: '',
      stderrBuf: '',
      stage: 'preparing',
      stageChangedAt: Date.now(),
      // Cache stdin handle so controls can still function if child reference is swapped/null briefly
      stdin: child && child.stdin && typeof child.stdin.write === 'function' ? child.stdin : null,
      metrics: {
        visited: 0,
        downloaded: 0,
        found: 0,
        saved: 0,
        errors: 0,
        queueSize: 0,
        running: 1,
        _lastSampleTime: Date.now(),
        _lastVisited: 0,
        _lastDownloaded: 0,
        requestsPerSec: 0,
        downloadsPerSec: 0,
        errorRatePerMin: 0,
        bytesPerSec: 0,
        stage: 'preparing'
      },
      watchdogTimers: []
    };
    // Normalize interface: ensure stdout/stderr are EventEmitters that emit 'data'
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();
    jobs.set(jobId, job);
    broadcastJobs(true);
    // Set a short guard window to account for ultra-fast fake runners exiting immediately
    // Slightly longer window (600ms) to be robust under parallel test load
    try {
      jobStartGuardUntil = Date.now() + 600;
    } catch (_) {
      jobStartGuardUntil = now + 600;
    }

    // Persist job start (best-effort) — defer until after response to keep POST fast
    const persistStart = () => {
      try {
        const db = getDbRW();
        if (db) {
          db.prepare(`INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, status) VALUES (?, ?, ?, ?, ?, 'running')`)
            .run(jobId, job.url || null, JSON.stringify(args), child?.pid || null, job.startedAt);
        }
      } catch (_) {
        /* ignore db errors */ }
    };

    // Prepare common exit handler up-front so we can attach listeners immediately
    let exitEmitted = false;
    const onExit = (code, signal, extraInfo = null) => {
      if (exitEmitted) return; // guard against both 'exit' and 'close'
      exitEmitted = true;
      try {
        if (job.killTimer) {
          clearTimeout(job.killTimer);
          job.killTimer = null;
        }
        clearJobWatchdogs(job);
      } catch (_) {}
      const endedAt = new Date().toISOString();
      const extras = (extraInfo && typeof extraInfo === 'object' && extraInfo !== null) ? extraInfo : null;
      const stageForExit = extras && extras.error ? 'failed' : 'done';
      updateJobStage(job, stageForExit);
      job.lastExit = extras ? {
        code,
        signal,
        endedAt,
        ...extras
      } : {
        code,
        signal,
        endedAt
      };
      try {
        if (!QUIET) console.log(`[child] exit code=${code} signal=${signal}`);
      } catch (_) {}
      // Mark child as gone immediately so status becomes 'done' in detail snapshot
      try {
        job.child = null;
      } catch (_) {}
      // Update job record (best-effort)
      try {
        const db = getDbRW();
        if (db) {
          db.prepare(`UPDATE crawl_jobs SET ended_at = ?, status = 'done' WHERE id = ?`).run(job.lastExit.endedAt, jobId);
        }
      } catch (_) {}
      // Include jobId on terminal event
      try {
        broadcast('done', {
          ...job.lastExit,
          jobId
        }, jobId);
      } catch (_) {
        broadcast('done', job.lastExit, jobId);
      }
      // Remove job after a brief delay to reduce control/status races on ultra-fast runs
      setTimeout(() => {
        try {
          jobs.delete(jobId);
        } catch (_) {}
        try {
          broadcastJobs(true);
        } catch (_) {}
        // update legacy aggregate
        const first = getFirstJob();
        if (!first) {
          startedAt = null;
          lastExit = job.lastExit;
          metrics.running = 0;
          paused = false;
        }
      }, 350);
    };
    // Attach error/exit listeners immediately to avoid missing early events
    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      child.on('close', (code, signal) => onExit(code, signal));
      child.on('error', (err) => {
        try {
          if (job.killTimer) {
            clearTimeout(job.killTimer);
            job.killTimer = null;
          }
        } catch (_) {}
        const msg = (err && err.message) ? err.message : String(err);
        try {
          console.log(`[child] error: ${msg}`);
        } catch (_) {}
        broadcast('log', {
          stream: 'server',
          line: `[server] crawler failed to start: ${msg}\n`
        }, jobId);
        onExit(null, null, {
          error: msg
        });
      });
    }

    // Update legacy aggregate for first job
    const first = getFirstJob();
    if (first && first.id === jobId) {
      startedAt = job.startedAt;
      metrics.running = 1;
      metrics._lastSampleTime = Date.now();
      metrics._lastVisited = 0;
      metrics._lastDownloaded = 0;
      lastExit = null;
      paused = false;
    }

    // Respond immediately so UI/tests see fast acceptance
    const initialDurationMs = Math.max(0, performance.now() - perfStart);
    try {
      res.status(202).json({
        pid: child.pid || null,
        args,
        jobId,
        stage: job.stage,
        durationMs: Number(initialDurationMs.toFixed(3))
      });
    } catch (_) {
      try {
        /* ignore */ } catch (_) {}
    }
    const t4 = Date.now();
    if (traceStart) {
      try {
        console.log(`[trace] start handler timings job=${jobId} buildArgs=${t2-t1}ms spawn=${t3-t2}ms respond=${t4-t3}ms totalSoFar=${t4-t0}ms`);
      } catch (_) {}
    }
    // Kick off best-effort persistence off the hot path
    try {
      setImmediate(persistStart);
    } catch (_) {
      try {
        setTimeout(persistStart, 0);
      } catch (_) {}
    }

    // Defer non-critical work to next tick to avoid delaying the response under load
    const defer = (fn) => {
      try {
        setImmediate(fn);
      } catch (_) {
        setTimeout(fn, 0);
      }
    };
    defer(() => {
      const td0 = Date.now();
      // Immediately surface that the crawler has started and seed a progress frame so the UI updates
      try {
        broadcast('log', {
          stream: 'server',
          line: `[server] starting crawler pid=${child?.pid || 'n/a'}\n`
        }, jobId);
        // Seed initial progress and include optional domain telemetry defaults so UI/tests see the fields immediately
        broadcastProgress({
          stage: job.stage,
          visited: 0,
          downloaded: 0,
          found: 0,
          saved: 0,
          errors: 0,
          queueSize: 0,
          paused: false,
          domainRateLimited: false,
          domainIntervalMs: null
        }, jobId, job.metrics);
        try {
          console.log(`[api] crawler started pid=${child?.pid||'n/a'} jobId=${jobId} args=${JSON.stringify(args)}`);
        } catch (_) {}
      } catch (_) {}
      const td1 = Date.now();
      // Seed jobs list right away
      try {
        broadcastJobs(true);
      } catch (_) {}
      const td2 = Date.now();

      // Startup watchdog: if no child output or progress within a short window, surface hints.
      // In TEST_FAST mode shorten the timers drastically (or skip) to avoid prolonging test runtime or producing late logs.
      try {
        const TEST_FAST = process.env.TEST_FAST === '1' || process.env.TEST_FAST === 'true';
        const firstDelay = TEST_FAST ? 600 : 3000;
        const secondDelay = TEST_FAST ? 1500 : 10000;
        if (!TEST_FAST || firstDelay > 0) {
          const t1 = setTimeout(() => {
            try {
              if (!job._outputSeen && job.child) {
                const hint = '[server] waiting for crawler output… (this can be caused by large SQLite DB init or slow network)';
                if (!QUIET) console.log(hint);
                broadcast('log', {
                  stream: 'server',
                  line: hint + '\n'
                }, jobId);
              }
            } catch (_) {}
          }, firstDelay);
          t1.unref?.();
          job.watchdogTimers?.push(t1);
        }
        if (!TEST_FAST || secondDelay > 0) {
          const t2 = setTimeout(() => {
            try {
              if (!job._outputSeen && job.child) {
                const hint = '[server] still waiting… check firewall/proxy and DB availability; try depth=0, maxPages=1';
                if (!QUIET) console.log(hint);
                broadcast('log', {
                  stream: 'server',
                  line: hint + '\n'
                }, jobId);
              }
            } catch (_) {}
          }, secondDelay);
          t2.unref?.();
          job.watchdogTimers?.push(t2);
        }
      } catch (_) {}
      const td3 = Date.now();
      if (traceStart) {
        try {
          console.log(`[trace] start defer timings job=${jobId} seed=${td1-td0}ms jobsBroadcast=${td2-td1}ms watchdogSetup=${td3-td2}ms`);
        } catch (_) {}
      }
    });

    let _firstOutputAt = 0;
    child.stdout.on('data', (chunk) => {
      if (!_firstOutputAt) {
        _firstOutputAt = Date.now();
        if (traceStart) {
          try {
            console.log(`[trace] first child stdout job=${jobId} after ${_firstOutputAt - t0}ms`);
          } catch (_) {}
        }
      }
      job._outputSeen = true;
      clearJobWatchdogs(job);
      job.stdoutBuf += chunk.toString();
      let idx;
      while ((idx = job.stdoutBuf.indexOf('\n')) !== -1) {
        const line = job.stdoutBuf.slice(0, idx);
        job.stdoutBuf = job.stdoutBuf.slice(idx + 1);
        if (!line) continue;
        // Mirror a few key lines to server console for live diagnostics (keep noise low)
        try {
          if (/^(Loading robots\.txt|robots\.txt loaded|Fetching:|Sitemap enqueue complete|Crawling completed|Final stats)/.test(line)) {
            if (!QUIET) console.log(`[child:stdout] ${line}`);
          }
        } catch (_) {}
        // Prefer structured events over raw log echoes to reduce client work
        if (line.startsWith('ERROR ')) {
          try {
            const obj = JSON.parse(line.slice('ERROR '.length));
            broadcast('error', obj, jobId);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('CACHE ')) {
          try {
            const obj = JSON.parse(line.slice('CACHE '.length));
            broadcast('cache', obj, jobId);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PROGRESS ')) {
          try {
            const obj = JSON.parse(line.slice('PROGRESS '.length));
            if (job.stage !== 'running') updateJobStage(job, 'running');
            if (!Object.prototype.hasOwnProperty.call(obj, 'stage')) obj.stage = job.stage;
            try {
              if (!QUIET) console.log(`[child:progress] v=${obj.visited||0} d=${obj.downloaded||0} q=${obj.queueSize||0}`);
            } catch (_) {}
            broadcastProgress(obj, jobId, job.metrics);
            broadcastJobs(false);
            continue;
          } catch (_) {}
        }
        if (line.startsWith('QUEUE ')) {
          try {
            const obj = JSON.parse(line.slice('QUEUE '.length));
            // Expected shape (example): { action: 'enqueued'|'dequeued'|'retry'|'drop', url, depth?, host?, reason?, queueSize? }
            broadcast('queue', obj, jobId);
            // Persist event (best-effort)
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                db.prepare(`INSERT INTO queue_events(job_id, ts, action, url, depth, host, reason, queue_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                  .run(jobId, ts, String(obj.action || ''), obj.url || null, (obj.depth != null ? obj.depth : null), obj.host || null, obj.reason || null, (obj.queueSize != null ? obj.queueSize : null));
              }
            } catch (_) {}
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PROBLEM ')) {
          try {
            const obj = JSON.parse(line.slice('PROBLEM '.length));
            // Derive severity (not stored yet; added to SSE payload)
            broadcast('problem', obj, jobId);
            // Persist best-effort (without severity column to keep table normalized); future migrations can add it if needed
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                db.prepare(`INSERT INTO crawl_problems(job_id, ts, kind, scope, target, message, details) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                  .run(jobId, ts, String(obj.kind || ''), obj.scope || null, obj.target || null, obj.message || null, obj.details != null ? (typeof obj.details === 'string' ? obj.details : JSON.stringify(obj.details)) : null);
              }
            } catch (_) {}
            continue;
          } catch (_) {}
        }
        if (line.startsWith('PLANNER_STAGE ')) {
          try {
            const obj = JSON.parse(line.slice('PLANNER_STAGE '.length));
            broadcast('planner-stage', obj, jobId);
            try {
              const db = getDbRW();
              if (db) {
                const ts = obj.ts || new Date().toISOString();
                db.prepare(`INSERT INTO planner_stage_events(job_id, ts, stage, status, sequence, duration_ms, details) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                  .run(
                    jobId,
                    ts,
                    obj.stage != null ? String(obj.stage) : null,
                    obj.status != null ? String(obj.status) : null,
                    obj.sequence != null ? obj.sequence : null,
                    obj.durationMs != null ? obj.durationMs : null,
                    obj.details != null ? (typeof obj.details === 'string' ? obj.details : JSON.stringify(obj.details)) : null
                  );
              }
            } catch (_) {}
            continue;
          } catch (_) {}
        }
        if (line.startsWith('MILESTONE ')) {
          try {
            const obj = JSON.parse(line.slice('MILESTONE '.length));
            broadcast('milestone', obj, jobId);
            // Persist best-effort
            try {
              const db = getDbRW();
              if (db) {
                const ts = new Date().toISOString();
                db.prepare(`INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                  .run(jobId, ts, String(obj.kind || ''), obj.scope || null, obj.target || null, obj.message || null, obj.details != null ? (typeof obj.details === 'string' ? obj.details : JSON.stringify(obj.details)) : null);
              }
            } catch (_) {}
            continue;
          } catch (_) {}
        }
        const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
        if (m) {
          broadcastProgress({
            stage: job.stage,
            visited: parseInt(m[1], 10),
            downloaded: parseInt(m[2], 10),
            found: parseInt(m[3], 10),
            saved: parseInt(m[4], 10)
          }, jobId, job.metrics);
          continue;
        }
        // If not a structured line, forward as log (rate-limited in broadcast)
        broadcast('log', {
          stream: 'stdout',
          line: line + '\n'
        }, jobId);
      }
    });

    child.stderr.on('data', (chunk) => {
      job.stderrBuf += chunk.toString();
      let idx;
      while ((idx = job.stderrBuf.indexOf('\n')) !== -1) {
        const line = job.stderrBuf.slice(0, idx);
        job.stderrBuf = job.stderrBuf.slice(idx + 1);
        if (!line) continue;
        // Rate-limited in broadcast
        broadcast('log', {
          stream: 'stderr',
          line: line + '\n'
        }, jobId);
      }
    });

    // (exit/error handlers already attached above)
  });

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
      res.status(500).json({
  error: err?.message || String(err)
      });
    }
  });

  // /api/crawls* routes are now provided by createCrawlsApiRouter

  app.post('/api/stop', (req, res) => {
  const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    if (jobs.size === 0) return res.status(200).json({
      stopped: false
    });
    if (!jobId && jobs.size > 1) return res.status(400).json({
      error: 'Multiple jobs running; specify jobId'
    });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({
        error: 'Job not found'
      });
      const target = job.child;
  if (typeof target?.kill === 'function') target.kill('SIGTERM');
      // Escalate if the process does not exit promptly
      try {
        if (job.killTimer) {
          clearTimeout(job.killTimer);
          job.killTimer = null;
        }
      } catch (_) {}
      job.killTimer = setTimeout(() => {
        try {
          if (target && !target.killed) {
            // On Windows, SIGKILL may still work via Node; additionally attempt taskkill
            try {
              target.kill('SIGKILL');
            } catch (_) {}
            if (process.platform === 'win32' && target.pid) {
              try {
                const {
                  exec
                } = require('child_process');
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
        console.log(`[api] POST /api/stop -> 202 stop requested jobId=${jobId||job.id} pid=${target?.pid||'n/a'}`);
      } catch (_) {}
      res.status(202).json({
        stopped: true,
        escalatesInMs: 800
      });
    } catch (e) {
      try {
        console.log(`[api] POST /api/stop -> 500 ${e?.message||e}`);
      } catch (_) {}
      res.status(500).json({
        error: e.message
      });
    }
  });

  // Pause/resume endpoints: communicate via child stdin line commands
  app.post('/api/pause', (req, res) => {
  const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    // Gracefully handle not-running with 200 to simplify UI/test flows
    if (jobs.size === 0) return res.status(200).json({
      ok: false,
      paused: false,
      error: 'not-running'
    });
    if (!jobId && jobs.size > 1) return res.status(400).json({
      error: 'Multiple jobs running; specify jobId'
    });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({
        error: 'Job not found'
      });
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('PAUSE\n');
        job.paused = true;
        broadcastProgress({
          ...job.metrics,
          stage: job.stage,
          paused: true
        }, job.id, job.metrics);
        try {
          console.log(`[api] POST /api/pause -> paused=true jobId=${job.id}`);
        } catch (_) {}
        return res.json({
          ok: true,
          paused: true
        });
      }
      try {
        console.log('[api] POST /api/pause -> stdin unavailable');
      } catch (_) {}
      return res.status(200).json({
        ok: false,
        paused: false,
        error: 'stdin unavailable'
      });
    } catch (e) {
      try {
        console.log(`[api] POST /api/pause -> 500 ${e?.message||e}`);
      } catch (_) {}
      return res.status(500).json({
        error: e.message
      });
    }
  });
  app.post('/api/resume', (req, res) => {
  const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    // Gracefully handle not-running with 200 to simplify UI/test flows
    if (jobs.size === 0) return res.status(200).json({
      ok: false,
      paused: false,
      error: 'not-running'
    });
    if (!jobId && jobs.size > 1) return res.status(400).json({
      error: 'Multiple jobs running; specify jobId'
    });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({
        error: 'Job not found'
      });
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('RESUME\n');
        job.paused = false;
        broadcastProgress({
          ...job.metrics,
          stage: job.stage,
          paused: false
        }, job.id, job.metrics);
        try {
          console.log(`[api] POST /api/resume -> paused=false jobId=${job.id}`);
        } catch (_) {}
        return res.json({
          ok: true,
          paused: false
        });
      }
      try {
        console.log('[api] POST /api/resume -> stdin unavailable');
      } catch (_) {}
      return res.status(200).json({
        ok: false,
        paused: false,
        error: 'stdin unavailable'
      });
    } catch (e) {
      try {
        console.log(`[api] POST /api/resume -> 500 ${e?.message||e}`);
      } catch (_) {}
      return res.status(500).json({
        error: e.message
      });
    }
  });

  // /metrics moved to routes/api.misc.js

  // /api/queues* routes are now provided by createQueuesApiRouter

  // /events route moved to routes/events.js

  // /health moved to routes/api.misc.js

  // Analysis SSR surfaces (list + detail)
  app.get('/analysis', (req, res) => {
    res.redirect('/analysis/ssr');
  });

  app.get('/analysis/ssr', (req, res) => {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
    const formatDuration = (ms) => {
      if (!Number.isFinite(ms) || ms <= 0) return '—';
      if (ms < 1000) return `${ms | 0}ms`;
      const seconds = ms / 1000;
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const minutes = Math.floor(seconds / 60);
      const remaining = Math.round(seconds % 60);
      return `${minutes}m ${remaining}s`;
    };
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(503).send('<!doctype html><title>Analysis</title><body><p>Database unavailable.</p></body></html>');
      }
      ensureAnalysisRunSchema(db);
      const { items, total } = listAnalysisRuns(db, { limit });
      const rowsHtml = items.length ? items.map((run) => {
        const duration = run.durationMs != null ? formatDuration(run.durationMs) : '—';
        const status = esc(run.status || 'unknown');
        const stage = esc(run.stage || '—');
        const config = [
          run.pageLimit != null ? `pages: ${run.pageLimit}` : null,
          run.domainLimit != null ? `domains: ${run.domainLimit}` : null,
          run.skipPages ? 'skipPages' : null,
          run.skipDomains ? 'skipDomains' : null,
          run.dryRun ? 'dryRun' : null
        ].filter(Boolean).join(', ');
        return `
          <tr>
            <td class="mono"><a href="/analysis/${esc(run.id)}/ssr">${esc(run.id)}</a></td>
            <td>${status}</td>
            <td>${stage}</td>
            <td>${esc(run.startedAt || '—')}</td>
            <td>${esc(run.endedAt || '—')}</td>
            <td>${esc(duration)}</td>
            <td>${esc(config || '—')}</td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="7" class="meta">No analysis runs yet.</td></tr>';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Analysis runs</h1>
      ${renderNav('analysis')}
    </header>
    <form class="filters" method="GET" action="/analysis/ssr">
      <label>Limit <input type="number" min="1" max="200" name="limit" value="${esc(limit)}"/></label>
      <button type="submit">Apply</button>
      <span class="meta">Total ${esc(total)}</span>
    </form>
    <table>
      <thead><tr><th>ID</th><th>Status</th><th>Stage</th><th>Started</th><th>Ended</th><th>Duration</th><th>Config</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</body></html>`;
      return res.type('html').send(html);
    } catch (err) {
      const message = esc(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis runs: ${message}</p></body></html>`);
    }
  });

  app.get('/analysis/:id/ssr', (req, res) => {
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
    const safeScript = (value) => {
      const json = JSON.stringify(value ?? {});
      return json
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    };
    const runId = String(req.params.id || '').trim();
    if (!runId) {
      return res.status(400).send('<!doctype html><title>Analysis</title><body><p>Missing analysis run id.</p></body></html>');
    }
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(503).send('<!doctype html><title>Analysis</title><body><p>Database unavailable.</p></body></html>');
      }
      ensureAnalysisRunSchema(db);
      const detail = getAnalysisRun(db, runId);
      if (!detail) {
        return res.status(404).send('<!doctype html><title>Analysis</title><body><p>Analysis run not found.</p></body></html>');
      }
      const { run, events } = detail;
  const summaryPretty = run.summary ? esc(JSON.stringify(run.summary, null, 2)) : 'No summary yet.';
      const eventsHtml = events.length ? events.map((event) => `
        <tr>
          <td class="nowrap">${esc(event.ts || '')}</td>
          <td>${esc(event.stage || '')}</td>
          <td>${esc(event.message || '')}</td>
        </tr>
      `).join('') : '<tr><td colspan="3" class="meta">No events logged.</td></tr>';
      const safePayload = safeScript(detail);
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${esc(run.id)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1000px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  section{margin-bottom:24px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  pre{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;overflow:auto}
  .meta{color:var(--muted);font-size:12px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Analysis run <span class="mono">${esc(run.id)}</span></h1>
      ${renderNav('analysis')}
    </header>
    <section>
      <h2>Overview</h2>
      <table>
        <tbody>
          <tr><th>Status</th><td>${esc(run.status || 'unknown')}</td></tr>
          <tr><th>Stage</th><td>${esc(run.stage || '—')}</td></tr>
          <tr><th>Started</th><td>${esc(run.startedAt || '—')}</td></tr>
          <tr><th>Ended</th><td>${esc(run.endedAt || '—')}</td></tr>
          <tr><th>Analysis version</th><td>${run.analysisVersion != null ? esc(run.analysisVersion) : '—'}</td></tr>
          <tr><th>Page limit</th><td>${run.pageLimit != null ? esc(run.pageLimit) : '—'}</td></tr>
          <tr><th>Domain limit</th><td>${run.domainLimit != null ? esc(run.domainLimit) : '—'}</td></tr>
          <tr><th>Flags</th><td>${[run.skipPages ? 'skipPages' : null, run.skipDomains ? 'skipDomains' : null, run.dryRun ? 'dryRun' : null, run.verbose ? 'verbose' : null].filter(Boolean).map(esc).join(', ') || '—'}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Summary</h2>
      <pre>${summaryPretty}</pre>
    </section>
    <section>
      <h2>Events</h2>
      <table>
        <thead><tr><th>Timestamp</th><th>Stage</th><th>Message</th></tr></thead>
        <tbody>${eventsHtml}</tbody>
      </table>
    </section>
  </div>
  <script>window.__ANALYSIS_RUN__ = ${safePayload};</script>
</body></html>`;
      res.type('html').send(html);
    } catch (err) {
      const message = esc(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis run: ${message}</p></body></html>`);
    }
  });

  // Problems SSR (read-only): newest-first problems with filters and simple pager
  app.get('/problems/ssr', (req, res) => {
    const db = getDbRW();
    const render = (items, opts) => {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
      } [c]));
      const rows = items.map(r => {
        const severity = deriveProblemSeverity(r.kind);
        const sevClass = severity === 'warn' ? 'warn' : 'info';
        return `
        <tr>
          <td class="nowrap">${esc(r.ts)}</td>
          <td class="mono">${esc(r.jobId || '')}</td>
          <td><span class="pill ${sevClass}"><code>${esc(r.kind)}</code></span></td>
          <td>${esc(r.scope || '')}</td>
          <td>${esc(r.target || '')}</td>
          <td>${esc(r.message || '')}</td>
        </tr>`;
      }).join('');
      const q = (k, v) => {
        const u = new URL('http://x');
        if (opts.job) u.searchParams.set('job', opts.job);
        if (opts.kind) u.searchParams.set('kind', opts.kind);
        if (opts.scope) u.searchParams.set('scope', opts.scope);
        if (opts.limit) u.searchParams.set('limit', String(opts.limit));
        if (k && v != null) u.searchParams.set(k, String(v));
        const s = u.search.toString();
        return s ? ('?' + s.slice(1)) : '';
      };
      const pager = `
        <div class="row">
          <div class="meta">${items.length} shown</div>
          <div class="right nav-small">
            ${opts.prevAfter?`<a href="/problems/ssr${q('after', opts.prevAfter)}">← Newer</a>`:''}
            ${opts.nextBefore?`<a class="space" href="/problems/ssr${q('before', opts.nextBefore)}">Older →</a>`:''}
          </div>
        </div>`;
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Problems</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .right a{margin-left:8px}
  .space{margin-left:8px}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}
  .pill.warn{background:#fff8e1;border-color:#facc15;color:#92400e}
  .pill.info{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Problems</h1>
  ${renderNav('problems')}
    </header>
    <form class="filters" method="GET" action="/problems/ssr">
      <label>Job <input type="text" name="job" value="${esc(opts.job||'')}"/></label>
      <label>Kind <input type="text" name="kind" value="${esc(opts.kind||'')}"/></label>
      <label>Scope <input type="text" name="scope" value="${esc(opts.scope||'')}"/></label>
      <label>Limit <input type="number" min="1" max="500" name="limit" value="${esc(opts.limit||100)}"/></label>
      <button type="submit">Apply</button>
    </form>
    ${pager}
    <table>
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="meta">No problems</td></tr>'}</tbody>
    </table>
    ${pager}
  </div>
</body></html>`;
      res.type('html').send(html);
    }
    try {
      if (!db) {
        return res.status(503).send('<!doctype html><title>Problems</title><body><p>Database unavailable.</p></body></html>');
      }
      const {
        items,
        cursors,
        appliedFilters
      } = fetchProblems(db, {
        job: req.query.job,
        kind: req.query.kind,
        scope: req.query.scope,
        limit: req.query.limit,
        before: req.query.before,
        after: req.query.after
      });
      const opts = {
        ...appliedFilters,
        ...cursors
      };
      if (!opts.limit) opts.limit = 100;
      render(items, opts);
    } catch (e) {
      try {
        console.log(`[ssr] GET /problems/ssr -> error ${e?.message || e}`);
      } catch (_) {}
      if (res.headersSent) return;
      render([], {});
    }
  });

  // Milestones SSR (read-only): newest-first milestones with filters and simple pager
  app.get('/milestones/ssr', (req, res) => {
    const db = getDbRW();
    const render = (items, opts) => {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
      } [c]));
      const rows = items.map(r => `
        <tr>
          <td class="nowrap">${esc(r.ts)}</td>
          <td class="mono">${esc(r.jobId || '')}</td>
          <td><span class="pill good"><code>${esc(r.kind)}</code></span></td>
          <td>${esc(r.scope || '')}</td>
          <td>${esc(r.target || '')}</td>
          <td>${esc(r.message || '')}</td>
        </tr>
      `).join('');
      const q = (k, v) => {
        const u = new URL('http://x');
        if (opts.job) u.searchParams.set('job', opts.job);
        if (opts.kind) u.searchParams.set('kind', opts.kind);
        if (opts.scope) u.searchParams.set('scope', opts.scope);
        if (opts.limit) u.searchParams.set('limit', String(opts.limit));
        if (k && v != null) u.searchParams.set(k, String(v));
        const s = u.search.toString();
        return s ? ('?' + s.slice(1)) : '';
      };
      const pager = `
        <div class="row">
          <div class="meta">${items.length} shown</div>
          <div class="right nav-small">
            ${opts.prevAfter?`<a href="/milestones/ssr${q('after', opts.prevAfter)}">← Newer</a>`:''}
            ${opts.nextBefore?`<a class="space" href="/milestones/ssr${q('before', opts.nextBefore)}">Older →</a>`:''}
          </div>
        </div>`;
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Milestones</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--good:#16a34a}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  form.filters{margin:6px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  .row{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .right a{margin-left:8px}
  .space{margin-left:8px}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:0 6px;background:#fff}
  .pill.good{border-color:#d1fae5;background:#ecfdf5;color:var(--good)}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .nowrap{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Milestones</h1>
  ${renderNav('milestones')}
    </header>
    <form class="filters" method="GET" action="/milestones/ssr">
      <label>Job <input type="text" name="job" value="${esc(opts.job||'')}"/></label>
      <label>Kind <input type="text" name="kind" value="${esc(opts.kind||'')}"/></label>
      <label>Scope <input type="text" name="scope" value="${esc(opts.scope||'')}"/></label>
      <label>Limit <input type="number" min="1" max="500" name="limit" value="${esc(opts.limit||100)}"/></label>
      <button type="submit">Apply</button>
    </form>
    ${pager}
    <table>
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="meta">No milestones</td></tr>'}</tbody>
    </table>
    ${pager}
  </div>
</body></html>`;
      res.type('html').send(html);
    };

    try {
      if (!db) {
        return res.status(503).send('<!doctype html><title>Milestones</title><body><p>Database unavailable.</p></body></html>');
      }
      const {
        items,
        cursors,
        appliedFilters
      } = fetchMilestones(db, {
        job: req.query.job,
        kind: req.query.kind,
        scope: req.query.scope,
        limit: req.query.limit,
        before: req.query.before,
        after: req.query.after
      });
      const opts = {
        ...appliedFilters,
        ...cursors
      };
      if (!opts.limit) opts.limit = 100;
      render(items, opts);
    } catch (e) {
      try {
        console.log(`[ssr] GET /milestones/ssr -> error ${e?.message || e}`);
      } catch (_) {}
      if (res.headersSent) return;
      render([], {});
    }
  });
  // Gazetteer per-kind listing (read-only SSR)
  app.get('/gazetteer/kind/:kind', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const kindParam = String(req.params.kind || '').trim();
    const normalizedKind = kindParam.toLowerCase();
    const showStorage = String(req.query.storage || '0') === '1';
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? ''), 10) || 300));

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    } [c]));

    const num = (n) => {
      if (n == null) return '';
      try {
        return Number(n).toLocaleString();
      } catch (_) {
        return String(n);
      }
    };

    const fmtBytes = (n) => {
      if (n == null) return '';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      let v = Number(n) || 0;
      while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
      }
      return (i === 0 ? String(v | 0) : v.toFixed(1)) + ' ' + units[i];
    };

    const qs = (obj) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(obj)) {
        if (value != null && value !== '') params.set(key, String(value));
      }
      const str = params.toString();
      return str ? `?${str}` : '';
    };

    if (!normalizedKind) {
      trace.end();
      return res.status(400).send('<!doctype html><title>Gazetteer</title><body><h1>Missing kind</h1></body></html>');
    }

    let openDbReadOnly;
    try {
      ({ openDbReadOnly } = require('../../ensure_db'));
    } catch (err) {
      trace.end();
      return res.status(503).send('<!doctype html><title>Gazetteer</title><body><h1>Database unavailable.</h1></body></html>');
    }

    let db;
    try {
      const doneOpen = trace.pre('db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const doneRows = trace.pre('rows');
      let rows = db.prepare(`
        SELECT p.id,
               p.country_code,
               p.adm1_code,
               p.population,
               COALESCE(cn.name, (
                 SELECT name
                 FROM place_names pn
                 WHERE pn.place_id = p.id
                 ORDER BY pn.is_official DESC, pn.is_preferred DESC, pn.name
                 LIMIT 1
               )) AS name
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE LOWER(p.kind) = ?
        ORDER BY p.population DESC, name COLLATE NOCASE ASC
        LIMIT ?
      `).all(normalizedKind, limit);
      doneRows();

      let totalStorage = 0;
      if (showStorage) {
        const memo = new Map();
        const sizeFor = (id) => {
          if (memo.has(id)) return memo.get(id);
          let val = 0;
          try {
            const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
            const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
            const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
            const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
            val = (a + b + c + d) | 0;
          } catch (_) {
            val = 0;
          }
          memo.set(id, val);
          return val;
        };
        rows = rows.map((r) => {
          const size = sizeFor(r.id);
          totalStorage += size;
          return { ...r, size_bytes: size };
        });
      }

      const perCountry = new Map();
      for (const r of rows) {
        const code = (r.country_code || '').toUpperCase() || '—';
        perCountry.set(code, (perCountry.get(code) || 0) + 1);
      }
      const countrySummary = Array.from(perCountry.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([code, count]) => `<span class="pill">${esc(code)}: ${count}</span>`)
        .join(' ');

      const columnCount = showStorage ? 5 : 4;
      const rowsHtml = rows.map((r) => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name || '(unnamed)')}</a></td>
          <td>${esc(r.country_code || '')}</td>
          <td>${esc(r.adm1_code || '')}</td>
          ${showStorage ? `<td class="tr"><span title="Approximate">~ ${fmtBytes(r.size_bytes || 0)}</span></td>` : ''}
          <td class="tr">${num(r.population)}</td>
        </tr>
      `).join('');

      const toggleLink = showStorage
        ? `<a href="${qs({ limit })}">Hide storage</a>`
        : `<a href="${qs({ storage: 1, limit })}">Show approx storage</a>`;

      const titleText = normalizedKind ? normalizedKind.replace(/^[a-z]/, (ch) => ch.toUpperCase()) : 'Places';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer – ${esc(titleText)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px;margin:6px 0}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;margin:2px;background:#fff;font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:12px}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
  .toolbar a{color:#2563eb;text-decoration:none;font-size:13px}
  .toolbar a:hover{text-decoration:underline}
  .tr{text-align:right}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>${esc(titleText)} places</h1>
  ${renderNav('gazetteer')}
    </header>
    <div class="meta">Showing ${rows.length} place${rows.length === 1 ? '' : 's'} (limit ${limit}).</div>
    ${countrySummary ? `<div class="meta">Top countries: ${countrySummary}</div>` : ''}
    ${showStorage ? `<div class="meta">Total shown storage: ~ ${fmtBytes(totalStorage)}</div>` : ''}
    <div class="toolbar">
      ${toggleLink}
      <a href="/gazetteer">Back to summary</a>
      <a href="/gazetteer/places">All places</a>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Country</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${columnCount}" class="meta">No places found.</td></tr>`}</tbody>
    </table>
  </div>
</body></html>`;

      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      trace.end();
      db.close();
    } catch (err) {
      try {
        if (db) db.close();
        trace.end();
      } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(err?.message || String(err)) + '</pre>');
    }
  });

  // JSON: Gazetteer places search (with pagination)
  app.get('/api/gazetteer/places', (req, res) => {
    try {
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        return res.status(503).json({
          error: 'Database unavailable',
          detail: e.message
        });
      }
      const db = openDbReadOnly(urlsDbPath);
      const q = String(req.query.q || '').trim();
      const kind = String(req.query.kind || '').trim();
      const cc = String(req.query.cc || '').trim().toUpperCase();
      const adm1 = String(req.query.adm1 || '').trim();
      const minpop = parseInt(req.query.minpop || '0', 10) || 0;
      const sort = String(req.query.sort || 'name').trim();
      const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
      const offset = (page - 1) * pageSize;
      const where = [];
      const params = [];
      if (kind) {
        where.push('p.kind = ?');
        params.push(kind);
      }
      if (cc) {
        where.push('UPPER(p.country_code) = ?');
        params.push(cc);
      }
      if (adm1) {
        where.push('p.adm1_code = ?');
        params.push(adm1);
      }
      if (minpop > 0) {
        where.push('COALESCE(p.population,0) >= ?');
        params.push(minpop);
      }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      const total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
      `).get(...params).c;
      const rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      db.close();
      res.json({
        total,
        page,
        pageSize,
        rows
      });
    } catch (e) {
      res.status(500).json({
        error: e.message
      });
    }
  });

  // JSON: Gazetteer place details
  app.get('/api/gazetteer/place/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({
        error: 'Invalid id'
      });
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        return res.status(503).json({
          error: 'Database unavailable',
          detail: e.message
        });
      }
      const db = openDbReadOnly(urlsDbPath);
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      if (!place) {
        db.close();
        return res.status(404).json({
          error: 'Not found'
        });
      }
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      // Compute size metrics similar to SSR page
      let size_bytes = 0;
      let size_method = 'approx';
      try {
        const row = db.prepare(`WITH
  t_places(rowid) AS (SELECT id FROM places WHERE id = ?),
  t_names(rowid) AS (SELECT rowid FROM place_names WHERE place_id = ?),
  t_ext(rowid) AS (SELECT rowid FROM place_external_ids WHERE place_id = ?),
  t_hier(rowid) AS (SELECT rowid FROM place_hierarchy WHERE parent_id = ? OR child_id = ?),
  idx_places AS (SELECT name FROM pragma_index_list('places')),
  idx_names AS (SELECT name FROM pragma_index_list('place_names')),
  idx_ext AS (SELECT name FROM pragma_index_list('place_external_ids')),
  idx_hier AS (SELECT name FROM pragma_index_list('place_hierarchy'))
SELECT (
  COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='places' AND rowid IN (SELECT rowid FROM t_places)) OR (name IN (SELECT name FROM idx_places) AND rowid IN (SELECT rowid FROM t_places))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_names' AND rowid IN (SELECT rowid FROM t_names)) OR (name IN (SELECT name FROM idx_names) AND rowid IN (SELECT rowid FROM t_names))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_external_ids' AND rowid IN (SELECT rowid FROM t_ext)) OR (name IN (SELECT name FROM idx_ext) AND rowid IN (SELECT rowid FROM t_ext))),0)
  + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_hierarchy' AND rowid IN (SELECT rowid FROM t_hier)) OR (name IN (SELECT name FROM idx_hier) AND rowid IN (SELECT rowid FROM t_hier))),0)
) AS bytes`).get(id, id, id, id, id);
        if (row && typeof row.bytes === 'number') {
          size_bytes = row.bytes | 0;
          size_method = 'dbstat';
        }
      } catch (_) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
          size_bytes = (a + b + c + d) | 0;
          size_method = 'approx';
        } catch (_) {
          size_bytes = 0;
          size_method = 'approx';
        }
      }
      db.close();
      res.json({
        place,
        names,
        parents,
        children,
        size_bytes,
        size_method
      });
    } catch (e) {
      res.status(500).json({
        error: e.message
      });
    }
  });

  // JSON: Gazetteer recent articles mentioning a place (by id)
  app.get('/api/gazetteer/articles', (req, res) => {
    try {
      const id = parseInt(String(req.query.id || ''), 10);
      if (!id) return res.status(400).json({
        error: 'Missing id'
      });
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        return res.status(503).json({
          error: 'Database unavailable',
          detail: e.message
        });
      }
      const db = openDbReadOnly(urlsDbPath);
      const cname = db.prepare('SELECT name FROM place_names WHERE id = (SELECT canonical_name_id FROM places WHERE id = ?)').get(id)?.name || null;
      let rows = [];
      if (cname) {
        rows = db.prepare(`
          SELECT a.url, a.title, a.date
          FROM article_places ap JOIN articles a ON a.url = ap.article_url
          WHERE ap.place = ?
          ORDER BY (a.date IS NULL) ASC, a.date DESC
          LIMIT 20
        `).all(cname);
      }
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(500).json({
        error: e.message
      });
    }
  });

  // JSON: Gazetteer hubs for a host
  app.get('/api/gazetteer/hubs', (req, res) => {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        return res.status(200).json([]);
      }
      const db = openDbReadOnly(urlsDbPath);
      let rows = [];
      try {
        if (host) rows = db.prepare('SELECT * FROM place_hubs WHERE LOWER(host) = ? ORDER BY last_seen_at DESC LIMIT 50').all(host);
        else rows = db.prepare('SELECT * FROM place_hubs ORDER BY last_seen_at DESC LIMIT 50').all();
      } catch (_) {
        rows = [];
      }
      db.close();
      res.json(rows);
    } catch (_) {
      res.status(200).json([]);
    }
  });

  // JSON: Gazetteer resolve helper
  app.get('/api/gazetteer/resolve', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(200).json([]);
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        return res.status(200).json([]);
      }
      const db = openDbReadOnly(urlsDbPath);
      const like = `%${q.toLowerCase()}%`;
      const rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))
        ORDER BY (p.kind!='city') ASC, (p.kind!='region') ASC, (p.population IS NULL) ASC, p.population DESC
        LIMIT 10
      `).all(like, like);
      db.close();
      res.json(rows);
    } catch (e) {
      res.status(200).json([]);
    }
  });

  // Domain summary API
  app.get('/api/domain-summary', (req, res) => {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      if (!host) return res.status(400).json({
        error: 'Missing host'
      });
      let NewsDatabase;
      try {
        NewsDatabase = require('../../db');
      } catch (e) {
        return res.status(503).json({
          error: 'Database unavailable',
          detail: e.message
        });
      }
      const db = new NewsDatabase(urlsDbPath);
      // Articles by host
      const art = db.db.prepare(`
        SELECT COUNT(*) AS c FROM articles a
        JOIN urls u ON u.url = a.url
        WHERE LOWER(u.host) = ?
  `).get(host)?.c || 0;
      // Fetches by host
      let fetches = 0;
      try {
  fetches = db.db.prepare(`SELECT COUNT(*) AS c FROM fetches WHERE LOWER(host) = ?`).get(host)?.c || 0;
      } catch (_) {
        // fallback via urls join
        try {
          fetches = db.db.prepare(`SELECT COUNT(*) AS c FROM fetches f JOIN urls u ON u.url=f.url WHERE LOWER(u.host) = ?`).get(host)?.c || 0;
        } catch (_) {
          fetches = 0;
        }
      }
      db.close();
      res.json({
        host,
        articles: art,
        fetches
      });
    } catch (e) {
      res.status(500).json({
        error: e.message
      });
    }
  });

  // Server-rendered list of all countries
  app.get('/gazetteer/countries', (req, res) => {
    const trace = startTrace(req, 'gazetteer');

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
      } [c]));
    }

    function num(n) {
      if (n == null) return '';
      try {
        return Number(n).toLocaleString();
      } catch {
        return String(n);
      }
    }
    try {
      let openDbReadOnly;
      try {
        ({
          openDbReadOnly
        } = require('../../ensure_db'));
      } catch (e) {
        res.status(503).send('<!doctype html><title>Countries</title><h1>Countries</h1><p>Database unavailable.</p>');
        return;
      }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneList = trace.pre('list-countries');
      const rows = db.prepare(`
        SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'country'
        GROUP BY p.id
        ORDER BY name ASC
      `).all();
      doneList();
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();
      const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.country_code||'')}</td>
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="meta">No countries</td></tr>';
      const page = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Countries — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Countries</h1>
  ${renderNav('gazetteer')}
    </header>
    <table>
      <thead><tr><th>Name</th><th>CC</th><th style="text-align:right">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="3" class="meta">No countries</td></tr>'}</tbody>
    </table>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(page);
      doneRender();
      trace.end();
    } catch (e) {
      try {
        trace.end();
      } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message || String(e)) + '</pre>');
    }
  });



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