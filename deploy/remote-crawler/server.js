#!/usr/bin/env node
/**
 * Remote Crawler Server
 * ---------------------
 * Part of @copilot-dl-news/remote-crawler module.
 * 
 * Reuses database patterns from main codebase:
 * - Uses same schema structure for compatibility
 * - Crawl results can be synced back to main DB
 * 
 * Deploy: scp this directory to remote server, npm install, npm start
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const zlib = require('zlib');

// Reuse schema pattern from main codebase
const { initSchema } = require('./lib/schema');
const { CrawlWorker } = require('./lib/crawl-worker');

// Parse CLI args
const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace('--', '').split('=');
    args[key] = val || true;
});

const PORT = parseInt(args.port, 10) || 3200;
const TARGET_DOMAIN = args.domain || 'apnews.com';
const DB_FILE = args.db || `data/crawl-${TARGET_DOMAIN.replace(/[^a-z0-9]/gi, '_')}.db`;
const MAX_PAGES = parseInt(args.maxPages, 10) || 200;

console.log('=== Remote Crawler Server ===');
console.log(`Target: ${TARGET_DOMAIN}`);
console.log(`Database: ${DB_FILE}`);
console.log(`Port: ${PORT}`);
console.log(`Max pages: ${MAX_PAGES}`);

// Ensure data directory
const fs = require('fs');
const dataDir = path.dirname(DB_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database with reused schema
const db = new Database(DB_FILE);
initSchema(db);

// Initialize crawl worker
const worker = new CrawlWorker(db, { targetDomain: TARGET_DOMAIN, maxPages: MAX_PAGES });

// Express app
const app = express();
app.use(express.json());

// Status endpoint
app.get('/', (req, res) => {
    const status = worker.getStatus();
    const intel = worker.intelligence.exportIntelligence();
    res.json({
        service: 'Remote Crawler',
        version: require('./package.json').version,
        targetDomain: TARGET_DOMAIN,
        ...status,
        intelligence: {
            puppeteerRecommended: intel.puppeteerRecommended,
            puppeteerReason: intel.puppeteerReason,
            failureCounts: intel.failureCounts,
            econnresetCount: intel.econnresetCount,
        },
    });
});

app.get('/api/status', (req, res) => {
    res.json(worker.getStatus());
});

// Error diagnostics endpoint
app.get('/api/errors', (req, res) => {
    res.json(worker.getErrorSummary());
});

// Control endpoints
app.post('/api/start', (req, res) => {
    const body = req.body || {};
    const maxPages = parseInt(body.maxPages, 10) || MAX_PAGES;
    const result = worker.start(maxPages);
    res.json(result);
});

app.post('/api/stop', (req, res) => {
    worker.stop();
    res.json({ stopping: true });
});

// URL management
app.post('/api/seed', (req, res) => {
    const { urls } = req.body;
    if (!Array.isArray(urls)) {
        return res.status(400).json({ error: 'urls must be an array' });
    }
    const result = worker.seedUrls(urls);
    res.json(result);
});

app.get('/api/urls', (req, res) => {
    const status = req.query.status || 'done';
    const limit = parseInt(req.query.limit, 10) || 100;
    const urls = worker.getUrls(status, limit);
    res.json({ count: urls.length, urls });
});

// Export for syncing back to main DB
app.get('/api/export', (req, res) => {
    const data = worker.exportResults();
    res.json(data);
});

// Full export — ALL data (done URLs, error URLs, links, runs, intelligence)
// Supports incremental sync: ?since=2026-01-01T00:00:00Z&limit=5000
app.get('/api/export/full', (req, res) => {
    const since = req.query.since || null;
    const limit = parseInt(req.query.limit, 10) || 0;
    const data = worker.exportFull({ since, limit });
    res.json(data);
});

// ── Time-windowed batch export with gzip compression ──────────────────
// Near-real-time polling endpoint. Caller asks for a time window of
// activity (e.g., the last 10-20 seconds) and receives ALL data for that
// window (URLs of any status including errors/dead, discovered links,
// intelligence) compressed with gzip for efficient transfer over thin pipes.
//
// Query params:
//   since  — ISO datetime, start of window (exclusive)
//   until  — ISO datetime, end of window (inclusive, default: server now)
//   window — seconds, alternative: "last N seconds"  (overrides since)
//   limit  — max URL rows per batch (default 5000)
//
// Response: gzip-compressed JSON with X-Batch-Watermark header.
// The watermark is the latest updated_at value; pass it as ?since= on
// next poll to get only new activity.
app.get('/api/export/batch', (req, res) => {
    const since = req.query.since || null;
    const until = req.query.until || null;
    const windowSec = parseInt(req.query.window, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 5000;

    const data = worker.exportBatch({ since, until, window: windowSec, limit });
    const json = JSON.stringify(data);
    const buf = Buffer.from(json, 'utf8');

    // Always gzip — the whole point is bandwidth efficiency
    zlib.gzip(buf, { level: 6 }, (err, compressed) => {
        if (err) {
            console.error('[batch] gzip error:', err.message);
            // Fallback: send uncompressed
            res.setHeader('Content-Type', 'application/json');
            return res.send(buf);
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('X-Uncompressed-Length', String(buf.length));
        res.setHeader('X-Batch-Watermark', data.watermark || '');
        res.setHeader('X-Batch-Id', data.batchId || '');
        res.setHeader('X-Batch-Urls', String(data.counts?.urls || 0));
        res.setHeader('X-Batch-Links', String(data.counts?.links || 0));
        res.send(compressed);
    });
});

app.get('/api/export/download', (req, res) => {
    const data = worker.exportResults();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=crawl-${TARGET_DOMAIN}-${Date.now()}.json`);
    res.send(JSON.stringify(data, null, 2));
});

// ── Intelligence endpoints ────────────────────────────────────
// Export intelligence data for the fleet orchestrator
app.get('/api/intelligence', (req, res) => {
    const intel = worker.intelligence.exportIntelligence();
    res.json(intel);
});

// Receive intelligence from the fleet orchestrator
app.post('/api/intelligence', (req, res) => {
    const intel = req.body;
    if (!intel || typeof intel !== 'object') {
        return res.status(400).json({ error: 'Expected intelligence object in body' });
    }
    worker.intelligence.receiveIntelligence(intel);
    res.json({ received: true, domain: TARGET_DOMAIN });
});

// Logs
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = db.prepare(`SELECT * FROM crawl_log ORDER BY id DESC LIMIT ?`).all(limit);
    res.json({ logs });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /                   - Status (with intelligence summary)`);
    console.log(`  POST /api/start          - Start crawl (body: {maxPages})`);
    console.log(`  POST /api/stop           - Stop crawl`);
    console.log(`  POST /api/seed           - Seed URLs (body: {urls:[...]})`);
    console.log(`  GET  /api/urls           - List URLs (?status=done&limit=100)`);
    console.log(`  GET  /api/errors         - Error diagnostics & fatal state`);
    console.log(`  GET  /api/export         - Export results for sync (done URLs only)`);
    console.log(`  GET  /api/export/full    - Full export (URLs + errors + links + runs)`);
    console.log(`  GET  /api/export/batch   - Time-windowed gzip batch (?window=10&since=...)`);
    console.log(`  GET  /api/intelligence   - Export domain intelligence`);
    console.log(`  POST /api/intelligence   - Receive intelligence from orchestrator`);
    console.log(`  GET  /api/logs           - Recent logs`);
});

// \u2500\u2500 Watchdog: auto-restart stalled crawlers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const WATCHDOG_INTERVAL_MS = 120000; // 2 minutes
const WATCHDOG_MAX_RESTARTS = 3;
const watchdogState = { restarts: 0, lastDone: 0 };

const watchdog = setInterval(() => {
    const status = worker.getStatus();

    // Crawler is still running \u2014 no action needed
    if (status.isRunning) return;
    // Already in fatal state \u2014 don't retry
    if (worker._fatalState) return;

    const totalDone = status.stats?.done || 0;
    const totalUrls = status.stats?.total || 0;
    const pending = status.stats?.pending || 0;

    // Crawl never configured (no URLs at all)
    if (totalUrls === 0) return;
    // Target already reached
    if (totalDone >= MAX_PAGES) return;

    // Check if progress was made since last watchdog restart
    if (totalDone > watchdogState.lastDone) {
        watchdogState.restarts = 0; // Progress made, reset counter
    }
    watchdogState.lastDone = totalDone;

    if (watchdogState.restarts >= WATCHDOG_MAX_RESTARTS) {
        worker._fatalState = {
            reason: 'WATCHDOG_EXHAUSTED',
            message: `${watchdogState.restarts} restart attempts without progress. done=${totalDone}/${MAX_PAGES}`,
            detectedAt: new Date().toISOString(),
        };
        console.log(`[WATCHDOG] FATAL: ${worker._fatalState.message}`);
        return;
    }

    console.log(`[WATCHDOG] Crawler idle. done=${totalDone}/${MAX_PAGES}, pending=${pending}, errors=${status.stats?.errors || 0}`);

    // Reseed if queue is empty
    if (pending === 0) {
        const seeded = worker.seedUrls([`https://${TARGET_DOMAIN}`, `https://www.${TARGET_DOMAIN}`]);
        console.log(`[WATCHDOG] Reseeded: ${seeded.inserted} new URLs`);
    }

    watchdogState.restarts++;
    const result = worker.start(MAX_PAGES);
    console.log(`[WATCHDOG] Restart #${watchdogState.restarts}: ${JSON.stringify(result)}`);
}, WATCHDOG_INTERVAL_MS);
