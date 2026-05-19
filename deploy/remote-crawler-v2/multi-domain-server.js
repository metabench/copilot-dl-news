#!/usr/bin/env node
/**
 * Multi-Domain Crawl Server v4 — On-Demand, Single DB, Single Process
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages N CrawlWorker instances sharing ONE SQLite database.
 * Each domain gets its own worker (rate limiter, intelligence), but all
 * content is stored in a single DB — no temporary per-domain files.
 *
 * v4 key features:
 *   - On-demand operation: auto-shuts down after configurable idle timeout
 *   - maxPages override from API (not just CLI)
 *   - DB reset endpoint for fresh starts
 *   - Memory reporting in health endpoint
 *   - Single process replaces 10+ PM2 processes (~2GB RAM savings)
 *
 * Usage:
 *   # With config file
 *   node multi-domain-server.js --config crawl-domains.json
 *
 *   # With domains from CLI
 *   node multi-domain-server.js --port 3200 --domains bbc.com,reuters.com
 *
 *   # Auto-shutdown after 15 minutes idle
 *   node multi-domain-server.js --config crawl-domains.json --idle-timeout 15
 *
 *   # No auto-shutdown (persistent mode)
 *   node multi-domain-server.js --config crawl-domains.json --idle-timeout 0
 *
 * @module deploy/remote-crawler-v2/multi-domain-server
 */

'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);

const { initSchema, getSchemaVersion } = require('./lib/schema');
const { fnv1a64 } = require('./lib/hash-manifest');
const { globalShield } = require('./lib/resource-shield');
const { closeIntelligencePool } = require('./lib/intelligence-pool');
const { pruneExportedPayload } = require('./lib/export-retention');
const { buildServerConfig, parseServerArgv } = require('./lib/server-config');
const {
  getDomainsToSchedule,
  getRunningCount,
  getWorkerPm2Name,
  normalizeManagedWorkerStatus,
  shouldStopOrchestrator,
} = require('./lib/orchestrator-utils');

// ── CLI Args ────────────────────────────────────────────────
const args = parseServerArgv(process.argv.slice(2));

function loadBuildInfo() {
  const buildInfoPath = path.join(__dirname, 'build-info.json');
  try {
    if (!fs.existsSync(buildInfoPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    return {
      error: error.message,
      path: buildInfoPath,
    };
  }
}

if (args.help || args.h) {
  console.log('multi-domain-server.js v4 — On-demand multi-domain crawl server');
  console.log('');
  console.log('Usage:');
  console.log('  node multi-domain-server.js --domains bbc.com,reuters.com --port 3200');
  console.log('  node multi-domain-server.js --config crawl-domains.json');
  console.log('');
  console.log('Options:');
  console.log('  --domains <list>       Comma-separated domain list');
  console.log('  --config <file>        JSON config file with domains plus port/db/limit options');
  console.log('  --port <n>             Server port (default: 3200)');
  console.log('  --db <path>            Database file (default: data/news.db)');
  console.log('  --max-pages <n>        Max pages per domain (default: 50)');
  console.log('  --max-depth <n>        Max link-follow depth per domain (default: 2)');
  console.log('  --max-concurrent <n>   Max concurrent crawling domains (default: 20)');
  console.log('  --idle-timeout <mins>  Auto-shutdown after N minutes idle (default: 30, 0=off)');
  console.log('  --coordinator-mode     Seeded-only crawl mode (do not auto-queue discovered URLs)');
  console.log('  --no-auto-start        Start API server idle; wait for /api/start');
  console.log('  --help                 Show this help');
  process.exit(0);
}

// ── Configuration ───────────────────────────────────────────

let serverConfig;
try {
  serverConfig = buildServerConfig(args);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}

const PORT = serverConfig.port;
const DB_FILE = serverConfig.dbFile;
const MAX_PAGES_DEFAULT = serverConfig.maxPagesDefault;
let MAX_CONCURRENT = serverConfig.maxConcurrent;
const IDLE_TIMEOUT_MIN = serverConfig.idleTimeoutMin;
const COORDINATOR_MODE = serverConfig.coordinatorMode;
const AUTO_START = serverConfig.autoStart;

let domainConfigs = serverConfig.domainConfigs;
let loadedConfigPath = serverConfig.loadedConfigPath;

if (domainConfigs.length === 0) {
  console.error('No domains specified. Use --domains or --config.');
  console.error('Run with --help for usage.');
  process.exit(1);
}

// ── Database Setup ──────────────────────────────────────────

const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = openNewsCrawlerDb(DB_FILE);
initSchema(db);
const remoteCrawlerDb = db.remoteCrawler;
if (!remoteCrawlerDb) {
  throw new Error('news-crawler-db remoteCrawler access is not available');
}
remoteCrawlerDb.configureRemoteCrawlerSqliteRuntime({ journalMode: 'WAL', busyTimeoutMs: 5000 });
for (const result of remoteCrawlerDb.ensureRemoteCrawlerExportIndexes()) {
  if (!result.ok) console.warn(`[Export Index] ${result.error}`);
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  Multi-Domain Crawl Server v4 — On-Demand');
console.log('═══════════════════════════════════════════════════════════');
if (loadedConfigPath) {
  console.log(`  Config:         ${loadedConfigPath}`);
}
console.log(`  Database:       ${DB_FILE}`);
console.log(`  Schema:         ${getSchemaVersion(db)}`);
console.log(`  Port:           ${PORT}`);
console.log(`  Domains:        ${domainConfigs.length}`);
console.log(`  Max pages:      ${MAX_PAGES_DEFAULT} per domain`);
console.log(`  Concurrency:    ${MAX_CONCURRENT} simultaneous`);
console.log(`  Idle timeout:   ${IDLE_TIMEOUT_MIN > 0 ? IDLE_TIMEOUT_MIN + ' min' : 'disabled'}`);
console.log(`  Coordinator:    ${COORDINATOR_MODE ? 'enabled (seeded-only queueing)' : 'disabled'}`);
console.log(`  Auto-start:     ${AUTO_START ? 'enabled' : 'disabled'}`);
console.log('═══════════════════════════════════════════════════════════');

// ── Worker Management ───────────────────────────────────────

/** @type {Map<string, { worker: CrawlWorker, config: object, state: string }>} */
const workers = new Map();
const SHUTDOWN_TIMEOUT_MS = 10000;
let isShuttingDown = false;
let shutdownPromise = null;
let shutdownForceTimer = null;
const activeSockets = new Set();

/** SSE clients for live event streaming */
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  }
}

function createWorker(domainConfig) {
  // Worker stub: tracks PM2-based worker state so that entry.worker.isRunning
  // and other property accesses don't crash the server (fix for OOM loop).
  const workerStub = {
    isRunning: false,
    fatalState: null,
    targetDomain: domainConfig.domain,
    start(maxPages) { this.isRunning = true; return { status: 'pm2_managed' }; },
    stop() { this.isRunning = false; },
    getStatus() {
      return {
        stats: { done: 0, errors: 0, pending: 0, fetched: 0 },
        contentPipeline: { totalStored: 0 },
        targetDomain: this.targetDomain,
        isRunning: this.isRunning,
      };
    },
    seedUrls() { return { inserted: 0, alreadyKnown: 0 }; },
  };

  const entry = {
    worker: workerStub,
    config: domainConfig,
    state: 'idle', // idle | running | stopped | error
    startedAt: null,
    stoppedAt: null,
  };
  workers.set(domainConfig.domain, entry);
  return entry;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeSeedUrls(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];
  return [...new Set(list
    .map(url => String(url || '').trim())
    .filter(Boolean))];
}

function seedUrlsForDomain(domain, startOptions = {}, entryConfig = {}) {
  const map = startOptions.seedUrlsByDomain && typeof startOptions.seedUrlsByDomain === 'object'
    ? startOptions.seedUrlsByDomain
    : {};
  const domainSeeds = normalizeSeedUrls(map[domain] || map[String(domain || '').replace(/^www\./, '')]);
  if (domainSeeds.length > 0) return domainSeeds;
  const globalSeeds = normalizeSeedUrls(startOptions.seedUrls);
  if (globalSeeds.length > 0) return globalSeeds;
  return normalizeSeedUrls(entryConfig.seedUrls);
}

function enqueueSeedUrls(domain, urls) {
  const summary = { total: 0, inserted: 0, alreadyKnown: 0, invalid: 0, outsideDomain: 0 };
  for (const url of normalizeSeedUrls(urls)) {
    summary.total += 1;
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      summary.invalid += 1;
      continue;
    }
    const normalizedDomain = String(domain || '').replace(/^www\./, '');
    const normalizedHost = parsed.hostname.replace(/^www\./, '');
    if (normalizedHost !== normalizedDomain && !normalizedHost.endsWith(`.${normalizedDomain}`)) {
      summary.outsideDomain += 1;
      continue;
    }
    const result = remoteCrawlerDb.insertPendingRemoteCrawlerUrl({
      url: parsed.href,
      host: parsed.hostname,
      path: parsed.pathname,
      depth: 0,
      discoveredFrom: null,
    });
    if (result?.inserted) summary.inserted += 1;
    else summary.alreadyKnown += 1;
  }
  return summary;
}

// Create all workers
for (const dc of domainConfigs) {
  createWorker(dc);
}

// ── Idle Auto-Shutdown ──────────────────────────────────────

let lastActivityAt = Date.now();
let idleCheckInterval = null;

function resetIdleTimer() {
  lastActivityAt = Date.now();
}

function startIdleMonitor() {
  if (IDLE_TIMEOUT_MIN <= 0 || idleCheckInterval) return;
  idleCheckInterval = setInterval(() => {
    const idleMs = Date.now() - lastActivityAt;
    const idleMin = Math.floor(idleMs / 60000);
    if (idleMin >= IDLE_TIMEOUT_MIN && getRunningCount(workers) === 0) {
      console.log(`\n  ⏱ Idle for ${idleMin} min (limit: ${IDLE_TIMEOUT_MIN}). Auto-shutting down...`);
      shutdown('IDLE_TIMEOUT');
    }
  }, 60000); // Check every minute
  idleCheckInterval.unref(); // Don't keep process alive
}

function stopIdleMonitor() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

// ── Crawl Orchestration ─────────────────────────────────────

let orchestratorRunning = false;
let orchestratorInterval = null;
let orchestratorScope = null; // null = all domains, Set = only these domains
let statePollInterval = null;

/**
 * Start crawling for a specific domain.
 * @param {string} domain
 * @param {number} [maxPagesOverride] - Override maxPages for this crawl
 * @param {object} [startOptions] - Extra CrawlWorker.start options
 */
function startDomain(domain, maxPagesOverride, startOptions = {}) {
  if (isShuttingDown) {
    return { domain, status: 'shutting_down' };
  }
  const entry = workers.get(domain);
  if (!entry) return { error: `Unknown domain: ${domain}` };
  if (entry.state === 'running') {
    return { domain, status: 'already_running' };
  }

  const maxPages = maxPagesOverride || entry.config.maxPages;
  const maxDepth = parseNonNegativeInteger(startOptions.maxDepth, parseNonNegativeInteger(entry.config.maxDepth, 2));
  const seedUrls = seedUrlsForDomain(domain, startOptions, entry.config);
  if (startOptions.seedUrls || startOptions.seedUrlsByDomain) {
    entry.config.seedUrls = seedUrls;
  }
  entry.config.maxDepth = maxDepth;
  const workerOptions = {
    ...startOptions,
    coordinatorMode: !!startOptions.coordinatorMode,
  };

  const pm2Name = getWorkerPm2Name(domain);
  const scriptPath = require('path').join(__dirname, 'lib', 'run-worker.js');

  // Clean up any existing PM2 process with the same name to prevent duplicates on restart
  try { require('child_process').execFileSync('pm2', ['delete', pm2Name], { stdio: 'ignore' }); } catch (_) { }
  const pm2Args = [
    'start',
    scriptPath,
    '--name',
    pm2Name,
    '--max-memory-restart',
    '1500M',
    '--',
    '--domain',
    domain,
    '--max-pages',
    String(maxPages),
    '--max-depth',
    String(maxDepth),
    '--db',
    DB_FILE,
  ];
  if (seedUrls.length > 0) pm2Args.push('--seed-urls', seedUrls.join(','));
  if (workerOptions.coordinatorMode) pm2Args.push('--coordinator-mode');

  try {
    const out = require('child_process').spawnSync('pm2', pm2Args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
    if (out.error) throw out.error;
    if (out.status !== 0) {
      const err = new Error(`pm2 exited with status ${out.status}`);
      err.stdout = out.stdout;
      err.stderr = out.stderr;
      throw err;
    }
    // console.log(`  [${domain}] PM2 out:`, out); // Optional
  } catch (e) {
    console.error(`  [${domain}] PM2 start failed:`, e.message);
    if (e.stderr) console.error(`  [${domain}] STDERR:`, e.stderr);
    if (e.stdout) console.error(`  [${domain}] STDOUT:`, e.stdout);
    return { domain, status: 'error', error: e.message, stderr: e.stderr };
  }

  entry.state = 'running';
  entry.startedAt = new Date().toISOString();
  entry.stoppedAt = null;
  entry.lastStatus = null;
  if (entry.worker) entry.worker.isRunning = true;
  resetIdleTimer();

  broadcastSSE('crawl:start', { domain, maxPages, maxDepth, seedUrls: seedUrls.length, coordinatorMode: workerOptions.coordinatorMode });
  console.log(`  [${domain}] Crawl started via PM2 (maxPages=${maxPages}, maxDepth=${maxDepth}, seeds=${seedUrls.length}, coordinatorMode=${workerOptions.coordinatorMode})`);

  return { domain, status: 'started', maxPages, maxDepth, seedUrls: seedUrls.length };
}

/**
 * Stop crawling for a specific domain.
 */
function stopDomain(domain) {
  const entry = workers.get(domain);
  if (!entry) return { error: `Unknown domain: ${domain}` };

  const pm2Name = getWorkerPm2Name(domain);
  try {
    require('child_process').execSync(`pm2 stop "${pm2Name}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`  [${domain}] PM2 stop failed:`, e.message);
  }

  entry.state = 'stopped';
  entry.stoppedAt = new Date().toISOString();
  if (entry.worker) entry.worker.isRunning = false;

  broadcastSSE('crawl:stop', { domain });
  console.log(`  [${domain}] Crawl stopped via PM2`);

  return { domain, status: 'stopped' };
}

/**
 * Start all domains (respecting max concurrent).
 * @param {number} [maxPagesOverride] - Override maxPages for all domains
 */
function startAll(maxPagesOverride) {
  const results = [];
  let started = 0;

  for (const [domain, entry] of workers) {
    if (started >= MAX_CONCURRENT) break;
    if (entry.state !== 'running' || !entry.worker.isRunning) {
      results.push(startDomain(domain, maxPagesOverride));
      started++;
    }
  }

  // Start the orchestrator to manage concurrent scheduling (all domains)
  startOrchestrator(null);

  return { started: results.length, results, maxConcurrent: MAX_CONCURRENT };
}

/**
 * Stop all domains.
 */
function stopAll() {
  const results = [];
  for (const [domain] of workers) {
    results.push(stopDomain(domain));
  }
  stopOrchestrator();
  return { stopped: results.length, results };
}

/**
 * Orchestrator: manages domain scheduling.
 * When a crawler finishes, starts the next idle domain.
 */
/**
 * Start orchestrator with optional domain scope.
 * @param {string[]|null} scopeDomains - If provided, orchestrator only manages these domains
 */
function startOrchestrator(scopeDomains) {
  if (orchestratorRunning) {
    // If already running, widen scope if needed
    if (scopeDomains && orchestratorScope) {
      for (const d of scopeDomains) orchestratorScope.add(d);
    } else if (!scopeDomains) {
      orchestratorScope = null; // widen to all
    }
    return;
  }
  orchestratorRunning = true;
  orchestratorScope = scopeDomains ? new Set(scopeDomains) : null;

  orchestratorInterval = setInterval(async () => {
    // Check for completed workers
    for (const [domain, entry] of workers) {
      if (entry.state === 'running') {
        const ds = await getDomainStatus(domain);
        if (entry.state !== 'running') {
          broadcastSSE('crawl:complete', {
            domain,
            fetched: ds.stats?.done || 0,
            stored: ds.contentPipeline?.totalStored || 0,
            errors: ds.stats?.errors || 0,
          });
          console.log(`  [${domain}] Crawl completed (done=${ds.stats?.done || 0}, stored=${ds.contentPipeline?.totalStored || 0})`);
          const pm2Name = getWorkerPm2Name(domain);
          try { require('child_process').execSync(`pm2 delete "${pm2Name}"`, { stdio: 'ignore' }); } catch (e) { }
        }
      }
    }

    const domainsToStart = getDomainsToSchedule(workers, MAX_CONCURRENT, orchestratorScope);
    for (const domain of domainsToStart) {
      startDomain(domain);
    }

    if (shouldStopOrchestrator(workers, orchestratorScope)) {
      stopOrchestrator();
      broadcastSSE('orchestrator:idle', {
        scope: orchestratorScope ? Array.from(orchestratorScope) : 'all',
      });
      return;
    }

    // Broadcast status update
    broadcastSSE('status:update', getMultiStatus());
  }, 5000);
}

function stopOrchestrator() {
  if (orchestratorInterval) {
    clearInterval(orchestratorInterval);
    orchestratorInterval = null;
  }
  orchestratorRunning = false;
}

// ── Status Helpers ──────────────────────────────────────────

async function getDomainStatus(domain) {
  const entry = workers.get(domain);
  if (!entry) return null;

  const fs = require('fs');
  const path = require('path');
  const statusFile = path.join(__dirname, 'data', 'status', `${domain}.json`);

  let diskStatus = null;
  try {
    const stat = await fs.promises.stat(statusFile).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs < 20000) {
      const data = await fs.promises.readFile(statusFile, 'utf8');
      diskStatus = JSON.parse(data);
    }
  } catch (e) { }

  const normalizedDiskStatus = normalizeManagedWorkerStatus(entry.state, diskStatus);

  if (normalizedDiskStatus) {
    entry.lastStatus = normalizedDiskStatus;
    if (normalizedDiskStatus.state && entry.state !== normalizedDiskStatus.state) {
      entry.state = normalizedDiskStatus.state;
      if (normalizedDiskStatus.state !== 'running') {
        entry.stoppedAt = normalizedDiskStatus.stoppedAt || entry.stoppedAt || new Date().toISOString();
        entry.lastStatus = {
          ...normalizedDiskStatus,
          stoppedAt: entry.stoppedAt,
        };
      } else {
        entry.startedAt = normalizedDiskStatus.startedAt || entry.startedAt || new Date().toISOString();
        entry.stoppedAt = null;
      }
    }
  }

  const effectiveStatus = normalizedDiskStatus || entry.lastStatus;

  return {
    domain,
    state: effectiveStatus ? effectiveStatus.state : entry.state,
    isRunning: effectiveStatus ? effectiveStatus.isRunning : false,
    startedAt: effectiveStatus ? effectiveStatus.startedAt : entry.startedAt,
    stoppedAt: effectiveStatus ? effectiveStatus.stoppedAt : entry.stoppedAt,
    stats: effectiveStatus ? effectiveStatus.stats : {},
    contentPipeline: effectiveStatus ? effectiveStatus.contentPipeline : null,
    rateLimiter: null,
    fatalState: effectiveStatus ? effectiveStatus.fatalState : null,
    maxPages: entry.config.maxPages,
    maxDepth: parseNonNegativeInteger(entry.config.maxDepth, 2),
    seedUrls: normalizeSeedUrls(entry.config.seedUrls).length,
  };
}

let lastTotals = { fetched: 0, stored: 0, timestamp: Date.now() };
let telemetryThroughput = { fetchesPerSec: 0, writesPerSec: 0 };

async function getMultiStatus() {
  const domainStatuses = [];
  let totalFetched = 0, totalStored = 0, totalErrors = 0, totalPending = 0;

  for (const [domain] of workers) {
    const ds = await getDomainStatus(domain);
    domainStatuses.push(ds);
    const stats = ds?.stats || {};
    const contentPipeline = ds?.contentPipeline || {};
    totalFetched += Number(stats.fetched || stats.done || 0);
    totalStored += Number(contentPipeline.totalStored || stats.stored || 0);
    totalErrors += Number(stats.errors || 0);
    totalPending += Number(stats.pending || stats.queued || 0);
  }

  const mem = process.memoryUsage();
  const idleMs = Date.now() - lastActivityAt;
  const now = Date.now();
  const elapsedSec = (now - lastTotals.timestamp) / 1000;

  if (elapsedSec >= 5) {
    const fetchedDiff = totalFetched - lastTotals.fetched;
    const storedDiff = totalStored - lastTotals.stored;
    if (fetchedDiff >= 0 && storedDiff >= 0) {
      telemetryThroughput.fetchesPerSec = Number((fetchedDiff / elapsedSec).toFixed(2));
      telemetryThroughput.writesPerSec = Number((storedDiff / elapsedSec).toFixed(2));
    }
    lastTotals = { fetched: totalFetched, stored: totalStored, timestamp: now };
  }

  const walPendingCount = remoteCrawlerDb.countRemoteCrawlerWalRows();

  return {
    service: 'Multi-Domain Crawl Server v4',
    version: '4.0.0',
    build: loadBuildInfo(),
    schemaVersion: getSchemaVersion(db),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    idle: {
      minutes: Math.floor(idleMs / 60000),
      timeoutMin: IDLE_TIMEOUT_MIN,
      autoShutdown: IDLE_TIMEOUT_MIN > 0,
    },
    orchestrator: {
      running: orchestratorRunning,
      maxConcurrent: MAX_CONCURRENT,
      currentlyRunning: getRunningCount(workers),
      totalDomains: workers.size,
    },
    shield: globalShield.getMetrics(),
    throughput: {
      fetchesPerSec: telemetryThroughput.fetchesPerSec,
      writesPerSec: telemetryThroughput.writesPerSec,
      windowSec: Math.floor(elapsedSec),
    },
    wal: {
      pendingCheckpoints: walPendingCount,
    },
    totals: {
      fetched: totalFetched,
      stored: totalStored,
      errors: totalErrors,
      pending: totalPending,
    },
    domains: domainStatuses,
  };
}

// ── Multi-Domain Streaming Exports ────────────────────────────

/**
 * Async stream JSON arrays.
 */
async function streamArray(out, key, rows) {
  out.write(`,"${key}":[`);
  let first = true;
  let count = 0;
  for (const row of rows) {
    if (row.content_blob) {
      row.content_blob_b64 = row.content_blob.toString('base64');
      delete row.content_blob;
    }
    if (!first) out.write(',');
    out.write(JSON.stringify(row));
    first = false;
    count++;
    if (count % 250 === 0) await new Promise(r => setImmediate(r));
  }
  out.write(']');
  return count;
}

// ── Express Server ──────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Status Endpoints ────────────────────────────────────────

app.get('/', async (req, res) => res.json(await getMultiStatus()));
app.get('/api/status', async (req, res) => res.json(await getMultiStatus()));

app.get('/api/health', async (req, res) => {
  const status = await getMultiStatus();
  res.json({
    healthy: true,
    version: '4.0.0',
    build: status.build,
    mode: 'multi-domain',
    domains: status.orchestrator.totalDomains,
    running: status.orchestrator.currentlyRunning,
    stored: status.totals.stored,
    memory: status.memory,
    idle: status.idle,
    uptime: status.uptime,
  });
});

app.get('/api/domain/:domain', async (req, res) => {
  const ds = await getDomainStatus(req.params.domain);
  if (!ds) return res.status(404).json({ error: 'Domain not found' });
  res.json(ds);
});

// Backward-compatible alias: /api/status/:domain
app.get('/api/status/:domain', async (req, res) => {
  const ds = await getDomainStatus(req.params.domain);
  if (!ds) return res.status(404).json({ error: 'Domain not found' });
  res.json(ds);
});

// Pending queue size per domain
app.get('/api/queue/pending', (req, res) => {
  const counts = {};
  for (const [domain] of workers) {
    counts[domain] = remoteCrawlerDb.countPendingRemoteCrawlerUrlsForDomain(domain);
  }

  res.json(counts);
});

// ── Crawl Control ───────────────────────────────────────────

function handleStartRequest(req, res) {
  const { domain, domains: domainList, maxPages, maxConcurrent, maxDepth, seedUrls, seedUrlsByDomain } = req.body || {};
  const maxPagesOverride = maxPages ? parseInt(maxPages, 10) : undefined;
  const maxDepthOverride = maxDepth !== undefined ? parseNonNegativeInteger(maxDepth, undefined) : undefined;
  const startOptions = {
    maxDepth: maxDepthOverride,
    seedUrls: normalizeSeedUrls(seedUrls),
    seedUrlsByDomain: seedUrlsByDomain && typeof seedUrlsByDomain === 'object' ? seedUrlsByDomain : undefined,
  };

  // Allow runtime concurrency override
  if (maxConcurrent && Number.isFinite(parseInt(maxConcurrent, 10))) {
    const newMax = Math.max(1, parseInt(maxConcurrent, 10));
    console.log(`  [config] maxConcurrent changed: ${MAX_CONCURRENT} → ${newMax}`);
    MAX_CONCURRENT = newMax;
  }

  if (domain) {
    res.json(startDomain(domain, maxPagesOverride, startOptions));
  } else if (Array.isArray(domainList)) {
    const results = domainList.map(d => startDomain(d, maxPagesOverride, startOptions));
    startOrchestrator(domainList);
    res.json({ started: results.length, results, maxConcurrent: MAX_CONCURRENT });
  } else {
    res.json(startAll(maxPagesOverride));
  }
}

app.post('/api/start', handleStartRequest);
app.post('/api/crawl/start', handleStartRequest);

// Runtime configuration
app.post('/api/config', (req, res) => {
  const changes = {};
  if (req.body.maxConcurrent !== undefined) {
    const newMax = Math.max(1, parseInt(req.body.maxConcurrent, 10));
    if (Number.isFinite(newMax)) {
      console.log(`  [config] maxConcurrent changed: ${MAX_CONCURRENT} → ${newMax}`);
      MAX_CONCURRENT = newMax;
      changes.maxConcurrent = newMax;
    }
  }
  res.json({ ok: true, config: { maxConcurrent: MAX_CONCURRENT }, changes });
});

app.get('/api/config', (req, res) => {
  res.json({
    maxConcurrent: MAX_CONCURRENT,
    maxPagesDefault: MAX_PAGES_DEFAULT,
    idleTimeoutMin: IDLE_TIMEOUT_MIN,
    coordinatorMode: COORDINATOR_MODE,
    totalDomains: workers.size,
  });
});

// ── Throttle Stub ─────────────────────────────────────────

let throttleState = { maxConcurrent: null, pause: false, reason: null, updatedAt: null };

app.post('/api/throttle', (req, res) => {
  const { maxConcurrent: mc, pause, reason } = req.body || {};
  if (mc !== undefined && Number.isFinite(parseInt(mc, 10))) {
    const newMax = Math.max(0, parseInt(mc, 10));
    console.log(`  [throttle] maxConcurrent: ${MAX_CONCURRENT} → ${newMax} (reason: ${reason || 'none'})`);
    MAX_CONCURRENT = newMax;
  }
  throttleState = {
    maxConcurrent: MAX_CONCURRENT,
    pause: !!pause,
    reason: reason || null,
    updatedAt: new Date().toISOString(),
  };
  res.json({ ok: true, throttle: throttleState });
});

app.get('/api/throttle', (req, res) => {
  res.json({
    ok: true,
    throttle: throttleState,
    currentMaxConcurrent: MAX_CONCURRENT,
  });
});

app.post('/api/tools/fetch', async (req, res) => {
  const { url, domain } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  // Use provided domain or extract from URL
  let targetDomain = domain;
  if (!targetDomain) {
    try {
      const u = new URL(url);
      targetDomain = u.hostname.replace(/^www\./, '');
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  }

  // Get or create worker
  let entry = workers.get(targetDomain);
  if (!entry) {
    const worker = new CrawlWorker(db, { targetDomain });
    entry = { worker, state: 'manual' };
    workers.set(targetDomain, entry);
  }

  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Server-side timeout (45s)')), 45000);
    });
    const result = await Promise.race([
      entry.worker.processSingleUrl(url),
      timeout
    ]);
    res.json(result);
  } catch (e) {
    res.status(504).json({ error: e.message, timeout: true });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

function handleStopRequest(req, res) {
  const { domain } = req.body || {};
  if (domain) {
    res.json(stopDomain(domain));
  } else {
    res.json(stopAll());
  }
}

app.post('/api/stop', handleStopRequest);
app.post('/api/crawl/stop', handleStopRequest);

app.post('/api/seed', (req, res) => {
  const { domain, urls: urlList } = req.body;
  if (!domain || !Array.isArray(urlList)) {
    return res.status(400).json({ error: 'Required: { domain, urls: [...] }' });
  }
  const entry = workers.get(domain);
  if (!entry) return res.status(404).json({ error: `Unknown domain: ${domain}` });

  const result = enqueueSeedUrls(domain, urlList);
  if (result.inserted > 0) resetIdleTimer();
  res.json({ domain, ...result });
});

// Apply a strict CrawlPlan from the Hub or FleetSupervisor
app.post('/api/domain/:domain/plan', (req, res) => {
  const domain = req.params.domain;
  const entry = workers.get(domain);
  if (!entry) return res.status(404).json({ error: `Unknown domain: ${domain}` });

  try {
    const result = entry.worker.receivePlan(req.body);
    entry.worker.start();
    res.json({ ok: true, domain, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a new domain at runtime
app.post('/api/domains/add', (req, res) => {
  const { domain, maxPages, maxDepth, seedUrls } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });
  if (workers.has(domain)) return res.json({ domain, status: 'already_exists' });

  const config = {
    domain,
    maxPages: maxPages || MAX_PAGES_DEFAULT,
    maxDepth: parseNonNegativeInteger(maxDepth, 2),
    seedUrls,
  };
  createWorker(config);
  domainConfigs.push(config);

  res.json({ domain, status: 'added', maxPages: config.maxPages });
});

// Set all domains dynamically (decouples from terraform)
app.put('/api/domains', (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const newConfigs = domains.map(d => {
    if (typeof d === 'string') return { domain: d, maxPages: MAX_PAGES_DEFAULT };
    return {
      domain: d.domain || d.host,
      maxPages: d.maxPages || MAX_PAGES_DEFAULT,
      maxDepth: parseNonNegativeInteger(d.maxDepth ?? d['max-depth'], 2),
      seedUrls: d.seedUrls,
    };
  }).filter(dc => dc && dc.domain);

  // 1. Stop workers that are not in the new config
  const newDomainSet = new Set(newConfigs.map(c => c.domain));
  for (const [domain, entry] of workers.entries()) {
    if (!newDomainSet.has(domain)) {
      if (entry.worker.isRunning) entry.worker.stop();
      workers.delete(domain);
      console.log(`  [${domain}] Worker stopped and removed by config update`);
    }
  }

  // 2. Add or update workers
  for (const config of newConfigs) {
    const existing = workers.get(config.domain);
    if (!existing) {
      createWorker(config);
    } else {
      existing.config.maxPages = config.maxPages;
      existing.config.maxDepth = config.maxDepth;
      existing.worker.maxPages = config.maxPages;
      existing.config.seedUrls = config.seedUrls;
      if (config.seedUrls && config.seedUrls.length > 0) {
        existing.worker.seedUrls(config.seedUrls);
      }
    }
  }

  domainConfigs = newConfigs;

  // 3. Persist to disk if a config file was used
  if (loadedConfigPath) {
    try {
      const fs = require('fs');
      let fileContent = {};
      if (fs.existsSync(loadedConfigPath)) {
        fileContent = JSON.parse(fs.readFileSync(loadedConfigPath, 'utf8'));
      }
      fileContent.domains = domainConfigs;
      fs.writeFileSync(loadedConfigPath, JSON.stringify(fileContent, null, 2));
      console.log(`  Persisted new domains config to ${loadedConfigPath}`);
    } catch (e) {
      console.error(`  Failed to persist config: ${e.message}`);
    }
  }

  res.json({ status: 'ok', domains: domainConfigs.length });
});

// Remove a domain
app.post('/api/domains/remove', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });

  const entry = workers.get(domain);
  if (!entry) return res.status(404).json({ error: 'Domain not found' });

  if (entry.worker.isRunning) entry.worker.stop();
  workers.delete(domain);

  res.json({ domain, status: 'removed' });
});

// ── Database Management ─────────────────────────────────────

app.post('/api/db/reset', async (req, res) => {
  try {
    // Stop all crawlers first and wait for in-flight work to settle.
    stopOrchestrator();
    await stopAllWorkersGracefully(8000);
    for (const [, entry] of workers) {
      entry.state = 'idle';
    }

    const tables = remoteCrawlerDb.resetRemoteCrawlerDatabaseTables();

    initSchema(db);

    // Recreate workers with fresh state
    workers.clear();
    for (const dc of domainConfigs) {
      createWorker(dc);
    }

    console.log(`  [db:reset] Dropped ${tables.length} tables, re-initialized schema, recreated ${domainConfigs.length} workers`);
    res.json({ status: 'reset', tablesDropped: tables.length, domainsRecreated: domainConfigs.length });
  } catch (error) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

// ── Export Endpoints ────────────────────────────────────────

app.get('/api/export/batch', async (req, res) => {
  const since = req.query.since || null;
  const until = req.query.until || null;
  const windowSec = parseInt(req.query.window, 10) || 10;
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
  const includeContent = req.query.includeContent !== 'false';
  const includeLinks = req.query.includeLinks !== 'false';

  const now = new Date();
  const toSqlite = (d) => d.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
  let sinceSql, untilSql;
  if (windowSec > 0 && !since) {
    const untilDate = until ? new Date(until) : now;
    untilSql = toSqlite(untilDate);
    sinceSql = toSqlite(new Date(untilDate.getTime() - windowSec * 1000));
  } else {
    sinceSql = since ? toSqlite(new Date(since)) : toSqlite(new Date(now.getTime() - 10000));
    untilSql = until ? toSqlite(new Date(until)) : toSqlite(new Date(now.getTime() + 2000));
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  const out = zlib.createGzip({ level: 6 });
  out.pipe(res);

  try {
    const urls = remoteCrawlerDb.listRemoteCrawlerUrlsUpdatedInWindow({ since: sinceSql, until: untilSql, limit });
    const watermark = urls.length > 0 ? urls[urls.length - 1].updated_at : untilSql;
    res.setHeader('X-Batch-Watermark', watermark || '');

    out.write('{"version":"2.0.0","batchId":"multi-' + Date.now() + '","watermark":"' + watermark + '"');

    if (urls.length === 0) {
      out.end('}');
      return;
    }

    // Write urls array identically
    out.write(',"urls":' + JSON.stringify(urls));

    const urlIds = urls.map(u => u.id);

    const httpResponsesCount = await streamArray(out, 'httpResponses', remoteCrawlerDb.listRemoteCrawlerHttpResponsesForUrlIds(urlIds));

    let contentCount = 0;
    if (includeContent) {
      contentCount = await streamArray(out, 'content', remoteCrawlerDb.listRemoteCrawlerContentForUrlIds(urlIds));
    } else {
      out.write(',"content":[]');
    }

    let linksCount = 0;
    if (includeLinks) {
      linksCount = await streamArray(out, 'links', remoteCrawlerDb.listRemoteCrawlerDiscoveredLinksForUrlIds(urlIds));
    } else {
      out.write(',"links":[]');
    }

    out.write(',"counts":' + JSON.stringify({
      urls: urls.length,
      httpResponses: httpResponsesCount,
      content: contentCount,
      links: linksCount,
    }));

    out.end('}');
  } catch (err) {
    console.error('[Export Error]', err);
    out.destroy(err);
  }
});

app.post('/api/export/prune', (req, res) => {
  const body = req.body || {};
  const before = body.before || body.watermark || null;
  if (!before && !Array.isArray(body.urlIds)) {
    return res.status(400).json({ ok: false, error: 'before watermark or urlIds are required' });
  }

  try {
    const result = pruneExportedPayload(db, {
      before,
      urlIds: Array.isArray(body.urlIds) ? body.urlIds : undefined,
      deleteUrls: body.deleteUrls === true,
      deleteLinks: body.deleteLinks !== false,
      vacuum: body.vacuum === true,
      vacuumThresholdBytes: Number.isFinite(Number(body.vacuumThresholdMb))
        ? Number(body.vacuumThresholdMb) * 1024 * 1024
        : 0,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// /api/throttle — backpressure stub: records the most recent request and
// returns 200 so the local sync loop's best-effort POST does not error.
// Real concurrency adjustment is wired through the orchestrator's worker
// pool; the local sync loop only needs an acknowledgement.
let lastThrottleRequest = null;
app.post('/api/throttle', (req, res) => {
  const body = req.body || {};
  lastThrottleRequest = {
    at: new Date().toISOString(),
    maxConcurrent: Number.isFinite(Number(body.maxConcurrent)) ? Number(body.maxConcurrent) : null,
    pause: body.pause === true,
    reason: typeof body.reason === 'string' ? body.reason : null,
  };
  res.json({ ok: true, accepted: lastThrottleRequest });
});
app.get('/api/throttle', (req, res) => {
  res.json({ ok: true, last: lastThrottleRequest });
});

app.get('/api/export/replay', async (req, res) => {
  const afterRowId = parseInt(req.query.afterRowId, 10) || 0;
  let limit = parseInt(req.query.limit, 10) || 500;
  const includeContent = req.query.includeContent !== 'false';

  if (includeContent && limit > 250) limit = 250;
  if (!includeContent && limit > 10000) limit = 10000;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');

  const out = zlib.createGzip({ level: 6 });
  out.pipe(res);

  try {
    const urls = remoteCrawlerDb.listRemoteCrawlerUrlsAfterRowId({ afterRowId, limit });
    const lastRowId = urls.length > 0 ? urls[urls.length - 1].id : afterRowId;
    const maxRowId = remoteCrawlerDb.getRemoteCrawlerReplayStats().maxRowId || 0;

    res.setHeader('X-Replay-LastRowId', String(lastRowId));
    res.setHeader('X-Replay-MaxRowId', String(maxRowId));

    out.write('{"version":"3.0.0-replay","cursor":{"lastRowId":' + lastRowId + ',"maxRowId":' + maxRowId + '}');

    if (urls.length === 0) {
      out.end('}');
      return;
    }

    out.write(',"urls":' + JSON.stringify(urls));
    const urlIds = urls.map(u => u.id);

    await streamArray(out, 'httpResponses', remoteCrawlerDb.listRemoteCrawlerHttpResponsesForUrlIds(urlIds));

    if (includeContent) {
      await streamArray(out, 'content', remoteCrawlerDb.listRemoteCrawlerContentForUrlIds(urlIds));
    } else {
      out.write(',"content":[]');
    }

    await streamArray(out, 'links', remoteCrawlerDb.listRemoteCrawlerDiscoveredLinksForUrlIds(urlIds));

    out.end('}');
  } catch (err) {
    console.error('[Replay Error]', err);
    out.destroy(err);
  }
});

app.get('/api/export/replay/stats', (_req, res) => {
  res.json(remoteCrawlerDb.getRemoteCrawlerReplayStats());
});

// v1-compatible simple export
app.get('/api/export', (req, res) => {
  const urls = remoteCrawlerDb.listCompletedRemoteCrawlerUrlExportRows();
  res.json({ mode: 'multi-domain', count: urls.length, exportedAt: new Date().toISOString(), urls });
});

// ── SSE Live Events ─────────────────────────────────────────

// ── Hash-Based Differential Sync ────────────────────────────

app.get('/api/sync/manifest/urls', (req, res) => {
  const filterDomain = req.query.domain || null;

  const result = {
    version: 1,
    generated: new Date().toISOString(),
    domains: {},
  };

  const domains = filterDomain ? [filterDomain] : Array.from(workers.keys());
  let domainIdx = 0;

  function processNextDomain() {
    if (domainIdx >= domains.length) {
      return res.json(result);
    }

    const domain = domains[domainIdx];
    const hosts = [domain, 'www.' + domain];
    const iterator = remoteCrawlerDb.iterateRemoteCrawlerUrlHashRowsForHosts(hosts);

    const hashes = [];
    let doneCount = 0;
    let totalCount = 0;

    function processChunk() {
      let chunkCount = 0;
      while (chunkCount < 5000) {
        const next = iterator.next();
        if (next.done) {
          // Finished this domain
          const contentCount = remoteCrawlerDb.countRemoteCrawlerContentRowsForHosts(hosts);

          result.domains[domain] = {
            total: totalCount,
            doneCount,
            contentCount,
            hashes,
          };

          domainIdx++;
          return setImmediate(processNextDomain);
        }

        const row = next.value;
        hashes.push(fnv1a64(row.url));
        if (row.status === 'done') doneCount++;
        totalCount++;
        chunkCount++;
      }
      setImmediate(processChunk);
    }

    processChunk();
  }

  processNextDomain();
});

// GET /api/sync/manifest/content — Content SHA256 manifest for integrity verification.
// Streaming generator yielding directly to GZIP prevents JSON stringification massive buffer bloat.
app.get('/api/sync/manifest/content', async (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  const out = zlib.createGzip({ level: 6 });
  out.pipe(res);

  try {
    out.write('{"version":1,"generated":"' + new Date().toISOString() + '","hashes":[');

    const iter = remoteCrawlerDb.iterateRemoteCrawlerContentSha256Hashes();
    let count = 0;
    let first = true;
    for (const row of iter) {
      if (!first) out.write(',');
      out.write('"' + row.content_sha256 + '"');
      first = false;
      count++;
      if (count % 1000 === 0) await new Promise(r => setImmediate(r));
    }

    out.write('],"total":' + count + '}');
    out.end();
  } catch (err) {
    console.error('[Manifest Error]', err);
    out.destroy(err);
  }
});

app.post('/api/sync/resolve', (req, res) => {
  const requestedHashes = req.body.hashes;
  if (!Array.isArray(requestedHashes) || requestedHashes.length === 0) {
    return res.status(400).json({ error: 'hashes array required' });
  }

  const hashSet = new Set(requestedHashes);
  const resolved = [];

  const iterator = remoteCrawlerDb.iterateRemoteCrawlerUrlSyncResolutionRows();

  function processChunk() {
    let count = 0;
    while (count < 5000) {
      const next = iterator.next();
      if (next.done) {
        return res.json({
          requested: requestedHashes.length,
          resolved: resolved.length,
          unresolved: requestedHashes.length - resolved.length,
          records: resolved,
        });
      }

      const row = next.value;
      const h = fnv1a64(row.url);
      if (hashSet.has(h)) {
        resolved.push({
          hash: h,
          id: row.id,
          url: row.url,
          host: row.host,
          status: row.status,
        });
        hashSet.delete(h);

        if (hashSet.size === 0) {
          if (typeof iterator.return === 'function') iterator.return();
          return res.json({
            requested: requestedHashes.length,
            resolved: resolved.length,
            unresolved: requestedHashes.length - resolved.length,
            records: resolved,
          });
        }
      }
      count++;
    }
    setImmediate(processChunk);
  }

  processChunk();
});

// GET /api/sync/pull — Pull specific records by ID (with full content).
// Heavy payloads are streamed into ZLib avoiding massive JSON.stringify blocking.
app.get('/api/sync/pull', async (req, res) => {
  const idsParam = req.query.ids;
  if (!idsParam) return res.status(400).json({ error: 'ids query param required' });

  const ids = idsParam.split(',').map(Number).filter(n => n > 0);
  if (ids.length === 0) return res.status(400).json({ error: 'No valid IDs provided' });
  if (ids.length > 10000) return res.status(400).json({ error: 'Max 10000 IDs' });

  const includeContent = req.query.includeContent !== 'false';

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('X-Sync-Pull-Count', String(ids.length));

  const out = zlib.createGzip({ level: 6 });
  out.pipe(res);

  try {
    out.write('{"version":"2.0.0","batchId":"sync-pull-' + Date.now() + '"');

    const urls = remoteCrawlerDb.listRemoteCrawlerSyncUrlRowsByIds(ids);
    const httpResponses = remoteCrawlerDb.listRemoteCrawlerSyncHttpResponsesForUrlIds(ids);

    const urlIds = urls.map(u => u.id);
    const links = remoteCrawlerDb.listRemoteCrawlerDiscoveredLinksForUrlIds(urlIds);

    // Write safe metadata directly
    out.write(',"urls":' + JSON.stringify(urls));
    out.write(',"httpResponses":' + JSON.stringify(httpResponses));
    out.write(',"links":' + JSON.stringify(links));

    // Stream massive content payloads to defend against event-loop exhaustion
    out.write(',"content":[');
    let contentCount = 0;

    if (includeContent && httpResponses.length > 0) {
      const hrIds = httpResponses.map(h => h.id);
      let firstContent = true;
      const rows = remoteCrawlerDb.listRemoteCrawlerContentForHttpResponseIds(hrIds);
      for (const row of rows) {
        if (row.content_blob) {
          row.content_blob_b64 = row.content_blob.toString('base64');
          delete row.content_blob;
        }
        if (!firstContent) out.write(',');
        out.write(JSON.stringify(row));
        firstContent = false;
        contentCount++;
        if (contentCount % 100 === 0) await new Promise(r => setImmediate(r));
      }
    }
    out.write(']');

    out.write(',"counts":' + JSON.stringify({
      urls: urls.length,
      httpResponses: httpResponses.length,
      content: contentCount,
      links: links.length
    }) + '}');

    out.end();
  } catch (err) {
    console.error('[Sync Pull Error]', err);
    out.destroy(err);
  }
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  startContentWatcher(); // lazy-start: polls for page:complete only when clients exist

  // Send initial status
  res.write(`event: status:initial\ndata: ${JSON.stringify(getMultiStatus())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
    if (sseClients.size === 0) stopContentWatcher();
  });
});

// ── Fast State Pollling for SSE ─────────────────────────────
function startStatePoller() {
  if (statePollInterval) return;
  statePollInterval = setInterval(() => {
    for (const [domain, entry] of workers) {
      const isRunning = entry.worker.isRunning;
      const fatalState = entry.worker.fatalState;

      // Check for state transitions
      if (!entry.lastKnownState) {
        entry.lastKnownState = { isRunning, fatalState };
        continue;
      }

      // Started
      if (isRunning && !entry.lastKnownState.isRunning) {
        broadcastSSE('crawl_event', { action: 'start', domain });
      }

      // Stopped / Completed
      if (!isRunning && entry.lastKnownState.isRunning) {
        broadcastSSE('crawl_event', { action: 'stop', domain });
      }

      // Fatal error
      if (fatalState && !entry.lastKnownState.fatalState) {
        broadcastSSE('crawl_event', { action: 'fatal', domain, reason: fatalState.reason });
      }

      entry.lastKnownState = { isRunning, fatalState };
    }
  }, 1000);
}

function stopStatePoller() {
  if (statePollInterval) {
    clearInterval(statePollInterval);
    statePollInterval = null;
  }
}

// ── Content Watcher: broadcasts page:complete SSE events ────
// Polls the remote crawler DB for newly-completed URLs (after a high-water
// row ID) and broadcasts SSE events so streaming sync clients can immediately
// pull the page data. Runs at 500ms intervals when SSE clients are connected.
let contentWatcherInterval = null;
let contentWatcherHighWater = 0;

function startContentWatcher() {
  if (contentWatcherInterval) return;
  // Initialize high-water mark to current max so we only broadcast NEW pages
  try {
    const stats = remoteCrawlerDb.getRemoteCrawlerReplayStats();
    contentWatcherHighWater = stats?.maxRowId || 0;
  } catch (_) {
    contentWatcherHighWater = 0;
  }

  contentWatcherInterval = setInterval(() => {
    if (sseClients.size === 0) return; // no listeners, skip
    try {
      const urls = remoteCrawlerDb.listRemoteCrawlerUrlsAfterRowId({
        afterRowId: contentWatcherHighWater,
        limit: 50,
      });
      if (!urls || urls.length === 0) return;

      for (const url of urls) {
        if (url.status === 'done') {
          broadcastSSE('page:complete', {
            urlId: url.id,
            url: url.url,
            domain: url.host?.replace(/^www\./, '') || '',
            ts: url.updated_at || new Date().toISOString(),
            httpStatus: url.http_status,
          });
        }
        if (url.id > contentWatcherHighWater) {
          contentWatcherHighWater = url.id;
        }
      }
    } catch (err) {
      console.error('[Content Watcher Error]', err.message);
    }
  }, 500);
}

function stopContentWatcher() {
  if (contentWatcherInterval) {
    clearInterval(contentWatcherInterval);
    contentWatcherInterval = null;
  }
}

// Debug: content inspection
app.get('/api/debug/links', (req, res) => {
  const domain = req.query.domain || 'news.ycombinator.com';
  const entry = workers.get(domain);
  if (!entry) return res.status(404).json({ error: 'Worker not found' });
  try {
    const snapshot = entry.worker.db.remoteCrawler.getRemoteCrawlerDebugLinksSnapshot({ limit: 5 });
    res.json(snapshot);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Content Inspection ──────────────────────────────────────

app.get('/api/content/stats', (req, res) => {
  res.json(remoteCrawlerDb.getRemoteCrawlerContentInspectionStats());
});

app.get('/api/content/by-url', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  const row = remoteCrawlerDb.getLatestRemoteCrawlerContentForUrl(url);

  if (!row) return res.status(404).json({ error: 'No content found' });

  zlib.gunzip(row.content_blob, (err, decompressed) => {
    if (err) return res.status(500).json({ error: 'Decompression failed' });
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(decompressed);
    }
    res.json({
      url, title: row.title, classification: row.classification,
      httpStatus: row.http_status, contentType: row.content_type,
      fetchedAt: row.fetched_at, sha256: row.content_sha256,
      uncompressedSize: row.uncompressed_size,
      htmlPreview: decompressed.toString('utf8').substring(0, 2000),
    });
  });
});

// ── Logs ────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const logs = remoteCrawlerDb.listRemoteCrawlerLogRows({ limit });
  res.json({ logs });
});

app.get('/api/errors', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const errors = remoteCrawlerDb.listRemoteCrawlerErrorRows({ limit });
  res.json({ count: errors.length, errors });
});

async function stopAllWorkersGracefully(timeoutMs = 8000) {
  const stopPromises = [];
  for (const [domain, entry] of workers) {
    if (!entry.worker || typeof entry.worker.stopAsync !== 'function') {
      if (entry.worker && typeof entry.worker.stop === 'function') {
        entry.worker.stop();
      }
      entry.state = 'stopped';
      entry.stoppedAt = new Date().toISOString();
      continue;
    }

    if (entry.worker.isRunning) {
      stopPromises.push(
        entry.worker.stopAsync({ timeoutMs })
          .then((result) => ({ domain, result }))
          .catch((error) => ({ domain, error: error?.message || String(error) }))
      );
    }
    entry.state = 'stopped';
    entry.stoppedAt = new Date().toISOString();
  }

  return Promise.all(stopPromises);
}

function closeSseClients() {
  for (const client of sseClients) {
    try {
      client.end();
      client.destroy?.();
    } catch (_) { }
  }
  sseClients.clear();
}

// ── Start Server ────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Multi-Domain Crawl Server v4 running at http://0.0.0.0:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /                       Status (all domains)');
  console.log('  GET  /api/status             Full status + memory + idle');
  console.log('  GET  /api/status/:domain     Per-domain status (alias)');
  console.log('  GET  /api/health             Health check + memory');
  console.log('  GET  /api/domain/:domain     Per-domain status');
  console.log('  GET  /api/queue/pending      Pending queue counts by domain');
  console.log('  POST /api/start              Start crawl { domain, maxPages }');
  console.log('  POST /api/crawl/start        Start crawl alias for coordinator clients');
  console.log('  POST /api/stop               Stop crawl { domain } or all');
  console.log('  POST /api/crawl/stop         Stop crawl alias for coordinator clients');
  console.log('  POST /api/seed               Seed URLs { domain, urls }');
  console.log('  POST /api/domains/add        Add domain { domain, maxPages }');
  console.log('  POST /api/domains/remove     Remove domain { domain }');
  console.log('  PUT  /api/domains            Set all domains dynamically (decoupled from terraform)');
  console.log('  PUT  /api/domains            Set all domains dynamically');
  console.log('  POST /api/db/reset           Reset DB (drop all, recreate schema)');
  console.log('  GET  /api/export/batch       Batch export (gzip) ?window=10');
  console.log('  GET  /api/export/replay      Full replay export (rowid pagination)');
  console.log('  GET  /api/export/replay/stats  Replay progress stats');
  console.log('  GET  /api/export             Simple URL export');
  console.log('  GET  /api/events             SSE live event stream');
  console.log('  GET  /api/content/stats      Content stats by domain');
  console.log('  GET  /api/content/by-url     Inspect content ?url=...');
  console.log('  GET  /api/errors             Error log');
  console.log('  GET  /api/logs               Crawl logs');
  console.log('');
  console.log(`Domains: ${domainConfigs.map(d => d.domain).join(', ')}`);
  console.log(`Coordinator mode: ${COORDINATOR_MODE ? 'enabled' : 'disabled'}`);
  globalShield.start();
  if (AUTO_START) {
    startAll();
  } else {
    console.log('Auto-start disabled: waiting for /api/start');
  }
  startStatePoller();

  if (IDLE_TIMEOUT_MIN > 0) {
    console.log(`Auto-shutdown: after ${IDLE_TIMEOUT_MIN} min idle`);
  }

  // Start idle monitor
  startIdleMonitor();
});
server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => activeSockets.delete(socket));
});

// ── Graceful Shutdown ───────────────────────────────────────

function shutdown(signal = 'SIGTERM') {
  if (isShuttingDown) {
    console.log('\n  [Force Quit] Shutdown already in progress. Hard exiting.');
    process.exit(1);
  }

  isShuttingDown = true;
  console.log(`\n  [Shutdown] Received ${signal}. Draining workers and closing server...`);

  shutdownForceTimer = setTimeout(() => {
    console.error(`\n  [Shutdown] Timeout after ${SHUTDOWN_TIMEOUT_MS}ms. Forcing exit.`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  shutdownForceTimer.unref?.();

  shutdownPromise = (async () => {
    try {
      stopOrchestrator();
      stopIdleMonitor();
      stopStatePoller();
      stopContentWatcher();
      globalShield.stop();

      closeSseClients();
      server.closeIdleConnections?.();

      const serverClosePromise = new Promise((resolve, reject) => {
        server.close((error) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(error);
            return;
          }
          resolve();
        });
      });
      const socketDrainTimer = setTimeout(() => {
        for (const socket of activeSockets) {
          try { socket.destroy(); } catch (_) { }
        }
      }, 2000);
      socketDrainTimer.unref?.();

      const workerResults = await stopAllWorkersGracefully(Math.max(2000, SHUTDOWN_TIMEOUT_MS - 2000));
      const timedOutDomains = workerResults.filter((r) => r?.result?.timedOut || r?.error).map((r) => r.domain);
      if (timedOutDomains.length > 0) {
        console.warn(`  [Shutdown] Worker drain timed out for: ${timedOutDomains.join(', ')}`);
      }

      await serverClosePromise;
      clearTimeout(socketDrainTimer);

      for (const socket of activeSockets) {
        try { socket.destroy(); } catch (_) { }
      }
      activeSockets.clear();

      await closeIntelligencePool({ drainTimeoutMs: 2000 });

      db.close();
      console.log('  Database closed. Goodbye.');

      if (shutdownForceTimer) {
        clearTimeout(shutdownForceTimer);
        shutdownForceTimer = null;
      }
      process.exit(0);
    } catch (error) {
      console.error('  [Shutdown] Error during shutdown:', error?.message || String(error));
      if (shutdownForceTimer) {
        clearTimeout(shutdownForceTimer);
        shutdownForceTimer = null;
      }
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
