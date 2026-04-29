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

const express = require('express');
const Database = require('better-sqlite3');
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

const db = new Database(DB_FILE);
initSchema(db);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

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
    seedUrls() { return { inserted: 0 }; },
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
  const workerOptions = {
    ...startOptions,
    coordinatorMode: !!startOptions.coordinatorMode,
  };

  const pm2Name = getWorkerPm2Name(domain);
  const scriptPath = require('path').join(__dirname, 'lib', 'run-worker.js');
  const seedUrls = entry.config.seedUrls && entry.config.seedUrls.length > 0 ? entry.config.seedUrls.join(',') : '';

  // Clean up any existing PM2 process with the same name to prevent duplicates on restart
  try { require('child_process').execSync(`pm2 delete "${pm2Name}" 2>/dev/null`, { stdio: 'ignore' }); } catch (_) { }
  let cmd = `pm2 start "${scriptPath}" --name "${pm2Name}" --max-memory-restart 1500M -- --domain "${domain}" --max-pages ${maxPages} --db "${DB_FILE}"`;
  if (seedUrls) cmd += ` --seed-urls "${seedUrls}"`;
  if (workerOptions.coordinatorMode) cmd += ` --coordinator-mode`;

  try {
    const out = require('child_process').execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' });
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

  broadcastSSE('crawl:start', { domain, maxPages, coordinatorMode: workerOptions.coordinatorMode });
  console.log(`  [${domain}] Crawl started via PM2 (maxPages=${maxPages}, coordinatorMode=${workerOptions.coordinatorMode})`);

  return { domain, status: 'started', maxPages };
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
    if (entry.state === 'running' && normalizedDiskStatus.state !== 'running') {
      entry.state = normalizedDiskStatus.state;
      entry.stoppedAt = normalizedDiskStatus.stoppedAt || new Date().toISOString();
      entry.lastStatus = {
        ...normalizedDiskStatus,
        stoppedAt: entry.stoppedAt,
      };
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

  let walPendingCount = 0;
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM crawl_wal').get();
    walPendingCount = row ? row.count : 0;
  } catch (e) { }

  return {
    service: 'Multi-Domain Crawl Server v4',
    version: '4.0.0',
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
 * Creates an async generator to yield SQLite rows and prevent event-loop blocking.
 */
async function* iterateDb(stmt, ...binds) {
  const iterator = stmt.iterate(...binds);
  let count = 0;
  for (const row of iterator) {
    yield row;
    count++;
    if (count % 250 === 0) {
      await new Promise(r => setImmediate(r));
    }
  }
}

/**
 * Async stream JSON arrays.
 */
async function streamArray(out, key, stmt, ...binds) {
  out.write(`,"${key}":[`);
  let first = true;
  let count = 0;
  for await (const row of iterateDb(stmt, ...binds)) {
    if (row.content_blob) {
      row.content_blob_b64 = row.content_blob.toString('base64');
      delete row.content_blob;
    }
    if (!first) out.write(',');
    out.write(JSON.stringify(row));
    first = false;
    count++;
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
  const stmt = db.prepare(`
    SELECT COUNT(*) AS c
    FROM urls
    WHERE status = 'pending'
      AND (host = ? OR host = ? OR host LIKE ?)
  `);

  for (const [domain] of workers) {
    const row = stmt.get(domain, `www.${domain}`, `%.${domain}`);
    counts[domain] = Number(row?.c || 0);
  }

  res.json(counts);
});

// ── Crawl Control ───────────────────────────────────────────

function handleStartRequest(req, res) {
  const { domain, domains: domainList, maxPages, maxConcurrent } = req.body || {};
  const maxPagesOverride = maxPages ? parseInt(maxPages, 10) : undefined;

  // Allow runtime concurrency override
  if (maxConcurrent && Number.isFinite(parseInt(maxConcurrent, 10))) {
    const newMax = Math.max(1, parseInt(maxConcurrent, 10));
    console.log(`  [config] maxConcurrent changed: ${MAX_CONCURRENT} → ${newMax}`);
    MAX_CONCURRENT = newMax;
  }

  if (domain) {
    res.json(startDomain(domain, maxPagesOverride));
  } else if (Array.isArray(domainList)) {
    const results = domainList.map(d => startDomain(d, maxPagesOverride));
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

  const result = entry.worker.seedUrls(urlList);
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
  const { domain, maxPages, seedUrls } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });
  if (workers.has(domain)) return res.json({ domain, status: 'already_exists' });

  const config = { domain, maxPages: maxPages || MAX_PAGES_DEFAULT, seedUrls };
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

    // Drop and recreate all tables (disable FK checks to avoid ordering issues)
    db.pragma('foreign_keys = OFF');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(r => r.name);

    for (const table of tables) {
      db.prepare(`DROP TABLE IF EXISTS [${table}]`).run();
    }
    db.pragma('foreign_keys = ON');

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

  const now = new Date();
  const toSqlite = (d) => d.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
  let sinceSql, untilSql;
  if (windowSec > 0 && !since) {
    const untilDate = until ? new Date(until) : now;
    untilSql = toSqlite(untilDate);
    sinceSql = toSqlite(new Date(untilDate.getTime() - windowSec * 1000));
  } else {
    sinceSql = since ? toSqlite(new Date(since)) : toSqlite(new Date(now.getTime() - 10000));
    untilSql = until ? toSqlite(new Date(until)) : toSqlite(now);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  const out = zlib.createGzip({ level: 6 });
  out.pipe(res);

  try {
    const urlsStmt = db.prepare(`SELECT * FROM urls WHERE updated_at > ? AND updated_at <= ? ORDER BY updated_at ASC LIMIT ?`);
    const urls = urlsStmt.all(sinceSql, untilSql, limit);
    const watermark = urls.length > 0 ? urls[urls.length - 1].updated_at : untilSql;
    res.setHeader('X-Batch-Watermark', watermark || '');

    out.write('{"version":"2.0.0","batchId":"multi-' + Date.now() + '","watermark":"' + watermark + '"');

    if (urls.length === 0) {
      out.end('}');
      return;
    }

    // Write urls array identically
    out.write(',"urls":' + JSON.stringify(urls));

    const uIds = urls.map(u => u.id).join(',');

    const httpResponsesCount = await streamArray(out, 'httpResponses', db.prepare(`SELECT * FROM http_responses WHERE url_id IN (${uIds})`));

    let contentCount = 0;
    if (includeContent) {
      contentCount = await streamArray(out, 'content', db.prepare(`SELECT * FROM content_storage WHERE http_response_id IN (SELECT id FROM http_responses WHERE url_id IN (${uIds}))`));
    } else {
      out.write(',"content":[]');
    }

    const linksCount = await streamArray(out, 'links', db.prepare(`SELECT dl.*, u.url as source_url FROM discovered_links dl JOIN urls u ON dl.source_url_id = u.id WHERE dl.source_url_id IN (${uIds})`));

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
  if (!before) {
    return res.status(400).json({ ok: false, error: 'before watermark is required' });
  }

  try {
    const result = pruneExportedPayload(db, {
      before,
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

// Row-ID replay export — syncs ALL historical data via generic streams
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
    const urls = db.prepare(`SELECT * FROM urls WHERE id > ? ORDER BY id ASC LIMIT ?`).all(afterRowId, limit);
    const lastRowId = urls.length > 0 ? urls[urls.length - 1].id : afterRowId;
    const maxRowId = db.prepare('SELECT MAX(id) AS m FROM urls').get()?.m || 0;

    res.setHeader('X-Replay-LastRowId', String(lastRowId));
    res.setHeader('X-Replay-MaxRowId', String(maxRowId));

    out.write('{"version":"3.0.0-replay","cursor":{"lastRowId":' + lastRowId + ',"maxRowId":' + maxRowId + '}');

    if (urls.length === 0) {
      out.end('}');
      return;
    }

    out.write(',"urls":' + JSON.stringify(urls));
    const uIds = urls.map(u => u.id).join(',');

    await streamArray(out, 'httpResponses', db.prepare(`SELECT * FROM http_responses WHERE url_id IN (${uIds})`));

    if (includeContent) {
      await streamArray(out, 'content', db.prepare(`SELECT * FROM content_storage WHERE http_response_id IN (SELECT id FROM http_responses WHERE url_id IN (${uIds}))`));
    } else {
      out.write(',"content":[]');
    }

    await streamArray(out, 'links', db.prepare(`SELECT dl.*, u.url as source_url FROM discovered_links dl JOIN urls u ON dl.source_url_id = u.id WHERE dl.source_url_id IN (${uIds})`));

    out.end('}');
  } catch (err) {
    console.error('[Replay Error]', err);
    out.destroy(err);
  }
});

app.get('/api/export/replay/stats', (_req, res) => {
  const row = db.prepare('SELECT MAX(rowid) AS maxRowId, COUNT(*) AS totalUrls FROM urls').get();
  const content = db.prepare('SELECT COUNT(*) AS c FROM content_storage').get();
  const responses = db.prepare('SELECT COUNT(*) AS c FROM http_responses').get();
  res.json({
    maxRowId: row?.maxRowId || 0,
    totalUrls: row?.totalUrls || 0,
    totalContent: content?.c || 0,
    totalResponses: responses?.c || 0,
  });
});

// v1-compatible simple export
app.get('/api/export', (req, res) => {
  const urls = db.prepare(`
    SELECT url, host, path, http_status, content_type, content_length,
      title, word_count, links_found, classification, fetched_at
    FROM urls WHERE status = 'done' ORDER BY fetched_at ASC
  `).all();
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
    const ph = hosts.map(() => '?').join(',');

    const stmt = db.prepare('SELECT url, status FROM urls WHERE host IN (' + ph + ')');
    const iterator = stmt.iterate(...hosts);

    const hashes = [];
    let doneCount = 0;
    let totalCount = 0;

    function processChunk() {
      let chunkCount = 0;
      while (chunkCount < 5000) {
        const next = iterator.next();
        if (next.done) {
          // Finished this domain
          const contentRow = db.prepare(
            'SELECT COUNT(*) AS c FROM content_storage cs ' +
            'JOIN http_responses hr ON cs.http_response_id = hr.id ' +
            'JOIN urls u ON hr.url_id = u.id ' +
            'WHERE u.host IN (' + ph + ')'
          ).get(...hosts);

          result.domains[domain] = {
            total: totalCount,
            doneCount,
            contentCount: contentRow?.c || 0,
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

    const iter = db.prepare('SELECT content_sha256 FROM content_storage WHERE content_sha256 IS NOT NULL').iterate();
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

  const stmt = db.prepare('SELECT id, url, host, status FROM urls');
  const iterator = stmt.iterate();

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

    // Fetch memory-safe metadata
    const urls = [];
    const httpResponses = [];
    const links = [];

    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const ph = chunk.map(() => '?').join(',');

      urls.push(...db.prepare(
        'SELECT id, url, host, path, status, http_status, content_type, ' +
        'content_length, title, word_count, links_found, depth, discovered_from, ' +
        'classification, fetched_at, created_at, updated_at, error_msg ' +
        'FROM urls WHERE id IN (' + ph + ')'
      ).all(...chunk));

      httpResponses.push(...db.prepare(
        'SELECT id, url_id, request_started_at, fetched_at, http_status, ' +
        'content_type, content_encoding, redirect_chain, ttfb_ms, ' +
        'download_ms, total_ms, bytes_downloaded, transfer_kbps, request_method ' +
        'FROM http_responses WHERE url_id IN (' + ph + ') ORDER BY fetched_at ASC'
      ).all(...chunk));
    }

    const urlIds = urls.map(u => u.id);
    for (let i = 0; i < urlIds.length; i += 100) {
      const chunk = urlIds.slice(i, i + 100);
      const ph = chunk.map(() => '?').join(',');
      links.push(...db.prepare(
        'SELECT dl.id, dl.source_url_id, u.url AS source_url, ' +
        'dl.target_url, dl.link_text, dl.is_nav_link, dl.created_at ' +
        'FROM discovered_links dl JOIN urls u ON dl.source_url_id = u.id ' +
        'WHERE dl.source_url_id IN (' + ph + ') ORDER BY dl.created_at ASC'
      ).all(...chunk));
    }

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
      for (let i = 0; i < hrIds.length; i += 100) {
        const chunk = hrIds.slice(i, i + 100);
        const ph = chunk.map(() => '?').join(',');
        const rows = db.prepare(
          'SELECT id, http_response_id, storage_type, content_blob, ' +
          'content_sha256, uncompressed_size, compressed_size, ' +
          'compression_ratio, content_category, content_subtype, created_at ' +
          'FROM content_storage WHERE http_response_id IN (' + ph + ')'
        ).all(...chunk);

        for (const row of rows) {
          if (row.content_blob) {
            row.content_blob_b64 = row.content_blob.toString('base64');
            delete row.content_blob;
          }
          if (!firstContent) out.write(',');
          out.write(JSON.stringify(row));
          firstContent = false;
          contentCount++;
        }
        await new Promise(r => setImmediate(r)); // yield chunk
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

  // Send initial status
  res.write(`event: status:initial\ndata: ${JSON.stringify(getMultiStatus())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
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


// Debug: content inspection
app.get('/api/debug/links', (req, res) => {
  const domain = req.query.domain || 'news.ycombinator.com';
  const entry = workers.get(domain);
  if (!entry) return res.status(404).json({ error: 'Worker not found' });
  try {
    const count = entry.worker.db.prepare('SELECT count(*) c FROM discovered_links').get().c;
    const rows = entry.worker.db.prepare('SELECT * FROM discovered_links ORDER BY id DESC LIMIT 5').all();
    const urls = entry.worker.db.prepare('SELECT * FROM urls ORDER BY updated_at DESC LIMIT 5').all();
    res.json({ count, rows, urls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Content Inspection ──────────────────────────────────────

app.get('/api/content/stats', (req, res) => {
  const byDomain = db.prepare(`
    SELECT u.host as domain, COUNT(*) as count,
      SUM(cs.uncompressed_size) as total_uncompressed,
      SUM(cs.compressed_size) as total_compressed
    FROM content_storage cs
    JOIN http_responses hr ON cs.http_response_id = hr.id
    JOIN urls u ON hr.url_id = u.id
    GROUP BY u.host ORDER BY count DESC
  `).all();

  const totals = db.prepare(`
    SELECT COUNT(*) as total_stored,
      SUM(uncompressed_size) as total_uncompressed,
      SUM(compressed_size) as total_compressed,
      AVG(compression_ratio) as avg_compression_ratio
    FROM content_storage
  `).get();

  res.json({ totals, byDomain });
});

app.get('/api/content/by-url', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  const row = db.prepare(`
    SELECT cs.content_blob, cs.uncompressed_size, cs.content_sha256,
      hr.http_status, hr.content_type, hr.fetched_at,
      u.title, u.classification
    FROM content_storage cs
    JOIN http_responses hr ON hr.id = cs.http_response_id
    JOIN urls u ON u.id = hr.url_id
    WHERE u.url = ?
    ORDER BY cs.created_at DESC LIMIT 1
  `).get(url);

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
  const logs = db.prepare('SELECT * FROM crawl_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ logs });
});

app.get('/api/errors', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const errors = db.prepare(`
    SELECT host, kind, code, message, at, url_id FROM errors
    ORDER BY at DESC LIMIT ?
  `).all(limit);
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
