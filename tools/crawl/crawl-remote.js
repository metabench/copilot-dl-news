#!/usr/bin/env node
/**
 * crawl-remote.js — CLI for controlling the Multi-Domain Crawl Server
 * ════════════════════════════════════════════════════════════════════
 *
 * Controls the remote multi-domain crawl server and pulls data
 * in 10-second batches for instant ingestion into local news.db.
 *
 * Commands:
 *   status          Show all domain crawl status
 *   health          Quick health check
 *   start           Start crawling (all or specific domains)
 *   stop            Stop crawling (all or specific domains)
 *   seed            Seed URLs for a domain
 *   add             Add a new domain to the remote server
 *   remove          Remove a domain from the remote server
 *   pull            Pull a single batch and save to local DB
 *   sync            Continuous sync loop (pull every 10s)
 *   errors          Show recent errors
 *   content         Content stats by domain
 *
 * Usage:
 *   node tools/crawl/crawl-remote.js status --host 141.144.193.218:3200
 *   node tools/crawl/crawl-remote.js start --domain bbc.com
 *   node tools/crawl/crawl-remote.js start --all
 *   node tools/crawl/crawl-remote.js stop --all
 *   node tools/crawl/crawl-remote.js sync --interval 10
 *   node tools/crawl/crawl-remote.js pull --window 30
 *   node tools/crawl/crawl-remote.js add --domain nytimes.com --max-pages 100
 *
 * @module tools/crawl/crawl-remote
 */

'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const {
  findMissingDomains,
  resolveTargetDomains,
  summarizeBoundedRun,
} = require('./lib/crawl-remote-bounded');
const { createAdaptiveBatchController } = require('./lib/adaptive-sync-batching');
const {
  shouldPruneAfterIngest: shouldPruneAfterIngestPure,
  validatePruneExportConfig: validatePruneExportConfigPure,
} = require('./lib/prune-config');
const { evaluateStorageBudget, normalizeStorageBudgetOptions } = require('./lib/storage-budget');
const { evaluateBackpressure } = require('./lib/backpressure');
const { createPerfReporter } = require('./lib/perf-reporter');

// ── Arg Parsing ─────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0] || 'status';

const args = {};
for (let i = 1; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
}

if (command === 'help' || args.help || args.h) {
  console.log(`crawl-remote.js — Multi-Domain Crawl Server CLI

Usage:  node tools/crawl/crawl-remote.js <command> [options]

Commands:
  status                    Show all domain crawl status
  health                    Quick health check
  start [--domain d|--all]  Start crawling
  launch [--domain d|--domains d1,d2] Register missing domains, start crawling, and return
  bounded [--domain d|--domains d1,d2]  Start bounded crawl and wait for completion
  stop  [--domain d|--all]  Stop crawling
  run   [--domain d|--all]  Start crawling, sync continuously, and stop on exit
  seed  --domain d --urls u1,u2  Seed URLs
  add   --domain d          Add domain to server
  remove --domain d         Remove domain from server
  pull  [--window 10]       Pull one batch to local DB
  sync  [--interval 5]      Continuous timestamped batch sync loop
  errors [--limit 50]       Show recent errors
  content                   Content stats by domain

Options:
  --host <host:port>     Remote server (default: env/resolver or 141.144.193.218:3200)
  --db <path>            Local DB path (default: data/news.db)
  --domain <domain>      Target domain for start/stop/seed/add/remove
  --all                  Affect all domains
  --window <seconds>     Batch window in seconds (default: 10)
  --since <timestamp>    Override the first sync watermark for catch-up/drain runs
  --interval <seconds>   Sync polling interval (default: 5 for sync, 10 for run)
  --rounds <n>           Stop sync after n rounds (useful for checks)
  --limit <n>            Limit for queries (default: 500)
  --adaptive-limit       Adjust sync export limit toward --target-sync-ms
  --adaptive-batching    Alias for --adaptive-limit
  --target-sync-ms <n>   Target fetch+ingest+verify+prune duration; enables adaptive batching
  --min-limit <n>        Minimum adaptive export limit (default: 1)
  --max-limit <n>        Maximum adaptive export limit (default: initial --limit)
  --include-content <bool> Include content blobs in export batches (default: true)
  --include-links <bool> Include discovered links in export batches when supported (default: true)
  --prune-after-ingest   Confirm local save, then prune exported payloads from the remote node
  --prune-delete-urls    Also delete remote URL state rows after ingest (unsafe while crawls are active)
  --no-backoff           Keep the configured interval even after empty sync rounds
  --remote-storage-budget-mb <n>   Soft cap on remote content storage (MB); above this, sync prefers small drain batches
  --remote-storage-reserve-mb <n>  Hard reserve above the budget; above (budget+reserve), request remote /api/throttle pause
  --normal-concurrency <n>         Worker concurrency to restore when budget returns to normal (default: --max-concurrent or 10)
  --reduced-concurrency <n>        Worker concurrency under storage pressure (default: 2)
  --perf-summary-every <n>         Print p50/p95 perf summary every N rounds (default: 10)
  --max-pages <n>        Max pages when adding domain (default: 50)
  --max-concurrent <n>   Max domains to crawl in parallel for start/bounded/run
  --poll <seconds>       Poll interval for bounded wait (default: 5)
  --timeout-min <n>      Timeout in minutes for bounded wait (default: 30)
  --json                 Output raw JSON
  --help                 Show this help
`);
  process.exit(0);
}

let defaultHost = '127.0.0.1:3200';
try {
  const { getFleetHostSync } = require('./lib/fleet-host-resolver');
  defaultHost = `${getFleetHostSync()}:3200`;
} catch (e) {
  // fallback if resolver fails
}

const REMOTE_HOST = args.host || process.env.CRAWL_REMOTE_HOST || defaultHost;
const LOCAL_DB_PATH = args.db || path.resolve(__dirname, '../../data/news.db');
const WATERMARK_FILE = path.resolve(__dirname, '.crawl-remote-watermark.json');
const JSON_OUTPUT = args.json === true;

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

let configureRemoteCrawlLocalSyncDb;
let verifyRemoteCrawlBatchPersisted;

function getConfigureRemoteCrawlLocalSyncDb() {
  if (!configureRemoteCrawlLocalSyncDb) {
    configureRemoteCrawlLocalSyncDb = getDbApi('configureRemoteCrawlLocalSyncDb');
  }
  return configureRemoteCrawlLocalSyncDb;
}

function getVerifyRemoteCrawlBatchPersisted() {
  if (!verifyRemoteCrawlBatchPersisted) {
    verifyRemoteCrawlBatchPersisted = getDbApi('verifyRemoteCrawlBatchPersisted');
  }
  return verifyRemoteCrawlBatchPersisted;
}

function parsePositiveIntArg(name) {
  const value = args[name];
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function applyStartOverrides(body) {
  const maxPages = parsePositiveIntArg('max-pages');
  const maxConcurrent = parsePositiveIntArg('max-concurrent') || parsePositiveIntArg('maxConcurrent');
  if (maxPages) body.maxPages = maxPages;
  if (maxConcurrent) body.maxConcurrent = maxConcurrent;
  return body;
}

function isFalseArg(name) {
  const value = args[name];
  return value === false || String(value).toLowerCase() === 'false' || String(value).toLowerCase() === '0';
}

function isTrueArg(name) {
  const value = args[name];
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function appendExportOptions(queryPath) {
  const parts = [];
  if (isFalseArg('include-content') || isFalseArg('includeContent')) parts.push('includeContent=false');
  if (isFalseArg('include-links') || isFalseArg('includeLinks')) parts.push('includeLinks=false');
  return parts.length ? `${queryPath}&${parts.join('&')}` : queryPath;
}

function shouldPruneAfterIngest() {
  return shouldPruneAfterIngestPure(args);
}

function validatePruneExportConfig() {
  validatePruneExportConfigPure(args);
}

function appendWatermark(queryPath, watermark) {
  return watermark ? `${queryPath}&since=${encodeURIComponent(watermark)}` : queryPath;
}

function createSyncBatchController(initialLimit) {
  return createAdaptiveBatchController({
    ...args,
    initialLimit,
    limit: initialLimit,
  });
}

function getAdaptiveSummary(controller) {
  if (!controller.isEnabled()) return 'disabled';
  const options = controller.getOptions();
  return `enabled target=${options.targetMs}ms min=${options.minLimit} max=${options.maxLimit}`;
}

function logAdaptiveDecision(decision) {
  if (!decision?.enabled || decision.action === 'hold') return;
  const duration = Number.isFinite(decision.durationMs) ? `, round=${decision.durationMs}ms` : '';
  console.log(`  Adaptive limit ${decision.action}: ${decision.previousLimit} → ${decision.currentLimit} (${decision.reason}${duration}, target=${decision.targetMs}ms)`);
}

function getRequestedDomains() {
  if (args.domain) return [args.domain];
  if (args.domains) return args.domains.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

async function registerRequestedDomains(targetDomains) {
  const uniqueDomains = [...new Set(targetDomains || [])];
  const maxPagesOverride = parsePositiveIntArg('max-pages');
  for (const domain of uniqueDomains) {
    const body = { domain };
    if (maxPagesOverride) body.maxPages = maxPagesOverride;
    const { data } = await requestWithTimeout('POST', '/api/domains/add', body, 15000);
    if (data?.error) throw new Error(`Failed to register remote domain ${domain}: ${data.error}`);
    if (!JSON_OUTPUT && data?.status === 'added') {
      console.log(`  Registered remote domain: ${domain}${maxPagesOverride ? ` (maxPages=${maxPagesOverride})` : ''}`);
    }
  }
}

// ── HTTP Helpers ────────────────────────────────────────────

/**
 * Make HTTP request to remote server
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = REMOTE_HOST.startsWith('https://');
    const host = REMOTE_HOST.replace(/^https?:\/\//, '');
    const [hostname, port] = host.split(':');

    const options = {
      hostname,
      port: port || (isHttps ? 443 : 80),
      path,
      method,
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      timeout: 30000,
    };

    if (body) {
      const payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const transport = isHttps ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      const isGzipped = res.headers['content-encoding'] === 'gzip';

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        if (isGzipped) {
          zlib.gunzip(raw, (err, decompressed) => {
            if (err) return reject(new Error(`Decompression error: ${err.message}`));
            try {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                data: JSON.parse(decompressed.toString('utf8')),
              });
            } catch (e) {
              resolve({ status: res.statusCode, headers: res.headers, data: decompressed.toString('utf8') });
            }
          });
        } else {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: JSON.parse(raw.toString('utf8')),
            });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, data: raw.toString('utf8') });
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function requestWithTimeout(method, path, body = null, timeoutMs = 30000) {
  return Promise.race([
    request(method, path, body),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Request ${method} ${path} timed out after ${timeoutMs}ms`)), timeoutMs))
  ]);
}

// ── Watermark Management ────────────────────────────────────

function loadWatermark() {
  try {
    if (fs.existsSync(WATERMARK_FILE)) {
      return JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { lastWatermark: null, lastPullAt: null, totalPulled: 0 };
}

function saveWatermark(wm) {
  try {
    fs.writeFileSync(WATERMARK_FILE, JSON.stringify(wm, null, 2));
  } catch (e) {
    console.error(`  Warning: Could not save watermark: ${e.message}`);
  }
}

// ── Local DB Ingestion ──────────────────────────────────────

let localDb;

function openLocalDb() {
  if (localDb) return localDb;
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`Local DB not found: ${LOCAL_DB_PATH}`);
    process.exit(1);
  }
  localDb = openNewsCrawlerDb(LOCAL_DB_PATH);
  getConfigureRemoteCrawlLocalSyncDb()(localDb);
  return localDb;
}

function closeLocalDb() {
  if (localDb) {
    localDb.close();
    localDb = null;
  }
}

/**
 * Ingest a v2 batch into local news.db
 * Re-uses the sync-ingest pipeline
 */
function ingestBatch(batch) {
  const { ingestV2Batch } = require('./lib/sync-ingest');
  const db = openLocalDb();
  const result = ingestV2Batch(db, batch);
  return result;
}

function getBatchCounts(batch) {
  return batch.counts || {
    urls: Array.isArray(batch.urls) ? batch.urls.length : 0,
    content: Array.isArray(batch.content) ? batch.content.length : 0,
    httpResponses: Array.isArray(batch.httpResponses) ? batch.httpResponses.length : 0,
    links: Array.isArray(batch.links) ? batch.links.length : 0,
  };
}

function verifyBatchPersisted(batch) {
  const db = openLocalDb();
  return getVerifyRemoteCrawlBatchPersisted()(db, batch);
}

function getBatchUrlIds(batch) {
  if (!Array.isArray(batch?.urls)) return [];
  return batch.urls
    .map((row) => Number(row?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function pruneRemoteWatermark(watermark, urlIds = []) {
  if (!watermark) return null;
  const exactUrlIds = Array.from(new Set(urlIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (exactUrlIds.length === 0) {
    throw new Error('Refusing remote prune without exact exported URL IDs. Watermark-only prune is reserved for manual server-side maintenance.');
  }
  const body = {
    before: watermark,
    urlIds: exactUrlIds,
    deleteUrls: isTrueArg('prune-delete-urls') || isTrueArg('pruneDeleteUrls'),
    deleteLinks: !isFalseArg('prune-delete-links') && !isFalseArg('pruneDeleteLinks'),
    vacuum: isTrueArg('prune-vacuum') || isTrueArg('pruneVacuum'),
  };
  if (args['prune-vacuum-threshold-mb']) body.vacuumThresholdMb = args['prune-vacuum-threshold-mb'];
  const { data } = await requestWithTimeout('POST', '/api/export/prune', body, 60000);
  if (!data?.ok) {
    throw new Error(`Remote prune failed for ${watermark}`);
  }
  return data;
}

async function prunePendingWatermark(wm, batch = null) {
  if (!shouldPruneAfterIngest() || !wm.pendingPruneWatermark) return null;
  const urlIds = getBatchUrlIds(batch).length > 0 ? getBatchUrlIds(batch) : (Array.isArray(wm.pendingPruneUrlIds) ? wm.pendingPruneUrlIds : []);
  const pruneResult = await pruneRemoteWatermark(wm.pendingPruneWatermark, urlIds);
  wm.lastPrunedWatermark = wm.pendingPruneWatermark;
  wm.totalPrunedRecords = (wm.totalPrunedRecords || 0) + Object.values(pruneResult.deleted || {}).reduce((sum, value) => sum + (value || 0), 0);
  delete wm.pendingPruneWatermark;
  delete wm.pendingPruneUrlIds;
  saveWatermark(wm);
  return pruneResult;
}

async function confirmSaveAndMaybePrune(batch, wm, counts) {
  const verification = verifyBatchPersisted(batch);
  if (!verification.ok) {
    throw new Error(`Local DB confirmation failed: ${JSON.stringify({ missingCounts: verification.missingCounts, sampleMissing: verification.sampleMissing })}`);
  }

  let pruneResult = null;
  if (batch.watermark) {
    wm.lastWatermark = batch.watermark;
    wm.lastPullAt = new Date().toISOString();
    wm.totalPulled = (wm.totalPulled || 0) + (counts.urls || 0);
    if (shouldPruneAfterIngest()) {
      wm.pendingPruneWatermark = batch.watermark;
      wm.pendingPruneUrlIds = getBatchUrlIds(batch);
    }
    saveWatermark(wm);

    if (shouldPruneAfterIngest()) {
      pruneResult = await prunePendingWatermark(wm, batch);
    }
  }

  return { verification, pruneResult };
}

// ── Format Helpers ──────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < 3) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function printTable(rows, cols) {
  if (rows.length === 0) { console.log('  (empty)'); return; }
  const widths = cols.map(c => Math.max(c.label.length, ...rows.map(r => String(c.get(r) ?? '').length)));
  const header = cols.map((c, i) => c.label.padEnd(widths[i])).join('  ');
  console.log(`  ${header}`);
  console.log(`  ${cols.map((_, i) => '─'.repeat(widths[i])).join('──')}`);
  for (const row of rows) {
    console.log(`  ${cols.map((c, i) => String(c.get(row) ?? '').padEnd(widths[i])).join('  ')}`);
  }
}

// ── Commands ────────────────────────────────────────────────

async function cmdStatus() {
  const { data } = await requestWithTimeout('GET', '/api/status');

  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Multi-Domain Crawl Server Status');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Server: ${REMOTE_HOST}`);
  console.log(`  Version: ${data.version}`);
  console.log(`  Schema: ${data.schemaVersion}`);
  console.log(`  Orchestrator: ${data.orchestrator?.running ? 'RUNNING' : 'IDLE'}`);
  console.log(`  Concurrency: ${data.orchestrator?.currentlyRunning}/${data.orchestrator?.maxConcurrent}`);
  console.log('');
  console.log(`  Totals: ${data.totals?.fetched || 0} fetched, ${data.totals?.stored || 0} stored, ${data.totals?.errors || 0} errors, ${data.totals?.pending || 0} pending`);
  console.log('');

  if (data.domains && data.domains.length > 0) {
    printTable(data.domains, [
      { label: 'Domain', get: d => d.domain },
      { label: 'State', get: d => d.state + (d.isRunning ? ' ●' : '') },
      { label: 'Done', get: d => d.stats?.done || 0 },
      { label: 'Pending', get: d => d.stats?.pending || 0 },
      { label: 'Errors', get: d => d.stats?.errors || 0 },
      { label: 'Stored', get: d => d.contentPipeline?.totalStored || 0 },
      { label: 'Size', get: d => `${d.contentPipeline?.totalCompressedMB || 0}MB` },
    ]);
  }
  console.log('');
}

async function cmdHealth() {
  try {
    const { data } = await requestWithTimeout('GET', '/api/health', null, 10000);
    if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
    console.log(`  ✅ ${data.mode} server healthy — ${data.domains} domains, ${data.running} running, ${data.stored} stored`);
  } catch (e) {
    console.log(`  ❌ Server unreachable: ${e.message}`);
    process.exit(1);
  }
}

async function cmdStart() {
  const body = {};
  if (args.domain) body.domain = args.domain;
  else if (args.domains) body.domains = args.domains.split(',').map(s => s.trim());
  applyStartOverrides(body);
  // else: start all (empty body)

  const { data } = await requestWithTimeout('POST', '/api/start', body);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  if (data.results) {
    for (const r of data.results) {
      console.log(`  ${r.status === 'started' ? '▶' : '○'} ${r.domain}: ${r.status}`);
    }
    console.log(`  Started ${data.started || data.results.length} domain(s)`);
  } else {
    console.log(`  ${data.status === 'started' ? '▶' : '○'} ${data.domain}: ${data.status}`);
  }
}

async function ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride) {
  const missingDomains = findMissingDomains(initialStatus, targetDomains);
  for (const domain of missingDomains) {
    const body = { domain };
    if (maxPagesOverride) body.maxPages = maxPagesOverride;
    const { data: addData } = await requestWithTimeout('POST', '/api/domains/add', body, 15000);
    if (addData?.error) {
      throw new Error(`Failed to register remote domain ${domain}: ${addData.error}`);
    }
    if (!JSON_OUTPUT) {
      console.log(`  Registered remote domain: ${domain}${maxPagesOverride ? ` (maxPages=${maxPagesOverride})` : ''}`);
    }
  }

  if (missingDomains.length > 0) {
    const { data } = await requestWithTimeout('GET', '/api/status', null, 10000);
    return data;
  }

  return initialStatus;
}

async function cmdLaunch() {
  let { data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const targetDomains = resolveTargetDomains(args, initialStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains resolved for launch');
  }

  const maxPagesOverride = args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined;
  initialStatus = await ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride);

  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else startBody.domains = targetDomains;
  applyStartOverrides(startBody);

  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);
  const result = { ok: true, targetDomains, started: startData };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (startData.results) {
    for (const item of startData.results) {
      console.log(`  ${item.status === 'started' ? '▶' : '○'} ${item.domain}: ${item.status}`);
    }
  }
  console.log(`  Launch requested for ${targetDomains.length} domain(s).`);
  console.log('  Use `node tools/crawl/crawl-remote.js health` for a lightweight liveness check.');
}

async function cmdStop() {
  const body = {};
  if (args.domain) body.domain = args.domain;
  // else: stop all

  const { data } = await requestWithTimeout('POST', '/api/stop', body, 15000);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  if (data.results) {
    for (const r of data.results) {
      console.log(`  ⏹ ${r.domain}: ${r.status}`);
    }
    console.log(`  Stopped ${data.stopped || data.results.length} domain(s)`);
  } else {
    console.log(`  ⏹ ${data.domain}: ${data.status}`);
  }
}

async function cmdSeed() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }
  if (!args.urls) { console.error('  --urls required (comma-separated)'); process.exit(1); }

  const urls = args.urls.split(',').map(s => s.trim());
  const { data } = await requestWithTimeout('POST', '/api/seed', { domain: args.domain, urls }, 30000);

  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  Seeded ${data.inserted}/${data.total} URLs for ${data.domain}`);
}

async function cmdAddDomain() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }

  const body = {
    domain: args.domain,
    maxPages: parseInt(args['max-pages'], 10) || undefined,
  };

  if (args.seeds) body.seedUrls = args.seeds.split(',').map(s => s.trim());

  const { data } = await requestWithTimeout('POST', '/api/domains/add', body);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  ➕ ${data.domain}: ${data.status} (maxPages: ${data.maxPages})`);
}

async function cmdRemoveDomain() {
  if (!args.domain) { console.error('  --domain required'); process.exit(1); }
  const { data } = await requestWithTimeout('POST', '/api/domains/remove', { domain: args.domain });
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`  ➖ ${data.domain}: ${data.status}`);
}

async function cmdErrors() {
  const limit = args.limit || 50;
  const { data } = await requestWithTimeout('GET', `/api/errors?limit=${limit}`);
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`  Recent errors (${data.count}):`);
  if (data.errors && data.errors.length > 0) {
    printTable(data.errors.slice(0, 20), [
      { label: 'Domain', get: e => e.host },
      { label: 'Kind', get: e => e.kind },
      { label: 'Code', get: e => e.code || '' },
      { label: 'Message', get: e => (e.message || '').substring(0, 60) },
      { label: 'At', get: e => e.at },
    ]);
  }
}

async function cmdContent() {
  const { data } = await requestWithTimeout('GET', '/api/content/stats');
  if (JSON_OUTPUT) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log('  Content Stats:');
  console.log(`  Total stored: ${data.totals?.total_stored || 0}`);
  console.log(`  Total raw: ${formatSize(data.totals?.total_uncompressed)}`);
  console.log(`  Total compressed: ${formatSize(data.totals?.total_compressed)}`);
  console.log(`  Avg compression: ${(data.totals?.avg_compression_ratio * 100 || 0).toFixed(1)}%`);
  console.log('');

  if (data.byDomain && data.byDomain.length > 0) {
    printTable(data.byDomain, [
      { label: 'Domain', get: d => d.domain },
      { label: 'Count', get: d => d.count },
      { label: 'Raw', get: d => formatSize(d.total_uncompressed) },
      { label: 'Compressed', get: d => formatSize(d.total_compressed) },
    ]);
  }
}

// ── Pull / Sync Commands ────────────────────────────────────

async function cmdPull() {
  validatePruneExportConfig();
  const windowSec = parseInt(args.window, 10) || 10;
  const limit = parseInt(args.limit, 10) || 500;
  const wm = loadWatermark();
  await prunePendingWatermark(wm);
  const since = args.since || wm.lastWatermark;

  // Build query with watermark for incremental sync
  const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);

  console.log(`  Pulling batch from ${REMOTE_HOST}...`);
  console.log(`  Window: ${windowSec}s, Limit: ${limit}, Watermark: ${since || '(none)'}`);
  if (shouldPruneAfterIngest()) console.log('  Prune after ingest: enabled (remote URL state retained unless --prune-delete-urls is set)');

  const startTime = Date.now();
  const { data, headers } = await requestWithTimeout('GET', queryPath, null, 60000);
  const fetchMs = Date.now() - startTime;

  const counts = getBatchCounts(data);

  if (!data.urls || data.urls.length === 0) {
    console.log(`  No new data (fetch took ${fetchMs}ms)`);
    return { urls: 0, content: 0, fetchMs };
  }

  console.log(`  Fetched batch: ${counts.urls} URLs, ${counts.content} content, ${counts.httpResponses} responses, ${counts.links} links (${fetchMs}ms)`);

  // Ingest to local DB
  const ingestStart = Date.now();
  const result = ingestBatch(data);
  const ingestMs = Date.now() - ingestStart;
  const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);

  console.log(`  Ingested: ${result.urlsInserted || 0} URLs, ${result.contentInserted || 0} content, ${result.responsesInserted || 0} responses (${ingestMs}ms)`);
  console.log(`  Confirmed local save: ${verification.checked.urls} URLs, ${verification.checked.httpResponses} responses, ${verification.checked.content} content, ${verification.checked.links} links`);
  if (pruneResult) console.log(`  Remote pruned: ${JSON.stringify(pruneResult.deleted)} retained=${JSON.stringify(pruneResult.retained || {})}`);
  console.log(`  Total pulled this session: ${wm.totalPulled}`);

  return { urls: counts.urls, content: counts.content, fetchMs, ingestMs, ...result };
}

async function cmdSync() {
  validatePruneExportConfig();
  const intervalSec = parseInt(args.interval, 10) || 5;
  const maxRounds = args.rounds ? parseInt(args.rounds, 10) : Infinity;
  const initialLimit = parsePositiveIntArg('limit') || 500;
  const batchController = createSyncBatchController(initialLimit);
  const noBackoff = args['no-backoff'] === true || args.noBackoff === true;
  const budgetOptions = normalizeStorageBudgetOptions(args);
  const perfReporter = createPerfReporter({ capacity: 60 });
  const perfPrintEvery = parsePositiveIntArg('perf-summary-every') || 10;
  let lastBackpressureAction = 'normal';

  // ── Ledger (source of truth) ──────────────────────────────
  const {
    loadLedger, saveLedger, appendBatch: ledgerAppendBatch,
    markConfirmed: ledgerMarkConfirmed, markPruned: ledgerMarkPruned,
    recordPruneFailure: ledgerRecordPruneFailure, findUnpruned,
    generateBatchId, getLastWatermark,
  } = require('./lib/sync-ledger');
  const LEDGER_FILE = path.resolve(__dirname, '.crawl-remote-ledger.json');
  let ledger = loadLedger(LEDGER_FILE);

  /** Mirror ledger watermark to legacy file for one release */
  function mirrorLegacyWatermark() {
    const wm = loadWatermark();
    const ledgerWm = getLastWatermark(ledger);
    if (ledgerWm) wm.lastWatermark = ledgerWm;
    wm.totalPulled = ledger.totalPulled || wm.totalPulled || 0;
    saveWatermark(wm);
  }

  /** Extract url ids from a batch export payload */
  function extractUrlIdsFromBatch(data) {
    return getBatchUrlIds(data);
  }

  // ── Drain unpruned ledger entries from previous crash ─────
  const unpruned = findUnpruned(ledger);
  if (unpruned.length > 0) {
    console.log(`  Ledger: draining ${unpruned.length} unpruned entries from previous run...`);
    for (const entry of unpruned) {
      try {
        const pruneResult = await pruneRemoteWatermark(entry.watermark, entry.urlIds);
        ledger = ledgerMarkPruned(ledger, entry.batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
        console.log(`    ✓ pruned ledger entry ${entry.batchId} (${entry.urlIds.length} urlIds)`);
      } catch (e) {
        ledger = ledgerRecordPruneFailure(ledger, entry.batchId);
        saveLedger(LEDGER_FILE, ledger);
        console.log(`    ✗ prune failed for ${entry.batchId} (retry #${entry.pruneRetries + 1}): ${e.message}`);
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Continuous Sync Loop');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Remote: ${REMOTE_HOST}`);
  console.log(`  Local DB: ${LOCAL_DB_PATH}`);
  console.log(`  Interval: ${intervalSec}s`);
  console.log(`  Window: ${parseInt(args.window, 10) || 5}s`);
  console.log(`  Limit: ${batchController.getLimit()}`);
  console.log(`  Adaptive batching: ${getAdaptiveSummary(batchController)}`);
  console.log(`  Storage budget: ${budgetOptions.enabled ? `enabled budget=${budgetOptions.budgetMb}MB reserve=${budgetOptions.reserveMb || 0}MB` : 'disabled'}`);
  console.log(`  Prune after ingest: ${shouldPruneAfterIngest() ? 'enabled' : 'disabled'}`);
  console.log(`  Backoff: ${noBackoff ? 'disabled' : 'enabled after empty rounds'}`);
  console.log(`  Max rounds: ${maxRounds === Infinity ? '∞' : maxRounds}`);
  console.log(`  Ledger: ${LEDGER_FILE} (${ledger.entries.length} entries, wm=${getLastWatermark(ledger) || 'none'})`);
  console.log('  Press Ctrl+C to stop');
  console.log('');

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;
  let overrideSince = args.since || null;

  const windowSec = parseInt(args.window, 10) || 5;

  while (round < maxRounds) {
    round++;
    const wm = loadWatermark();

    try {
      await prunePendingWatermark(wm);
      const since = overrideSince || getLastWatermark(ledger) || wm.lastWatermark;
      const limit = batchController.getLimit();
      const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);
      const roundStartTime = Date.now();
      const { data } = await requestWithTimeout('GET', queryPath, null, 60000);
      const fetchMs = Date.now() - roundStartTime;

      if (!data.urls || data.urls.length === 0) {
        batchController.recordEmpty({ fetchMs });
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        // Back off after several empty rounds
        const backoffMs = noBackoff ? intervalSec * 1000 : Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }

      consecutiveEmpty = 0;

      // ── Record batch in ledger ─────────────────────────────
      const batchId = generateBatchId();
      const urlIds = extractUrlIdsFromBatch(data);
      ledger = ledgerAppendBatch(ledger, {
        batchId,
        exportedAt: new Date().toISOString(),
        watermark: data.watermark,
        urlIds,
      });
      saveLedger(LEDGER_FILE, ledger);

      // Ingest
      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;
      const counts = getBatchCounts(data);

      totalUrls += counts.urls || 0;
      totalContent += counts.content || 0;
      const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
      if (data.watermark) overrideSince = null;

      // ── Mark confirmed in ledger ──────────────────────────
      ledger = ledgerMarkConfirmed(ledger, batchId, new Date().toISOString());
      saveLedger(LEDGER_FILE, ledger);

      // ── Mark pruned in ledger (if prune happened) ─────────
      if (pruneResult) {
        ledger = ledgerMarkPruned(ledger, batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
      }

      // ── Mirror legacy watermark ───────────────────────────
      mirrorLegacyWatermark();

      const roundMs = Date.now() - roundStartTime;
      const decision = batchController.recordSuccess({ durationMs: roundMs, fetchedRows: counts.urls, fetchMs, ingestMs });
      logAdaptiveDecision(decision);

      const ts = new Date().toLocaleTimeString();
      const pruneText = pruneResult ? `, pruned ${JSON.stringify(pruneResult.deleted)}` : '';
      console.log(`  [${round}] ${ts} — ${counts.urls} URLs, ${counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content; confirmed ${verification.checked.urls}/${verification.checked.httpResponses}/${verification.checked.content}/${verification.checked.links}${pruneText} (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms, round: ${roundMs}ms, next limit: ${batchController.getLimit()}) | Total: ${totalUrls} URLs, ${totalContent} content`);

      // ── Perf reporter ─────────────────────────────────────
      perfReporter.record({
        fetchMs,
        ingestMs,
        verifyMs: 0,
        pruneMs: pruneResult?.durationMs || 0,
        totalMs: roundMs,
        rows: counts.urls || 0,
        bytes: counts.content || 0,
      });
      if (round % perfPrintEvery === 0) {
        const s = perfReporter.summary();
        if (s.samples) {
          console.log(`  ↳ perf p50/p95 fetch=${s.fetchMs.p50}/${s.fetchMs.p95}ms ingest=${s.ingestMs.p50}/${s.ingestMs.p95}ms total=${s.totalMs.p50}/${s.totalMs.p95}ms rows/s=${s.rowsPerSec.toFixed(2)} samples=${s.samples}`);
        }
      }

      // ── Storage budget + backpressure ─────────────────────
      if (budgetOptions.enabled) {
        try {
          const { data: stats } = await requestWithTimeout('GET', '/api/content/stats', null, 10000);
          const remoteContentBytes = Number(stats?.totals?.compressed_size || stats?.totalBytes || 0);
          const budgetDecision = evaluateStorageBudget({
            remoteContentBytes,
            budgetMb: budgetOptions.budgetMb,
            reserveMb: budgetOptions.reserveMb,
            currentLimit: batchController.getLimit(),
            minLimit: parsePositiveIntArg('min-limit') || 1,
            maxLimit: parsePositiveIntArg('max-limit') || initialLimit,
          });
          if (budgetDecision.action !== 'normal') {
            console.log(`  ↳ storage budget: action=${budgetDecision.action} target-limit=${budgetDecision.targetLimit} headroom=${budgetDecision.headroomMb?.toFixed(1)}MB (${budgetDecision.reason})`);
          }
          if (budgetDecision.action !== lastBackpressureAction) {
            const bp = evaluateBackpressure({
              action: budgetDecision.action,
              currentConcurrency: parsePositiveIntArg('max-concurrent') || 10,
              normalConcurrency: parsePositiveIntArg('normal-concurrency') || parsePositiveIntArg('max-concurrent') || 10,
              reducedConcurrency: parsePositiveIntArg('reduced-concurrency') || 2,
              reason: budgetDecision.reason,
            });
            if (bp.changed) {
              try {
                await requestWithTimeout('POST', '/api/throttle', { maxConcurrent: bp.desiredConcurrency, pause: bp.pause, reason: bp.reason }, 5000);
                console.log(`  ↳ backpressure: requested maxConcurrent=${bp.desiredConcurrency} pause=${bp.pause} (${bp.reason})`);
              } catch (e) {
                // best-effort: remote may not yet expose /api/throttle
                if (!/404|not found|ECONN/i.test(e.message)) {
                  console.log(`  ↳ backpressure (skipped): ${e.message}`);
                }
              }
            }
            lastBackpressureAction = budgetDecision.action;
          }
        } catch (e) {
          // /api/content/stats failures shouldn't fail the sync loop
        }
      }

    } catch (err) {
      console.error(`  [${round}] Error: ${err.message}`);
      logAdaptiveDecision(batchController.recordError({ error: err.message }));
      consecutiveEmpty++;
    }

    await sleep(intervalSec * 1000);
  }

  console.log('');
  console.log(`  Sync complete: ${round} rounds, ${totalUrls} URLs, ${totalContent} content records pulled`);
  console.log(`  Ledger: ${ledger.entries.length} entries, last watermark=${getLastWatermark(ledger) || 'none'}`);
  closeLocalDb();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cmdRun() {
  validatePruneExportConfig();
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rapid Coordination: Start + Continuous Sync + Stop');
  console.log('═══════════════════════════════════════════════════════');

  // 1. Start domains
  console.log('  ▶ Starting domains...');
  const targetDomains = getRequestedDomains();
  if (targetDomains.length > 0) {
    await registerRequestedDomains(targetDomains);
  }
  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else if (targetDomains.length > 0) startBody.domains = targetDomains;
  applyStartOverrides(startBody);
  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);

  if (startData.results) {
    console.log(`  Started ${startData.started || startData.results.length} domain(s)`);
  } else {
    console.log(`  Started ${startData.domain || 'all'}`);
  }

  // 2. Setup graceful shutdown for Remote Sync
  let isShuttingDown = false;
  let syncRunning = true;

  const shutdown = async (sig) => {
    if (isShuttingDown) {
      console.log(`\n  [Force Quit] Double ${sig} received. Hard exiting.`);
      process.exit(1);
    }
    isShuttingDown = true;
    syncRunning = false;

    console.log(`\n  ⏹ Received ${sig}, stopping remote crawls... (Press Ctrl+C again to force quit)`);

    // Attempt to stop the same domains we started
    const stopBody = {};
    if (args.domain) stopBody.domain = args.domain;
    else if (args.domains) stopBody.domains = args.domains.split(',').map(s => s.trim());

    try {
      // Use an aggressive 5-second timeout for the shutdown hook so we don't hang
      await requestWithTimeout('POST', '/api/stop', stopBody, 5000);
      console.log('  ⏹ Remote crawls stopped successfully.');
    } catch (e) {
      console.error(`  ✗ Failed to stop remote crawls: ${e.message}`);
    }
    closeLocalDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 3. Continuous Sync Loop (instrumented — parity with cmdSync)
  const intervalSec = parseInt(args.interval, 10) || 10;
  const windowSec = parseInt(args.window, 10) || 30;
  const initialLimit = parsePositiveIntArg('limit') || 500;
  const batchController = createSyncBatchController(initialLimit);
  const noBackoff = args['no-backoff'] === true || args.noBackoff === true;
  const budgetOptions = normalizeStorageBudgetOptions(args);
  const { createInstrumentation } = require('./lib/sync-loop-instrumentation');
  const instrumentation = createInstrumentation({
    budgetOptions,
    perfPrintEvery: parsePositiveIntArg('perf-summary-every') || 10,
    initialLimit,
    argOverrides: args,
  });
  const {
    loadLedger, saveLedger, appendBatch: ledgerAppendBatch,
    markConfirmed: ledgerMarkConfirmed,
    markPruned: ledgerMarkPruned,
    generateBatchId, getLastWatermark,
  } = require('./lib/sync-ledger');
  const LEDGER_FILE = path.resolve(__dirname, '.crawl-remote-ledger.json');
  let ledger = loadLedger(LEDGER_FILE);
  const ledgerWm = getLastWatermark(ledger);
  if (ledgerWm) {
    const wm = loadWatermark();
    wm.lastWatermark = ledgerWm;
    saveWatermark(wm);
  }

  console.log(`\n  🔄 Entering continuous sync loop (every ${intervalSec}s). Press Ctrl+C to stop.`);
  console.log(`  Initial limit: ${batchController.getLimit()}`);
  console.log(`  Adaptive batching: ${getAdaptiveSummary(batchController)}`);
  console.log(`  Storage budget: ${budgetOptions.enabled ? `enabled budget=${budgetOptions.budgetMb}MB reserve=${budgetOptions.reserveMb || 0}MB` : 'disabled'}`);
  console.log(`  Prune after ingest: ${shouldPruneAfterIngest() ? 'enabled' : 'disabled'}`);
  console.log(`  Ledger: ${LEDGER_FILE} (${ledger.entries.length} entries, wm=${getLastWatermark(ledger) || 'none'})`);

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;
  let overrideSince = args.since || null;

  while (syncRunning) {
    round++;
    const wm = loadWatermark();

    try {
      await prunePendingWatermark(wm);
      const since = overrideSince || getLastWatermark(ledger) || wm.lastWatermark;
      const limit = batchController.getLimit();
      const queryPath = appendWatermark(appendExportOptions(`/api/export/batch?window=${windowSec}&limit=${limit}`), since);
      const roundStartTime = Date.now();
      // Generous 60s timeout for bulk batches
      const { data } = await requestWithTimeout('GET', queryPath, null, 60000);
      const fetchMs = Date.now() - roundStartTime;

      if (!data.urls || data.urls.length === 0) {
        batchController.recordEmpty({ fetchMs });
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        const backoffMs = noBackoff ? intervalSec * 1000 : Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }
      consecutiveEmpty = 0;

      const batchId = generateBatchId();
      ledger = ledgerAppendBatch(ledger, {
        batchId,
        exportedAt: new Date().toISOString(),
        watermark: data.watermark,
        urlIds: getBatchUrlIds(data),
      });
      saveLedger(LEDGER_FILE, ledger);

      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;
      const counts = getBatchCounts(data);

      totalUrls += counts.urls || 0;
      totalContent += counts.content || 0;
      const { verification, pruneResult } = await confirmSaveAndMaybePrune(data, wm, counts);
      if (data.watermark) overrideSince = null;
      ledger = ledgerMarkConfirmed(ledger, batchId, new Date().toISOString());
      saveLedger(LEDGER_FILE, ledger);
      if (pruneResult) {
        ledger = ledgerMarkPruned(ledger, batchId, {
          at: new Date().toISOString(),
          deleted: pruneResult.deleted,
        });
        saveLedger(LEDGER_FILE, ledger);
      }
      const roundMs = Date.now() - roundStartTime;
      const decision = batchController.recordSuccess({ durationMs: roundMs, fetchedRows: counts.urls, fetchMs, ingestMs });
      logAdaptiveDecision(decision);

      const ts = new Date().toLocaleTimeString();
      const pruneText = pruneResult ? `, pruned ${JSON.stringify(pruneResult.deleted)}` : '';
      console.log(`  [${round}] ${ts} — ${counts.urls} URLs, ${counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content; confirmed ${verification.checked.urls}/${verification.checked.httpResponses}/${verification.checked.content}/${verification.checked.links}${pruneText} (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms, round: ${roundMs}ms, next limit: ${batchController.getLimit()}) | Total: ${totalUrls} URLs, ${totalContent} content`);

      // ── Perf reporter (parity with cmdSync) ─────────────────
      const instrResult = instrumentation.onRoundSuccess({
        fetchMs, ingestMs, roundMs,
        rows: counts.urls || 0, bytes: counts.content || 0,
        pruneResult, currentLimit: batchController.getLimit(),
      });
      if (instrResult.perfLine) console.log(instrResult.perfLine);

      // ── Storage budget + backpressure (parity with cmdSync) ─
      if (budgetOptions.enabled) {
        try {
          const { data: stats } = await requestWithTimeout('GET', '/api/content/stats', null, 10000);
          const remoteContentBytes = Number(stats?.totals?.compressed_size || stats?.totalBytes || 0);
          const { budgetDecision, backpressure, transitioned } = instrumentation.evaluateBudget({
            remoteContentBytes,
            currentLimit: batchController.getLimit(),
          });
          if (budgetDecision && budgetDecision.action !== 'normal') {
            console.log(`  ↳ storage budget: action=${budgetDecision.action} target-limit=${budgetDecision.targetLimit} headroom=${budgetDecision.headroomMb?.toFixed(1)}MB (${budgetDecision.reason})`);
          }
          if (transitioned && backpressure?.changed) {
            try {
              await requestWithTimeout('POST', '/api/throttle', { maxConcurrent: backpressure.desiredConcurrency, pause: backpressure.pause, reason: backpressure.reason }, 5000);
              console.log(`  ↳ backpressure: requested maxConcurrent=${backpressure.desiredConcurrency} pause=${backpressure.pause} (${backpressure.reason})`);
            } catch (e) {
              if (!/404|not found|ECONN/i.test(e.message)) {
                console.log(`  ↳ backpressure (skipped): ${e.message}`);
              }
            }
          }
        } catch (e) {
          // /api/content/stats failures shouldn't fail the sync loop
        }
      }
    } catch (err) {
      if (syncRunning) console.error(`  [${round}] Error: ${err.message}`);
      logAdaptiveDecision(batchController.recordError({ error: err.message }));
      instrumentation.onRoundError();
      consecutiveEmpty++;
    }

    if (syncRunning) await sleep(intervalSec * 1000);
  }
}

function formatBoundedSummary(summary) {
  const running = summary.running.map(status => `${status.domain}(${status.stats?.fetched || status.stats?.done || 0})`).join(', ');
  const completed = summary.completed.map(status => `${status.domain}(${status.stats?.fetched || status.stats?.done || 0})`).join(', ');
  const notStarted = summary.notStarted.map(status => status.domain).join(', ');
  return {
    running: running || '(none)',
    completed: completed || '(none)',
    notStarted: notStarted || '(none)',
  };
}

async function cmdBounded() {
  let { data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const targetDomains = resolveTargetDomains(args, initialStatus);
  if (targetDomains.length === 0) {
    throw new Error('No target domains resolved for bounded crawl');
  }

  const maxPagesOverride = args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined;
  initialStatus = await ensureDomainsForRun(initialStatus, targetDomains, maxPagesOverride);

  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else if (args.domains) startBody.domains = targetDomains;
  applyStartOverrides(startBody);

  const pollMs = Math.max(1000, (parseInt(args.poll, 10) || 5) * 1000);
  const timeoutMs = Math.max(10000, (parseInt(args['timeout-min'], 10) || 30) * 60 * 1000);
  const startedAt = Date.now();

  const { data: startData } = await requestWithTimeout('POST', '/api/start', startBody, 15000);
  let lastProgressKey = '';

  while (Date.now() - startedAt < timeoutMs) {
    const { data: statusData } = await requestWithTimeout('GET', '/api/status', null, 10000);
    const summary = summarizeBoundedRun(statusData, targetDomains);
    const currentProgressKey = JSON.stringify({
      running: summary.running.map(domain => domain.domain),
      completed: summary.completed.map(domain => domain.domain),
      notStarted: summary.notStarted.map(domain => domain.domain),
    });

    if (!JSON_OUTPUT && currentProgressKey !== lastProgressKey) {
      const formatted = formatBoundedSummary(summary);
      console.log(`  Running: ${formatted.running}`);
      console.log(`  Completed: ${formatted.completed}`);
      console.log(`  Not started: ${formatted.notStarted}`);
      console.log('');
      lastProgressKey = currentProgressKey;
    }

    if (summary.allDone) {
      const result = {
        ok: true,
        started: startData,
        elapsedMs: Date.now() - startedAt,
        summary,
      };
      if (JSON_OUTPUT) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`  Completed ${summary.completed.length}/${summary.targetDomains.length} domains in ${formatDuration(result.elapsedMs)}`);
      }
      return;
    }

    await sleep(pollMs);
  }

  const { data: finalStatus } = await requestWithTimeout('GET', '/api/status', null, 10000);
  const finalSummary = summarizeBoundedRun(finalStatus, targetDomains);
  const formatted = formatBoundedSummary(finalSummary);
  throw new Error(
    `Timed out waiting for bounded crawl completion after ${formatDuration(timeoutMs)}. ` +
    `Running: ${formatted.running}. Not started: ${formatted.notStarted}.`
  );
}

// ── Execute Command ─────────────────────────────────────────

const COMMANDS = {
  status: cmdStatus,
  health: cmdHealth,
  start: cmdStart,
  launch: cmdLaunch,
  bounded: cmdBounded,
  stop: cmdStop,
  run: cmdRun,
  seed: cmdSeed,
  add: cmdAddDomain,
  remove: cmdRemoveDomain,
  pull: cmdPull,
  sync: cmdSync,
  errors: cmdErrors,
  content: cmdContent,
};

async function main() {
  const fn = COMMANDS[command];
  if (!fn) {
    console.error(`Unknown command: ${command}`);
    console.error(`Valid commands: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  try {
    await fn();
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    if (!JSON_OUTPUT) console.error(`  Stack: ${err.stack}`);
    process.exit(1);
  } finally {
    closeLocalDb();
  }
}

main();
