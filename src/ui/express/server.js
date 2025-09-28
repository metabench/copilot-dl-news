#!/usr/bin/env node

const http = require('http');
const express = require('express');
const compression = require('compression');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');
const { evaluateDomainFromDb } = require('../../is_this_a_news_website');
const { buildArgs } = require('./services/buildArgs');
const { newJobIdFactory, computeJobsSummary } = require('./services/jobs');
const { createBroadcaster } = require('./services/broadcast');
const { createProgressBroadcaster } = require('./services/progress');
const { createEventsRouter } = require('./routes/events');
const { createCrawlsApiRouter } = require('./routes/api.crawls');
const { createQueuesApiRouter } = require('./routes/api.queues');
const { createProblemsApiRouter } = require('./routes/api.problems');
const { createMiscApiRouter } = require('./routes/api.misc');
const { createUrlsApiRouter } = require('./routes/api.urls');
const { createAnalysisApiRouter } = require('./routes/api.analysis');
const { createCoverageApiRouter } = require('./routes/coverage');
const { createConfigApiRouter } = require('./routes/config');
const { createNavigationApiRouter } = require('./routes/api.navigation');
const { renderNav } = require('./services/navigation');
const { ConfigManager } = require('../../config/ConfigManager');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('./services/analysisRuns');
// Quiet test mode: suppress certain async logs that can fire after Jest completes
const QUIET = !!process.env.JEST_WORKER_ID || ['1','true','yes','on'].includes(String(process.env.UI_TEST_QUIET||'').toLowerCase());

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
          try { ee.emit('error', new Error('simulated spawn failure')); } catch (_) {}
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
        ee.stdin = { write: () => true };
        ee.pid = 424242;
        ee.kill = () => { try { ee.emit('exit', null, 'SIGTERM'); } catch (_) {} };
  const plannerFlag = String(process.env.UI_FAKE_PLANNER || '').trim().toLowerCase();
  const envPlannerEnabled = ['1', 'true', 'yes', 'on'].includes(plannerFlag);
  const argsPlannerEnabled = Array.isArray(args) && args.some((arg) => typeof arg === 'string' && arg.includes('--crawl-type=intelligent'));
  const fakePlannerEnabled = envPlannerEnabled || argsPlannerEnabled;
        // Emit a quick sequence of logs and progress frames so the UI updates immediately
        setTimeout(() => {
          try { ee.stderr.emit('data', Buffer.from(`[fake-runner] planner-enabled=${fakePlannerEnabled}\n`, 'utf8')); } catch (_) {}
          try { ee.stdout.emit('data', Buffer.from('Starting fake crawler\n', 'utf8')); } catch(_) {}
          // Optional: emit a very long log line to exercise truncation code path
          try {
            if (String(process.env.UI_FAKE_LONGLOG || process.env.UI_FAKE_RUNNER_LONGLOG || '').toLowerCase() === '1') {
              const longLine = 'X'.repeat(12000) + '\n';
              ee.stdout.emit('data', Buffer.from(longLine, 'utf8'));
            }
          } catch(_) {}
          // seed progress frames
          const frames = [
            { visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 1, robotsLoaded: true },
            { visited: 1, downloaded: 1, found: 0, saved: 0, errors: 0, queueSize: 0, robotsLoaded: true }
          ];
          for (const p of frames) {
            try { ee.stdout.emit('data', Buffer.from('PROGRESS ' + JSON.stringify(p) + '\n', 'utf8')); } catch(_) {}
          }
          // Optionally emit queue lifecycle events for tests
          try {
            if (String(process.env.UI_FAKE_QUEUE || '').toLowerCase() === '1') {
              const qEvents = [
                { action: 'enqueued', url: 'https://ex.com/', depth: 0, host: 'ex.com', queueSize: 1 },
                { action: 'dequeued', url: 'https://ex.com/', depth: 0, host: 'ex.com', queueSize: 0 },
                { action: 'drop', url: 'https://ex.com/bad', reason: 'off-domain', queueSize: 0 }
              ];
              for (const ev of qEvents) {
                ee.stdout.emit('data', Buffer.from('QUEUE ' + JSON.stringify(ev) + '\n', 'utf8'));
              }
            }
          } catch (_) {}
          // Optionally emit problem diagnostics
          try {
            if (String(process.env.UI_FAKE_PROBLEMS || '').toLowerCase() === '1') {
              const problems = [
                { kind: 'missing-hub', scope: 'guardian', target: '/world/france', message: 'Country hub not found in sitemap', details: { slug: 'france' } },
                { kind: 'unknown-pattern', scope: 'guardian', target: '/p/abc123', message: 'Unrecognized shortlink pattern' }
              ];
              for (const p of problems) {
                ee.stdout.emit('data', Buffer.from('PROBLEM ' + JSON.stringify(p) + '\n', 'utf8'));
              }
            }
          } catch (_) {}
          // Optionally emit milestones
          try {
            if (String(process.env.UI_FAKE_MILESTONES || '').toLowerCase() === '1') {
              const milestones = [
                { kind: 'patterns-learned', scope: 'guardian', message: 'Homepage sections inferred', details: { sections: ['world','sport'] } },
                { kind: 'hubs-seeded', scope: 'guardian', message: 'Seeded 10 hubs', details: { count: 10 } }
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
                const stageEvents = [
                  { stage: 'bootstrap', status: 'started', sequence: 1, ts: nowIso(), details: { context: { host: 'example.com' } } },
                  { stage: 'bootstrap', status: 'completed', sequence: 1, ts: nowIso(), durationMs: 8, details: { context: { host: 'example.com' }, result: { allowed: true } } },
                  { stage: 'infer-patterns', status: 'started', sequence: 2, ts: nowIso(), details: { context: { startUrl: 'https://example.com' } } },
                  { stage: 'infer-patterns', status: 'completed', sequence: 2, ts: nowIso(), durationMs: 12, details: { context: { startUrl: 'https://example.com' }, result: { sectionCount: 3, sectionsPreview: ['world','sport','culture'] } } },
                  { stage: 'seed-hubs', status: 'started', sequence: 3, ts: nowIso(), details: { context: { sectionsFromPatterns: 3 } } },
                  { stage: 'seed-hubs', status: 'completed', sequence: 3, ts: nowIso(), durationMs: 20, details: { context: { sectionsFromPatterns: 3 }, result: { seededCount: 2, sampleSeeded: ['https://example.com/world/', 'https://example.com/sport/'] } } }
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
                    coverage: { expected: 3, seeded: 2, coveragePct: 2 / 3 },
                    problems: [{ kind: 'missing-hub', count: 1, sample: { scope: 'example.com', target: '/world/mars' } }],
                    stats: { visited: 1, downloaded: 1, articlesFound: 0, articlesSaved: 0, errors: 0 }
                  }
                };
                ee.stdout.emit('data', Buffer.from('MILESTONE ' + JSON.stringify(completion) + '\n', 'utf8'));
              } catch (err) {
                try { ee.stderr.emit('data', Buffer.from(`[fake-runner] planner error: ${err && err.message || err}\n`, 'utf8')); } catch (_) {}
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
          try { ee.stdout.emit('data', Buffer.from('Final stats: 1 pages visited, 1 pages downloaded, 0 articles found, 0 articles saved\n', 'utf8')); } catch(_) {}
          // Give a little more time so pause/resume API broadcasts can be observed in SSE before exit
          setTimeout(() => { try { ee.emit('exit', 0, null); } catch(_) {} }, 200);
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
      const cp = spawn(node, args, { cwd: repoRoot, env: process.env });
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
  const shouldWatchConfig = options.watchPriorityConfig !== undefined
    ? !!options.watchPriorityConfig
    : !process.env.JEST_WORKER_ID;
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
      } catch (_) { /* noop */ }
    });
    next();
  });
  const sseClients = new Set(); // stores { res, logsEnabled, jobFilter }
  // Multi-job state: allow multiple concurrent crawler children
  const jobs = new Map(); // jobId -> { child, args, url, startedAt, lastExit, paused, stdoutBuf, stderrBuf, metrics, lastProgressStr, lastProgressSentAt, killTimer }
  const analysisRuns = new Map(); // runId -> { child, startedAt }
  // Legacy aggregated metrics (kept for /metrics & /health); reflect first active job
  const allowMultiJobs = (options.allowMultiJobs === true) || ['1','true','yes','on'].includes(String(process.env.UI_ALLOW_MULTI_JOBS||'').toLowerCase());
  // Optional: detailed start-path tracing, logs timing for key steps in POST /api/crawl
  const traceStart = options.traceStart === true || ['1','true','yes','on'].includes(String(process.env.UI_TRACE_START||'').toLowerCase());
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
      const { ensureDb } = require('../../ensure_db');
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
          ins.run('basic', 'Follow links only (no sitemap)', JSON.stringify({ crawlType: 'basic', useSitemap: false, sitemapOnly: false }));
          ins.run('sitemap-only', 'Use only the sitemap to discover pages', JSON.stringify({ crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true }));
          ins.run('basic-with-sitemap', 'Follow links and also use the sitemap', JSON.stringify({ crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false }));
          // Intelligent variant (planner-enabled) – inherits sitemap behavior of basic-with-sitemap
          ins.run('intelligent', 'Intelligent planning (hubs + sitemap + heuristics)', JSON.stringify({ crawlType: 'intelligent', useSitemap: true, sitemapOnly: false }));
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
      } catch (_) { /* ignore index create errors */ }
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
    setPaused: (v) => { paused = !!v; },
    legacyMetrics: {
      visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0,
      running: 0, _lastSampleTime: 0, _lastVisited: 0, _lastDownloaded: 0,
      requestsPerSec: 0, downloadsPerSec: 0, errorRatePerMin: 0, bytesPerSec: 0,
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
    try { broadcast('jobs', payload); } catch (_) {}
  }

  function updateJobStage(job, stage) {
    if (!job) return;
    const next = stage || 'running';
    if (job.stage === next) {
      broadcastJobs(true);
      return;
    }
    job.stage = next;
    try { job.stageChangedAt = Date.now(); } catch (_) {}
    if (job.metrics) {
      try { job.metrics.stage = next; } catch (_) {}
    }
    broadcastJobs(true);
  }
  function clearJobWatchdogs(job) {
    if (!job || !Array.isArray(job.watchdogTimers) || job.watchdogTimers.length === 0) return;
    for (const timer of job.watchdogTimers.splice(0)) {
      try { clearTimeout(timer); } catch (_) {}
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
    lastModified: true
  }));

  // Serve shared UI assets (CSS/JS) from src/ui/public at /assets
  app.use('/assets', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
  }));

  // Mount SSE events router (keeps path '/events')
  app.use(createEventsRouter({ sseClients, jobs, broadcaster, progress, QUIET }));
  // Mount crawls API router (list, detail, and job-scoped controls)
  app.use(createCrawlsApiRouter({ jobs, broadcastProgress: (...args) => progress.broadcastProgress(...args), QUIET }));
  // Mount queues API router
  app.use(createQueuesApiRouter({ getDbRW }));
  // Mount misc API router (status, crawl-types, health, metrics)
  app.use(createMiscApiRouter({
    jobs,
    getLegacy: () => ({ startedAt, lastExit, paused }),
    getMetrics: () => metrics,
    getDbRW,
    QUIET
  }));
  // Mount URLs APIs (list, details, fetch-body)
  app.use(createUrlsApiRouter({ urlsDbPath }));
  // Mount Analysis APIs (read-only history)
  app.use(createAnalysisApiRouter({ getDbRW }));
  // Mount Problems APIs (read-only)
  app.use(createProblemsApiRouter({ getDbRW }));
  // Mount shared navigation API for clients needing link metadata
  app.use(createNavigationApiRouter());
  // Mount Coverage Analytics APIs
  app.use(createCoverageApiRouter({ getDbRW }));
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
      return { pre: () => noop, end: noop };
    }
    const start = Date.now();
    try { console.log(`[${tag}] request ${req.method} ${req.originalUrl || req.url}`); } catch (_) {}
    const pre = (name) => {
      const t = Date.now();
      try { console.log(`pre[${name}]`); } catch (_) {}
      return () => { try { console.log(`post[${name}] (+${Date.now() - t}ms)`); } catch (_) {} };
    };
    const end = () => { try { console.log(`[${tag}] done (+${Date.now() - start}ms)`); } catch (_) {} };
    return { pre, end };
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
    try { console.log(`[api] POST /api/crawl received (runningJobs=${jobs.size})`); } catch (_) {}
    const now = Date.now();
    if (!allowMultiJobs && (jobs.size > 0 || now < jobStartGuardUntil)) {
      try { console.log(`[api] POST /api/crawl -> 409 already-running`); } catch (_) {}
      return res.status(409).json({ error: 'Crawler already running' });
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
        visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0,
        running: 1, _lastSampleTime: Date.now(), _lastVisited: 0, _lastDownloaded: 0,
        requestsPerSec: 0, downloadsPerSec: 0, errorRatePerMin: 0, bytesPerSec: 0,
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
  try { jobStartGuardUntil = Date.now() + 600; } catch (_) { jobStartGuardUntil = now + 600; }

    // Persist job start (best-effort) — defer until after response to keep POST fast
    const persistStart = () => {
      try {
        const db = getDbRW();
        if (db) {
          db.prepare(`INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, status) VALUES (?, ?, ?, ?, ?, 'running')`)
            .run(jobId, job.url || null, JSON.stringify(args), child?.pid || null, job.startedAt);
        }
      } catch (_) { /* ignore db errors */ }
    };

    // Prepare common exit handler up-front so we can attach listeners immediately
    let exitEmitted = false;
    const onExit = (code, signal, extraInfo = null) => {
      if (exitEmitted) return; // guard against both 'exit' and 'close'
      exitEmitted = true;
      try {
        if (job.killTimer) { clearTimeout(job.killTimer); job.killTimer = null; }
        clearJobWatchdogs(job);
      } catch (_) {}
      const endedAt = new Date().toISOString();
      const extras = (extraInfo && typeof extraInfo === 'object' && extraInfo !== null) ? extraInfo : null;
      const stageForExit = extras && extras.error ? 'failed' : 'done';
      updateJobStage(job, stageForExit);
      job.lastExit = extras ? { code, signal, endedAt, ...extras } : { code, signal, endedAt };
  try { if (!QUIET) console.log(`[child] exit code=${code} signal=${signal}`); } catch (_) {}
      // Mark child as gone immediately so status becomes 'done' in detail snapshot
  try { job.child = null; } catch (_) {}
      // Update job record (best-effort)
      try {
        const db = getDbRW();
        if (db) {
          db.prepare(`UPDATE crawl_jobs SET ended_at = ?, status = 'done' WHERE id = ?`).run(job.lastExit.endedAt, jobId);
        }
      } catch (_) {}
      // Include jobId on terminal event
      try { broadcast('done', { ...job.lastExit, jobId }, jobId); } catch(_) { broadcast('done', job.lastExit, jobId); }
      // Remove job after a brief delay to reduce control/status races on ultra-fast runs
      setTimeout(() => {
        try { jobs.delete(jobId); } catch (_) {}
        try { broadcastJobs(true); } catch (_) {}
        // update legacy aggregate
        const first = getFirstJob();
        if (!first) {
          startedAt = null; lastExit = job.lastExit; metrics.running = 0; paused = false;
        }
      }, 350);
    };
    // Attach error/exit listeners immediately to avoid missing early events
    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      child.on('close', (code, signal) => onExit(code, signal));
      child.on('error', (err) => {
        try { if (job.killTimer) { clearTimeout(job.killTimer); job.killTimer = null; } } catch (_) {}
        const msg = (err && err.message) ? err.message : String(err);
        try { console.log(`[child] error: ${msg}`); } catch (_) {}
        broadcast('log', { stream: 'server', line: `[server] crawler failed to start: ${msg}\n` }, jobId);
        onExit(null, null, { error: msg });
      });
    }

    // Update legacy aggregate for first job
    const first = getFirstJob();
    if (first && first.id === jobId) {
      startedAt = job.startedAt; metrics.running = 1; metrics._lastSampleTime = Date.now(); metrics._lastVisited = 0; metrics._lastDownloaded = 0; lastExit = null; paused = false;
    }

    // Respond immediately so UI/tests see fast acceptance
    const initialDurationMs = Math.max(0, performance.now() - perfStart);
    try {
      res.status(202).json({ pid: child.pid || null, args, jobId, stage: job.stage, durationMs: Number(initialDurationMs.toFixed(3)) });
    } catch (_) {
      try { /* ignore */ } catch (_) {}
    }
    const t4 = Date.now();
    if (traceStart) {
      try {
        console.log(`[trace] start handler timings job=${jobId} buildArgs=${t2-t1}ms spawn=${t3-t2}ms respond=${t4-t3}ms totalSoFar=${t4-t0}ms`);
      } catch(_) {}
    }
    // Kick off best-effort persistence off the hot path
    try { setImmediate(persistStart); } catch (_) { try { setTimeout(persistStart, 0); } catch (_) {} }

    // Defer non-critical work to next tick to avoid delaying the response under load
    const defer = (fn) => { try { setImmediate(fn); } catch (_) { setTimeout(fn, 0); } };
    defer(() => {
      const td0 = Date.now();
      // Immediately surface that the crawler has started and seed a progress frame so the UI updates
      try {
        broadcast('log', { stream: 'server', line: `[server] starting crawler pid=${child?.pid || 'n/a'}\n` }, jobId);
        // Seed initial progress and include optional domain telemetry defaults so UI/tests see the fields immediately
  broadcastProgress({ stage: job.stage, visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0, paused: false, domainRateLimited: false, domainIntervalMs: null }, jobId, job.metrics);
        try { console.log(`[api] crawler started pid=${child?.pid||'n/a'} jobId=${jobId} args=${JSON.stringify(args)}`); } catch (_) {}
      } catch (_) {}
      const td1 = Date.now();
      // Seed jobs list right away
      try { broadcastJobs(true); } catch (_) {}
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
                broadcast('log', { stream: 'server', line: hint + '\n' }, jobId);
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
                broadcast('log', { stream: 'server', line: hint + '\n' }, jobId);
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
        } catch(_) {}
      }
    });

    let _firstOutputAt = 0;
    child.stdout.on('data', (chunk) => {
      if (!_firstOutputAt) {
        _firstOutputAt = Date.now();
        if (traceStart) {
          try { console.log(`[trace] first child stdout job=${jobId} after ${_firstOutputAt - t0}ms`); } catch(_) {}
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
            try { if (!QUIET) console.log(`[child:progress] v=${obj.visited||0} d=${obj.downloaded||0} q=${obj.queueSize||0}`); } catch (_) {}
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
                  .run(jobId, ts, String(obj.action||''), obj.url || null, (obj.depth!=null?obj.depth:null), obj.host || null, obj.reason || null, (obj.queueSize!=null?obj.queueSize:null));
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
                  .run(jobId, ts, String(obj.kind||''), obj.scope || null, obj.target || null, obj.message || null, obj.details!=null ? (typeof obj.details==='string'?obj.details:JSON.stringify(obj.details)) : null);
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
                  .run(jobId, ts, String(obj.kind||''), obj.scope || null, obj.target || null, obj.message || null, obj.details!=null ? (typeof obj.details==='string'?obj.details:JSON.stringify(obj.details)) : null);
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
        broadcast('log', { stream: 'stdout', line: line + '\n' }, jobId);
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
        broadcast('log', { stream: 'stderr', line: line + '\n' }, jobId);
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
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // /api/crawls* routes are now provided by createCrawlsApiRouter

  app.post('/api/stop', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    if (jobs.size === 0) return res.status(200).json({ stopped: false });
    if (!jobId && jobs.size > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const job = jobId ? jobs.get(jobId) : getFirstJob();
      if (!job) return res.status(404).json({ error: 'Job not found' });
      const target = job.child;
      if (typeof target?.kill === 'function') target.kill('SIGTERM');
      // Escalate if the process does not exit promptly
      try { if (job.killTimer) { clearTimeout(job.killTimer); job.killTimer = null; } } catch (_) {}
      job.killTimer = setTimeout(() => {
        try {
          if (target && !target.killed) {
            // On Windows, SIGKILL may still work via Node; additionally attempt taskkill
            try { target.kill('SIGKILL'); } catch (_) {}
            if (process.platform === 'win32' && target.pid) {
              try {
                const { exec } = require('child_process');
                exec(`taskkill /PID ${target.pid} /T /F`);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }, 800);
      try { job.killTimer?.unref?.(); } catch (_) {}
      try { console.log(`[api] POST /api/stop -> 202 stop requested jobId=${jobId||job.id} pid=${target?.pid||'n/a'}`); } catch (_) {}
      res.status(202).json({ stopped: true, escalatesInMs: 800 });
    } catch (e) {
      try { console.log(`[api] POST /api/stop -> 500 ${e?.message||e}`); } catch (_) {}
      res.status(500).json({ error: e.message });
    }
  });

  // Pause/resume endpoints: communicate via child stdin line commands
  app.post('/api/pause', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    // Gracefully handle not-running with 200 to simplify UI/test flows
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
        try { console.log(`[api] POST /api/pause -> paused=true jobId=${job.id}`); } catch (_) {}
        return res.json({ ok: true, paused: true });
      }
      try { console.log('[api] POST /api/pause -> stdin unavailable'); } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/pause -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });
  app.post('/api/resume', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    // Gracefully handle not-running with 200 to simplify UI/test flows
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
        try { console.log(`[api] POST /api/resume -> paused=false jobId=${job.id}`); } catch (_) {}
        return res.json({ ok: true, paused: false });
      }
      try { console.log('[api] POST /api/resume -> stdin unavailable'); } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/resume -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  // /metrics moved to routes/api.misc.js

  // /api/queues* routes are now provided by createQueuesApiRouter

  // /events route moved to routes/events.js

  // /health moved to routes/api.misc.js

  // Problems SSR (read-only): newest-first problems with filters and simple pager
  app.get('/problems/ssr', (req, res) => {
    const db = getDbRW();
    const render = (items, opts) => {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
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
    };
    try {
      if (!db) return render([], {});
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '100', 10)));
      const job = String(req.query.job || '').trim();
      const kind = String(req.query.kind || '').trim();
      const scope = String(req.query.scope || '').trim();
      const before = (() => { const v = parseInt(String(req.query.before||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
      const after = (() => { const v = parseInt(String(req.query.after||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
      const where = [];
      const params = [];
      if (job) { where.push('job_id = ?'); params.push(job); }
      if (kind) { where.push('kind = ?'); params.push(kind); }
      if (scope) { where.push('scope = ?'); params.push(scope); }
      let order = 'DESC';
      if (before != null) { where.push('id < ?'); params.push(before); }
      else if (after != null) { where.push('id > ?'); params.push(after); order = 'ASC'; }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      let items = db.prepare(`
        SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
        FROM crawl_problems
        ${whereSql}
        ORDER BY id ${order}
        LIMIT ?
      `).all(...params, limit);
      if (order === 'ASC') items.reverse();
      const cursors = items.length ? { nextBefore: items[items.length - 1].id, prevAfter: items[0].id } : {};
      render(items, { job, kind, scope, limit, ...cursors });
    } catch (e) {
      render([], {});
    }
  });

  // Milestones SSR (read-only): newest-first milestones with filters and simple pager
  app.get('/milestones/ssr', (req, res) => {
    const db = getDbRW();
    const render = (items, opts) => {
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
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
      if (!db) return render([], {});
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '100', 10)));
      const job = String(req.query.job || '').trim();
      const kind = String(req.query.kind || '').trim();
      const scope = String(req.query.scope || '').trim();
      const before = (() => { const v = parseInt(String(req.query.before||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
      const after = (() => { const v = parseInt(String(req.query.after||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
      const where = [];
      const params = [];
      if (job) { where.push('job_id = ?'); params.push(job); }
      if (kind) { where.push('kind = ?'); params.push(kind); }
      if (scope) { where.push('scope = ?'); params.push(scope); }
      let order = 'DESC';
      if (before != null) { where.push('id < ?'); params.push(before); }
      else if (after != null) { where.push('id > ?'); params.push(after); order = 'ASC'; }
      let items = db.prepare(`
        SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
        FROM crawl_milestones
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY id ${order}
        LIMIT ?
      `).all(...params, limit);
      if (order === 'ASC') items.reverse();
      const cursors = items.length ? { nextBefore: items[items.length - 1].id, prevAfter: items[0].id } : {};
      render(items, { job, kind, scope, limit, ...cursors });
    } catch (e) {
      render([], {});
    }
  });

  // System health: DB size and free disk (best-effort)
  app.get('/api/system-health', (req, res) => {
    try {
      const dbPath = urlsDbPath;
      let dbSizeBytes = null;
      try { dbSizeBytes = fs.statSync(dbPath).size; } catch (_) {}
      let freeDiskBytes = null;
      try {
        const os = require('os');
        // Fall back to platform-specific shell calls
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
          const drive = path.parse(dbPath).root || 'C:\\';
          const out = execSync('wmic logicaldisk get size,freespace,caption', { stdio: ['ignore','pipe','ignore'] }).toString();
          const lines = out.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
          for (const line of lines) {
            const m = line.match(/^([A-Z]:)\s+(\d+)\s+(\d+)$/i) || line.match(/^([A-Z]:)\s+(\d+)\s+(\d+)/i);
            if (m && drive.toUpperCase().startsWith(m[1].toUpperCase())) {
              freeDiskBytes = parseInt(m[2], 10);
              break;
            }
          }
        } else {
          const out = execSync('df -k .', { cwd: path.dirname(dbPath), stdio: ['ignore','pipe','ignore'] }).toString();
          const lines = out.trim().split(/\n/);
          if (lines.length >= 2) {
            const parts = lines[1].trim().split(/\s+/);
            const availK = parseInt(parts[3], 10);
            if (!isNaN(availK)) freeDiskBytes = availK * 1024;
          }
        }
        if (freeDiskBytes == null) {
          // As a last resort, expose free memory so UI can show something
          freeDiskBytes = os.freemem();
        }
      } catch (_) {}
      // Process memory and CPU (best-effort, CPU is process share of one core since last call)
      let mem = null;
      let cpu = null;
      try {
        const os = require('os');
        const mu = process.memoryUsage();
        mem = { rss: mu.rss, heapUsed: mu.heapUsed, heapTotal: mu.heapTotal, external: mu.external };
        // Keep prev sample on app locals
        app.locals._cpuPrev = app.locals._cpuPrev || { usage: process.cpuUsage(), time: process.hrtime.bigint() };
        const nowUsage = process.cpuUsage();
        const nowTime = process.hrtime.bigint();
        const prev = app.locals._cpuPrev;
        const deltaUserUs = Math.max(0, nowUsage.user - prev.usage.user);
        const deltaSysUs = Math.max(0, nowUsage.system - prev.usage.system);
        const deltaNs = Number(nowTime - prev.time);
        const elapsedMs = deltaNs / 1e6;
        const totalUs = deltaUserUs + deltaSysUs;
        const pctOfOneCore = elapsedMs > 0 ? Math.max(0, Math.min(100, (totalUs / 1000) / elapsedMs * 100)) : 0;
        const cores = Math.max(1, (os.cpus()?.length || 1));
        const pctOfAllCores = Math.max(0, Math.min(100, pctOfOneCore / cores));
        cpu = { percent: pctOfAllCores, percentOfOneCore: pctOfOneCore };
        app.locals._cpuPrev = { usage: nowUsage, time: nowTime };
      } catch (_) {}
      // SQLite WAL autocheckpoint setting (read-only open to avoid heavy init)
      let walAutocheckpoint = null;
      let journalMode = null;
      try {
        let openDbReadOnly;
        try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { openDbReadOnly = null; }
        if (openDbReadOnly) {
          const db = openDbReadOnly(urlsDbPath);
          try { journalMode = db.pragma('journal_mode', { simple: true }); } catch(_) {}
          try { walAutocheckpoint = db.pragma('wal_autocheckpoint', { simple: true }); } catch(_) {}
          try { db.close(); } catch(_) {}
        }
      } catch (_) {}
      res.json({ dbSizeBytes, freeDiskBytes, memory: mem, cpu, journalMode, walAutocheckpoint });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Recent errors grouped by status and host, with examples (fast, RO DB)
  app.get('/api/recent-errors', (req, res) => {
    let openDbReadOnly;
    try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
      // Graceful fallback: empty list so UI doesn't break
      return res.status(200).json({ totalGroups: 0, totalRows: 0, errors: [] });
    }
    const limitRows = Math.max(100, Math.min(parseInt(req.query.rows || '1000', 10) || 1000, 5000));
    try {
      const db = openDbReadOnly(urlsDbPath);
      // Prefer new errors table; fallback to fetches if empty
      let rows = [];
      try {
        rows = db.prepare(`
          SELECT url, host, kind, code AS status, at AS ts
          FROM errors
          ORDER BY at DESC
          LIMIT ?
        `).all(limitRows);
      } catch (_) { rows = []; }
      if (!rows || rows.length === 0) {
        rows = db.prepare(`
          SELECT url, http_status AS status, fetched_at AS ts
          FROM fetches
          WHERE http_status >= 400 AND fetched_at IS NOT NULL
          ORDER BY fetched_at DESC
          LIMIT ?
        `).all(limitRows);
      }
      try { db.close(); } catch (_) {}
      const groups = new Map(); // key: `${status}|${host}` -> { status, host, count, examples: [] }
      for (const r of rows) {
        let host = (r.host || '').toLowerCase();
        if (!host) { try { host = new URL(r.url).hostname.toLowerCase(); } catch (_) { host = ''; } }
        const key = `${r.status}|${host}`;
        if (!groups.has(key)) groups.set(key, { status: r.status, host, count: 0, examples: [] });
        const g = groups.get(key);
        g.count += 1;
        if (g.examples.length < 3) g.examples.push({ url: r.url, ts: r.ts });
      }
      const list = Array.from(groups.values()).sort((a,b) => b.count - a.count).slice(0, 50);
      res.json({ totalGroups: list.length, totalRows: rows.length, errors: list });
    } catch (e) {
      // Graceful fallback: return empty payload
      res.status(200).json({ totalGroups: 0, totalRows: 0, errors: [] });
    }
  });

  // Errors page route
  app.get('/errors', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'errors.html'));
  });

  // Analysis pages (SSR)
  app.get('/analysis', (req, res) => {
    res.redirect('/analysis/ssr');
  });

  app.get('/analysis/ssr', (req, res) => {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const displayVal = (label) => {
      if (!label) return '<span class="muted">—</span>';
      if (label === 'skipped') return '<span class="muted">skipped</span>';
      return esc(label);
    };
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(503).send('<!doctype html><title>Analysis</title><p>Database unavailable.</p>');
      }
      ensureAnalysisRunSchema(db);
      const { items } = listAnalysisRuns(db, { limit });
      const rowsHtml = items.map((item) => {
        const summary = item.summary || {};
        const steps = summary.steps || {};
        const pagesLabel = formatPagesStep(steps.pages);
        const domainsLabel = formatDomainsStep(steps.domains);
        const milestonesLabel = formatMilestonesStep(steps.milestones);
        const duration = formatDuration(item.durationMs);
        const statusMain = esc(item.status || '');
        const stageLine = item.stage ? `<div class="muted small">${esc(item.stage)}</div>` : '';
        const errLine = item.error ? `<div class="warn small">${esc(item.error)}</div>` : '';
        const durationCell = duration ? esc(duration) : '<span class="muted">—</span>';
        return `<tr>
          <td class="fit mono"><a href="/analysis/${encodeURIComponent(item.id)}/ssr">${esc(item.id)}</a></td>
          <td>${statusMain}${stageLine}${errLine}</td>
          <td>${esc(item.startedAt || '')}</td>
          <td>${esc(item.endedAt || '')}</td>
          <td class="fit">${durationCell}</td>
          <td>${displayVal(pagesLabel)}</td>
          <td>${displayVal(domainsLabel)}</td>
          <td>${displayVal(milestonesLabel)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="meta">No analysis runs yet.</td></tr>';
      const latestId = items.length ? items[0].id : null;
      const latestButton = latestId ? `<a class="btn" href="/analysis/${encodeURIComponent(latestId)}/ssr">Latest run →</a>` : '';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--warn:#dc2626}
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
  .muted{color:var(--muted)}
  .small{font-size:12px}
  .warn{color:var(--warn)}
  .btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  .btn:hover{text-decoration:underline}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .top{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .top .right a{margin-left:8px}
  .fit{white-space:nowrap}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Analysis runs</h1>
  ${renderNav('analysis')}
    </header>
    <div class="top">
      <div class="muted small">${esc(items.length)} shown</div>
      <div class="right">${latestButton}</div>
    </div>
    <table>
      <thead><tr><th class="fit">Run</th><th>Status</th><th>Started</th><th>Ended</th><th class="fit">Duration</th><th>Pages</th><th>Domains</th><th>Milestones</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="muted small" style="margin-top:8px">Progress updates appear while the CLI runs; open an individual run for live refresh.</div>
  </div>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e?.message || String(e)) + '</pre>');
    }
  });

  app.get('/analysis/latest', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) return res.redirect('/analysis/ssr');
      ensureAnalysisRunSchema(db);
      const row = db.prepare('SELECT id FROM analysis_runs ORDER BY started_at DESC LIMIT 1').get();
      if (!row) return res.redirect('/analysis/ssr');
      res.redirect(`/analysis/${encodeURIComponent(row.id)}/ssr`);
    } catch (_) {
      res.redirect('/analysis/ssr');
    }
  });

  app.get('/analysis/:id/ssr', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).send('<!doctype html><title>Bad id</title><p>Invalid analysis id</p>');
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const renderValue = (value, fallback = '—') => {
      if (value === null || value === undefined || value === '') return `<span class="muted">${esc(fallback)}</span>`;
      return esc(value);
    };
    try {
      const db = getDbRW();
      if (!db) return res.status(503).send('<!doctype html><title>Analysis</title><p>Database unavailable.</p>');
      ensureAnalysisRunSchema(db);
      const detail = getAnalysisRun(db, id, { limitEvents: req.query.eventsLimit || req.query.limit });
      if (!detail) return res.status(404).send('<!doctype html><title>Not found</title><p>Analysis run not found</p>');
      const { run, events } = detail;
      const summary = run.summary || {};
      const steps = summary.steps || {};
      const pagesLabel = formatPagesStep(steps.pages);
      const domainsLabel = formatDomainsStep(steps.domains);
      const milestonesLabel = formatMilestonesStep(steps.milestones);
      const durationText = formatDuration(run.durationMs);
      const configRows = [
        ['Analysis version', run.analysisVersion != null ? String(run.analysisVersion) : (summary.config?.analysisVersion != null ? String(summary.config.analysisVersion) : 'auto')],
        ['Page limit', run.pageLimit != null ? String(run.pageLimit) : (summary.config?.pageLimit != null ? String(summary.config.pageLimit) : 'default')],
        ['Domain limit', run.domainLimit != null ? String(run.domainLimit) : (summary.config?.domainLimit != null ? String(summary.config.domainLimit) : 'default')],
        ['Skip pages', run.skipPages ? 'yes' : 'no'],
        ['Skip domains', run.skipDomains ? 'yes' : 'no'],
        ['Dry run', run.dryRun ? 'yes' : 'no'],
        ['Verbose', run.verbose ? 'yes' : 'no']
      ].map(([label, value]) => `<li><span class="k">${esc(label)}</span> <span class="v">${renderValue(value)}</span></li>`).join('');
      const eventsRows = (events || []).map((ev) => {
        const detailsText = ev.details ? JSON.stringify(ev.details) : '';
        return `<tr>
          <td class="fit mono">${esc(ev.ts || '')}</td>
          <td class="fit">${esc(ev.stage || '')}</td>
          <td>${esc(ev.message || '')}</td>
          <td class="mono small">${esc(detailsText)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="meta">No events</td></tr>';
      const errorHtml = run.error ? `<div class="alert warn" id="errorRow"><strong>Error:</strong> <span id="errorValue">${esc(run.error)}</span></div>` : `<div class="alert warn" id="errorRow" style="display:none"><strong>Error:</strong> <span id="errorValue"></span></div>`;
      const stateJson = JSON.stringify(detail).replace(/[<>&]/g, (c) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' }[c]));
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis ${esc(run.id)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--warn:#dc2626}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  .btn:hover{text-decoration:underline}
  .muted{color:var(--muted)}
  .small{font-size:12px}
  .warn{color:var(--warn)}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .grid{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
  .grid .right a{margin-left:8px}
  .card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin:12px 0}
  .kv{margin:4px 0}
  .kv .k{color:var(--muted);margin-right:6px}
  .kv .v{font-weight:600}
  .kv-list{list-style:none;margin:0;padding:0}
  .kv-list li{margin:4px 0;display:flex;gap:8px}
  .kv-list .k{color:var(--muted);width:160px;flex:0 0 160px}
  .kv-list .v{flex:1 1 auto}
  .summary{list-style:none;margin:0;padding:0}
  .summary li{margin:4px 0;display:flex;gap:8px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
  .alert{border:1px solid var(--warn);border-radius:8px;padding:8px 10px;margin:8px 0;background:#fff5f5}
</style>
</head><body>
  <div class="container" data-run="${esc(run.id)}">
    <header>
      <h1>Analysis <span class="pill mono">${esc(run.id)}</span></h1>
  ${renderNav('analysis')}
    </header>
    <div class="grid">
      <div class="muted small">Started ${esc(run.startedAt || '')}</div>
      <div class="right"><a class="btn" href="/analysis/ssr">All runs</a><a class="btn" href="/analysis/latest">Latest →</a></div>
    </div>
    <div class="card">
      <div class="kv"><span class="k">Status:</span> <span class="v" id="statusValue">${esc(run.status || '')}</span></div>
      <div class="kv"><span class="k">Stage:</span> <span class="v" id="stageValue">${esc(run.stage || '')}</span></div>
      <div class="kv"><span class="k">Started:</span> <span class="v" id="startedValue">${esc(run.startedAt || '')}</span></div>
      <div class="kv"><span class="k">Ended:</span> <span class="v" id="endedValue">${esc(run.endedAt || '')}</span></div>
      <div class="kv"><span class="k">Duration:</span> <span class="v" id="durationValue">${renderValue(durationText)}</span></div>
      ${errorHtml}
    </div>
    <div class="card">
      <h2 style="margin:0 0 8px">Configuration</h2>
      <ul class="kv-list">${configRows}</ul>
    </div>
    <div class="card">
      <h2 style="margin:0 0 8px">Progress</h2>
      <ul class="summary">
        <li><span class="k">Pages</span> <span class="v" id="pagesSummaryValue">${renderValue(pagesLabel)}</span></li>
        <li><span class="k">Domains</span> <span class="v" id="domainsSummaryValue">${renderValue(domainsLabel)}</span></li>
        <li><span class="k">Milestones</span> <span class="v" id="milestonesSummaryValue">${renderValue(milestonesLabel)}</span></li>
      </ul>
    </div>
    <div class="card">
      <h2 style="margin:0 0 8px">Events</h2>
      <table>
        <thead><tr><th class="fit">Time</th><th class="fit">Stage</th><th>Message</th><th>Details</th></tr></thead>
        <tbody id="eventsBody">${eventsRows}</tbody>
      </table>
    </div>
  </div>
  <script>window.__ANALYSIS_RUN__=${stateJson};</script>
  <script>
    (function(){
      if (!window.fetch) return;
      var state = window.__ANALYSIS_RUN__;
      if (!state || !state.run) return;
      var runId = state.run.id;
      var statusEl = document.getElementById('statusValue');
      var stageEl = document.getElementById('stageValue');
      var startedEl = document.getElementById('startedValue');
      var endedEl = document.getElementById('endedValue');
      var durationEl = document.getElementById('durationValue');
      var pagesEl = document.getElementById('pagesSummaryValue');
      var domainsEl = document.getElementById('domainsSummaryValue');
      var milestonesEl = document.getElementById('milestonesSummaryValue');
      var eventsBody = document.getElementById('eventsBody');
      var errorRow = document.getElementById('errorRow');
      var errorValue = document.getElementById('errorValue');

      function escapeHtml(value){
        return String(value || '').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});
      }

      function fmtDuration(ms){
        if (ms == null) return '';
        var num = Number(ms);
        if (!isFinite(num) || num < 0) return '';
        var totalSeconds = Math.floor(num / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;
        var parts = [];
        if (hours) parts.push(hours + 'h');
        if (minutes) parts.push(minutes + 'm');
        if (!parts.length || seconds || (!hours && !minutes)) parts.push(seconds + 's');
        return parts.join(' ');
      }

      function describePages(step){
        if (!step) return '';
        if (step.skipped) return 'skipped';
        var parts = [];
        if (Number.isFinite(step.analysed)) parts.push(step.analysed + ' analysed');
        if (Number.isFinite(step.updated)) parts.push(step.updated + ' updated');
        if (Number.isFinite(step.placesInserted)) parts.push(step.placesInserted + ' places');
        return parts.join(', ');
      }

      function describeDomains(step){
        if (!step) return '';
        if (step.skipped) return 'skipped';
        var parts = [];
        if (step.completed) parts.push('completed');
        if (Number.isFinite(step.limit)) parts.push('limit ' + step.limit);
        return parts.join(', ');
      }

      function describeMilestones(step){
        if (!step) return '';
        if (step.skipped) return 'skipped';
        if (Number.isFinite(step.count)) {
          var text = step.count + ' awarded';
          if (step.dryRun) text += ' (dry-run)';
          return text;
        }
        if (step.dryRun) return 'dry-run';
        return '';
      }

      function renderEvents(events){
        if (!events || !events.length) return '<tr><td colspan="4" class="meta">No events</td></tr>';
        return events.map(function(ev){
          var details = ev.details ? JSON.stringify(ev.details) : '';
          return '<tr>' +
            '<td class="fit mono">' + escapeHtml(ev.ts || '') + '</td>' +
            '<td class="fit">' + escapeHtml(ev.stage || '') + '</td>' +
            '<td>' + escapeHtml(ev.message || '') + '</td>' +
            '<td class="mono small">' + escapeHtml(details) + '</td>' +
          '</tr>';
        }).join('');
      }

      function apply(detail){
        if (!detail || !detail.run) return;
        var run = detail.run;
        statusEl.textContent = run.status || '';
        stageEl.textContent = run.stage || '';
        startedEl.textContent = run.startedAt || '';
        endedEl.textContent = run.endedAt || '';
        durationEl.textContent = run.durationMs != null ? fmtDuration(run.durationMs) : '';
        if (run.error) {
          errorRow.style.display = '';
          errorValue.textContent = run.error;
        } else {
          errorRow.style.display = 'none';
          errorValue.textContent = '';
        }
        var steps = (run.summary && run.summary.steps) || {};
        var pagesText = describePages(steps.pages);
        var domainsText = describeDomains(steps.domains);
        var milestonesText = describeMilestones(steps.milestones);
        pagesEl.textContent = pagesText || '—';
        domainsEl.textContent = domainsText || '—';
        milestonesEl.textContent = milestonesText || '—';
        eventsBody.innerHTML = renderEvents(detail.events);
      }

      apply(state);

      function refresh(){
        fetch('/api/analysis/' + encodeURIComponent(runId))
          .then(function(res){ return res.ok ? res.json() : null; })
          .then(function(payload){ if (payload) apply(payload); })
          .catch(function(){});
      }

      setInterval(refresh, 5000);
    })();
  </script>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e?.message || String(e)) + '</pre>');
    }
  });

  // Queues page (simple, static)
  app.get('/queues', (req, res) => {
    // Redirect legacy static page to SSR list for a unified entry point
    res.redirect('/queues/ssr');
  });

  // Queues SSR: list of recent crawl jobs
  app.get('/queues/ssr', (req, res) => {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(503).send('<!doctype html><title>Queues</title><h1>Queues</h1><p>Database unavailable.</p>');
      }
      const rows = db.prepare(`
        SELECT j.id, j.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
               (SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id) AS events,
               (SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id) AS lastEventAt
        FROM crawl_jobs j
        ORDER BY COALESCE(j.ended_at, j.started_at) DESC
        LIMIT ?
      `).all(limit);
      const itemsHtml = rows.map(r => `
        <tr>
          <td><a href="/queues/${esc(r.id)}/ssr">${esc(r.id)}</a></td>
          <td>${esc(r.status||'')}</td>
          <td>${esc(r.startedAt||'')}</td>
          <td>${esc(r.endedAt||'')}</td>
          <td>${esc(r.pid||'')}</td>
          <td>${esc(r.url||'')}</td>
          <td style="text-align:right">${r.events|0}</td>
          <td>${esc(r.lastEventAt||'')}</td>
        </tr>
      `).join('') || '<tr><td colspan="8" class="meta">No queues</td></tr>';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
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
  .controls{margin:6px 2px}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;background:#fff}
  .right{float:right}
  .controls::after{content:"";display:block;clear:both}
  .btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  .btn:hover{text-decoration:underline}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .tr{text-align:right}
  .muted{color:var(--muted)}
  .small{font-size:12px}
  .grid{display:grid;grid-template-columns:1fr auto;align-items:center}
  .grid .right{justify-self:end}
  .nowrap{white-space:nowrap}
  .hdr{margin:0}
  .sub{margin-top:2px}
  .b{font-weight:600}
  .space{margin-left:8px}
  .kv{margin:2px 0}
  .kv .k{color:var(--muted);margin-right:4px}
  .kv .v.mono{font-weight:600}
  .list-help{margin:8px 2px}
  .top{display:flex;justify-content:space-between;align-items:center}
  .top .right a{margin-left:8px}
  .top .right a:first-child{margin-left:0}
  .top .right{font-size:13px}
  .nowrap{white-space:nowrap}
  .fit{width:1%;white-space:nowrap}
  .w100{width:100%}
  .center{display:flex;justify-content:center}
  .center .muted{margin-top:2px}
  .muted strong{font-weight:600}
  .tip{margin-top:6px}
  .tip code{background:#f5f5f5;border:1px solid #eee;padding:0 4px;border-radius:4px}
  .nav-small{margin-left:8px}
  .nav-small a{color:var(--muted);text-decoration:none}
  .nav-small a:hover{color:var(--fg);text-decoration:underline}
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="hdr">Queues</h1>
  ${renderNav('queues')}
    </header>
    <div class="top">
      <div class="muted sub">${rows.length} shown</div>
      <div class="right"><a class="btn" href="/queues/latest">Latest queue →</a></div>
    </div>
    <table>
      <thead><tr><th class="fit">Job</th><th class="fit">Status</th><th class="fit nowrap">Started</th><th class="fit nowrap">Ended</th><th class="fit">PID</th><th>URL</th><th class="tr fit">Events</th><th class="fit nowrap">Last event</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="tip muted small">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</div>
  </div>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!doctype html><title>Error</title><pre>' + (e?.message||String(e)) + '</pre>');
    }
  });

  // Redirect to the latest (most recently started/ended) queue details
  app.get('/queues/latest', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) return res.redirect('/queues/ssr');
      const row = db.prepare(`
        SELECT id FROM crawl_jobs
        ORDER BY COALESCE(ended_at, started_at) DESC
        LIMIT 1
      `).get();
      if (!row) return res.redirect('/queues/ssr');
      res.redirect(`/queues/${encodeURIComponent(row.id)}/ssr`);
    } catch (_) {
      res.redirect('/queues/ssr');
    }
  });

  // Queues SSR: single queue with recent events and next/prev links
  app.get('/queues/:id/ssr', (req, res) => {
    const id = String(req.params.id || '').trim();
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '200', 10)));
    const action = String(req.query.action || '').trim();
    const before = (() => { const v = parseInt(String(req.query.before||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
    const after = (() => { const v = parseInt(String(req.query.after||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    if (!id) return res.status(400).send('<!doctype html><title>Bad id</title><p>Invalid queue id</p>');
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(503).send('<!doctype html><title>Queue</title><h1>Queue</h1><p>Database unavailable.</p>');
      }
      const job = db.prepare(`SELECT id, url, pid, started_at AS startedAt, ended_at AS endedAt, status FROM crawl_jobs WHERE id = ?`).get(id);
      if (!job) return res.status(404).send('<!doctype html><title>Not found</title><p>Queue not found</p>');
      const where = ['job_id = ?'];
      const params = [id];
      if (action) { where.push('action = ?'); params.push(action); }
      // Cursor conditions: before => id < before (DESC), after => id > after (ASC then reverse)
      let order = 'DESC';
      if (before != null) { where.push('id < ?'); params.push(before); }
      else if (after != null) { where.push('id > ?'); params.push(after); order = 'ASC'; }
      let events = db.prepare(`
        SELECT id, ts, action, url, depth, host, reason, queue_size AS queueSize
        FROM queue_events
        WHERE ${where.join(' AND ')}
        ORDER BY id ${order}
        LIMIT ?
      `).all(...params, limit);
      if (order === 'ASC') events.reverse(); // always render newest-first
      // Compute pagination cursors and bounds
      const newestId = events.length ? events[0].id : null;
      const oldestId = events.length ? events[events.length - 1].id : null;
      let maxId = null, minId = null;
      try {
        const b = action
          ? db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ? AND action = ?').get(id, action)
          : db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ?').get(id);
        minId = b?.minId ?? null; maxId = b?.maxId ?? null;
      } catch (_) {}
      // Neighbor queues for navigation (ordered by recency)
      const neighbors = db.prepare(`
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(ended_at, started_at) DESC) AS rn
          FROM crawl_jobs
        )
        SELECT
          (SELECT id FROM ordered WHERE rn = o.rn - 1) AS newerId,
          (SELECT id FROM ordered WHERE rn = o.rn + 1) AS olderId
        FROM ordered o WHERE o.id = ?
      `).get(id) || { newerId: null, olderId: null };
      // Build pagination nav for events
      const buildQs = (obj) => {
        const u = new URLSearchParams();
        const base = { action, limit };
        for (const [k,v] of Object.entries({ ...base, ...obj })) { if (v!=null && v!=='') u.set(k, String(v)); }
        return u.toString();
      };
      const olderHref = oldestId != null ? ('?' + buildQs({ before: oldestId })) : '';
      // Newer page: set after to newestId
      const newerHref = newestId != null ? ('?' + buildQs({ after: newestId })) : '';
      const itemsHtml = events.map(ev => `
        <tr>
          <td class="fit mono">#${ev.id}</td>
          <td class="fit nowrap">${esc(ev.ts||'')}</td>
          <td class="fit">${esc(ev.action||'')}</td>
          <td>${ev.url ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.url)}</a>` : ''}</td>
          <td class="fit">${ev.depth!=null?esc(ev.depth):''}</td>
          <td class="fit">${esc(ev.host||'')}</td>
          <td>${esc(ev.reason||'')}</td>
          <td class="fit tr">${ev.queueSize!=null?esc(ev.queueSize):''}</td>
        </tr>
      `).join('') || '<tr><td colspan="8" class="meta">No events</td></tr>';
      const filterOpts = ['', 'enqueued','dequeued','retry','drop']
        .map(a => `<option value="${a}" ${action===a?'selected':''}>${a||'any'}</option>`).join('');
      const navLinks = `
        <div class="right nav-small">
          ${neighbors.newerId?`<a href="/queues/${esc(neighbors.newerId)}/ssr">← Newer</a>`:''}
          ${neighbors.olderId?`<a class="space" href="/queues/${esc(neighbors.olderId)}/ssr">Next →</a>`:''}
        </div>`;
      const pageNav = `
        <div class="row" style="margin:6px 2px">
          <div class="meta">${events.length} shown${(minId!=null&&maxId!=null)?` · ids ${newestId??''}…${oldestId??''} of ${minId}…${maxId}`:''}</div>
          <div class="right nav-small">
            ${after||before?`<a href="?${buildQs({})}">Latest</a>`:''}
            ${newestId!=null && maxId!=null && newestId < maxId ? `<a class="space" href="${newerHref}">← Newer</a>` : ''}
            ${oldestId!=null && minId!=null && oldestId > minId ? `<a class="space" href="${olderHref}">Older →</a>` : ''}
          </div>
        </div>`;
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queue ${esc(job.id)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:12px}
  .grid{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;background:#fff}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace}
  .kv{margin:2px 0}
  .kv .k{color:var(--muted);margin-right:4px}
  .kv .v.mono{font-weight:600}
  .controls{margin:6px 2px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .fit{width:1%;white-space:nowrap}
  .tr{text-align:right}
  .row{display:flex;justify-content:space-between;align-items:center}
  .row .right a{margin-left:8px}
  .row .right a:first-child{margin-left:0}
  .nowrap{white-space:nowrap}
  form.inline{display:flex;gap:8px;align-items:center}
  label.small{font-size:12px;color:var(--muted)}
  input,select{padding:6px 8px}
  button{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button:hover{text-decoration:underline}
  a.btn{border:1px solid var(--border);border-radius:8px;padding:6px 10px;text-decoration:none;color:var(--fg);background:#fff}
  a.btn:hover{text-decoration:underline}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Queue <span class="pill mono">${esc(job.id)}</span></h1>
  ${renderNav('queues')}
    </header>

    <section class="controls">
      <div class="row">
        <div>
          <div class="kv"><span class="k">Status:</span> <span class="v mono">${esc(job.status||'')}</span></div>
          <div class="kv"><span class="k">PID:</span> <span class="v mono">${esc(job.pid||'')}</span> <span class="k">URL:</span> <span class="v mono">${esc(job.url||'')}</span></div>
          <div class="kv"><span class="k">Started:</span> <span class="v mono">${esc(job.startedAt||'')}</span> <span class="k">Ended:</span> <span class="v mono">${esc(job.endedAt||'')}</span></div>
        </div>
        ${navLinks}
      </div>
      <form method="GET" class="inline" action="">
        <label class="small">Action
          <select name="action">${filterOpts}</select>
        </label>
        <label class="small">Limit
          <input type="number" name="limit" value="${limit}" min="1" max="500"/>
        </label>
        ${before?`<input type="hidden" name="before" value="${before}"/>`:''}
        ${after?`<input type="hidden" name="after" value="${after}"/>`:''}
        <button type="submit">Apply</button>
        <a class="btn" href="/queues/ssr">All queues</a>
      </form>
    </section>

    ${pageNav}
    <table>
      <thead><tr><th class="fit">#</th><th class="fit">Time</th><th class="fit">Action</th><th>URL</th><th class="fit">Depth</th><th class="fit">Host</th><th>Reason</th><th class="fit tr">Queue</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!doctype html><title>Error</title><pre>' + (e?.message||String(e)) + '</pre>');
    }
  });

  // fetch-body moved to routes/api.urls.js

  // URL details page route
  app.get('/url', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'url.html'));
  });

  // Catch-all for SPA
  app.get('/urls', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'urls.html'));
  });

  // url-details moved to routes/api.urls.js

  // Gazetteer APIs (read-only helpers)
  app.get('/api/gazetteer/summary', (req, res) => {
    try {
  let openDbReadOnly;
  try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
  const now = Date.now();
      if (summaryCache.data && (now - summaryCache.at) < summaryCache.ttlMs) {
        return res.json(summaryCache.data);
      }
  const db = openDbReadOnly(urlsDbPath);
      const row = {
        countries: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c,
        regions: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c,
        cities: db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c,
        names: db.prepare('SELECT COUNT(*) c FROM place_names').get().c,
        sources: db.prepare('SELECT COUNT(*) c FROM place_sources').get().c
      };
      db.close();
      summaryCache.data = row; summaryCache.at = now;
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-rendered Gazetteer list page
  app.get('/gazetteer/places', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
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
  const showStorage = String(req.query.storage || '0') === '1';

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
    }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
  function qs(obj) {
      const u = new URLSearchParams();
      for (const [k,v] of Object.entries(obj)) { if (v!=null && v!=='') u.set(k, String(v)); }
      return u.toString();
    }
  function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    try {
    let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return;
      }
  const doneOpen = trace.pre('db-open');
  const db = openDbReadOnly(urlsDbPath);
  doneOpen();
      const where = [];
      const params = [];
      if (kind) { where.push('p.kind = ?'); params.push(kind); }
      if (cc) { where.push('p.country_code = ?'); params.push(cc); }
      if (adm1) { where.push('p.adm1_code = ?'); params.push(adm1); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      // Filter out nameless places (no canonical name and no name rows)
  const doneCount = trace.pre('count-total');
  let total = 0;
  try {
        total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE (p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
          OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id)
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
      `).get(...params).c;
  } catch (_) { total = 0; }
  doneCount();
  const doneList = trace.pre('list-query');
  let rows = [];
  try { rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               cn.name AS name
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset); } catch (_) { rows = []; }
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
      } catch (_) { val = 0; }
      memo.set(id, val);
      return val;
    };
    rows = rows.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
    // Optional in-memory sort by storage for current page
    if (sort === 'storage') {
      const asc = String(dir).toUpperCase() !== 'DESC';
      rows.sort((a,b) => (a.size_bytes||0) - (b.size_bytes||0));
      if (!asc) rows.reverse();
    }
  }
  doneList();
  const doneClose = trace.pre('db-close');
  db.close();
  doneClose();

      const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
      const start = total ? ((page - 1) * pageSize + 1) : 0;
      const end = Math.min(page * pageSize, total || 0);
  const prevLink = page > 1 ? ('?' + qs({ q, kind, cc, adm1, minpop, sort, dir, page: page-1, pageSize, storage: showStorage ? '1' : '' })) : '';
  const nextLink = page < totalPages ? ('?' + qs({ q, kind, cc, adm1, minpop, sort, dir, page: page+1, pageSize, storage: showStorage ? '1' : '' })) : '';

    const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.kind||'')}</td>
          <td>${esc(r.country_code||'')}</td>
          <td>${esc(r.adm1_code||'')}</td>
      ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const totalShownStorage = showStorage ? rows.reduce((a,b)=>a+(b.size_bytes||0),0) : 0;

  const sortOptions = ['name','country','population'];
  if (showStorage) sortOptions.push('storage');
  const sortOpts = sortOptions.map(s => `<option value="${s}" ${sort===s?'selected':''}>${s}</option>`).join('');
      const dirOpts = ['asc','desc'].map(d => `<option value="${d}" ${dir.toLowerCase()===d?'selected':''}>${d.toUpperCase()}</option>`).join('');

  const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc;--accent:#0ea5e9}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
  label{font-size:12px;color:var(--muted)}
  input,select,button{padding:7px 8px;font-size:14px}
  button{border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .meta{color:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .pager a{margin-right:10px}
  .downloads{margin:8px 2px}
  .help{margin-top:4px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Places</h1>
  ${renderNav('gazetteer')}
    </header>
    <form method="GET" class="card" style="margin-bottom:10px">
      <div class="form-grid">
        <label>Search<br/><input name="q" value="${esc(q)}" placeholder="name"/></label>
        <label>Kind<br/>
          <select name="kind">
            <option value="" ${kind?'':'selected'}>Any</option>
            ${['country','region','city','poi','supranational'].map(k=>`<option ${kind===k?'selected':''}>${k}</option>`).join('')}
          </select>
        </label>
        <label>Country (CC)<br/><input name="cc" value="${esc(cc)}" placeholder="US"/></label>
        <label>ADM1<br/><input name="adm1" value="${esc(adm1)}" placeholder="CA-ON"/></label>
        <label>Min pop<br/><input name="minpop" type="number" value="${minpop||''}"/></label>
        <label>Sort<br/>
          <div style="display:flex;gap:6px"><select name="sort">${sortOpts}</select><select name="dir">${dirOpts}</select></div>
        </label>
        <label>Page size<br/><input name="pageSize" type="number" value="${pageSize}"/></label>
        <div style="align-self:end; display:flex; gap:8px; align-items:center">
          <label><input type="checkbox" name="storage" value="1" ${showStorage?'checked':''}/> Storage</label>
          <button type="submit" class="primary">Search</button>
        </div>
      </div>
      <div class="meta help">Tip: use cc=US or adm1=CA-ON to narrow results.</div>
    </form>
    <div class="meta" style="margin:6px 2px 8px">${rows.length} of ${total} — page ${page}/${totalPages} — showing ${start}-${end}</div>
    <div class="pager" style="margin:0 0 6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  ${showStorage?`<div class="meta" style="margin:4px 2px 6px">Total shown storage: ~ ${fmtBytes(totalShownStorage)}</div>`:''}
    <table>
      <thead><tr><th>Name</th><th>Kind</th><th>CC</th><th>ADM1</th>${showStorage?'<th style="text-align:right">Storage</th>':''}<th style="text-align:right">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="5" class="meta">No results</td></tr>'}</tbody>
    </table>
    <div class="pager" style="margin:6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  <div class="meta downloads">Download: <a href="/api/gazetteer/places?${qs({ q, kind, cc, adm1, minpop, sort, dir, page, pageSize, format:'csv' })}">CSV</a> · <a href="/api/gazetteer/places?${qs({ q, kind, cc, adm1, minpop, sort, dir, page, pageSize, format:'ndjson' })}">NDJSON</a></div>
  </div>
</body></html>`;

  const doneRender = trace.pre('render');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(pageHtml);
  doneRender();
  trace.end();
    } catch (e) {
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Gazetteer landing page with quick links and summary
  app.get('/gazetteer', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return;
      }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneCounts = trace.pre('counts');
      // Be resilient if tables are not yet initialized; default to zeros
      let countries = 0, regions = 0, cities = 0, names = 0, sources = 0;
      try { countries = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c; } catch (_) { countries = 0; }
      try { regions = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c; } catch (_) { regions = 0; }
      try { cities = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c; } catch (_) { cities = 0; }
      try { names = db.prepare('SELECT COUNT(*) c FROM place_names').get().c; } catch (_) { names = 0; }
      try { sources = db.prepare('SELECT COUNT(*) c FROM place_sources').get().c; } catch (_) { sources = 0; }
      doneCounts();
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();
      // Empty-state helper: show a small getting-started card when everything is zero
      const allZero = (Number(countries)||0)===0 && (Number(regions)||0)===0 && (Number(cities)||0)===0 && (Number(names)||0)===0 && (Number(sources)||0)===0;
      const emptyState = allZero ? `
        <section class="card" style="margin-top:10px">
          <div class="meta">Getting started</div>
          <p style="margin:6px 0">Your gazetteer looks empty. Populate it with the built-in tool:</p>
          <pre style="background:#0f172a;color:#e5e7eb;padding:10px;border-radius:8px;overflow:auto"><code>npm run populate:gazetteer</code></pre>
          <div class="meta" style="margin-top:6px">This will import countries, regions (ADM1), and a sample of cities. You can re-run safely; the importer is idempotent.</div>
        </section>
      ` : '';
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:22px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px}
  .meta{color:var(--muted);font-size:13px}
  ul{margin:6px 0 0 16px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Gazetteer</h1>
  ${renderNav('gazetteer')}
    </header>
    <section class="card">
      <div class="meta">Summary</div>
      <div style="margin-top:6px">Countries: <strong>${countries}</strong> · Regions: <strong>${regions}</strong> · Cities: <strong>${cities}</strong></div>
      <div class="meta" style="margin-top:6px">Names: ${names} · Sources: ${sources}</div>
      <div style="margin-top:10px">
        <a href="/gazetteer/countries">Countries</a> ·
        <a href="/gazetteer/places">All places</a>
      </div>
    </section>
    ${emptyState}
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Country page with optional storage UI
  app.get('/gazetteer/country/:cc', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    const cc = String(req.params.cc || '').trim().toUpperCase();
    const showStorage = String(req.query.storage || '0') === '1';
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Country</title><h1>Country</h1><p>Database unavailable.</p>'); return;
      }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneCountry = trace.pre('get-country');
      const country = db.prepare(`
        SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind='country' AND UPPER(p.country_code) = ?
        GROUP BY p.id
      `).get(cc);
      doneCountry();
      if (!country) { db.close(); res.status(404).send('<!doctype html><title>Not found</title><p>Country not found</p>'); return; }
      // Regions and Cities in this country
      const doneRegions = trace.pre('list-regions');
      const regions = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'region' AND UPPER(p.country_code) = ?
        GROUP BY p.id
        ORDER BY name ASC
      `).all(cc);
      doneRegions();
      // Cities in this country
      const doneCities = trace.pre('list-cities');
      let cities = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE p.kind = 'city' AND UPPER(p.country_code) = ?
        GROUP BY p.id
        ORDER BY p.population DESC, name ASC
      `).all(cc);
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
          } catch (_) { val = 0; }
          memo.set(id, val);
          return val;
        };
        cities = cities.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
      }
      doneCities();
      // Optional country storage (approximate)
      let countryStorage = 0;
      if (showStorage) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(country.id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(country.id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(country.id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(country.id, country.id)?.b || 0;
          countryStorage = (a + b + c + d) | 0;
        } catch (_) { countryStorage = 0; }
      }
      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();

      const toggleHtml = showStorage
        ? `<span>Storage: On · <a href="?">storage=0</a></span>`
        : `<span>Storage: Off · <a href="?storage=1">storage=1</a></span>`;
      const regionsHtml = regions.map(r => `
        <li><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a> <span class="meta">${esc(r.adm1_code||'')}</span></li>
      `).join('');
      const rowsHtml = cities.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.adm1_code||'')}</td>
          ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(country.name||country.country_code)} — Country</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px}
  .card{background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .bad{color:#dc2626}
  .muted{color:var(--muted)}
  .row{display:flex;justify-content:space-between;align-items:center}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;background:#fff}
  a.tiny{font-size:12px}
  .right{float:right}
  .infobox div{margin:2px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width: 800px){ .grid{grid-template-columns:1fr} }
  .infobox{padding:10px}
  .switch{font-size:12px}
  .switch a{margin-left:6px}
  .switch strong{font-weight:600}
  .storage-val{font-weight:600}
  .toggle{margin-top:6px}
  .hdr{margin:0 0 6px}
  .w100{width:100%}
  .tr{ text-align:right }
  .name{ font-weight:600 }
  .table-wrap{margin-top:8px}
  .tbl-meta{margin:4px 2px}
  .tbl-meta strong{font-weight:600}
  .tbl-meta .muted{margin-left:8px}
  .tbl-meta .right{float:right}
  .tbl-meta::after{content:"";display:block;clear:both}
  .pill strong{font-weight:600}
  .breadcrumbs{margin-bottom:4px}
  .breadcrumbs a{color:var(--muted);text-decoration:none}
  .breadcrumbs a:hover{color:var(--fg);text-decoration:underline}
  .hdr-cc{margin-left:8px}
  .hdr-pop{margin-left:8px}
  .hdr-id{margin-left:8px}
  .hdr-line{margin-top:2px}
  .hdr-line .meta{margin-right:8px}
  .hdr-line .meta:last-child{margin-right:0}
  .hdr-line .meta strong{font-weight:600}
  .toggle a{ text-decoration:none }
  .toggle a:hover{ text-decoration:underline }
  .section-title{margin:8px 0 6px}
  .section-title strong{font-weight:600}
  .hdr-links a{margin-left:8px}
  .hdr-links a:first-child{margin-left:0}
  .hdr-links{margin-top:6px}
  .center{display:flex;justify-content:center}
  .center .muted{margin-top:2px}
  .spaced{letter-spacing:0.2px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
  .mono .muted{letter-spacing:0}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:900px){ .grid-2{grid-template-columns:1fr} }
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="spaced">${esc(country.name||country.country_code)} <span class="pill mono">${esc(country.country_code||'')}</span></h1>
  ${renderNav('gazetteer')}
    </header>
    <section class="card infobox">
      <div class="row"><div class="name">Infobox</div><div class="switch toggle">${toggleHtml}</div></div>
      <div class="hdr-line">
        ${country.population?`<span class="meta">Population: <strong>${num(country.population)}</strong></span>`:''}
        ${showStorage?`<span class="meta">Storage: <span class="storage-val">${fmtBytes(countryStorage||0)}</span></span>`:''}
      </div>
      <div class="hdr-links"><a href="/gazetteer">Gazetteer</a> · <a href="/gazetteer/countries">Countries</a></div>
    </section>

    <section class="card">
      <h2 class="section-title"><strong>Regions</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${regions.length} regions</span>
      </div>
      <ul>${regionsHtml || '<li class="meta">No regions</li>'}</ul>
    </section>

    <section class="table-wrap">
      <h2 class="section-title"><strong>Cities</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${cities.length} cities</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>ADM1</th>${showStorage?'<th class="tr">Storage</th>':''}<th class="tr">Population</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4" class="meta">No cities</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Server-rendered Gazetteer page by kind (e.g., city/region), with optional storage column
  app.get('/gazetteer/kind/:kind', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    function fmtBytes(n) { if (n == null) return ''; const u=['B','KB','MB','GB','TB']; let i=0; let v=Number(n)||0; while (v>=1024&&i<u.length-1){v/=1024;i++;} return (i===0? String(v|0) : v.toFixed(1)) + ' ' + u[i]; }
    const kind = String(req.params.kind || '').trim().toLowerCase();
    const showStorage = String(req.query.storage || '0') === '1';
    const q = String(req.query.q || '').trim();
    const cc = String(req.query.cc || '').trim().toUpperCase();
    const minpop = parseInt(req.query.minpop || '0', 10) || 0;
    const sort = String(req.query.sort || 'name').trim();
    const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return; }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const where = ['p.kind = ?'];
      const params = [kind];
      if (cc) { where.push('UPPER(p.country_code) = ?'); params.push(cc); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const sortCol = (sort === 'pop' || sort === 'population') ? 'p.population' : (sort === 'country' ? 'p.country_code' : 'cn.name');
      let total = 0;
      try { total = db.prepare(`
        SELECT COUNT(*) AS c
        FROM places p
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          AND ${where.join(' AND ')}
      `).get(...params).c; } catch (_) { total = 0; }
      let rows = [];
      try { rows = db.prepare(`
        SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population,
               cn.name AS name
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          AND ${where.join(' AND ')}
        ORDER BY ${sortCol} ${dir}
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset); } catch (_) { rows = []; }
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
          } catch (_) { val = 0; }
          memo.set(id, val); return val;
        };
        rows = rows.map(r => ({ ...r, size_bytes: sizeFor(r.id) }));
        if (sort === 'storage') {
          const asc = String(dir).toUpperCase() !== 'DESC';
          rows.sort((a,b) => (a.size_bytes||0) - (b.size_bytes||0));
          if (!asc) rows.reverse();
        }
      }
      const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
      const start = total ? ((page - 1) * pageSize + 1) : 0;
      const end = Math.min(page * pageSize, total || 0);
      const buildQS = (obj) => {
        const u = new URLSearchParams();
        for (const [k,v] of Object.entries(obj)) { if (v!=null && v!=='') u.set(k, String(v)); }
        return u.toString();
      };
      const prevLink = page > 1 ? ('?' + buildQS({ q, cc, minpop, sort, dir, page: page-1, pageSize, storage: showStorage ? '1' : '' })) : '';
      const nextLink = page < totalPages ? ('?' + buildQS({ q, cc, minpop, sort, dir, page: page+1, pageSize, storage: showStorage ? '1' : '' })) : '';
      const sortOptions = ['name','country','population'];
      if (showStorage) sortOptions.push('storage');
      const sortOpts = sortOptions.map(s => `<option value="${s}" ${sort===s?'selected':''}>${s}</option>`).join('');
      const dirOpts = ['asc','desc'].map(d => `<option value="${d}" ${dir.toLowerCase()===d?'selected':''}>${d.toUpperCase()}</option>`).join('');
      const htmlRows = rows.map(r => `
        <tr>
          <td><a href="/gazetteer/place/${r.id}">${esc(r.name||'')}</a></td>
          <td>${esc(r.country_code||'')}</td>
          <td>${esc(r.adm1_code||'')}</td>
          ${showStorage?`<td style="text-align:right"><span title="Approximate">~ ${fmtBytes(r.size_bytes||0)}</span></td>`:''}
          <td style="text-align:right">${num(r.population)}</td>
        </tr>
      `).join('');
      const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${kind.charAt(0).toUpperCase()+kind.slice(1)} — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc;--accent:#0ea5e9}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1100px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
  label{font-size:12px;color:var(--muted)}
  input,select,button{padding:7px 8px;font-size:14px}
  button{border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
  button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .meta{color:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .pager a{margin-right:10px}
  .downloads{margin:8px 2px}
  .toggle{margin-left:8px}
  .hdr{margin:0 0 6px}
  .tr{ text-align:right }
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="hdr">${(kind.charAt(0).toUpperCase()+kind.slice(1))}s</h1>
  ${renderNav('gazetteer')}
    </header>
    <form method="GET" class="card" style="margin-bottom:10px">
      <div class="form-grid">
        <label>Search<br/><input name="q" value="${esc(q)}" placeholder="name"/></label>
        <label>Country (CC)<br/><input name="cc" value="${esc(cc)}" placeholder="US"/></label>
        <label>Min pop<br/><input name="minpop" type="number" value="${minpop||''}"/></label>
        <label>Sort<br/>
          <div style="display:flex;gap:6px"><select name="sort">${sortOpts}</select><select name="dir">${dirOpts}</select></div>
        </label>
        <label>Page size<br/><input name="pageSize" type="number" value="${pageSize}"/></label>
        <div style="align-self:end; display:flex; gap:8px; align-items:center">
          <label><input type="checkbox" name="storage" value="1" ${showStorage?'checked':''}/> Storage</label>
          <button type="submit" class="primary">Search</button>
        </div>
      </div>
    </form>
    <div class="meta" style="margin:6px 2px 8px">${rows.length} of ${total} — page ${page}/${totalPages} — showing ${start}-${end} <span class="toggle">${showStorage?`Storage: On · <a href="?${buildQS({ q, cc, minpop, sort, dir, page, pageSize })}">storage=0</a>`:`Storage: Off · <a href="?${buildQS({ q, cc, minpop, sort, dir, page, pageSize, storage:'1' })}">storage=1</a>`}</span></div>
    <div class="pager" style="margin:0 0 6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
    ${showStorage?`<div class="meta" style="margin:4px 2px 6px">Total shown storage: ~ ${fmtBytes(rows.reduce((a,b)=>a+(b.size_bytes||0),0))}</div>`:''}
    <table>
      <thead><tr><th>Name</th><th>CC</th><th>ADM1</th>${showStorage?'<th class="tr">Storage</th>':''}<th class="tr">Population</th></tr></thead>
      <tbody>${htmlRows || '<tr><td colspan="5" class="meta">No results</td></tr>'}</tbody>
    </table>
    <div class="pager" style="margin:6px 2px;">
      ${prevLink?`<a href="${prevLink}">← Prev</a>`:''}
      ${nextLink?`<a href="${nextLink}">Next →</a>`:''}
    </div>
  </div>
</body></html>`;
      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(pageHtml);
      doneRender();
      trace.end();
    } catch (e) {
      try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + (e?.message || String(e)) + '</pre>');
    }
  });

  // JSON: Gazetteer places search (with pagination)
  app.get('/api/gazetteer/places', (req, res) => {
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
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
      if (kind) { where.push('p.kind = ?'); params.push(kind); }
      if (cc) { where.push('UPPER(p.country_code) = ?'); params.push(cc); }
      if (adm1) { where.push('p.adm1_code = ?'); params.push(adm1); }
      if (minpop > 0) { where.push('COALESCE(p.population,0) >= ?'); params.push(minpop); }
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
      res.json({ total, page, pageSize, rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer place details
  app.get('/api/gazetteer/place/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
      const db = openDbReadOnly(urlsDbPath);
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      if (!place) { db.close(); return res.status(404).json({ error: 'Not found' }); }
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      // Compute size metrics similar to SSR page
      let size_bytes = 0; let size_method = 'approx';
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
        if (row && typeof row.bytes === 'number') { size_bytes = row.bytes|0; size_method = 'dbstat'; }
      } catch (_) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
          size_bytes = (a + b + c + d) | 0;
          size_method = 'approx';
        } catch (_) { size_bytes = 0; size_method = 'approx'; }
      }
      db.close();
      res.json({ place, names, parents, children, size_bytes, size_method });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer recent articles mentioning a place (by id)
  app.get('/api/gazetteer/articles', (req, res) => {
    try {
      const id = parseInt(String(req.query.id || ''), 10);
      if (!id) return res.status(400).json({ error: 'Missing id' });
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
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
      res.status(500).json({ error: e.message });
    }
  });

  // JSON: Gazetteer hubs for a host
  app.get('/api/gazetteer/hubs', (req, res) => {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(200).json([]); }
      const db = openDbReadOnly(urlsDbPath);
      let rows = [];
      try {
        if (host) rows = db.prepare('SELECT * FROM place_hubs WHERE LOWER(host) = ? ORDER BY last_seen_at DESC LIMIT 50').all(host);
        else rows = db.prepare('SELECT * FROM place_hubs ORDER BY last_seen_at DESC LIMIT 50').all();
      } catch (_) { rows = []; }
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
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { return res.status(200).json([]); }
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
      if (!host) return res.status(400).json({ error: 'Missing host' });
      let NewsDatabase; try { NewsDatabase = require('../../db'); } catch (e) { return res.status(503).json({ error: 'Database unavailable', detail: e.message }); }
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
        } catch (_) { fetches = 0; }
      }
      db.close();
      res.json({ host, articles: art, fetches });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-rendered Gazetteer detail page (wiki-like)
  app.get('/gazetteer/place/:id', (req, res) => {
  const trace = startTrace(req, 'gazetteer');
    const id = parseInt(req.params.id, 10);
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
  function fmtBytes(n) { if (n == null) return ''; const units=['B','KB','MB','GB','TB']; let i=0; let v = Number(n)||0; while (v>=1024 && i<units.length-1) { v/=1024; i++; } return (i===0? String(v|0) : v.toFixed(1)) + ' ' + units[i]; }
    if (!id) { res.status(400).send('<!doctype html><title>Bad id</title><p>Invalid id</p>'); return; }
    try {
      let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) { res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>'); return; }
      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();
      const doneGetPlace = trace.pre('get-place');
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      doneGetPlace();
      if (!place) { db.close(); res.status(404).send('<!doctype html><title>Not found</title><p>Place not found</p>'); return; }
      const doneNames = trace.pre('get-names');
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      doneNames();
      const doneIds = trace.pre('get-external-ids');
      const ids = db.prepare('SELECT * FROM place_external_ids WHERE place_id = ?').all(id);
      doneIds();
      const doneParents = trace.pre('get-parents');
      const parents = db.prepare('SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.parent_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.child_id = ?').all(id);
      doneParents();
      const doneChildren = trace.pre('get-children');
      const children = db.prepare('SELECT ph.child_id, p.kind, p.country_code, p.adm1_code, COALESCE(cn.name, pn.name) AS name FROM place_hierarchy ph JOIN places p ON p.id = ph.child_id LEFT JOIN place_names pn ON pn.place_id = p.id LEFT JOIN place_names cn ON cn.id = p.canonical_name_id WHERE ph.parent_id = ? LIMIT 200').all(id);
      doneChildren();
      // Related articles by canonical name if present
      let articles = [];
      try {
        const doneArticleName = trace.pre('get-article-name');
        const cname = place.canonical_name_id ? (db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id)?.name || null) : null;
        doneArticleName();
        if (cname) {
          const doneArticles = trace.pre('get-articles');
          articles = db.prepare(`
            SELECT a.url, a.title, a.date
            FROM article_places ap JOIN articles a ON a.url = ap.article_url
            WHERE ap.place = ?
            ORDER BY (a.date IS NULL) ASC, a.date DESC
            LIMIT 20
          `).all(cname);
          doneArticles();
        }
      } catch (_) {}
      // Place hubs by slug derived from canonical name
      let hubs = [];
      try {
        const doneHubName = trace.pre('get-hub-name');
        const cname = place.canonical_name_id ? (db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id)?.name || null) : null;
        const slug = cname ? String(cname).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') : '';
        doneHubName();
        const doneHubs = trace.pre('get-hubs');
        if (slug) hubs = db.prepare('SELECT * FROM place_hubs WHERE place_slug = ? ORDER BY last_seen_at DESC LIMIT 20').all(slug);
        doneHubs();
      } catch (_) {}
      // Resolve breadcrumb links
      let bcCountry = null; let bcRegion = null;
      try {
        const doneBreadcrumbs = trace.pre('breadcrumbs');
        if (place.country_code) {
          bcCountry = { cc: place.country_code, name: (place.country_code) };
          try {
            const crow = db.prepare(`SELECT COALESCE(cn.name, pn.name) AS name FROM places p LEFT JOIN place_names pn ON pn.place_id=p.id LEFT JOIN place_names cn ON cn.id=p.canonical_name_id WHERE p.kind='country' AND p.country_code = ? GROUP BY p.id`).get(place.country_code);
            if (crow && crow.name) bcCountry.name = crow.name;
          } catch (_) {}
        }
        if (place.country_code && place.adm1_code) {
          bcRegion = db.prepare(`SELECT id, COALESCE(cn.name, pn.name) AS name FROM places p LEFT JOIN place_names pn ON pn.place_id=p.id LEFT JOIN place_names cn ON cn.id=p.canonical_name_id WHERE p.kind='region' AND p.country_code = ? AND p.adm1_code = ? GROUP BY p.id LIMIT 1`).get(place.country_code, place.adm1_code) || null;
        }
        doneBreadcrumbs();
      } catch (_) {}
      const doneClose = trace.pre('db-close');
      // Compute storage size for this place (best-effort)
      let size_bytes = 0;
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
        if (row && typeof row.bytes === 'number') size_bytes = row.bytes|0;
      } catch (_) {
        try {
          const a = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b FROM places WHERE id=?`).get(id)?.b || 0;
          const b = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b FROM place_names WHERE place_id=?`).get(id)?.b || 0;
          const c = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b FROM place_external_ids WHERE place_id=?`).get(id)?.b || 0;
          const d = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b FROM place_hierarchy WHERE parent_id=? OR child_id=?`).get(id, id)?.b || 0;
          size_bytes = (a + b + c + d) | 0;
        } catch (_) { size_bytes = 0; }
      }
      db.close();
      doneClose();

      const title = names.find(n => n.id === place.canonical_name_id)?.name || names[0]?.name || '(unnamed)';
      // Build external ID links
      const idLink = (src, val) => {
        const s = String(src || '').toLowerCase();
        const v = String(val || '').trim();
        if (!v) return null;
        if (s === 'wikidata' || s === 'wd' || s === 'wdid') return { href: `https://www.wikidata.org/wiki/${encodeURIComponent(v)}`, label: 'Wikidata' };
        if (s === 'geonames' || s === 'geoname' || s === 'gn') return { href: `https://www.geonames.org/${encodeURIComponent(v)}`, label: 'GeoNames' };
        if (s === 'osm' || s === 'openstreetmap') {
          // support relation:123, way:456, node:789 or raw id (assume relation)
          const m = v.match(/^(node|way|relation)\s*[:#-]?\s*(\d+)$/i);
          if (m) {
            return { href: `https://www.openstreetmap.org/${m[1].toLowerCase()}/${m[2]}`, label: 'OpenStreetMap' };
          }
          if (/^\d+$/.test(v)) return { href: `https://www.openstreetmap.org/relation/${v}`, label: 'OpenStreetMap' };
        }
        return null;
      };
      const idLinksHtml = ids
        .map(r => { const L = idLink(r.source, r.ext_id); if (!L) return null; return `<li><a href="${L.href}" target="_blank" rel="noopener">${esc(L.label)}</a> <span class="meta">${esc(String(r.ext_id))}</span></li>`; })
        .filter(Boolean)
        .join('');
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:1000px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:center;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:6px 0 0}
  .meta{color:var(--muted);font-size:13px}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:12px}
  @media (max-width: 900px){ .grid{grid-template-columns:1fr} }
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:10px}
  h2{margin:0 0 8px}
  ul{margin:6px 0 0 16px}
  li{margin:2px 0}
  a.back{ text-decoration:none }
  a.back:hover{ text-decoration:underline }
  .badge{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;margin-left:6px;font-size:12px;color:#334155;background:#fff}
  .section{margin-top:10px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width: 700px){ .cols{grid-template-columns:1fr} }
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
</style>
</head><body>
  <div class="container">
    <header>
      <div>
        <div class="meta" style="margin-bottom:4px">🏠 <a href="/gazetteer">Gazetteer</a>${bcCountry?` › <a href="/gazetteer/country/${esc(bcCountry.cc)}">${esc(bcCountry.name||bcCountry.cc)}</a>`:''}${bcRegion?` › <a href="/gazetteer/place/${bcRegion.id}">${esc(bcRegion.name||'')}</a>`:''}</div>
        <h1>${esc(title)} <span class="badge">${esc(place.kind)}</span></h1>
        <div class="meta">${place.country_code?('· '+esc(place.country_code)) : ''} ${place.adm1_code?('· '+esc(place.adm1_code)) : ''} ${place.population?('· pop '+num(place.population)) : ''} · id ${place.id}</div>
      </div>
  ${renderNav('gazetteer')}
    </header>

    <div class="grid">
      <section class="card">
        <h2>Names</h2>
        <ul>${names.map(n => `<li>${esc(n.name)} <span class="meta">${esc(n.lang||'')} ${esc(n.name_kind||'')}</span></li>`).join('')}</ul>
      </section>
      <aside class="card">
        <h3>Infobox</h3>
  <div class="meta">Kind: ${esc(place.kind)}</div>
  <div class="meta">Storage: ${fmtBytes(size_bytes)}</div>
        ${place.country_code?`<div class="meta">Country: <a href="/gazetteer/country/${esc(place.country_code)}">${esc(place.country_code)}</a></div>`:''}
        ${place.adm1_code?`<div class="meta">ADM1: ${esc(place.adm1_code)}</div>`:''}
        ${place.population?`<div class="meta">Population: ${num(place.population)}</div>`:''}
        ${(place.lat!=null && place.lng!=null)?`<div class="meta">Coords: ${place.lat.toFixed?.(3)??place.lat}, ${place.lng.toFixed?.(3)??place.lng}</div>`:''}
  <div class="meta">IDs: ${ids.length}</div>
  ${idLinksHtml?`<ul>${idLinksHtml}</ul>`:''}
      </aside>
    </div>

    <section class="card section">
      <h2>Hierarchy</h2>
      <div class="cols">
        <div><strong>Parents</strong><ul>${parents.map(p => `<li>${esc(p.name||'')} <span class="meta">${esc(p.kind||'')}</span></li>`).join('')}</ul></div>
        <div><strong>Children</strong><ul>${children.map(c => `<li>${esc(c.name||'')} <span class="meta">${esc(c.kind||'')}</span></li>`).join('')}</ul></div>
      </div>
    </section>

    <div class="grid section">
      <section class="card">
        <h2>Articles</h2>
        <ul>${articles.map(a => `<li><a href="${a.url}" target="_blank">${esc(a.title||a.url)}</a> <span class="meta">${esc(a.date||'')}</span></li>`).join('') || '<li class="meta">None</li>'}</ul>
      </section>
      <section class="card">
        <h2>Hubs</h2>
        <ul>${hubs.map(h => `<li><a href="${h.url}" target="_blank">${esc(h.title||h.url)}</a> <span class="meta">${esc(h.host||'')}</span></li>`).join('') || '<li class="meta">None</li>'}</ul>
      </section>
    </div>
  </div>
</body></html>`;

  const doneRender = trace.pre('render');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  doneRender();
  trace.end();
    } catch (e) {
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Server-rendered list of all countries
  app.get('/gazetteer/countries', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
    function num(n) { if (n == null) return ''; try { return Number(n).toLocaleString(); } catch { return String(n); } }
    try {
  let openDbReadOnly; try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
        res.status(503).send('<!doctype html><title>Countries</title><h1>Countries</h1><p>Database unavailable.</p>'); return;
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
  try { trace.end(); } catch (_) {}
      res.status(500).send('<!doctype html><title>Error</title><pre>' + esc(e.message||String(e)) + '</pre>');
    }
  });

  // Recent domains API (from saved articles) — optimized for large DBs (fast, RO DB)
  app.get('/api/recent-domains', (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 100));
    // Back-compat test hook: if requiring '../../db' fails (e.g., better-sqlite3 missing), return empty
    try { require('../../db'); } catch (_) {
      return res.status(200).json({ count: 0, totalSeen: 0, limit, domains: [] });
    }
    let openDbReadOnly;
    try { ({ openDbReadOnly } = require('../../ensure_db')); } catch (e) {
      // Graceful fallback: return empty list so UI shows 'No recent domains' instead of failing
      return res.status(200).json({ count: 0, totalSeen: 0, limit, domains: [] });
    }
    try {
      const db = openDbReadOnly(urlsDbPath);
      // Strategy:
      // 1) Pull top-N recent URLs by fetched_at and crawled_at separately using their indexes
      // 2) Union and re-sort a small window, join urls for host, then aggregate
      const windowN = 2000; // small bounded window for speed; adjusted for large DBs
      const rows = db.prepare(`
        WITH recent AS (
          SELECT * FROM (
            SELECT url, fetched_at AS ts FROM articles WHERE fetched_at IS NOT NULL ORDER BY fetched_at DESC LIMIT ?
          )
          UNION ALL
          SELECT * FROM (
            SELECT url, crawled_at AS ts FROM articles WHERE crawled_at IS NOT NULL ORDER BY crawled_at DESC LIMIT ?
          )
        ), windowed AS (
          SELECT url, ts FROM recent ORDER BY ts DESC LIMIT ?
        )
        SELECT LOWER(u.host) AS host,
               COUNT(*) AS article_count,
               MAX(w.ts) AS last_saved_at
        FROM windowed w
        JOIN urls u ON u.url = w.url
        WHERE u.host IS NOT NULL AND TRIM(u.host) <> ''
        GROUP BY LOWER(u.host)
        ORDER BY last_saved_at DESC
        LIMIT ?
      `).all(windowN, windowN, windowN, limit);
      const totalSeen = rows.length; // distinct hosts returned in this window
      try { db.close(); } catch (_) {}
      res.json({ count: rows.length, totalSeen, limit, domains: rows });
    } catch (e) {
      // Graceful fallback: empty domains list on any error
      res.status(200).json({ count: 0, totalSeen: 0, limit, domains: [] });
    }
  });

  // Fallback: serve index.html (robust across legacy and new layouts) with diagnostics
  app.use((req, res) => {
    const candidates = [
      path.join(__dirname, 'public', 'index.html'),                 // canonical: src/ui/express/public/index.html
      path.join(__dirname, '..', 'public', 'index.html'),           // mirror:   src/ui/public/index.html
      path.join(process.cwd(), 'src', 'ui', 'public', 'index.html'),// cwd-based canonical (if launched from repo root)
      path.join(process.cwd(), 'ui', 'public', 'index.html')        // legacy root ui/public/index.html
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          if (!QUIET) console.log(`[server] Serving index from ${p}`);
          return res.sendFile(p);
        }
      } catch (e) { /* ignore individual stat errors */ }
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
      try { if (child && typeof child.kill === 'function') child.kill('SIGTERM'); } catch (_) {}
      try { configManager?.close?.(); } catch (_) {}
      // End SSE clients to unblock server.close
      try {
        for (const client of sseClients) {
          try { client.res.end(); } catch (_) {}
        }
      } catch (_) {}
      // Attempt graceful close, then force-destroy lingering sockets
      try {
        httpServer.close(() => process.exit(0));
        const t = setTimeout(() => {
          try { for (const s of sockets) { try { s.destroy(); } catch (_) {} } } catch (_) {}
          try { process.exit(0); } catch (_) { /* noop */ }
        }, 500);
        try { t.unref?.(); } catch (_) {}
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
    try { configManager?.close?.(); } catch (_) {}
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

module.exports = { createApp, startServer };
