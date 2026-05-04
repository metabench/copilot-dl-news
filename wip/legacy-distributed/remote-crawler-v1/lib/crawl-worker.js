/**
 * Crawl Worker - reusable crawl logic
 * 
 * Designed to be importable and testable.
 * Can be used by server or CLI.
 * 
 * Features:
 * - Adaptive rate limiting (robots.txt + learned from 429s)
 * - Link discovery and classification
 * - Progress tracking and export
 */

const { RateLimiter } = require('./rate-limiter');
const { DomainIntelligence } = require('./domain-intelligence');
const { RemoteDiagnosticEngine, remediate, HealingTracker } = require('./self-healing');

class CrawlWorker {
    constructor(db, options = {}) {
        this.db = db;
        this.targetDomain = options.targetDomain || 'example.com';
        this.maxPages = options.maxPages || 200;
        this.rateLimitMs = options.rateLimitMs || 500;

        this.isRunning = false;
        this.shouldStop = false;
        this.currentRun = null;

        this.stats = {
            fetched: 0,
            errors: 0,
            queued: 0,
            currentUrl: null,
            startTime: null,
            itemsPerSecond: 0,
            totalBytesDownloaded: 0,
            softFailures: 0,
            authBoundaries: 0
        };

        // Fatal state: set when crawler encounters unrecoverable errors
        this._fatalState = null;

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(db, {
            targetDomain: this.targetDomain,
            defaultIntervalMs: this.rateLimitMs
        });

        // Initialize domain intelligence tracker
        this.intelligence = new DomainIntelligence(db, {
            targetDomain: this.targetDomain
        });
        this.intelligence.load();

        // Initialize self-healing pipeline
        this.diagnosticEngine = new RemoteDiagnosticEngine();
        this.healingTracker = new HealingTracker(200);

        // Puppeteer fetcher (lazy init — only created when a domain needs it)
        this._puppeteerFetcher = null;
        this._puppeteerRecommended = false;

        // Prepare statements
        this._prepareStatements();
    }

    _prepareStatements() {
        this.stmts = {
            insertUrl: this.db.prepare(`
        INSERT OR IGNORE INTO urls (url, host, path, status, depth, discovered_from)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `),
            updateFetching: this.db.prepare(`UPDATE urls SET status = 'fetching' WHERE id = ?`),
            updateDone: this.db.prepare(`
        UPDATE urls SET 
          status = 'done',
          http_status = ?,
          content_type = ?,
          content_length = ?,
          title = ?,
          word_count = ?,
          links_found = ?,
          classification = ?,
          fetched_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
            updateError: this.db.prepare(`
        UPDATE urls SET status = 'error', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),
            getNextPending: this.db.prepare(`
        SELECT id, url, depth FROM urls 
        WHERE status = 'pending' AND (host = ? OR host LIKE ?)
        ORDER BY depth ASC, id ASC LIMIT 1
      `),
            getStats: this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'fetching' THEN 1 ELSE 0 END) as fetching,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
        FROM urls
      `),
            getDomainStats: this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM urls
        WHERE (host = ? OR host LIKE ?)
      `),
            insertLog: this.db.prepare(`INSERT INTO crawl_log (run_id, level, message, data) VALUES (?, ?, ?, ?)`),
            insertRun: this.db.prepare(`INSERT INTO crawl_runs (target_domain) VALUES (?)`),
            finishRun: this.db.prepare(`
        UPDATE crawl_runs SET ended_at = CURRENT_TIMESTAMP, total_fetched = ?, total_errors = ?, status = ? WHERE id = ?
      `),
            getUrls: this.db.prepare(`
        SELECT id, url, host, title, http_status, content_length, links_found, classification, fetched_at
        FROM urls WHERE status = ? ORDER BY fetched_at DESC LIMIT ?
      `),
            exportUrls: this.db.prepare(`
        SELECT url, host, path, http_status, content_type, content_length, title, word_count, links_found, classification, fetched_at
        FROM urls WHERE status = 'done' ORDER BY fetched_at ASC
      `),
            getErroredUrls: this.db.prepare(`
        SELECT id, url, depth FROM urls
        WHERE status = 'error' AND (host = ? OR host LIKE ?)
        ORDER BY id ASC LIMIT ?
      `),
            resetUrlToPending: this.db.prepare(`
        UPDATE urls SET status = 'pending', error_msg = NULL WHERE id = ?
      `),
            getErrorSummary: this.db.prepare(`
        SELECT error_msg, COUNT(*) as count
        FROM urls WHERE status = 'error'
        GROUP BY error_msg ORDER BY count DESC LIMIT ?
      `),
            getRecentErrors: this.db.prepare(`
        SELECT url, error_msg, updated_at
        FROM urls WHERE status = 'error'
        ORDER BY updated_at DESC LIMIT ?
      `)
        };
    }

    log(level, message, data = null) {
        const runId = this.currentRun?.id || null;
        this.stmts.insertLog.run(runId, level, message, data ? JSON.stringify(data) : null);
        console.log(`[${level.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');
    }

    getStatus() {
        const dbStats = this.stmts.getStats.get();
        const rateLimitStatus = this.rateLimiter.getStatus();
        return {
            isRunning: this.isRunning,
            targetDomain: this.targetDomain,
            fatalState: this._fatalState,
            rateLimiting: {
                currentIntervalMs: rateLimitStatus.currentIntervalMs,
                currentRpm: rateLimitStatus.currentRpm,
                robotsCrawlDelayMs: rateLimitStatus.robotsCrawlDelayMs,
                isRateLimited: rateLimitStatus.isRateLimited,
                limitReason: rateLimitStatus.limitReason,
                consecutiveSuccesses: rateLimitStatus.consecutiveSuccesses,
                consecutive429s: rateLimitStatus.consecutive429s,
                total429s: rateLimitStatus.total429s,
                totalRequests: rateLimitStatus.totalRequests,
                backoffUntil: rateLimitStatus.backoffUntil
            },
            healing: {
                stats: this.healingTracker.getStats(),
                puppeteerActive: this._puppeteerRecommended,
                puppeteerBrowserRunning: !!this._puppeteerFetcher,
                recentEvents: this.healingTracker.getRecent(5),
            },
            stats: { ...this.stats, ...dbStats }
        };
    }

    getUrls(status, limit) {
        return this.stmts.getUrls.all(status, limit);
    }

    exportResults() {
        const urls = this.stmts.exportUrls.all();
        return {
            domain: this.targetDomain,
            count: urls.length,
            exportedAt: new Date().toISOString(),
            urls
        };
    }

    /**
     * Export ALL crawl data for comprehensive sync to main DB.
     * Includes done URLs, error URLs, discovered links, crawl runs, and intelligence.
     * Supports incremental sync via `since` parameter.
     *
     * @param {object} [options]
     * @param {string} [options.since] - ISO datetime; only export records updated after this time
     * @param {number} [options.limit=0] - Max URLs to return (0 = unlimited)
     * @returns {{ domain, exportedAt, since, counts, urls, links, runs, intelligence }}
     */
    exportFull(options = {}) {
        const since = options.since || null;
        const limit = options.limit || 0;

        // 1. All done + error URLs (the valuable data)
        let urlSql = `SELECT id, url, host, path, status, http_status, content_type,
            content_length, title, word_count, links_found, depth, discovered_from,
            classification, fetched_at, created_at, updated_at, error_msg
            FROM urls WHERE status IN ('done', 'error')`;
        const urlParams = [];
        if (since) {
            urlSql += ` AND updated_at > ?`;
            urlParams.push(since);
        }
        urlSql += ` ORDER BY updated_at ASC`;
        if (limit > 0) {
            urlSql += ` LIMIT ?`;
            urlParams.push(limit);
        }
        const urls = this.db.prepare(urlSql).all(...urlParams);

        // 2. Discovered links (for link graph reconstruction)
        let linkSql = `SELECT dl.id, dl.source_url_id, u.url AS source_url,
            dl.target_url, dl.link_text, dl.is_nav_link, dl.created_at
            FROM discovered_links dl
            JOIN urls u ON dl.source_url_id = u.id`;
        const linkParams = [];
        if (since) {
            linkSql += ` WHERE dl.created_at > ?`;
            linkParams.push(since);
        }
        linkSql += ` ORDER BY dl.created_at ASC`;
        const links = this.db.prepare(linkSql).all(...linkParams);

        // 3. Crawl runs (for provenance tracking)
        const runs = this.db.prepare(
            `SELECT id, target_domain, started_at, ended_at, total_fetched, total_errors, status
             FROM crawl_runs ORDER BY started_at DESC`
        ).all();

        // 4. Domain intelligence
        let intelligence = null;
        try {
            intelligence = this.intelligence.exportIntelligence();
        } catch (_) { /* intelligence is optional */ }

        return {
            domain: this.targetDomain,
            exportedAt: new Date().toISOString(),
            since,
            counts: {
                urls: urls.length,
                links: links.length,
                runs: runs.length,
            },
            urls,
            links,
            runs,
            intelligence,
        };
    }

    /**
     * Export a time-windowed batch of crawl activity.
     * Returns ALL URLs (any status) updated within the window, plus links
     * discovered in the same window. Designed for near-real-time polling
     * (e.g., every 10-20s) with gzip compression on the wire.
     *
     * @param {object} [options]
     * @param {string} [options.since]  - ISO datetime: start of window (exclusive)
     * @param {string} [options.until]  - ISO datetime: end of window (inclusive, default: now)
     * @param {number} [options.window] - Seconds: alternative to since/until — "last N seconds"
     * @param {number} [options.limit=5000] - Max URL records per batch
     * @returns {{ domain, batchId, window: {since, until}, watermark, counts, urls, links, currentRun, intelligence }}
     */
    exportBatch(options = {}) {
        const limit = options.limit || 5000;
        const now = new Date();
        const nowIso = now.toISOString();

        // Resolve time window
        let since, until;
        if (options.window && options.window > 0) {
            until = options.until || nowIso;
            const sinceDate = new Date(new Date(until).getTime() - options.window * 1000);
            since = sinceDate.toISOString();
        } else {
            since = options.since || new Date(now.getTime() - 30000).toISOString(); // default: last 30s
            until = options.until || nowIso;
        }

        // 1. ALL URLs updated in the time window (any status — done, error, fetching, pending)
        const urls = this.db.prepare(`
            SELECT id, url, host, path, status, http_status, content_type,
                content_length, title, word_count, links_found, depth, discovered_from,
                classification, fetched_at, created_at, updated_at, error_msg
            FROM urls
            WHERE updated_at > ? AND updated_at <= ?
            ORDER BY updated_at ASC
            LIMIT ?
        `).all(since, until, limit);

        // 2. Discovered links created in the window
        const links = this.db.prepare(`
            SELECT dl.id, dl.source_url_id, u.url AS source_url,
                dl.target_url, dl.link_text, dl.is_nav_link, dl.created_at
            FROM discovered_links dl
            JOIN urls u ON dl.source_url_id = u.id
            WHERE dl.created_at > ? AND dl.created_at <= ?
            ORDER BY dl.created_at ASC
        `).all(since, until);

        // 3. Current crawl run info (if active)
        let currentRun = null;
        if (this.currentRun) {
            const run = this.db.prepare(
                `SELECT id, target_domain, started_at, ended_at, total_fetched, total_errors, status
                 FROM crawl_runs WHERE id = ?`
            ).get(this.currentRun.id);
            currentRun = run || null;
        }

        // 4. Domain intelligence snapshot
        let intelligence = null;
        try {
            intelligence = this.intelligence.exportIntelligence();
        } catch (_) { /* optional */ }

        // 5. Watermark: latest updated_at across all returned URLs
        let watermark = since;
        if (urls.length > 0) {
            watermark = urls[urls.length - 1].updated_at || since;
        }

        // Unique batch ID for tracking
        const batchId = `${this.targetDomain}:${Date.now().toString(36)}`;

        return {
            domain: this.targetDomain,
            batchId,
            window: { since, until },
            watermark,
            exportedAt: nowIso,
            counts: {
                urls: urls.length,
                links: links.length,
                hasMore: urls.length >= limit,
            },
            urls,
            links,
            currentRun,
            intelligence,
        };
    }

    seedUrls(urls) {
        let inserted = 0;
        for (const url of urls) {
            try {
                const parsed = new URL(url);
                const info = this.stmts.insertUrl.run(url, parsed.hostname, parsed.pathname, 0, 'seed');
                if (info.changes > 0) inserted++;
            } catch (e) {
                this.log('warn', `Invalid URL: ${url}`, { error: e.message });
            }
        }
        this.log('info', `Seeded ${inserted}/${urls.length} URLs`);
        return { inserted, total: urls.length };
    }

    // URL classification helpers
    _isValidUrl(url) {
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.includes(this.targetDomain)) return false;

            // Skip non-content
            const skipPatterns = [
                /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|ttf|pdf|xml|json)$/i,
                /\/(feed|rss|atom|sitemap|robots)/i,
                /\/(login|logout|register|account|profile|settings|preferences)/i,
                /\/(search|tag|author|newsletter|subscription)/i,
                /#/,  // Skip anchors
            ];
            for (const p of skipPatterns) {
                if (p.test(url)) return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    _classifyUrl(url, title, wordCount, linksFound) {
        // Simple classification logic
        const path = new URL(url).pathname;

        // Likely article: has date pattern or "article/story" in path
        if (/\/\d{4}\/\d{2}\//.test(path) || /\/(article|story)\//.test(path)) {
            return 'article';
        }

        // Likely hub: section page
        if (/^\/[a-z-]+\/?$/i.test(path) && linksFound > 10) {
            return 'hub';
        }

        // Use word count as heuristic
        if (wordCount > 300) return 'article';
        if (linksFound > 20) return 'hub';

        return 'other';
    }

    _extractLinks(html, baseUrl) {
        const links = [];
        const linkRegex = /<a\s+[^>]*href=["']([^"'#]+)["']/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            try {
                const resolved = new URL(match[1], baseUrl).href;
                if (this._isValidUrl(resolved)) {
                    links.push(resolved);
                }
            } catch { }
        }
        return [...new Set(links)];
    }

    _extractTitle(html) {
        const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        return match ? match[1].trim().replace(/\s+/g, ' ') : null;
    }

    _countWords(html) {
        // Simple word count from visible text
        const textOnly = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');
        return textOnly.split(' ').filter(w => w.length > 2).length;
    }

    async _fetchUrl(url) {
        // If Puppeteer is recommended, try browser fetch first
        if (this._puppeteerRecommended) {
            try {
                return await this._fetchUrlWithPuppeteer(url);
            } catch (puppErr) {
                this.log('warn', `Puppeteer fetch failed, falling back to HTTP: ${puppErr.message}`);
                // Fall through to normal fetch
            }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
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
                finalUrl: response.url,
                headers: Object.fromEntries(response.headers.entries()),
                viaPuppeteer: false
            };
        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    }

    /**
     * Fetch a URL using Puppeteer (headless browser)
     * @param {string} url
     * @returns {Promise<Object>}
     */
    async _fetchUrlWithPuppeteer(url) {
        const browser = await this._ensurePuppeteerBrowser();
        const page = await browser.newPage();

        try {
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            );
            await page.setViewport({ width: 1920, height: 1080 });

            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 45000,
            });

            const html = await page.content();
            const status = response ? response.status() : 200;
            const contentType = response ? (response.headers()['content-type'] || 'text/html') : 'text/html';

            return {
                status,
                contentType,
                contentLength: html.length,
                html,
                finalUrl: page.url(),
                headers: response ? response.headers() : {},
                viaPuppeteer: true,
            };
        } finally {
            await page.close().catch(() => {});
        }
    }

    /**
     * Lazily create a Puppeteer browser instance
     * @returns {Promise<import('puppeteer').Browser>}
     */
    async _ensurePuppeteerBrowser() {
        if (this._puppeteerFetcher) return this._puppeteerFetcher;

        try {
            const puppeteer = require('puppeteer-core');
            // Use system chromium (installed via apt/snap on the remote VM)
            const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
                || '/usr/bin/chromium-browser'
                || '/snap/bin/chromium';
            this._puppeteerFetcher = await puppeteer.launch({
                executablePath,
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process',
                ],
            });
            this.log('info', `Puppeteer browser launched (${executablePath})`);
            return this._puppeteerFetcher;
        } catch (err) {
            this.log('warn', `Puppeteer not available: ${err.message}`);
            this._puppeteerRecommended = false; // Disable future attempts
            throw err;
        }
    }

    /**
     * Close Puppeteer browser if open
     */
    async closePuppeteer() {
        if (this._puppeteerFetcher) {
            try {
                await this._puppeteerFetcher.close();
            } catch { /* ignore */ }
            this._puppeteerFetcher = null;
        }
    }

    /**
     * Get structured error summary for diagnostics and dashboard reporting.
     * @returns {{ domain: string, totalErrors: number, fatalState: Object|null, byMessage: Array, recent: Array }}
     */
    getErrorSummary() {
        const byMessage = this.stmts.getErrorSummary.all(20);
        const recent = this.stmts.getRecentErrors.all(10);
        return {
            domain: this.targetDomain,
            totalErrors: byMessage.reduce((a, e) => a + e.count, 0),
            fatalState: this._fatalState,
            byMessage,
            recent,
        };
    }

    /**
     * Attempt stall recovery by re-queuing errored URLs for retry.
     * @returns {number} Number of URLs re-queued
     */
    _attemptStallRecovery() {
        const errored = this.stmts.getErroredUrls.all(
            this.targetDomain, `%${this.targetDomain}%`, 30
        );
        if (errored.length === 0) return 0;
        let requeued = 0;
        for (const row of errored) {
            this.stmts.resetUrlToPending.run(row.id);
            requeued++;
        }
        return requeued;
    }

    async _processUrl(row) {
        this.stats.currentUrl = row.url;

        try {
            this.stmts.updateFetching.run(row.id);

            const result = await this._fetchUrl(row.url);

            // ── HTTP error responses (4xx, 5xx) → diagnose and treat as errors ──
            if (result.status >= 400) {
                const httpDiag = this.diagnosticEngine.diagnose({
                    statusCode: result.status,
                    errorMessage: null,
                    body: result.html ? result.html.slice(0, 5000) : null,
                    headers: result.headers || {},
                    domain: this.targetDomain,
                });
                const rem = remediate(httpDiag, {
                    domain: this.targetDomain,
                    headers: result.headers || {},
                    diagnosticEngine: this.diagnosticEngine,
                });
                this.healingTracker.record(this.targetDomain, httpDiag, rem);
                this.log('warn', `HTTP ${result.status}: ${httpDiag.type} → ${rem.action}`, {
                    url: row.url, viaPuppeteer: result.viaPuppeteer || false,
                });
                if (rem.puppeteerUpgrade && !this._puppeteerRecommended) {
                    this._puppeteerRecommended = true;
                    this.log('info', `Puppeteer upgrade triggered by HTTP ${result.status}`);
                }
                if (httpDiag.type === 'AUTH_REQUIRED') this.stats.authBoundaries++;
                this.stmts.updateError.run(`HTTP ${result.status}: ${httpDiag.message}`, row.id);
                this.stats.errors++;
                this.rateLimiter.recordResponse(result.status);
                this.intelligence.recordResult({
                    url: row.url, httpStatus: result.status, errorMessage: httpDiag.message,
                    responseBody: result.html, contentLength: result.contentLength,
                });
                if (rem.delayMs > 0 && rem.delayMs > 5000) {
                    this.log('info', `Healing delay: ${rem.delayMs}ms`);
                    await new Promise(r => setTimeout(r, rem.delayMs));
                }
                return { success: false, error: `HTTP ${result.status}: ${httpDiag.message}`, healingType: httpDiag.type, httpStatus: result.status };
            }

            const links = this._extractLinks(result.html, result.finalUrl);
            const title = this._extractTitle(result.html);
            const wordCount = this._countWords(result.html);
            const classification = this._classifyUrl(row.url, title, wordCount, links.length);

            // ── Self-healing: check for soft failures (200 but blocked content) ──
            if (result.status >= 200 && result.status < 400) {
                const softDiag = this.diagnosticEngine.diagnose({
                    statusCode: result.status,
                    errorMessage: null,
                    body: result.html.slice(0, 5000),
                    headers: result.headers || {},
                    domain: this.targetDomain,
                });
                if (softDiag.type !== 'UNKNOWN' && softDiag.confidence > 0.7) {
                    const rem = remediate(softDiag, {
                        domain: this.targetDomain,
                        headers: result.headers || {},
                        diagnosticEngine: this.diagnosticEngine,
                    });
                    this.healingTracker.record(this.targetDomain, softDiag, rem);
                    this.log('warn', `Soft failure detected on 200: ${softDiag.type} → ${rem.action}`, {
                        url: row.url, viaPuppeteer: result.viaPuppeteer,
                    });
                    if (rem.puppeteerUpgrade && !this._puppeteerRecommended) {
                        this._puppeteerRecommended = true;
                        this.log('info', `Puppeteer upgrade triggered by ${softDiag.type}`);
                    }
                    // Track soft failure stats for fatal detection
                    this.stats.softFailures++;
                    if (softDiag.type === 'AUTH_REQUIRED') this.stats.authBoundaries++;
                }
            }

            // Queue new links
            let newLinksQueued = 0;
            for (const link of links) {
                try {
                    const parsed = new URL(link);
                    const info = this.stmts.insertUrl.run(link, parsed.hostname, parsed.pathname, row.depth + 1, row.url);
                    if (info.changes > 0) newLinksQueued++;
                } catch { }
            }

            // Mark done
            this.stmts.updateDone.run(
                result.status,
                result.contentType,
                result.contentLength,
                title,
                wordCount,
                links.length,
                classification,
                row.id
            );

            this.stats.fetched++;
            this.stats.totalBytesDownloaded += result.contentLength || 0;

            // Record success with rate limiter
            this.rateLimiter.recordResponse(result.status);

            // Record with intelligence tracker
            this.intelligence.recordResult({
                url: row.url,
                httpStatus: result.status,
                errorMessage: null,
                responseBody: result.html,
                contentLength: result.contentLength,
            });

            // Reset consecutive error count on success
            this.diagnosticEngine.resetDomain(this.targetDomain);

            this.log('info', `Fetched: ${row.url}`, {
                status: result.status,
                links: links.length,
                newQueued: newLinksQueued,
                classification,
                title: title?.substring(0, 50),
                viaPuppeteer: result.viaPuppeteer || false,
            });

            return { success: true, newLinksQueued, httpStatus: result.status };

        } catch (err) {
            // ── Self-healing pipeline for hard errors ──
            const diagnosis = this.diagnosticEngine.diagnose({
                statusCode: null,
                errorMessage: err.message,
                body: null,
                headers: {},
                domain: this.targetDomain,
            });

            const rem = remediate(diagnosis, {
                domain: this.targetDomain,
                headers: {},
                diagnosticEngine: this.diagnosticEngine,
            });

            this.healingTracker.record(this.targetDomain, diagnosis, rem);

            this.log('warn', `Self-healing: ${diagnosis.type} → ${rem.action}`, {
                url: row.url,
                retry: rem.retry,
                delayMs: rem.delayMs,
                puppeteerUpgrade: rem.puppeteerUpgrade,
            });

            // Upgrade to Puppeteer if recommended
            if (rem.puppeteerUpgrade && !this._puppeteerRecommended) {
                this._puppeteerRecommended = true;
                this.log('info', `Puppeteer upgrade triggered by ${diagnosis.type}`);
            }

            this.stmts.updateError.run(err.message, row.id);
            this.stats.errors++;

            // Record error with rate limiter
            if (err.message && err.message.includes('aborted')) {
                this.rateLimiter.recordResponse(408);
            }

            // Record with intelligence tracker
            this.intelligence.recordResult({
                url: row.url,
                httpStatus: null,
                errorMessage: err.message,
                responseBody: null,
                contentLength: 0,
            });

            this.log('error', `Failed: ${row.url}`, { error: err.message });

            // Apply remediation delay (DNS pause, server error backoff, etc.)
            if (rem.delayMs > 0 && rem.delayMs > 5000) {
                this.log('info', `Healing delay: ${rem.delayMs}ms`);
                await new Promise(r => setTimeout(r, rem.delayMs));
            }

            return { success: false, error: err.message, healing: rem, healingType: diagnosis.type };
        }
    }

    start(maxPages = this.maxPages) {
        if (this.isRunning) {
            return { error: 'Already running' };
        }

        this._fatalState = null; // Clear fatal state on explicit restart
        this.isRunning = true;
        this.shouldStop = false;
        this.maxPages = maxPages;

        // Start async
        this._runCrawl().catch(err => {
            this.log('error', 'Crawler crashed', { error: err.message });
            this.isRunning = false;
        });

        return { started: true, maxPages };
    }

    stop() {
        this.shouldStop = true;
        this.log('info', 'Stop requested');
    }

    async _runCrawl() {
        this.stats.startTime = Date.now();
        this.stats.fetched = 0;
        this.stats.errors = 0;
        this.stats.totalBytesDownloaded = 0;
        this.stats.softFailures = 0;
        this.stats.authBoundaries = 0;

        // Create run record
        const runResult = this.stmts.insertRun.run(this.targetDomain);
        this.currentRun = { id: runResult.lastInsertRowid };

        this.log('info', `Starting crawl of ${this.targetDomain}`, { maxPages: this.maxPages });

        // Check if intelligence recommends Puppeteer for this domain
        const intel = this.intelligence.exportIntelligence();
        if (intel.puppeteerRecommended && !this._puppeteerRecommended) {
            this._puppeteerRecommended = true;
            this.log('info', `Puppeteer enabled from intelligence: ${intel.puppeteerReason}`);
        }

        // Fetch robots.txt to check for Crawl-delay
        this.log('info', 'Checking robots.txt for rate limits...');
        await this.rateLimiter.fetchRobotsTxt();

        // Log current rate limit status
        const rateStatus = this.rateLimiter.getStatus();
        this.log('info', 'Rate limit status', {
            intervalMs: rateStatus.currentIntervalMs,
            rpm: rateStatus.currentRpm,
            isLimited: rateStatus.isRateLimited,
            reason: rateStatus.limitReason,
            historical429s: rateStatus.total429s
        });

        // Seed if empty
        const dbStats = this.stmts.getDomainStats.get(this.targetDomain, `%${this.targetDomain}%`);
        if (dbStats.total === 0) {
            const startUrl = `https://${this.targetDomain}`;
            this.seedUrls([startUrl]);
        }

        // Crawl loop with fatal error detection + stall recovery
        let processed = 0;
        let consecutiveErrors = 0;
        const errorTypeCounts = {};
        let stallRecoveries = 0;
        const MAX_CONSECUTIVE_ERRORS = 20;
        const MAX_STALL_RECOVERIES = 2;

        while (!this.shouldStop && processed < this.maxPages && !this._fatalState) {
            const row = this.stmts.getNextPending.get(this.targetDomain, `%${this.targetDomain}%`);

            if (!row) {
                // Queue exhausted — attempt stall recovery
                const domainStats = this.stmts.getDomainStats.get(this.targetDomain, `%${this.targetDomain}%`);
                const totalDone = domainStats?.done || 0;
                if (totalDone < this.maxPages && stallRecoveries < MAX_STALL_RECOVERIES) {
                    const recovered = this._attemptStallRecovery();
                    if (recovered > 0) {
                        stallRecoveries++;
                        this.log('info', `Stall recovery #${stallRecoveries}: re-queued ${recovered} errored URLs (${totalDone}/${this.maxPages} done)`);
                        await new Promise(r => setTimeout(r, 5000));
                        continue;
                    }
                }
                this.log('info', 'No more pending URLs');
                break;
            }

            const result = await this._processUrl(row);
            processed++;

            // ── Fatal error detection ──
            if (result.success) {
                consecutiveErrors = 0;
            } else {
                consecutiveErrors++;
                const errType = result.healingType || 'UNKNOWN';
                errorTypeCounts[errType] = (errorTypeCounts[errType] || 0) + 1;

                // Fast-fatal: DNS failure (domain doesn't resolve)
                if (errType === 'DNS_FAILURE' && consecutiveErrors >= 3) {
                    this._fatalState = {
                        reason: 'DNS_FAILURE',
                        message: `Domain ${this.targetDomain} DNS resolution failed ${consecutiveErrors}x`,
                        consecutiveErrors,
                        detectedAt: new Date().toISOString(),
                    };
                    this.log('error', `FATAL: ${this._fatalState.message}`);
                    break;
                }
                // Fast-fatal: SSL error (cert problem won't self-fix)
                if (errType === 'SSL_ERROR' && consecutiveErrors >= 3) {
                    this._fatalState = {
                        reason: 'SSL_ERROR',
                        message: `SSL/TLS error for ${this.targetDomain} (${consecutiveErrors}x)`,
                        consecutiveErrors,
                        detectedAt: new Date().toISOString(),
                    };
                    this.log('error', `FATAL: ${this._fatalState.message}`);
                    break;
                }
                // General consecutive error limit
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    const dominant = Object.entries(errorTypeCounts).sort(([,a], [,b]) => b - a)[0];
                    this._fatalState = {
                        reason: 'CONSECUTIVE_ERRORS',
                        message: `${consecutiveErrors} consecutive errors (dominant: ${dominant?.[0] || 'mixed'})`,
                        consecutiveErrors,
                        errorTypeCounts: { ...errorTypeCounts },
                        detectedAt: new Date().toISOString(),
                    };
                    this.log('error', `FATAL: ${this._fatalState.message}`, this._fatalState);
                    break;
                }
            }

            // Handle rate limit response (429)
            if (result.httpStatus === 429) {
                const rateStatus = this.rateLimiter.getStatus();
                this.log('warn', `⚠️ Rate limited! Slowing down`, {
                    newIntervalMs: rateStatus.currentIntervalMs,
                    backoffUntil: rateStatus.backoffUntil
                });
            }

            // Adaptive rate limiting - use learned rate
            await this.rateLimiter.wait();

            // Update speed
            const elapsed = (Date.now() - this.stats.startTime) / 1000;
            this.stats.itemsPerSecond = elapsed > 0 ? (this.stats.fetched / elapsed).toFixed(2) : 0;

            // Periodic paywall detection (soft auth on 200 responses)
            if (processed % 50 === 0 && processed >= 50) {
                const totalAttempted = this.stats.fetched + this.stats.errors;
                if (totalAttempted > 30 && this.stats.authBoundaries > totalAttempted * 0.9) {
                    this._fatalState = {
                        reason: 'EFFECTIVELY_PAYWALLED',
                        message: `${this.stats.authBoundaries}/${totalAttempted} pages behind paywall`,
                        detectedAt: new Date().toISOString(),
                    };
                    this.log('error', `FATAL: ${this._fatalState.message}`);
                    break;
                }
            }

            // Log progress periodically
            if (processed % 20 === 0) {
                const rateStatus = this.rateLimiter.getStatus();
                this.log('info', `Progress: ${processed}/${this.maxPages}`, {
                    fetched: this.stats.fetched,
                    errors: this.stats.errors,
                    consecutiveErrors,
                    rpm: rateStatus.currentRpm,
                    isLimited: rateStatus.isRateLimited
                });
            }
        }

        // Finalize
        const runStatus = this._fatalState ? 'fatal' : this.shouldStop ? 'stopped' : 'completed';
        this.stmts.finishRun.run(
            this.stats.fetched,
            this.stats.errors,
            runStatus,
            this.currentRun.id
        );

        this.log('info', `Crawl finished (${runStatus})`, {
            fetched: this.stats.fetched,
            errors: this.stats.errors,
            fatalState: this._fatalState?.reason || null,
        });

        // Finalize rate limiter (save learned rates)
        this.rateLimiter.finalize();

        // Save intelligence data
        this.intelligence.save();

        // Close Puppeteer browser if open
        await this.closePuppeteer();

        // Log healing summary
        const healStats = this.healingTracker.getStats();
        if (healStats.total > 0) {
            this.log('info', 'Healing summary', healStats);
        }

        this.isRunning = false;
        this.currentRun = null;
    }
}

module.exports = { CrawlWorker };
