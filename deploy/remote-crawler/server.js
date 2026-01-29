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
    res.json({
        service: 'Remote Crawler',
        version: require('./package.json').version,
        targetDomain: TARGET_DOMAIN,
        ...worker.getStatus()
    });
});

app.get('/api/status', (req, res) => {
    res.json(worker.getStatus());
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

app.get('/api/export/download', (req, res) => {
    const data = worker.exportResults();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=crawl-${TARGET_DOMAIN}-${Date.now()}.json`);
    res.send(JSON.stringify(data, null, 2));
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
    console.log(`  GET  /              - Status`);
    console.log(`  POST /api/start     - Start crawl (body: {maxPages})`);
    console.log(`  POST /api/stop      - Stop crawl`);
    console.log(`  POST /api/seed      - Seed URLs (body: {urls:[...]})`);
    console.log(`  GET  /api/urls      - List URLs (?status=done&limit=100)`);
    console.log(`  GET  /api/export    - Export results for sync`);
    console.log(`  GET  /api/logs      - Recent logs`);
});
