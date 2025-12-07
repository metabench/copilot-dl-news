'use strict';

const EventEmitter = require('events');

/**
 * UrlDecisionOrchestrator - Centralized URL eligibility decisions.
 *
 * Consolidates decision logic previously scattered across:
 * - UrlPolicy (syntax validation, extension filtering)
 * - UrlDecisionService (caching decisions)
 * - FetchPipeline (skip handling)
 * - PageExecutionService (per-page decisions)
 * - QueueManager (depth/domain checks, visited tracking)
 *
 * Decision flow:
 * 1. Syntax validation (is URL valid?)
 * 2. Policy checks (robots.txt, same-domain, depth, patterns)
 * 3. State checks (already visited? already queued?)
 * 4. Resource checks (domain throttled? budget exceeded?)
 * 5. Freshness checks (cached version available and fresh?)
 *
 * Returns a decision object with action and reason.
 *
 * @extends EventEmitter
 */
class UrlDecisionOrchestrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {CrawlContext} options.context - CrawlContext for state tracking
   * @param {Object} options.robotsChecker - Robots.txt checker
   * @param {Object} options.config - URL policy configuration
   */
  constructor(options = {}) {
    super();

    this.context = options.context;
    this.robotsChecker = options.robotsChecker;

    // Configuration
    this.config = {
      // Domain constraints
      stayOnDomain: options.config?.stayOnDomain ?? true,
      startDomain: options.config?.startDomain ?? null,
      allowedDomains: options.config?.allowedDomains ?? null, // Set or null
      blockedDomains: options.config?.blockedDomains ?? new Set(),

      // Depth constraints
      maxDepth: options.config?.maxDepth ?? Infinity,

      // URL filtering
      respectRobots: options.config?.respectRobots ?? true,
      skipQueryUrls: options.config?.skipQueryUrls ?? true,
      skipFragmentUrls: options.config?.skipFragmentUrls ?? true,

      // Extension filtering
      blockedExtensions: options.config?.blockedExtensions ?? new Set([
        '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
        '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
        '.zip', '.tar', '.gz', '.rar', '.7z',
        '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.exe', '.dmg', '.iso', '.bin',
        '.css', '.js', '.json', '.xml', '.rss', '.atom'
      ]),

      // Path filtering
      blockedPathPatterns: options.config?.blockedPathPatterns ?? [
        /\/search\b/i,
        /\/login\b/i,
        /\/logout\b/i,
        /\/register\b/i,
        /\/signup\b/i,
        /\/admin\b/i,
        /\/wp-admin\b/i,
        /\/api\b/i,
        /\/feed\b/i,
        /\/rss\b/i,
        /\/print\b/i,
        /\/share\b/i,
        /\/email\b/i
      ],

      // Budget constraints
      maxPages: options.config?.maxPages ?? null,

      // Cache freshness
      maxAge: options.config?.maxAge ?? null, // ms, or null for no caching
      articleMaxAge: options.config?.articleMaxAge ?? null,
      hubMaxAge: options.config?.hubMaxAge ?? null
    };

    // Decision cache for performance
    this._cache = new Map();
    this._cacheMaxSize = options.cacheMaxSize ?? 50000;
    this._cacheEnabled = options.cacheEnabled ?? true;

    // Statistics
    this._stats = {
      decisions: 0,
      fetches: 0,
      skips: 0,
      cacheHits: 0,
      byReason: new Map()
    };
  }

  // ============================================================
  // MAIN DECISION API
  // ============================================================

  /**
   * Decide what to do with a URL.
   *
   * @param {string} url - The URL to evaluate
   * @param {Object} metadata - Additional context
   * @param {string} metadata.referrer - URL that linked to this URL
   * @param {number} metadata.depth - Current crawl depth
   * @param {number} metadata.priority - Priority score
   * @param {string} metadata.classification - 'article', 'hub', 'unknown'
   * @param {boolean} metadata.forceRecheck - Skip cache
   * @returns {Promise<Decision>}
   *
   * @typedef {Object} Decision
   * @property {string} action - 'fetch', 'cache', 'skip', 'defer', 'queue'
   * @property {string} reason - Why this decision was made
   * @property {Object} [details] - Additional details
   * @property {Object} [cachedData] - Cached data if action is 'cache'
   */
  async decide(url, metadata = {}) {
    this._stats.decisions++;

    // Check decision cache first (not content cache)
    if (this._cacheEnabled && !metadata.forceRecheck) {
      const cached = this._getCachedDecision(url);
      if (cached) {
        this._stats.cacheHits++;
        return cached;
      }
    }

    // Run evaluation
    const decision = await this._evaluate(url, metadata);

    // Cache the decision
    if (this._cacheEnabled && decision.action === 'skip') {
      // Only cache skip decisions (they won't change)
      this._cacheDecision(url, decision);
    }

    // Record in context
    if (this.context) {
      this.context.setUrlDecision(url, decision.action, decision.reason);
    }

    // Update stats
    this._recordStats(decision);

    // Emit event
    this.emit('decision', { url, decision, metadata });

    return decision;
  }

  /**
   * Quick check if URL should be queued (lighter than full decide).
   * Use this when discovering links.
   *
   * @param {string} url - URL to check
   * @param {Object} metadata - { referrer, depth }
   * @returns {QueueDecision}
   *
   * @typedef {Object} QueueDecision
   * @property {boolean} shouldQueue - Whether to add to queue
   * @property {string} [reason] - Reason if not queuing
   */
  shouldQueue(url, metadata = {}) {
    // Syntax check
    const syntax = this._checkSyntax(url);
    if (!syntax.ok) {
      return { shouldQueue: false, reason: syntax.reason };
    }

    // Already seen?
    if (this.context?.hasSeen(url)) {
      return { shouldQueue: false, reason: 'already-seen' };
    }

    // Quick policy check (synchronous parts only)
    const policy = this._checkPolicySync(syntax.parsed, metadata);
    if (!policy.ok) {
      return { shouldQueue: false, reason: policy.reason };
    }

    return { shouldQueue: true };
  }

  /**
   * Batch decide for multiple URLs.
   * @param {Array<{url: string, metadata: Object}>} urls
   * @returns {Promise<Map<string, Decision>>}
   */
  async decideBatch(urls) {
    const results = new Map();

    // Process in parallel with concurrency limit
    const concurrency = 10;
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const decisions = await Promise.all(
        batch.map(({ url, metadata }) => this.decide(url, metadata))
      );
      batch.forEach(({ url }, idx) => {
        results.set(url, decisions[idx]);
      });
    }

    return results;
  }

  // ============================================================
  // EVALUATION PIPELINE
  // ============================================================

  async _evaluate(url, metadata) {
    // 1. Syntax validation
    const syntaxCheck = this._checkSyntax(url);
    if (!syntaxCheck.ok) {
      return this._skipDecision(syntaxCheck.reason, syntaxCheck.details);
    }

    const parsedUrl = syntaxCheck.parsed;
    const host = parsedUrl.hostname;

    // 2. Policy checks (sync)
    const policyCheck = this._checkPolicySync(parsedUrl, metadata);
    if (!policyCheck.ok) {
      return this._skipDecision(policyCheck.reason, policyCheck.details);
    }

    // 3. Robots.txt check (async)
    if (this.config.respectRobots && this.robotsChecker) {
      const robotsCheck = await this._checkRobots(parsedUrl);
      if (!robotsCheck.ok) {
        return this._skipDecision('robots-disallowed', { path: parsedUrl.pathname });
      }
    }

    // 4. State checks
    const stateCheck = this._checkState(url);
    if (!stateCheck.ok) {
      return this._skipDecision(stateCheck.reason);
    }

    // 5. Resource checks
    const resourceCheck = this._checkResources(host, metadata);
    if (!resourceCheck.ok) {
      if (resourceCheck.defer) {
        return {
          action: 'defer',
          reason: resourceCheck.reason,
          retryAfter: resourceCheck.retryAfter
        };
      }
      return this._skipDecision(resourceCheck.reason);
    }

    // 6. Freshness / cache check (if cache service available)
    const freshnessCheck = await this._checkFreshness(url, metadata);
    if (freshnessCheck.useCached) {
      return {
        action: 'cache',
        reason: 'fresh-cache',
        cachedData: freshnessCheck.data,
        details: { cachedAt: freshnessCheck.cachedAt }
      };
    }

    // All checks passed - proceed with fetch
    this._stats.fetches++;
    return {
      action: 'fetch',
      reason: 'eligible',
      details: {
        depth: metadata.depth,
        classification: metadata.classification
      }
    };
  }

  // ============================================================
  // INDIVIDUAL CHECKS
  // ============================================================

  _checkSyntax(url) {
    // Basic type check
    if (typeof url !== 'string' || url.length === 0) {
      return { ok: false, reason: 'invalid-url', details: 'empty or non-string' };
    }

    // Try parsing
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { ok: false, reason: 'invalid-url', details: e.message };
    }

    // Protocol check
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, reason: 'invalid-protocol', details: parsed.protocol };
    }

    // Extension check
    const pathname = parsed.pathname.toLowerCase();
    for (const ext of this.config.blockedExtensions) {
      if (pathname.endsWith(ext)) {
        return { ok: false, reason: 'blocked-extension', details: ext };
      }
    }

    // Fragment-only URLs (same page anchors)
    if (this.config.skipFragmentUrls && parsed.hash && !parsed.pathname) {
      return { ok: false, reason: 'fragment-only' };
    }

    return { ok: true, parsed };
  }

  _checkPolicySync(parsedUrl, metadata) {
    const { hostname, pathname, search } = parsedUrl;

    // Same-domain check
    if (this.config.stayOnDomain && this.config.startDomain) {
      if (!this._isSameDomain(hostname, this.config.startDomain)) {
        return { ok: false, reason: 'off-domain', details: { hostname } };
      }
    }

    // Allowed domains check (whitelist)
    if (this.config.allowedDomains && this.config.allowedDomains.size > 0) {
      const allowed = [...this.config.allowedDomains].some(d => this._isSameDomain(hostname, d));
      if (!allowed) {
        return { ok: false, reason: 'domain-not-allowed', details: { hostname } };
      }
    }

    // Blocked domains check (blacklist)
    if (this.config.blockedDomains.has(hostname)) {
      return { ok: false, reason: 'domain-blocked', details: { hostname } };
    }

    // Depth check
    const depth = metadata.depth ?? 0;
    if (this.config.maxDepth !== Infinity && depth > this.config.maxDepth) {
      return { ok: false, reason: 'max-depth-exceeded', details: { depth, maxDepth: this.config.maxDepth } };
    }

    // Query string check
    if (this.config.skipQueryUrls && search && search.length > 1) {
      return { ok: false, reason: 'has-query-string' };
    }

    // Path pattern check
    for (const pattern of this.config.blockedPathPatterns) {
      if (pattern.test(pathname)) {
        return { ok: false, reason: 'blocked-path-pattern', details: { pattern: pattern.toString() } };
      }
    }

    return { ok: true };
  }

  async _checkRobots(parsedUrl) {
    if (!this.robotsChecker) return { ok: true };

    try {
      const allowed = await this.robotsChecker.isAllowed(parsedUrl.href);
      return { ok: allowed };
    } catch (e) {
      // On robots.txt fetch error, allow by default
      return { ok: true };
    }
  }

  _checkState(url) {
    if (!this.context) return { ok: true };

    if (this.context.hasVisited(url)) {
      return { ok: false, reason: 'already-visited' };
    }

    // Note: We don't skip queued URLs here - that's for queue deduplication
    // This check is for deciding whether to fetch a specific URL

    return { ok: true };
  }

  _checkResources(host, metadata) {
    if (!this.context) return { ok: true };

    // Domain blocked?
    if (this.context.isDomainBlocked(host)) {
      return { ok: false, reason: 'domain-blocked' };
    }

    // Domain throttled?
    if (this.context.isDomainThrottled(host)) {
      const remaining = this.context.getDomainThrottleRemaining(host);
      return {
        ok: false,
        defer: true,
        reason: 'domain-throttled',
        retryAfter: Date.now() + remaining
      };
    }

    // Page budget check
    if (this.config.maxPages !== null && this.context.stats.visited >= this.config.maxPages) {
      return { ok: false, reason: 'page-budget-exceeded' };
    }

    return { ok: true };
  }

  async _checkFreshness(url, metadata) {
    // No cache service or max age configured
    if (!this.config.maxAge) {
      return { useCached: false };
    }

    // Get cached data (implementation depends on cache service)
    // For now, return false - integrations should override this
    return { useCached: false };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _isSameDomain(hostname, baseDomain) {
    if (hostname === baseDomain) return true;
    return hostname.endsWith('.' + baseDomain);
  }

  _skipDecision(reason, details = null) {
    this._stats.skips++;
    return {
      action: 'skip',
      reason,
      details
    };
  }

  _recordStats(decision) {
    const count = this._stats.byReason.get(decision.reason) || 0;
    this._stats.byReason.set(decision.reason, count + 1);
  }

  // ============================================================
  // DECISION CACHE
  // ============================================================

  _getCachedDecision(url) {
    const entry = this._cache.get(url);
    if (!entry) return null;

    // Expire after 5 minutes
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
      this._cache.delete(url);
      return null;
    }

    return entry.decision;
  }

  _cacheDecision(url, decision) {
    // Evict oldest if at capacity
    if (this._cache.size >= this._cacheMaxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }

    this._cache.set(url, { decision, timestamp: Date.now() });
  }

  clearCache() {
    this._cache.clear();
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  /**
   * Update configuration dynamically.
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);

    // Clear cache when config changes
    this.clearCache();

    this.emit('config-updated', updates);
  }

  /**
   * Set the start domain (useful when URL is resolved after construction).
   */
  setStartDomain(domain) {
    this.config.startDomain = domain;
    this.clearCache();
  }

  /**
   * Add a domain to the blocked list.
   */
  blockDomain(domain) {
    this.config.blockedDomains.add(domain);
    this.clearCache();
  }

  /**
   * Add a path pattern to block.
   */
  addBlockedPattern(pattern) {
    if (typeof pattern === 'string') {
      pattern = new RegExp(pattern, 'i');
    }
    this.config.blockedPathPatterns.push(pattern);
    this.clearCache();
  }

  // ============================================================
  // STATISTICS & DEBUGGING
  // ============================================================

  /**
   * Get decision statistics.
   */
  getStats() {
    return {
      total: this._stats.decisions,
      fetches: this._stats.fetches,
      skips: this._stats.skips,
      cacheHits: this._stats.cacheHits,
      byReason: Object.fromEntries(this._stats.byReason),
      cacheSize: this._cache.size
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this._stats = {
      decisions: 0,
      fetches: 0,
      skips: 0,
      cacheHits: 0,
      byReason: new Map()
    };
  }

  /**
   * Explain why a URL would be skipped (debugging helper).
   */
  async explain(url, metadata = {}) {
    const decision = await this.decide(url, { ...metadata, forceRecheck: true });
    return {
      url,
      decision,
      config: {
        stayOnDomain: this.config.stayOnDomain,
        startDomain: this.config.startDomain,
        maxDepth: this.config.maxDepth,
        skipQueryUrls: this.config.skipQueryUrls,
        respectRobots: this.config.respectRobots
      },
      metadata
    };
  }
}

module.exports = UrlDecisionOrchestrator;
