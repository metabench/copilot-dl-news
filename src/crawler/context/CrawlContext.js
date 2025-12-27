'use strict';

const EventEmitter = require('events');

/**
 * CrawlContext - Single source of truth for all crawl state.
 *
 * Consolidates state previously scattered across:
 * - CrawlerState (core stats)
 * - Multiple caches (articleHeader, knownArticles, urlAnalysis, urlDecision)
 * - Domain tracking (domainLimits, connectionResetState)
 * - Queue state (queuedUrls Set)
 * - Problem/milestone counters
 *
 * Design principles:
 * - Immutable reads (getters return copies or frozen objects)
 * - Explicit mutations via named methods
 * - Observable state changes via EventEmitter
 * - Serializable for persistence/debugging
 * - Compatible with existing CrawlerState interface during migration
 *
 * @extends EventEmitter
 */
class CrawlContext extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.jobId - Unique job identifier
   * @param {string} options.startUrl - The seed URL for this crawl
   * @param {string} options.crawlType - The crawl mode (basic, intelligent, gazetteer)
   * @param {number} options.maxDepth - Maximum crawl depth
   * @param {number} options.maxPages - Maximum pages to crawl
   * @param {Object} options.existingState - Optional existing CrawlerState to migrate from
   */
  constructor(options = {}) {
    super();

    this.jobId = options.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.startUrl = options.startUrl || null;
    this.crawlType = options.crawlType || 'basic';
    this.maxDepth = options.maxDepth;
    this.maxPages = options.maxPages;

    // Lifecycle timestamps
    this._startedAt = null;
    this._finishedAt = null;
    this._pausedAt = null;
    this._status = 'pending'; // pending, running, paused, completed, aborted, failed

    // Core statistics
    this._stats = {
      visited: 0,
      queued: 0,
      dequeued: 0,
      articles: 0,
      navigation: 0,
      errors: 0,
      skipped: 0,
      bytesDownloaded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      retries: 0,
      rateLimited: 0
    };

    // URL tracking
    this._urls = {
      visited: new Set(),           // URLs we've fully processed
      queued: new Set(),            // URLs currently in queue
      discovered: new Set(),        // All URLs we've seen (visited + queued + skipped)
      decisions: new Map(),         // URL -> { action, reason, timestamp }
      analyses: new Map(),          // URL -> { classification, signals, timestamp }
      priorities: new Map()         // URL -> priority score
    };

    // Domain tracking
    this._domains = {
      seen: new Set(),              // All domains encountered
      requestCounts: new Map(),     // domain -> count in current window
      lastRequestTime: new Map(),   // domain -> timestamp of last request
      errorCounts: new Map(),       // domain -> error count in window
      errorHistory: new Map(),      // domain -> [{ timestamp, reason }]
      throttledUntil: new Map(),    // domain -> timestamp when throttle expires
      blocked: new Set(),           // domains permanently blocked
      robotsCache: new Map()        // domain -> { allowed, disallowed, fetchedAt }
    };

    // Content tracking
    this._content = {
      articleUrls: new Set(),       // URLs identified as articles
      hubUrls: new Set(),           // URLs identified as hubs/navigation
      sitemapUrls: new Set()        // URLs discovered via sitemap
    };

    // Diagnostics
    this._diagnostics = {
      problems: [],                 // Array of problem objects
      milestones: [],               // Array of milestone objects
      problemCounts: new Map(),     // kind -> count
      milestoneCounts: new Map(),   // kind -> count
      emittedMilestones: new Set()  // For once-only milestones
    };

    // Timing metrics
    this._timing = {
      totalFetchMs: 0,
      totalProcessMs: 0,
      fetchCount: 0,
      lastActivityAt: null
    };

    // Migrate from existing state if provided
    if (options.existingState) {
      this._migrateFromExistingState(options.existingState);
    }
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  /**
   * Mark the crawl as started.
   */
  start() {
    if (this._status !== 'pending') {
      throw new Error(`Cannot start crawl in status: ${this._status}`);
    }
    this._startedAt = Date.now();
    this._status = 'running';
    this._timing.lastActivityAt = this._startedAt;
    this.emit('started', { jobId: this.jobId, startedAt: this.startedAt });
  }

  /**
   * Pause the crawl.
   */
  pause() {
    if (this._status !== 'running') return false;
    this._pausedAt = Date.now();
    this._status = 'paused';
    this.emit('paused', { jobId: this.jobId, pausedAt: this._pausedAt });
    return true;
  }

  /**
   * Resume a paused crawl.
   */
  resume() {
    if (this._status !== 'paused') return false;
    this._status = 'running';
    const pauseDuration = Date.now() - this._pausedAt;
    this._pausedAt = null;
    this.emit('resumed', { jobId: this.jobId, pauseDuration });
    return true;
  }

  /**
   * Mark the crawl as finished.
   * @param {string} status - Final status: 'completed', 'aborted', 'failed'
   * @param {string} reason - Optional reason for non-completed status
   */
  finish(status = 'completed', reason = null) {
    this._finishedAt = Date.now();
    this._status = status;
    this.emit('finished', {
      jobId: this.jobId,
      status,
      reason,
      duration: this.elapsedMs,
      stats: this.stats
    });
  }

  get status() {
    return this._status;
  }

  get isRunning() {
    return this._status === 'running';
  }

  get isPaused() {
    return this._status === 'paused';
  }

  get isFinished() {
    return ['completed', 'aborted', 'failed'].includes(this._status);
  }

  get startedAt() {
    return this._startedAt ? new Date(this._startedAt).toISOString() : null;
  }

  get finishedAt() {
    return this._finishedAt ? new Date(this._finishedAt).toISOString() : null;
  }

  get elapsedMs() {
    if (!this._startedAt) return 0;
    const end = this._finishedAt || Date.now();
    return end - this._startedAt;
  }

  // ============================================================
  // STATISTICS (read-only)
  // ============================================================

  /**
   * Get a copy of current statistics.
   */
  get stats() {
    return { ...this._stats };
  }

  /**
   * Get a specific stat value.
   */
  getStat(name) {
    return this._stats[name];
  }

  /**
   * Increment a stat by amount (default 1).
   * @private - Use specific record* methods instead
   */
  _incrementStat(name, amount = 1) {
    if (!(name in this._stats)) {
      throw new Error(`Unknown stat: ${name}`);
    }
    const oldValue = this._stats[name];
    this._stats[name] += amount;
    this._timing.lastActivityAt = Date.now();

    this.emit('stats:change', {
      name,
      oldValue,
      newValue: this._stats[name],
      delta: amount
    });
  }

  // ============================================================
  // URL STATE
  // ============================================================

  /**
   * Check if URL has been visited (fully processed).
   */
  hasVisited(url) {
    return this._urls.visited.has(url);
  }

  /**
   * Check if URL is currently queued.
   */
  isQueued(url) {
    return this._urls.queued.has(url);
  }

  /**
   * Check if URL has been seen (visited, queued, or skipped).
   */
  hasSeen(url) {
    return this._urls.discovered.has(url);
  }

  /**
   * Get count of visited URLs.
   */
  get visitedCount() {
    return this._urls.visited.size;
  }

  /**
   * Get count of queued URLs.
   */
  get queuedCount() {
    return this._urls.queued.size;
  }

  /**
   * Mark URL as visited (processed).
   * @returns {boolean} true if newly marked, false if already visited
   */
  markVisited(url, metadata = {}) {
    if (this._urls.visited.has(url)) return false;

    const oldState = this.isQueued(url) ? 'queued' : 'discovered';
    this._urls.visited.add(url);
    this._urls.queued.delete(url);
    this._urls.discovered.add(url);
    this._stats.visited++;

    // Track domain
    try {
      const domain = new URL(url).hostname;
      this._domains.seen.add(domain);
    } catch (e) { /* ignore invalid URLs */ }

    this._timing.lastActivityAt = Date.now();
    this.emit('url:visited', { url, ...metadata });
    this.emit('url:state-change', { url, oldState, newState: 'visited', ...metadata });
    this.emit('stats:change', { name: 'visited', newValue: this._stats.visited, delta: 1 });
    return true;
  }

  /**
   * Mark URL as queued.
   * @returns {boolean} true if newly queued, false if already queued/visited
   */
  markQueued(url, metadata = {}) {
    if (this._urls.queued.has(url) || this._urls.visited.has(url)) {
      return false;
    }

    const oldState = this.hasSeen(url) ? 'discovered' : 'new';
    this._urls.queued.add(url);
    this._urls.discovered.add(url);
    this._stats.queued++;

    if (metadata.priority !== undefined) {
      this._urls.priorities.set(url, metadata.priority);
    }

    this.emit('url:queued', { url, ...metadata });
    this.emit('url:state-change', { url, oldState, newState: 'queued', ...metadata });
    this.emit('stats:change', { name: 'queued', newValue: this._stats.queued, delta: 1 });
    return true;
  }

  /**
   * Mark URL as dequeued (about to process).
   */
  markDequeued(url) {
    if (this._urls.queued.has(url)) {
      this._urls.queued.delete(url);
      this._stats.dequeued++;
      this.emit('url:state-change', { url, oldState: 'queued', newState: 'dequeued' });
      this.emit('stats:change', { name: 'dequeued', newValue: this._stats.dequeued, delta: 1 });
    }
  }

  /**
   * Mark URL as skipped (won't be processed).
   */
  markSkipped(url, reason) {
    const oldState = this.isQueued(url) ? 'queued' : (this.hasSeen(url) ? 'discovered' : 'new');
    this._urls.discovered.add(url);
    this._stats.skipped++;
    this.setUrlDecision(url, 'skip', reason);
    this.emit('url:state-change', { url, oldState, newState: 'skipped', reason });
    this.emit('stats:change', { name: 'skipped', newValue: this._stats.skipped, delta: 1 });
  }

  /**
   * Get stored decision for a URL.
   */
  getUrlDecision(url) {
    return this._urls.decisions.get(url) || null;
  }

  /**
   * Store a decision for a URL.
   */
  setUrlDecision(url, action, reason = null) {
    this._urls.decisions.set(url, {
      action,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Get stored analysis for a URL.
   */
  getUrlAnalysis(url) {
    return this._urls.analyses.get(url) || null;
  }

  /**
   * Store analysis result for a URL.
   */
  setUrlAnalysis(url, analysis) {
    this._urls.analyses.set(url, {
      ...analysis,
      timestamp: Date.now()
    });
  }

  /**
   * Get priority for a URL.
   */
  getUrlPriority(url) {
    return this._urls.priorities.get(url);
  }

  /**
   * Set priority for a URL.
   */
  setUrlPriority(url, priority) {
    this._urls.priorities.set(url, priority);
  }

  // ============================================================
  // DOMAIN STATE
  // ============================================================

  /**
   * Check if domain is currently throttled.
   */
  isDomainThrottled(domain) {
    const until = this._domains.throttledUntil.get(domain);
    if (!until) return false;
    if (Date.now() >= until) {
      this._domains.throttledUntil.delete(domain);
      return false;
    }
    return true;
  }

  /**
   * Check if domain is permanently blocked.
   */
  isDomainBlocked(domain) {
    return this._domains.blocked.has(domain);
  }

  /**
   * Get time remaining on throttle (ms), or 0 if not throttled.
   */
  getDomainThrottleRemaining(domain) {
    const until = this._domains.throttledUntil.get(domain);
    if (!until) return 0;
    return Math.max(0, until - Date.now());
  }

  /**
   * Record a request to a domain.
   */
  recordDomainRequest(domain) {
    const count = (this._domains.requestCounts.get(domain) || 0) + 1;
    this._domains.requestCounts.set(domain, count);
    this._domains.lastRequestTime.set(domain, Date.now());
    this._domains.seen.add(domain);
  }

  /**
   * Get request count for domain in current window.
   */
  getDomainRequestCount(domain) {
    return this._domains.requestCounts.get(domain) || 0;
  }

  /**
   * Get time since last request to domain (ms).
   */
  getTimeSinceLastRequest(domain) {
    const last = this._domains.lastRequestTime.get(domain);
    if (!last) return Infinity;
    return Date.now() - last;
  }

  /**
   * Record an error for a domain.
   */
  recordDomainError(domain, reason = 'unknown') {
    const count = (this._domains.errorCounts.get(domain) || 0) + 1;
    this._domains.errorCounts.set(domain, count);

    // Keep error history
    if (!this._domains.errorHistory.has(domain)) {
      this._domains.errorHistory.set(domain, []);
    }
    const history = this._domains.errorHistory.get(domain);
    history.push({ timestamp: Date.now(), reason });

    // Limit history size
    if (history.length > 100) {
      history.shift();
    }

    this.emit('domain:error', { domain, reason, errorCount: count });
  }

  /**
   * Get error count for domain.
   */
  getDomainErrorCount(domain) {
    return this._domains.errorCounts.get(domain) || 0;
  }

  /**
   * Throttle a domain for specified duration.
   */
  throttleDomain(domain, durationMs) {
    const until = Date.now() + durationMs;
    this._domains.throttledUntil.set(domain, until);
    this._stats.rateLimited++;
    this.emit('domain:throttled', { domain, durationMs, until });
  }

  /**
   * Unthrottle a domain immediately.
   */
  unthrottleDomain(domain) {
    if (this._domains.throttledUntil.has(domain)) {
      this._domains.throttledUntil.delete(domain);
      this.emit('domain:unthrottled', { domain });
    }
  }

  /**
   * Block a domain permanently (for this crawl).
   */
  blockDomain(domain, reason = 'unknown') {
    this._domains.blocked.add(domain);
    this.emit('domain:blocked', { domain, reason });
  }

  /**
   * Get all seen domains.
   */
  get seenDomains() {
    return [...this._domains.seen];
  }

  /**
   * Get count of unique domains seen.
   */
  get domainCount() {
    return this._domains.seen.size;
  }

  // ============================================================
  // CONTENT TRACKING
  // ============================================================

  /**
   * Record an article was found.
   */
  recordArticle(url, metadata = {}) {
    this._content.articleUrls.add(url);
    this._stats.articles++;
    this.emit('article:found', { url, ...metadata });
    this.emit('stats:change', { name: 'articles', newValue: this._stats.articles, delta: 1 });
  }

  /**
   * Check if URL was identified as an article.
   */
  isArticle(url) {
    return this._content.articleUrls.has(url);
  }

  /**
   * Record a hub/navigation page.
   */
  recordHub(url, metadata = {}) {
    this._content.hubUrls.add(url);
    this._stats.navigation++;
    this.emit('hub:found', { url, ...metadata });
    this.emit('stats:change', { name: 'navigation', newValue: this._stats.navigation, delta: 1 });
  }

  /**
   * Check if URL was identified as a hub.
   */
  isHub(url) {
    return this._content.hubUrls.has(url);
  }

  /**
   * Record a URL from sitemap.
   */
  recordSitemapUrl(url) {
    this._content.sitemapUrls.add(url);
  }

  /**
   * Check if URL came from sitemap.
   */
  isFromSitemap(url) {
    return this._content.sitemapUrls.has(url);
  }

  /**
   * Record bytes downloaded.
   */
  recordDownload(bytes, fetchMs = 0) {
    this._stats.bytesDownloaded += bytes;
    this._timing.totalFetchMs += fetchMs;
    this._timing.fetchCount++;
    this.emit('stats:change', { name: 'bytesDownloaded', newValue: this._stats.bytesDownloaded, delta: bytes });
  }

  /**
   * Record a cache hit.
   */
  recordCacheHit() {
    this._stats.cacheHits++;
    this.emit('stats:change', { name: 'cacheHits', newValue: this._stats.cacheHits, delta: 1 });
  }

  /**
   * Record a cache miss.
   */
  recordCacheMiss() {
    this._stats.cacheMisses++;
    this.emit('stats:change', { name: 'cacheMisses', newValue: this._stats.cacheMisses, delta: 1 });
  }

  /**
   * Record an error.
   */
  recordError(url, error) {
    this._stats.errors++;
    this.emit('url:error', {
      url,
      error: error?.message || String(error),
      timestamp: Date.now()
    });
    this.emit('stats:change', { name: 'errors', newValue: this._stats.errors, delta: 1 });
  }

  /**
   * Record a retry.
   */
  recordRetry(url, attempt) {
    this._stats.retries++;
    this.emit('retry', { url, attempt });
    this.emit('stats:change', { name: 'retries', newValue: this._stats.retries, delta: 1 });
  }

  // ============================================================
  // DIAGNOSTICS (Problems & Milestones)
  // ============================================================

  /**
   * Add a problem.
   */
  addProblem(problem) {
    const entry = {
      ...problem,
      id: `prob-${this._diagnostics.problems.length + 1}`,
      timestamp: Date.now()
    };
    this._diagnostics.problems.push(entry);

    const kind = problem.kind || 'unknown';
    this._diagnostics.problemCounts.set(
      kind,
      (this._diagnostics.problemCounts.get(kind) || 0) + 1
    );

    this.emit('problem', entry);
    return entry;
  }

  /**
   * Add a milestone.
   */
  addMilestone(milestone) {
    const entry = {
      ...milestone,
      id: `mile-${this._diagnostics.milestones.length + 1}`,
      timestamp: Date.now()
    };
    this._diagnostics.milestones.push(entry);

    const kind = milestone.kind || 'unknown';
    this._diagnostics.milestoneCounts.set(
      kind,
      (this._diagnostics.milestoneCounts.get(kind) || 0) + 1
    );

    this.emit('milestone', entry);
    return entry;
  }

  /**
   * Add a milestone only if not already emitted (by kind).
   */
  addMilestoneOnce(kind, milestone) {
    if (this._diagnostics.emittedMilestones.has(kind)) {
      return null;
    }
    this._diagnostics.emittedMilestones.add(kind);
    return this.addMilestone({ kind, ...milestone });
  }

  /**
   * Get all problems.
   */
  get problems() {
    return [...this._diagnostics.problems];
  }

  /**
   * Get all milestones.
   */
  get milestones() {
    return [...this._diagnostics.milestones];
  }

  /**
   * Get problem count by kind.
   */
  getProblemCount(kind) {
    return this._diagnostics.problemCounts.get(kind) || 0;
  }

  /**
   * Get milestone count by kind.
   */
  getMilestoneCount(kind) {
    return this._diagnostics.milestoneCounts.get(kind) || 0;
  }

  // ============================================================
  // TIMING & PERFORMANCE
  // ============================================================

  /**
   * Get average fetch time in ms.
   */
  get averageFetchMs() {
    if (this._timing.fetchCount === 0) return 0;
    return this._timing.totalFetchMs / this._timing.fetchCount;
  }

  /**
   * Get pages per second rate.
   */
  get pagesPerSecond() {
    const elapsed = this.elapsedMs / 1000;
    if (elapsed === 0) return 0;
    return this._stats.visited / elapsed;
  }

  /**
   * Get bytes per second rate.
   */
  get bytesPerSecond() {
    const elapsed = this.elapsedMs / 1000;
    if (elapsed === 0) return 0;
    return this._stats.bytesDownloaded / elapsed;
  }

  /**
   * Get time since last activity.
   */
  get idleMs() {
    if (!this._timing.lastActivityAt) return 0;
    return Date.now() - this._timing.lastActivityAt;
  }

  // ============================================================
  // BUDGET CHECKS
  // ============================================================

  /**
   * Check if page budget is exhausted.
   */
  isPageBudgetExhausted() {
    if (this.maxPages === undefined || this.maxPages === null) return false;
    return this._stats.visited >= this.maxPages;
  }

  /**
   * Get remaining page budget.
   */
  get remainingPages() {
    if (this.maxPages === undefined || this.maxPages === null) return Infinity;
    return Math.max(0, this.maxPages - this._stats.visited);
  }

  /**
   * Get completion percentage (based on maxPages or queue).
   */
  get completionPercent() {
    if (this.maxPages) {
      return Math.min(100, (this._stats.visited / this.maxPages) * 100);
    }
    const total = this._stats.visited + this._urls.queued.size;
    if (total === 0) return 0;
    return (this._stats.visited / total) * 100;
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  /**
   * Get a JSON-serializable snapshot of the context.
   */
  toJSON() {
    return {
      jobId: this.jobId,
      startUrl: this.startUrl,
      crawlType: this.crawlType,
      status: this._status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsedMs: this.elapsedMs,

      stats: this.stats,

      urls: {
        visited: this._urls.visited.size,
        queued: this._urls.queued.size,
        discovered: this._urls.discovered.size,
        decisions: this._urls.decisions.size,
        analyses: this._urls.analyses.size
      },

      domains: {
        seen: this._domains.seen.size,
        throttled: this._domains.throttledUntil.size,
        blocked: this._domains.blocked.size
      },

      content: {
        articles: this._content.articleUrls.size,
        hubs: this._content.hubUrls.size,
        fromSitemap: this._content.sitemapUrls.size
      },

      diagnostics: {
        problems: this._diagnostics.problems.length,
        milestones: this._diagnostics.milestones.length
      },

      performance: {
        pagesPerSecond: this.pagesPerSecond,
        bytesPerSecond: this.bytesPerSecond,
        averageFetchMs: this.averageFetchMs,
        completionPercent: this.completionPercent
      }
    };
  }

  /**
   * Get detailed snapshot (including some data).
   */
  toDetailedJSON() {
    const base = this.toJSON();
    return {
      ...base,
      recentProblems: this._diagnostics.problems.slice(-10),
      recentMilestones: this._diagnostics.milestones.slice(-10),
      throttledDomains: [...this._domains.throttledUntil.keys()],
      blockedDomains: [...this._domains.blocked],
      topDomains: this._getTopDomains(10)
    };
  }

  /**
   * Get top N domains by request count.
   * @private
   */
  _getTopDomains(n) {
    return [...this._domains.requestCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([domain, count]) => ({ domain, count }));
  }

  // ============================================================
  // MIGRATION SUPPORT
  // ============================================================

  /**
   * Migrate from an existing CrawlerState object.
   * @private
   */
  _migrateFromExistingState(state) {
    // Copy stats
    if (state.visited !== undefined) this._stats.visited = state.visited;
    if (state.queued !== undefined) this._stats.queued = state.queued;
    if (state.articles !== undefined) this._stats.articles = state.articles;
    if (state.errors !== undefined) this._stats.errors = state.errors;

    // Copy URL sets if available
    if (state.visitedUrls instanceof Set) {
      this._urls.visited = new Set(state.visitedUrls);
    }
    if (state.queuedUrls instanceof Set) {
      this._urls.queued = new Set(state.queuedUrls);
    }
  }

  /**
   * Create a CrawlerState-compatible interface for backward compatibility.
   * @deprecated Use CrawlContext methods directly
   */
  toLegacyState() {
    const self = this;
    return {
      get visited() { return self._stats.visited; },
      set visited(v) { self._stats.visited = v; },
      get queued() { return self._stats.queued; },
      set queued(v) { self._stats.queued = v; },
      get articles() { return self._stats.articles; },
      set articles(v) { self._stats.articles = v; },
      get errors() { return self._stats.errors; },
      set errors(v) { self._stats.errors = v; },
      get bytesDownloaded() { return self._stats.bytesDownloaded; },
      set bytesDownloaded(v) { self._stats.bytesDownloaded = v; },

      // Expose sets for compatibility
      visitedUrls: self._urls.visited,
      queuedUrls: self._urls.queued
    };
  }

  // ============================================================
  // FACTORY
  // ============================================================

  /**
   * Create a new CrawlContext.
   */
  static create(options = {}) {
    return new CrawlContext(options);
  }

  /**
   * Create from crawler config object.
   */
  static fromConfig(config) {
    return new CrawlContext({
      jobId: config.jobId,
      startUrl: config.startUrl,
      crawlType: config.crawlType,
      maxDepth: config.maxDepth,
      maxPages: config.maxPages
    });
  }
}

module.exports = CrawlContext;
