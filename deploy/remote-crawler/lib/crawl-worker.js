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
            itemsPerSecond: 0
        };

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(db, {
            targetDomain: this.targetDomain,
            defaultIntervalMs: this.rateLimitMs
        });

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
            rateLimiting: {
                currentIntervalMs: rateLimitStatus.currentIntervalMs,
                currentRpm: rateLimitStatus.currentRpm,
                isRateLimited: rateLimitStatus.isRateLimited,
                limitReason: rateLimitStatus.limitReason,
                total429s: rateLimitStatus.total429s
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

    async _processUrl(row) {
        this.stats.currentUrl = row.url;

        try {
            this.stmts.updateFetching.run(row.id);

            const result = await this._fetchUrl(row.url);
            const links = this._extractLinks(result.html, result.finalUrl);
            const title = this._extractTitle(result.html);
            const wordCount = this._countWords(result.html);
            const classification = this._classifyUrl(row.url, title, wordCount, links.length);

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

            // Record success with rate limiter
            this.rateLimiter.recordResponse(result.status);

            this.log('info', `Fetched: ${row.url}`, {
                status: result.status,
                links: links.length,
                newQueued: newLinksQueued,
                classification,
                title: title?.substring(0, 50)
            });

            return { success: true, newLinksQueued, httpStatus: result.status };

        } catch (err) {
            this.stmts.updateError.run(err.message, row.id);
            this.stats.errors++;

            // Record error - check if it might be a rate limit timeout
            if (err.message && err.message.includes('aborted')) {
                // Timeout might indicate rate limiting, treat cautiously
                this.rateLimiter.recordResponse(408); // Treat as timeout
            }

            this.log('error', `Failed: ${row.url}`, { error: err.message });
            return { success: false, error: err.message };
        }
    }

    start(maxPages = this.maxPages) {
        if (this.isRunning) {
            return { error: 'Already running' };
        }

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

        // Create run record
        const runResult = this.stmts.insertRun.run(this.targetDomain);
        this.currentRun = { id: runResult.lastInsertRowid };

        this.log('info', `Starting crawl of ${this.targetDomain}`, { maxPages: this.maxPages });

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

        // Crawl loop
        let processed = 0;
        while (!this.shouldStop && processed < this.maxPages) {
            const row = this.stmts.getNextPending.get(this.targetDomain, `%${this.targetDomain}%`);

            if (!row) {
                this.log('info', 'No more pending URLs');
                break;
            }

            const result = await this._processUrl(row);
            processed++;

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

            // Log rate limit status periodically
            if (processed % 20 === 0) {
                const rateStatus = this.rateLimiter.getStatus();
                this.log('info', `Progress: ${processed}/${this.maxPages}`, {
                    fetched: this.stats.fetched,
                    errors: this.stats.errors,
                    rpm: rateStatus.currentRpm,
                    isLimited: rateStatus.isRateLimited
                });
            }
        }

        // Finalize
        this.stmts.finishRun.run(
            this.stats.fetched,
            this.stats.errors,
            this.shouldStop ? 'stopped' : 'completed',
            this.currentRun.id
        );

        this.log('info', 'Crawl finished', { fetched: this.stats.fetched, errors: this.stats.errors });

        // Finalize rate limiter (save learned rates)
        this.rateLimiter.finalize();

        this.isRunning = false;
        this.currentRun = null;
    }
}

module.exports = { CrawlWorker };
