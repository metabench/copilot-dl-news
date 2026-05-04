'use strict';

const { generateNodeId } = require('./PeerProtocol');

/**
 * RemoteCrawlerAdapter — Network bridge for NewsCrawler.
 *
 * Wraps a NewsCrawler instance (or any Crawler subclass) and exposes
 * status, control, export, and intelligence APIs suitable for remote
 * operation. This adapter **observes** the crawler via its EventEmitter
 * interface — it does NOT modify the crawler internals.
 *
 * Features:
 * - Status API: getStatus(), getHealth(), getFatalState()
 * - Control API: start(), stop(), seedUrls()
 * - Export API: exportBatch(), exportFull() — watermark-based incremental sync
 * - Intelligence API: getIntelligence()
 * - Fatal state detection: DNS, SSL, consecutive errors, paywall detection
 * - Crawl run tracking: start/end timestamps, fetched/error counts
 *
 * @example
 * const crawler = new NewsCrawler('https://bbc.com', { crawlType: 'basic' });
 * const adapter = new RemoteCrawlerAdapter(crawler, { nodeId: 'node-01' });
 * const status = adapter.getStatus();
 * adapter.start({ maxDownloads: 200 });
 */
class RemoteCrawlerAdapter {
  /**
   * @param {import('../NewsCrawler')} crawler - A NewsCrawler (or Crawler subclass) instance
   * @param {Object} [options={}]
   * @param {string} [options.nodeId] - Unique node identifier (auto-generated if omitted)
   * @param {number} [options.maxConsecutiveErrors=20] - Threshold for consecutive-error fatal state
   * @param {number} [options.dnsFailureThreshold=3] - Threshold for DNS fatal state
   * @param {number} [options.sslFailureThreshold=3] - Threshold for SSL fatal state
   * @param {number} [options.paywallRatio=0.9] - Ratio of auth-boundary pages triggering paywall fatal
   * @param {number} [options.paywallMinPages=30] - Minimum pages before paywall check applies
   */
  constructor(crawler, options = {}) {
    if (!crawler) {
      throw new Error('RemoteCrawlerAdapter requires a crawler instance');
    }

    this.crawler = crawler;
    this.nodeId = options.nodeId || generateNodeId();
    this.createdAt = new Date().toISOString();

    // Config
    this._maxConsecutiveErrors = options.maxConsecutiveErrors || 20;
    this._dnsFailureThreshold = options.dnsFailureThreshold || 3;
    this._sslFailureThreshold = options.sslFailureThreshold || 3;
    this._paywallRatio = options.paywallRatio || 0.9;
    this._paywallMinPages = options.paywallMinPages || 30;

    // Operational state
    this._fatalState = null;
    this._consecutiveErrors = 0;
    this._errorTypeCounts = {};
    this._authBoundaryCount = 0;
    this._isRunning = false;
    this._startedAt = null;
    this._stoppedAt = null;

    // Run tracking
    this._currentRun = null;
    this._runs = [];
    this._maxRunHistory = 20;

    // Export watermarks (per-domain)
    this._lastExportWatermark = null;
    this._dbInitAttempted = false;

    // Completion callback — set by the server to update registry state
    this._onCrawlFinished = options.onCrawlFinished || null;

    // Bind event listeners
    this._wireEventListeners();
  }

  // ── Event wiring ────────────────────────────────────────────

  _wireEventListeners() {
    const c = this.crawler;

    // Track page-level results for fatal detection
    if (typeof c.on === 'function') {
      c.on('url:visited', (info) => this._onUrlVisited(info));
      c.on('progress', (info) => this._onProgress(info));
      c.on('paused', () => { this._isRunning = false; });
      c.on('resumed', () => { this._isRunning = true; });
      c.on('abort-requested', () => { this._isRunning = false; });
      c.on('disposed', () => {
        this._isRunning = false;
        this._finalizeCurrentRun('disposed');
      });
    }
  }

  /**
   * Handle a page visit event for fatal detection.
   * @param {Object} info - Page visit info from NewsCrawler
   * @private
   */
  _onUrlVisited(info) {
    if (!info) return;

    const isError = info.error || (info.httpStatus && info.httpStatus >= 400);

    if (isError) {
      this._consecutiveErrors++;
      const errType = this._classifyError(info);
      this._errorTypeCounts[errType] = (this._errorTypeCounts[errType] || 0) + 1;

      // Fast-fatal: DNS failure
      if (errType === 'DNS_FAILURE' && this._consecutiveErrors >= this._dnsFailureThreshold) {
        this._setFatal('DNS_FAILURE', `DNS resolution failed ${this._consecutiveErrors}x`);
        return;
      }

      // Fast-fatal: SSL error
      if (errType === 'SSL_ERROR' && this._consecutiveErrors >= this._sslFailureThreshold) {
        this._setFatal('SSL_ERROR', `SSL/TLS error (${this._consecutiveErrors}x)`);
        return;
      }

      // General consecutive error limit
      if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
        const dominant = Object.entries(this._errorTypeCounts)
          .sort(([, a], [, b]) => b - a)[0];
        this._setFatal('CONSECUTIVE_ERRORS',
          `${this._consecutiveErrors} consecutive errors (dominant: ${dominant?.[0] || 'mixed'})`);
        return;
      }

      // Track auth boundaries
      if (errType === 'AUTH_REQUIRED' || (info.httpStatus === 401 || info.httpStatus === 403)) {
        this._authBoundaryCount++;
      }
    } else {
      this._consecutiveErrors = 0;
    }

    // Periodic paywall detection
    const stats = this.crawler.state?.getStats?.() || {};
    const totalAttempted = (stats.pagesVisited || 0);
    if (totalAttempted > this._paywallMinPages &&
        this._authBoundaryCount > totalAttempted * this._paywallRatio) {
      this._setFatal('EFFECTIVELY_PAYWALLED',
        `${this._authBoundaryCount}/${totalAttempted} pages behind paywall`);
    }

    // Update run stats
    if (this._currentRun) {
      if (isError) {
        this._currentRun.totalErrors++;
      } else {
        this._currentRun.totalFetched++;
      }
    }
  }

  _onProgress(_info) {
    // Progress event can be used for heartbeat, logging, etc.
    // Currently a no-op; the adapter tracks state via url:visited.
  }

  /**
   * Classify an error from page visit info into a diagnostic type.
   * @private
   */
  _classifyError(info) {
    const msg = (info.error || info.errorMessage || '').toLowerCase();
    if (msg.includes('getaddrinfo') || msg.includes('dns') || msg.includes('enotfound')) {
      return 'DNS_FAILURE';
    }
    if (msg.includes('ssl') || msg.includes('tls') || msg.includes('certificate') || msg.includes('cert')) {
      return 'SSL_ERROR';
    }
    if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('etimedout')) {
      return 'TIMEOUT';
    }
    if (msg.includes('econnreset') || msg.includes('econnrefused')) {
      return 'CONNECTION_ERROR';
    }
    if (info.httpStatus === 429) return 'RATE_LIMIT';
    if (info.httpStatus === 401 || info.httpStatus === 403) return 'AUTH_REQUIRED';
    if (info.httpStatus >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN';
  }

  _setFatal(reason, message) {
    this._fatalState = {
      reason,
      message,
      consecutiveErrors: this._consecutiveErrors,
      errorTypeCounts: { ...this._errorTypeCounts },
      detectedAt: new Date().toISOString(),
    };

    // If crawler has a state object with fatal tracking, update it
    if (this.crawler.state && typeof this.crawler.state.addFatalIssue === 'function') {
      this.crawler.state.addFatalIssue({
        kind: reason,
        message,
        detectedAt: this._fatalState.detectedAt,
      });
    }
  }

  // ── Status API ──────────────────────────────────────────────

  /**
   * Get comprehensive peer status.
   * @returns {Object}
   */
  getStatus() {
    const crawlerStats = this.crawler.state?.getStats?.() || {};
    const queueSize = this.crawler.queue?.size?.() || 0;

    return {
      nodeId: this.nodeId,
      domain: this.crawler.domain || this.crawler.startUrl || null,
      isRunning: this._isRunning,
      isPaused: this.crawler.isPaused?.() || false,
      fatalState: this._fatalState,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      stoppedAt: this._stoppedAt,
      currentRun: this._currentRun ? {
        id: this._currentRun.id,
        startedAt: this._currentRun.startedAt,
        totalFetched: this._currentRun.totalFetched,
        totalErrors: this._currentRun.totalErrors,
      } : null,
      stats: {
        ...crawlerStats,
        consecutiveErrors: this._consecutiveErrors,
        authBoundaries: this._authBoundaryCount,
        queueSize,
      },
      features: this.crawler.featuresEnabled || {},
      crawlType: this.crawler.crawlType || 'unknown',
    };
  }

  /**
   * Get health check response (lightweight).
   * @returns {Object}
   */
  getHealth() {
    return {
      ok: !this._fatalState,
      nodeId: this.nodeId,
      domain: this.crawler.domain || null,
      isRunning: this._isRunning,
      fatalState: this._fatalState?.reason || null,
      uptimeMs: this._startedAt ? Date.now() - new Date(this._startedAt).getTime() : 0,
    };
  }

  /**
   * Get fatal state if any.
   * @returns {Object|null}
   */
  getFatalState() {
    return this._fatalState;
  }

  // ── Control API ─────────────────────────────────────────────

  /**
   * Start crawling. Delegates to the crawler's crawl lifecycle.
   *
   * @param {Object} [options={}]
   * @param {number} [options.maxDownloads] - Override max downloads
   * @returns {{ started: boolean, error?: string }}
   */
  start(options = {}) {
    if (this._isRunning) {
      return { started: false, error: 'Already running' };
    }
    if (this._fatalState) {
      // Clear fatal state on explicit restart
      this._fatalState = null;
      this._consecutiveErrors = 0;
      this._errorTypeCounts = {};
      this._authBoundaryCount = 0;
    }

    this._isRunning = true;
    this._startedAt = new Date().toISOString();
    this._stoppedAt = null;
    this._beginNewRun();

    // Apply overrides
    if (options.maxDownloads != null && this.crawler._resolvedOptions) {
      this.crawler._resolvedOptions.maxDownloads = options.maxDownloads;
      this.crawler.maxDownloads = options.maxDownloads;
    }

    // Run crawl asynchronously — don't await to return immediately
    this.crawler.crawl().then(() => {
      this._isRunning = false;
      this._stoppedAt = new Date().toISOString();
      this._finalizeCurrentRun('completed');
      if (typeof this._onCrawlFinished === 'function') {
        this._onCrawlFinished({ status: 'completed', domain: this.crawler.domain });
      }
    }).catch((err) => {
      this._isRunning = false;
      this._stoppedAt = new Date().toISOString();
      this._finalizeCurrentRun('error');
      if (typeof this._onCrawlFinished === 'function') {
        this._onCrawlFinished({ status: 'error', domain: this.crawler.domain, error: err?.message });
      }
      console.error(`[RemoteCrawlerAdapter:${this.nodeId}] Crawl error:`, err?.message || err);
    });

    return { started: true, maxDownloads: options.maxDownloads || this.crawler.maxDownloads };
  }

  /**
   * Stop crawling gracefully.
   * @returns {{ stopped: boolean }}
   */
  stop() {
    if (!this._isRunning) {
      return { stopped: false, error: 'Not running' };
    }

    if (typeof this.crawler.requestAbort === 'function') {
      this.crawler.requestAbort();
    }

    this._isRunning = false;
    this._stoppedAt = new Date().toISOString();
    this._finalizeCurrentRun('stopped');

    return { stopped: true };
  }

  /**
   * Seed URLs into the crawler queue at runtime.
   *
   * @param {string[]} urls - URLs to add
   * @returns {{ inserted: number, total: number, errors: string[] }}
   */
  seedUrls(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return { inserted: 0, total: 0, errors: [] };
    }

    let inserted = 0;
    const errors = [];

    for (const url of urls) {
      try {
        if (typeof this.crawler.enqueueRequest === 'function') {
          const result = this.crawler.enqueueRequest({
            url,
            depth: 0,
            type: 'seed',
            meta: { source: 'remote-seed', seededAt: new Date().toISOString() },
          });
          if (result !== false) {
            inserted++;
          }
        }
      } catch (err) {
        errors.push(`${url}: ${err.message}`);
      }
    }

    return { inserted, total: urls.length, errors };
  }

  // ── Export API ───────────────────────────────────────────────

  /**
   * Export a batch of crawl results (watermark-based incremental sync).
   *
   * Reads from the crawler's DB adapter to produce a batch of URLs
   * updated since the last watermark.
   *
   * @param {Object} [options={}]
   * @param {string} [options.since] - Watermark: only return data after this timestamp
   * @param {number} [options.limit=500] - Max URLs per batch
   * @returns {Object} Batch export data
   */
  exportBatch(options = {}) {
    const db = this._getDb();
    if (!db) {
      return this._emptyBatch('No database available');
    }

    const since = options.since || this._lastExportWatermark || '1970-01-01T00:00:00.000Z';
    const limit = Math.min(options.limit || 500, 10000);
    const now = new Date().toISOString();

    try {
      // Fetch URLs updated since watermark using the canonical
      // urls → http_responses → content_storage → content_analysis join
      const rows = db.prepare(`
        SELECT
          u.id,
          u.url,
          u.host,
          u.canonical_url,
          hr.fetched_at,
          hr.http_status,
          hr.content_type,
          hr.bytes_downloaded,
          hr.ttfb_ms,
          hr.download_ms,
          hr.total_ms,
          ca.classification,
          ca.title,
          ca.word_count,
          ca.nav_links_count,
          ca.article_links_count,
          ca.date AS article_date,
          u.created_at,
          u.last_seen_at
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        LEFT JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE hr.fetched_at > ?
        ORDER BY hr.fetched_at ASC
        LIMIT ?
      `).all(since, limit);

      // Watermark is the latest fetched_at
      const watermark = rows.length > 0
        ? rows[rows.length - 1].fetched_at
        : since;

      this._lastExportWatermark = watermark;

      const batchId = `${this.nodeId}:${Date.now().toString(36)}`;

      return {
        nodeId: this.nodeId,
        domain: this.crawler.domain || null,
        batchId,
        exportedAt: now,
        watermark,
        counts: {
          urls: rows.length,
          hasMore: rows.length >= limit,
        },
        urls: rows,
      };
    } catch (err) {
      return this._emptyBatch(`Export error: ${err.message}`);
    }
  }

  /**
   * Full export — all completed URLs.
   *
   * @param {Object} [options={}]
   * @param {string} [options.since] - Only export records updated after this time
   * @param {number} [options.limit=0] - Max URLs (0 = unlimited)
   * @returns {Object}
   */
  exportFull(options = {}) {
    const db = this._getDb();
    if (!db) {
      return this._emptyBatch('No database available');
    }

    const since = options.since || null;
    const limit = options.limit || 0;

    try {
      let sql = `SELECT
          u.id,
          u.url,
          u.host,
          u.canonical_url,
          hr.fetched_at,
          hr.http_status,
          hr.content_type,
          hr.bytes_downloaded,
          hr.ttfb_ms,
          hr.download_ms,
          hr.total_ms,
          ca.classification,
          ca.title,
          ca.word_count,
          ca.nav_links_count,
          ca.article_links_count,
          ca.date AS article_date,
          u.created_at,
          u.last_seen_at
        FROM urls u
        INNER JOIN http_responses hr ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        LEFT JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE 1=1`;
      const params = [];

      if (since) {
        sql += ` AND hr.fetched_at > ?`;
        params.push(since);
      }
      sql += ` ORDER BY hr.fetched_at ASC`;
      if (limit > 0) {
        sql += ` LIMIT ?`;
        params.push(limit);
      }

      const rows = db.prepare(sql).all(...params);

      return {
        nodeId: this.nodeId,
        domain: this.crawler.domain || null,
        exportedAt: new Date().toISOString(),
        since,
        counts: { urls: rows.length },
        urls: rows,
      };
    } catch (err) {
      return this._emptyBatch(`Full export error: ${err.message}`);
    }
  }

  _emptyBatch(reason = null) {
    return {
      nodeId: this.nodeId,
      domain: this.crawler.domain || null,
      batchId: `${this.nodeId}:empty`,
      exportedAt: new Date().toISOString(),
      watermark: this._lastExportWatermark || null,
      counts: { urls: 0, hasMore: false },
      urls: [],
      error: reason,
    };
  }

  // ── Intelligence API ────────────────────────────────────────

  /**
   * Export domain intelligence for sharing with other peers.
   * @returns {Object|null}
   */
  getIntelligence() {
    const domain = this.crawler.domain || null;
    const result = {
      domain,
      nodeId: this.nodeId,
      exportedAt: new Date().toISOString(),
    };

    // Gather throttle/rate-limit state
    if (this.crawler.domainThrottle) {
      const host = this.crawler.domainNormalized || domain;
      const limitState = this.crawler.state?.getDomainLimitState?.(host);
      if (limitState) {
        result.rateLimit = {
          isLimited: limitState.rateLimited || false,
          resumeAfter: limitState.resumeAfter || null,
          consecutiveErrors: limitState.consecutiveErrors || 0,
        };
      }
    }

    // Gather resilience/healing state
    if (this.crawler.resilienceService) {
      try {
        result.resilience = this.crawler.resilienceService.getSnapshot?.() || null;
      } catch (_) { /* optional */ }
    }

    // Error patterns
    result.errorPatterns = { ...this._errorTypeCounts };
    result.consecutiveErrors = this._consecutiveErrors;
    result.fatalState = this._fatalState?.reason || null;

    return result;
  }

  // ── Run tracking ────────────────────────────────────────────

  _beginNewRun() {
    const run = {
      id: `run-${Date.now().toString(36)}`,
      startedAt: new Date().toISOString(),
      endedAt: null,
      totalFetched: 0,
      totalErrors: 0,
      status: 'running',
    };
    this._currentRun = run;
    this._runs.push(run);

    // Keep history bounded
    if (this._runs.length > this._maxRunHistory) {
      this._runs = this._runs.slice(-this._maxRunHistory);
    }
  }

  _finalizeCurrentRun(status) {
    if (!this._currentRun) return;
    this._currentRun.endedAt = new Date().toISOString();
    this._currentRun.status = this._fatalState ? 'fatal' : status;
    this._currentRun = null;
  }

  /**
   * Get run history.
   * @param {number} [limit=5]
   * @returns {Object[]}
   */
  getRunHistory(limit = 5) {
    return this._runs.slice(-limit);
  }

  // ── Helper ──────────────────────────────────────────────────

  /**
   * Get the underlying better-sqlite3 database handle.
   * @returns {import('better-sqlite3').Database|null}
   * @private
   */
  _getDb() {
    // Try several known paths to the DB handle
    const adapter = this.crawler.dbAdapter;

    // If the CrawlerDb adapter exists but hasn't been initialised yet, trigger lazy init
    if (adapter && !adapter.isEnabled?.() && typeof adapter.init === 'function' && !this._dbInitAttempted) {
      this._dbInitAttempted = true;
      // init() is async but we call it fire-and-forget for the first attempt;
      // subsequent _getDb() calls will find the handle if init succeeded.
      adapter.init().catch((err) => {
        console.warn(`[RemoteCrawlerAdapter:${this.nodeId}] Lazy DB init failed: ${err?.message || err}`);
      });
    }

    if (adapter && typeof adapter.getDb === 'function') {
      const handle = adapter.getDb();
      if (handle) return handle;
    }
    if (adapter && adapter.db) {
      return adapter.db;
    }
    if (this.crawler._db) {
      return this.crawler._db;
    }
    return null;
  }
}

module.exports = { RemoteCrawlerAdapter };
