/**
 * Rate Limiter - Adaptive rate limiting based on robots.txt and learned limits
 * 
 * Features:
 * - Parses robots.txt for Crawl-delay directive
 * - Tracks historical 429 responses to learn safe rates
 * - Dynamically adjusts crawl rate based on responses
 * - Logs clearly when rate limiting affects crawl speed
 * 
 * Compatible with main repo's domain_rate_limits schema
 */

class RateLimiter {
    constructor(db, options = {}) {
        this.db = db;
        this.targetDomain = options.targetDomain;
        this.defaultIntervalMs = options.defaultIntervalMs || 1000; // 1 req/sec default
        this.minIntervalMs = options.minIntervalMs || 200;  // Never faster than 5/sec
        this.maxIntervalMs = options.maxIntervalMs || 30000; // Never slower than 2/min

        // Current state
        this.currentIntervalMs = this.defaultIntervalMs;
        this.robotsCrawlDelayMs = null;
        this.learnedRpmFromDb = null;
        this.consecutiveSuccesses = 0;
        this.consecutive429s = 0;
        this.total429s = 0;
        this.totalRequests = 0;
        this.lastRequestAt = null;
        this.backoffUntil = null;

        // Ensure schema
        this._ensureSchema();

        // Load existing rate limit data from DB
        this._loadFromDb();
    }

    _ensureSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_rate_limits (
        domain TEXT PRIMARY KEY,
        learned_rpm INTEGER DEFAULT 30,
        safe_rpm INTEGER,
        max_observed_rpm INTEGER,
        min_safe_rpm INTEGER,
        last_429_at TEXT,
        last_success_at TEXT,
        total_requests INTEGER DEFAULT 0,
        total_429s INTEGER DEFAULT 0,
        success_streak INTEGER DEFAULT 0,
        err_429_streak INTEGER DEFAULT 0,
        backoff_until TEXT,
        crawl_delay_seconds INTEGER,
        robots_txt_cached TEXT,
        source TEXT DEFAULT 'learned',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        event_type TEXT NOT NULL,
        http_status INTEGER,
        interval_ms INTEGER,
        rpm_at_time REAL,
        message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    }

    _loadFromDb() {
        try {
            const row = this.db.prepare(`
        SELECT * FROM domain_rate_limits WHERE domain = ?
      `).get(this.targetDomain);

            if (row) {
                this.totalRequests = row.total_requests || 0;
                this.total429s = row.total_429s || 0;
                this.consecutiveSuccesses = row.success_streak || 0;
                this.consecutive429s = row.err_429_streak || 0;

                if (row.crawl_delay_seconds) {
                    this.robotsCrawlDelayMs = row.crawl_delay_seconds * 1000;
                }

                if (row.learned_rpm && row.learned_rpm > 0) {
                    this.learnedRpmFromDb = row.learned_rpm;
                    const learnedIntervalMs = Math.round(60000 / row.learned_rpm);
                    this.currentIntervalMs = Math.max(this.minIntervalMs, learnedIntervalMs);
                }

                if (row.backoff_until) {
                    const backoffTime = new Date(row.backoff_until).getTime();
                    if (backoffTime > Date.now()) {
                        this.backoffUntil = backoffTime;
                    }
                }

                this._log('info', `Loaded rate limit from DB: ${row.learned_rpm} RPM, ${row.total_429s} historical 429s`);
            }
        } catch (e) {
            console.log('[RateLimiter] No existing rate limit data:', e.message);
        }
    }

    _saveToDb() {
        try {
            const rpm = this.currentIntervalMs > 0 ? Math.round(60000 / this.currentIntervalMs) : 60;

            this.db.prepare(`
        INSERT INTO domain_rate_limits 
          (domain, learned_rpm, total_requests, total_429s, success_streak, err_429_streak, 
           crawl_delay_seconds, last_success_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(domain) DO UPDATE SET
          learned_rpm = excluded.learned_rpm,
          total_requests = excluded.total_requests,
          total_429s = excluded.total_429s,
          success_streak = excluded.success_streak,
          err_429_streak = excluded.err_429_streak,
          crawl_delay_seconds = excluded.crawl_delay_seconds,
          last_success_at = excluded.last_success_at,
          updated_at = datetime('now')
      `).run(
                this.targetDomain,
                rpm,
                this.totalRequests,
                this.total429s,
                this.consecutiveSuccesses,
                this.consecutive429s,
                this.robotsCrawlDelayMs ? Math.round(this.robotsCrawlDelayMs / 1000) : null
            );
        } catch (e) {
            console.error('[RateLimiter] Save error:', e.message);
        }
    }

    _logEvent(eventType, httpStatus, message) {
        try {
            const rpm = this.currentIntervalMs > 0 ? (60000 / this.currentIntervalMs).toFixed(1) : 0;
            this.db.prepare(`
        INSERT INTO rate_limit_events (domain, event_type, http_status, interval_ms, rpm_at_time, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(this.targetDomain, eventType, httpStatus, this.currentIntervalMs, parseFloat(rpm), message);
        } catch (e) {
            // Ignore event logging errors
        }
    }

    _log(level, message, data = null) {
        const prefix = `[RateLimiter:${this.targetDomain}]`;
        const logLine = data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
        console.log(`[${level.toUpperCase()}] ${logLine}`);
    }

    /**
     * Fetch and parse robots.txt for Crawl-delay
     */
    async fetchRobotsTxt() {
        try {
            const url = `https://${this.targetDomain}/robots.txt`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'NewsCrawler/1.0' },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                this._log('warn', `robots.txt returned ${response.status}`);
                return null;
            }

            const text = await response.text();

            // Parse Crawl-delay
            const crawlDelayMatch = text.match(/Crawl-delay:\s*(\d+)/i);
            if (crawlDelayMatch) {
                const delaySeconds = parseInt(crawlDelayMatch[1], 10);
                this.robotsCrawlDelayMs = delaySeconds * 1000;

                // If robots.txt specifies a delay, respect it
                if (this.robotsCrawlDelayMs > this.currentIntervalMs) {
                    this.currentIntervalMs = this.robotsCrawlDelayMs;
                    this._log('info', `robots.txt specifies Crawl-delay: ${delaySeconds}s - respecting this limit`);
                    this._logEvent('robots_crawl_delay', null, `Crawl-delay: ${delaySeconds}s`);
                }
            }

            return text;
        } catch (e) {
            this._log('warn', `Failed to fetch robots.txt: ${e.message}`);
            return null;
        }
    }

    /**
     * Record the result of a request
     */
    recordResponse(httpStatus) {
        this.totalRequests++;
        this.lastRequestAt = Date.now();

        if (httpStatus === 429) {
            this.total429s++;
            this.consecutive429s++;
            this.consecutiveSuccesses = 0;

            // Increase interval (slow down)
            const oldInterval = this.currentIntervalMs;
            this.currentIntervalMs = Math.min(
                this.currentIntervalMs * 2,  // Double the delay
                this.maxIntervalMs
            );

            // Set backoff period
            this.backoffUntil = Date.now() + (this.currentIntervalMs * 5);

            this._log('warn', `⚠️ HTTP 429 Rate Limited - slowing down`, {
                oldIntervalMs: oldInterval,
                newIntervalMs: this.currentIntervalMs,
                consecutive429s: this.consecutive429s,
                total429s: this.total429s,
                backoffForSec: Math.round((this.backoffUntil - Date.now()) / 1000)
            });

            this._logEvent('rate_limited', 429, `Slowed from ${oldInterval}ms to ${this.currentIntervalMs}ms`);

            // Update DB with last_429_at
            this.db.prepare(`
        UPDATE domain_rate_limits SET 
          last_429_at = datetime('now'),
          err_429_streak = ?,
          total_429s = ?,
          backoff_until = datetime('now', '+' || ? || ' seconds')
        WHERE domain = ?
      `).run(this.consecutive429s, this.total429s, Math.round((this.backoffUntil - Date.now()) / 1000), this.targetDomain);

        } else if (httpStatus >= 200 && httpStatus < 400) {
            this.consecutiveSuccesses++;
            this.consecutive429s = 0;

            // After 10 consecutive successes, try speeding up (if not rate limited by robots.txt)
            if (this.consecutiveSuccesses >= 10 && this.consecutiveSuccesses % 10 === 0) {
                const minAllowed = this.robotsCrawlDelayMs || this.minIntervalMs;

                if (this.currentIntervalMs > minAllowed) {
                    const oldInterval = this.currentIntervalMs;
                    this.currentIntervalMs = Math.max(
                        Math.round(this.currentIntervalMs * 0.8),  // Speed up by 20%
                        minAllowed
                    );

                    if (this.currentIntervalMs < oldInterval) {
                        this._log('info', `✓ ${this.consecutiveSuccesses} consecutive successes - speeding up`, {
                            oldIntervalMs: oldInterval,
                            newIntervalMs: this.currentIntervalMs
                        });
                        this._logEvent('speed_increased', httpStatus, `Sped up from ${oldInterval}ms to ${this.currentIntervalMs}ms`);
                    }
                }
            }
        }

        // Save periodically
        if (this.totalRequests % 20 === 0) {
            this._saveToDb();
        }
    }

    /**
     * Get the delay to wait before next request
     */
    getDelayMs() {
        // Check if in backoff period
        if (this.backoffUntil && Date.now() < this.backoffUntil) {
            const waitMs = this.backoffUntil - Date.now();
            this._log('info', `In backoff period, waiting ${Math.round(waitMs / 1000)}s`);
            return waitMs;
        }

        return this.currentIntervalMs;
    }

    /**
     * Get current rate limit status for logging
     */
    getStatus() {
        const rpm = this.currentIntervalMs > 0 ? (60000 / this.currentIntervalMs).toFixed(1) : 0;
        const isLimited = this.currentIntervalMs > this.defaultIntervalMs;

        return {
            domain: this.targetDomain,
            currentIntervalMs: this.currentIntervalMs,
            currentRpm: parseFloat(rpm),
            robotsCrawlDelayMs: this.robotsCrawlDelayMs,
            isRateLimited: isLimited,
            consecutiveSuccesses: this.consecutiveSuccesses,
            consecutive429s: this.consecutive429s,
            total429s: this.total429s,
            totalRequests: this.totalRequests,
            backoffUntil: this.backoffUntil ? new Date(this.backoffUntil).toISOString() : null,
            limitReason: isLimited ? this._getLimitReason() : null
        };
    }

    _getLimitReason() {
        if (this.consecutive429s > 0) {
            return `Got ${this.consecutive429s} consecutive 429s (${this.total429s} total)`;
        }
        if (this.robotsCrawlDelayMs && this.currentIntervalMs >= this.robotsCrawlDelayMs) {
            return `robots.txt Crawl-delay: ${this.robotsCrawlDelayMs / 1000}s`;
        }
        if (this.total429s > 0) {
            return `Historical 429s: ${this.total429s} - using learned safe rate`;
        }
        return 'Unknown';
    }

    /**
     * Wait for the appropriate delay before next request
     */
    async wait() {
        const delayMs = this.getDelayMs();
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    /**
     * Finalize and save all data
     */
    finalize() {
        this._saveToDb();
        this._log('info', `Rate limit session complete`, this.getStatus());
    }
}

module.exports = { RateLimiter };
