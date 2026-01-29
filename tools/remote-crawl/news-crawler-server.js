#!/usr/bin/env node
/**
 * news-crawler-server.js
 * ----------------------
 * Enhanced news crawler for Oracle Cloud deployment.
 * 
 * Features:
 * - Crawls news websites with sitemap detection
 * - Discovers article links from homepage/sections
 * - Tracks progress and stores results in SQLite
 * - API for monitoring and control
 * - Exports results for sync to local DB
 * 
 * Usage:
 *   node news-crawler-server.js [--port=3200] [--domain=apnews.com]
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

// Parse command line args
const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace('--', '').split('=');
    args[key] = val || true;
});

const PORT = parseInt(args.port, 10) || 3200;
const TARGET_DOMAIN = args.domain || 'apnews.com';
const DB_FILE = args.db || `crawl-${TARGET_DOMAIN.replace(/\./g, '_')}.db`;

console.log(`News Crawler Server starting...`);
console.log(`Target domain: ${TARGET_DOMAIN}`);
console.log(`Database: ${DB_FILE}`);
console.log(`Port: ${PORT}`);

// Database Setup
const db = new Database(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    host TEXT,
    path TEXT,
    status TEXT DEFAULT 'pending',
    http_status INTEGER,
    content_type TEXT,
    content_length INTEGER,
    title TEXT,
    content TEXT,
    links_found INTEGER DEFAULT 0,
    depth INTEGER DEFAULT 0,
    discovered_from TEXT,
    fetched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    error_msg TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_urls_status ON urls(status);
  CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host);
  
  CREATE TABLE IF NOT EXISTS crawl_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_domain TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    total_fetched INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running'
  );
  
  CREATE TABLE IF NOT EXISTS crawl_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    level TEXT,
    message TEXT,
    data TEXT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// App setup
const app = express();
app.use(express.json());

// Crawl state
let crawlRun = null;
let isRunning = false;
let shouldStop = false;
const stats = {
    queued: 0,
    fetched: 0,
    errors: 0,
    currentUrl: null,
    startTime: null,
    itemsPerSecond: 0
};

// Helper: Extract links from HTML
function extractLinks(html, baseUrl) {
    const links = [];
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        try {
            const resolved = new URL(match[1], baseUrl).href;
            links.push(resolved);
        } catch {
            // Invalid URL, skip
        }
    }
    return [...new Set(links)];
}

// Helper: Extract title from HTML
function extractTitle(html) {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? match[1].trim() : null;
}

// Helper: Check if URL is article-like
function isArticleUrl(url, domain) {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(domain)) return false;

    // Skip non-content paths
    const skipPatterns = [
        /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|ttf|pdf)$/i,
        /\/(feed|rss|atom|sitemap|robots)/i,
        /\/(login|logout|register|account|profile|settings)/i,
        /\/(search|tag|author|category)\//i,
    ];
    for (const pattern of skipPatterns) {
        if (pattern.test(parsed.pathname)) return false;
    }

    // Accept paths that look like articles
    const articlePatterns = [
        /\/\d{4}\/\d{2}\//, // Date-based: /2024/01/
        /\/article\//i,
        /\/story\//i,
        /\/news\//i,
        /-[a-z0-9]{6,}$/i, // Slug with ID suffix
    ];

    // Also accept section pages
    const sectionPatterns = [
        /^\/(world|politics|business|technology|science|health|sports|entertainment|opinion)$/i,
        /^\/[a-z-]+$/i, // Simple section like /world
    ];

    for (const pattern of articlePatterns) {
        if (pattern.test(parsed.pathname)) return true;
    }
    for (const pattern of sectionPatterns) {
        if (pattern.test(parsed.pathname)) return true;
    }

    // Accept if path has at least 2 segments
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.length >= 2;
}

// Fetch a single URL
async function fetchUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'NewsCrawler/1.0 (Research Bot)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            redirect: 'follow'
        });

        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        const html = await response.text();

        return {
            status: response.status,
            contentType,
            contentLength: html.length,
            html,
            finalUrl: response.url
        };
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

// Process a URL
async function processUrl(row) {
    stats.currentUrl = row.url;

    try {
        db.prepare(`UPDATE urls SET status = 'fetching' WHERE id = ?`).run(row.id);

        const result = await fetchUrl(row.url);
        const links = extractLinks(result.html, result.finalUrl);
        const title = extractTitle(result.html);

        // Find new links to queue
        let newLinksQueued = 0;
        const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO urls (url, host, path, status, depth, discovered_from)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `);

        for (const link of links) {
            if (isArticleUrl(link, TARGET_DOMAIN)) {
                try {
                    const parsed = new URL(link);
                    const info = insertStmt.run(link, parsed.hostname, parsed.pathname, row.depth + 1, row.url);
                    if (info.changes > 0) newLinksQueued++;
                } catch { }
            }
        }

        // Update this URL as done
        db.prepare(`
      UPDATE urls SET 
        status = 'done',
        http_status = ?,
        content_type = ?,
        content_length = ?,
        title = ?,
        links_found = ?,
        fetched_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result.status, result.contentType, result.contentLength, title, links.length, row.id);

        stats.fetched++;

        log('info', `Fetched: ${row.url}`, { status: result.status, links: links.length, newQueued: newLinksQueued, title });

        return { success: true, newLinksQueued };

    } catch (err) {
        db.prepare(`UPDATE urls SET status = 'error', error_msg = ? WHERE id = ?`).run(err.message, row.id);
        stats.errors++;
        log('error', `Failed: ${row.url}`, { error: err.message });
        return { success: false, error: err.message };
    }
}

// Log to database
function log(level, message, data = null) {
    const runId = crawlRun?.id || null;
    db.prepare(`INSERT INTO crawl_log (run_id, level, message, data) VALUES (?, ?, ?, ?)`).run(
        runId, level, message, data ? JSON.stringify(data) : null
    );
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
}

// Main crawl loop
async function runCrawler(maxPages = 200) {
    if (isRunning) {
        return { error: 'Crawler already running' };
    }

    isRunning = true;
    shouldStop = false;
    stats.startTime = Date.now();
    stats.fetched = 0;
    stats.errors = 0;

    // Create crawl run
    const runResult = db.prepare(`INSERT INTO crawl_runs (target_domain) VALUES (?)`).run(TARGET_DOMAIN);
    crawlRun = { id: runResult.lastInsertRowid };

    log('info', `Starting crawl of ${TARGET_DOMAIN}`, { maxPages });

    // Seed with start URL if queue is empty
    const pending = db.prepare(`SELECT COUNT(*) as c FROM urls WHERE status = 'pending'`).get();
    if (pending.c === 0) {
        const startUrl = `https://${TARGET_DOMAIN}`;
        db.prepare(`INSERT OR IGNORE INTO urls (url, host, path, depth) VALUES (?, ?, '/', 0)`).run(startUrl, TARGET_DOMAIN);
        log('info', `Seeded with: ${startUrl}`);
    }

    // Crawl loop
    let processed = 0;
    while (!shouldStop && processed < maxPages) {
        const row = db.prepare(`SELECT id, url, depth FROM urls WHERE status = 'pending' ORDER BY depth ASC, id ASC LIMIT 1`).get();

        if (!row) {
            log('info', 'No more pending URLs');
            break;
        }

        await processUrl(row);
        processed++;

        // Rate limiting
        await new Promise(r => setTimeout(r, 500));

        // Update stats
        const elapsed = (Date.now() - stats.startTime) / 1000;
        stats.itemsPerSecond = elapsed > 0 ? (stats.fetched / elapsed).toFixed(2) : 0;
    }

    // Finalize
    db.prepare(`UPDATE crawl_runs SET ended_at = CURRENT_TIMESTAMP, total_fetched = ?, total_errors = ?, status = ? WHERE id = ?`).run(
        stats.fetched, stats.errors, shouldStop ? 'stopped' : 'completed', crawlRun.id
    );

    log('info', `Crawl finished`, { fetched: stats.fetched, errors: stats.errors });

    isRunning = false;
    crawlRun = null;

    return { processed, fetched: stats.fetched, errors: stats.errors };
}

// API Routes
app.get('/', (req, res) => {
    const summary = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
    FROM urls
  `).get();

    res.json({
        service: 'News Crawler Server',
        targetDomain: TARGET_DOMAIN,
        database: DB_FILE,
        isRunning,
        stats: {
            ...stats,
            ...summary
        }
    });
});

app.get('/api/status', (req, res) => {
    const summary = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
    FROM urls
  `).get();

    const recentLogs = db.prepare(`SELECT * FROM crawl_log ORDER BY id DESC LIMIT 10`).all();

    res.json({ isRunning, stats, summary, recentLogs });
});

app.post('/api/start', async (req, res) => {
    const maxPages = parseInt(req.body.maxPages, 10) || 200;

    if (isRunning) {
        return res.json({ error: 'Already running', isRunning: true });
    }

    // Start in background
    runCrawler(maxPages).catch(err => {
        log('error', 'Crawler crashed', { error: err.message });
        isRunning = false;
    });

    res.json({ started: true, maxPages, targetDomain: TARGET_DOMAIN });
});

app.post('/api/stop', (req, res) => {
    shouldStop = true;
    res.json({ stopping: true });
});

app.get('/api/urls', (req, res) => {
    const status = req.query.status || 'done';
    const limit = parseInt(req.query.limit, 10) || 100;

    const urls = db.prepare(`
    SELECT id, url, host, title, http_status, content_length, links_found, fetched_at
    FROM urls
    WHERE status = ?
    ORDER BY fetched_at DESC
    LIMIT ?
  `).all(status, limit);

    res.json({ count: urls.length, urls });
});

app.get('/api/export', (req, res) => {
    // Export completed URLs for syncing to local DB
    const urls = db.prepare(`
    SELECT url, host, path, http_status, content_type, content_length, title, links_found, fetched_at
    FROM urls
    WHERE status = 'done'
    ORDER BY fetched_at ASC
  `).all();

    res.json({
        domain: TARGET_DOMAIN,
        count: urls.length,
        exportedAt: new Date().toISOString(),
        urls
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`   Target: ${TARGET_DOMAIN}`);
    console.log(`   POST /api/start to begin crawling`);
    console.log(`   GET /api/status for progress`);
    console.log(`   GET /api/export for results`);
});
