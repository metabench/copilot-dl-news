#!/usr/bin/env node
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
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
const path = require('path');
const {
  ensureRemoteCrawlServerSchema,
  cleanupRemoteCrawlRunningRuns,
  createRemoteCrawlRun,
  insertRemoteCrawlLog,
  markRemoteCrawlUrlFetching,
  enqueueRemoteCrawlUrls,
  completeRemoteCrawlUrl,
  failRemoteCrawlUrl,
  countRemoteCrawlPendingUrls,
  seedRemoteCrawlStartUrl,
  getNextRemoteCrawlPendingUrl,
  finalizeRemoteCrawlRun,
  interruptRemoteCrawlRun,
  getRemoteCrawlServerSummary,
  listRemoteCrawlServerRecentLogs,
  listRemoteCrawlServerUrlsByStatus,
  listRemoteCrawlServerExportRows
} = require('news-crawler-db');

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
const db = openNewsCrawlerDb(DB_FILE);
ensureRemoteCrawlServerSchema(db);

// App setup
const app = express();
app.use(express.json());

// P3 fix: Clean up any stuck runs from previous crashes at startup
try {
  const stuckRuns = cleanupRemoteCrawlRunningRuns(db);
  if (stuckRuns.length > 0) {
    console.log(`[startup] Cleaned up ${stuckRuns.length} stuck run(s) from previous session: ${stuckRuns.map(r => `#${r.id}`).join(', ')}`);
  }
} catch (cleanupErr) {
  console.warn(`[startup] Failed to clean up stuck runs: ${cleanupErr.message}`);
}

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
        markRemoteCrawlUrlFetching(db, row.id);

        const result = await fetchUrl(row.url);
        const links = extractLinks(result.html, result.finalUrl);
        const title = extractTitle(result.html);

        // Find new links to queue
        const entries = [];

        for (const link of links) {
            if (isArticleUrl(link, TARGET_DOMAIN)) {
                try {
                    const parsed = new URL(link);
                    entries.push({
                        url: link,
                        host: parsed.hostname,
                        path: parsed.pathname,
                        depth: row.depth + 1,
                        discoveredFrom: row.url
                    });
                } catch { }
            }
        }
        const { queued: newLinksQueued } = enqueueRemoteCrawlUrls(db, entries);

        // Update this URL as done
        completeRemoteCrawlUrl(db, row.id, {
            status: result.status,
            contentType: result.contentType,
            contentLength: result.contentLength,
            title,
            linksFound: links.length
        });

        stats.fetched++;

        log('info', `Fetched: ${row.url}`, { status: result.status, links: links.length, newQueued: newLinksQueued, title });

        return { success: true, newLinksQueued };

    } catch (err) {
        failRemoteCrawlUrl(db, row.id, err.message);
        stats.errors++;
        log('error', `Failed: ${row.url}`, { error: err.message });
        return { success: false, error: err.message };
    }
}

// Log to database
function log(level, message, data = null) {
    const runId = crawlRun?.id || null;
    insertRemoteCrawlLog(db, { runId, level, message, data });
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
    crawlRun = createRemoteCrawlRun(db, TARGET_DOMAIN);

    log('info', `Starting crawl of ${TARGET_DOMAIN}`, { maxPages });

    // Seed with start URL if queue is empty
    const pending = countRemoteCrawlPendingUrls(db);
    if (pending === 0) {
        const { url: startUrl } = seedRemoteCrawlStartUrl(db, TARGET_DOMAIN);
        log('info', `Seeded with: ${startUrl}`);
    }

    // Crawl loop (wrapped in try/finally to prevent stuck runs on crash)
    let processed = 0;
    let crawlStatus = 'completed';
    try {
    while (!shouldStop && processed < maxPages) {
        const row = getNextRemoteCrawlPendingUrl(db);

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
    crawlStatus = shouldStop ? 'stopped' : 'completed';
    } catch (crawlError) {
      crawlStatus = 'failed';
      log('error', `Crawl loop crashed: ${crawlError.message}`);
    } finally {
    // Finalize (always runs, even on crash)
    try {
    finalizeRemoteCrawlRun(db, {
        id: crawlRun.id,
        fetched: stats.fetched,
        errors: stats.errors,
        status: crawlStatus
    });
    } catch (finalizeErr) {
      log('error', `Failed to finalize crawl run: ${finalizeErr.message}`);
    }

    log('info', `Crawl finished`, { fetched: stats.fetched, errors: stats.errors, status: crawlStatus });

    isRunning = false;
    crawlRun = null;
    }

    return { processed, fetched: stats.fetched, errors: stats.errors };
}

// API Routes
app.get('/', (req, res) => {
    const summary = getRemoteCrawlServerSummary(db);

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
    const summary = getRemoteCrawlServerSummary(db);
    const recentLogs = listRemoteCrawlServerRecentLogs(db, { limit: 10 });

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

    const urls = listRemoteCrawlServerUrlsByStatus(db, { status, limit });

    res.json({ count: urls.length, urls });
});

app.get('/api/export', (req, res) => {
    // Export completed URLs for syncing to local DB
    const urls = listRemoteCrawlServerExportRows(db);

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

// P3 fix: Graceful shutdown — ensure stuck runs are finalized on process exit
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  shouldStop = true;
  if (crawlRun && crawlRun.id) {
    try {
      interruptRemoteCrawlRun(db, {
        id: crawlRun.id,
        fetched: stats.fetched || 0,
        errors: stats.errors || 0
      });
      console.log(`[${signal}] Finalized crawl run #${crawlRun.id} as 'interrupted'`);
    } catch (err) {
      console.error(`[${signal}] Failed to finalize run: ${err.message}`);
    }
  }
  try { db.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error(`[UNCAUGHT] ${err.message}`);
  gracefulShutdown('uncaughtException');
});
