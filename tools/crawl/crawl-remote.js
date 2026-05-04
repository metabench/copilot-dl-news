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
  bounded [--domain d|--domains d1,d2]  Start bounded crawl and wait for completion
  stop  [--domain d|--all]  Stop crawling
  run   [--domain d|--all]  Start crawling, sync continuously, and stop on exit
  seed  --domain d --urls u1,u2  Seed URLs
  add   --domain d          Add domain to server
  remove --domain d         Remove domain from server
  pull  [--window 10]       Pull one batch to local DB
  sync  [--interval 10]     Continuous batch sync loop
  errors [--limit 50]       Show recent errors
  content                   Content stats by domain

Options:
  --host <host:port>     Remote server (default: env/resolver or 141.144.193.218:3200)
  --db <path>            Local DB path (default: data/news.db)
  --domain <domain>      Target domain for start/stop/seed/add/remove
  --all                  Affect all domains
  --window <seconds>     Batch window in seconds (default: 10)
  --interval <seconds>   Sync polling interval (default: 10)
  --limit <n>            Limit for queries (default: 500)
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
  const Database = require('better-sqlite3');
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`Local DB not found: ${LOCAL_DB_PATH}`);
    process.exit(1);
  }
  localDb = new Database(LOCAL_DB_PATH);
  localDb.pragma('journal_mode = WAL');
  localDb.pragma('busy_timeout = 5000');
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
  const windowSec = parseInt(args.window, 10) || 10;
  const limit = parseInt(args.limit, 10) || 500;
  const wm = loadWatermark();

  // Build query with watermark for incremental sync
  let queryPath = `/api/export/batch?window=${windowSec}&limit=${limit}`;
  if (wm.lastWatermark) {
    queryPath += `&since=${encodeURIComponent(wm.lastWatermark)}`;
  }

  console.log(`  Pulling batch from ${REMOTE_HOST}...`);
  console.log(`  Window: ${windowSec}s, Limit: ${limit}, Watermark: ${wm.lastWatermark || '(none)'}`);

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

  // Update watermark
  if (data.watermark) {
    wm.lastWatermark = data.watermark;
    wm.lastPullAt = new Date().toISOString();
    wm.totalPulled = (wm.totalPulled || 0) + (counts.urls || 0);
    saveWatermark(wm);
  }

  console.log(`  Ingested: ${result.urlsInserted || 0} URLs, ${result.contentInserted || 0} content, ${result.responsesInserted || 0} responses (${ingestMs}ms)`);
  console.log(`  Total pulled this session: ${wm.totalPulled}`);

  return { urls: counts.urls, content: counts.content, fetchMs, ingestMs, ...result };
}

async function cmdSync() {
  const intervalSec = parseInt(args.interval, 10) || 10;
  const maxRounds = args.rounds ? parseInt(args.rounds, 10) : Infinity;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Continuous Sync Loop');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Remote: ${REMOTE_HOST}`);
  console.log(`  Local DB: ${LOCAL_DB_PATH}`);
  console.log(`  Interval: ${intervalSec}s`);
  console.log(`  Max rounds: ${maxRounds === Infinity ? '∞' : maxRounds}`);
  console.log('  Press Ctrl+C to stop');
  console.log('');

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;

  const windowSec = parseInt(args.window, 10) || 30; // Wider window for sync to catch up

  while (round < maxRounds) {
    round++;
    const wm = loadWatermark();
    let queryPath = `/api/export/batch?window=${windowSec}&limit=500`;
    if (wm.lastWatermark) {
      queryPath += `&since=${encodeURIComponent(wm.lastWatermark)}`;
    }

    try {
      const startTime = Date.now();
      const { data } = await request('GET', queryPath);
      const fetchMs = Date.now() - startTime;

      if (!data.urls || data.urls.length === 0) {
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        // Back off after several empty rounds
        const backoffMs = Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }

      consecutiveEmpty = 0;

      // Ingest
      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;

      totalUrls += data.counts.urls || 0;
      totalContent += data.counts.content || 0;

      // Update watermark
      if (data.watermark) {
        wm.lastWatermark = data.watermark;
        wm.lastPullAt = new Date().toISOString();
        wm.totalPulled = (wm.totalPulled || 0) + (data.counts.urls || 0);
        saveWatermark(wm);
      }

      const ts = new Date().toLocaleTimeString();
      console.log(`  [${round}] ${ts} — ${data.counts.urls} URLs, ${data.counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms) | Total: ${totalUrls} URLs, ${totalContent} content`);

    } catch (err) {
      console.error(`  [${round}] Error: ${err.message}`);
      consecutiveEmpty++;
    }

    await sleep(intervalSec * 1000);
  }

  console.log('');
  console.log(`  Sync complete: ${round} rounds, ${totalUrls} URLs, ${totalContent} content records pulled`);
  closeLocalDb();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cmdRun() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rapid Coordination: Start + Continuous Sync + Stop');
  console.log('═══════════════════════════════════════════════════════');

  // 1. Start domains
  console.log('  ▶ Starting domains...');
  const startBody = {};
  if (args.domain) startBody.domain = args.domain;
  else if (args.domains) startBody.domains = args.domains.split(',').map(s => s.trim());
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

  // 3. Continuous Sync Loop
  const intervalSec = parseInt(args.interval, 10) || 10;
  const windowSec = parseInt(args.window, 10) || 30;
  console.log(`\n  🔄 Entering continuous sync loop (every ${intervalSec}s). Press Ctrl+C to stop.`);

  let round = 0;
  let totalUrls = 0;
  let totalContent = 0;
  let consecutiveEmpty = 0;

  while (syncRunning) {
    round++;
    const wm = loadWatermark();
    let queryPath = `/api/export/batch?window=${windowSec}&limit=500`;
    if (wm.lastWatermark) {
      queryPath += `&since=${encodeURIComponent(wm.lastWatermark)}`;
    }

    try {
      const startTime = Date.now();
      // Generous 60s timeout for bulk batches
      const { data } = await requestWithTimeout('GET', queryPath, null, 60000);
      const fetchMs = Date.now() - startTime;

      if (!data.urls || data.urls.length === 0) {
        consecutiveEmpty++;
        const dot = consecutiveEmpty > 3 ? '.' : '';
        process.stdout.write(`  [${round}] No new data (${fetchMs}ms)${dot}\r`);

        const backoffMs = Math.min(consecutiveEmpty * 2000, 30000);
        await sleep(Math.max(intervalSec * 1000, backoffMs));
        continue;
      }
      consecutiveEmpty = 0;

      const ingestStart = Date.now();
      const result = ingestBatch(data);
      const ingestMs = Date.now() - ingestStart;

      totalUrls += data.counts.urls || 0;
      totalContent += data.counts.content || 0;

      if (data.watermark) {
        wm.lastWatermark = data.watermark;
        wm.lastPullAt = new Date().toISOString();
        wm.totalPulled = (wm.totalPulled || 0) + (data.counts.urls || 0);
        saveWatermark(wm);
      }

      const ts = new Date().toLocaleTimeString();
      console.log(`  [${round}] ${ts} — ${data.counts.urls} URLs, ${data.counts.content} content → ${result.urlsInserted || 0} new URLs, ${result.contentInserted || 0} new content (fetch: ${fetchMs}ms, ingest: ${ingestMs}ms)`);
    } catch (err) {
      if (syncRunning) console.error(`  [${round}] Error: ${err.message}`);
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
  const missingDomains = findMissingDomains(initialStatus, targetDomains);
  for (const domain of missingDomains) {
    const body = { domain };
    if (maxPagesOverride) body.maxPages = maxPagesOverride;
    const { data: addData } = await requestWithTimeout('POST', '/api/domains/add', body, 15000);
    if (addData?.error) {
      throw new Error(`Failed to register bounded crawl domain ${domain}: ${addData.error}`);
    }
    if (!JSON_OUTPUT) {
      console.log(`  Registered remote domain: ${domain}${maxPagesOverride ? ` (maxPages=${maxPagesOverride})` : ''}`);
    }
  }

  if (missingDomains.length > 0) {
    ({ data: initialStatus } = await requestWithTimeout('GET', '/api/status', null, 10000));
  }

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
