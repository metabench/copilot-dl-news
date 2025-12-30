'use strict';

const { EventEmitter } = require('events');

/**
 * RateLimitTracker — Learns and adapts to site-specific rate limits
 * 
 * Tracks 429/403 responses, implements exponential backoff,
 * and persists learned limits to database.
 * 
 * Events:
 *   - 'success': { domain, interval } - Request succeeded
 *   - 'rateLimit': { domain, statusCode, interval } - Rate limit hit
 *   - 'failure': { domain, error, interval } - General failure
 *   - 'intervalAdjusted': { domain, oldInterval, newInterval, reason }
 * 
 * @example
 * const tracker = new RateLimitTracker({ db, defaultIntervalMs: 1000 });
 * await tracker.initialize();
 * 
 * // Before request
 * const delay = tracker.getDelay('example.com');
 * await sleep(delay);
 * 
 * // After request
 * if (response.status === 429) {
 *   tracker.recordRateLimit('example.com', 429);
 * } else if (response.ok) {
 *   tracker.recordSuccess('example.com');
 * }
 */
class RateLimitTracker extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} [options.db=null] - Database adapter for persistence
   * @param {number} [options.defaultIntervalMs=1000] - Default interval between requests
   * @param {number} [options.maxIntervalMs=60000] - Maximum backoff interval
   * @param {number} [options.minIntervalMs=100] - Minimum interval (floor)
   * @param {number} [options.successStreakThreshold=5] - Successes before reducing interval
   * @param {number} [options.backoffMultiplier=2] - Multiplier for rate limit backoff
   * @param {number} [options.recoveryRate=0.9] - Rate at which interval decreases on success
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor({
    db = null,
    defaultIntervalMs = 1000,
    maxIntervalMs = 60000,
    minIntervalMs = 100,
    successStreakThreshold = 5,
    backoffMultiplier = 2,
    recoveryRate = 0.9,
    logger = console
  } = {}) {
    super();
    this.db = db;
    this.defaultIntervalMs = defaultIntervalMs;
    this.maxIntervalMs = maxIntervalMs;
    this.minIntervalMs = minIntervalMs;
    this.successStreakThreshold = successStreakThreshold;
    this.backoffMultiplier = backoffMultiplier;
    this.recoveryRate = recoveryRate;
    this.logger = logger;
    
    // domain -> DomainState
    this._domainState = new Map();
    
    // Metrics
    this._metrics = {
      totalRequests: 0,
      totalRateLimits: 0,
      totalFailures: 0,
      domainsTracked: 0
    };
  }

  /**
   * Initialize the tracker, loading persisted state from DB
   */
  async initialize() {
    if (this.db) {
      await this._loadFromDb();
    }
    this.logger.debug?.('[RateLimitTracker] Initialized');
  }

  /**
   * Record a successful request
   * @param {string} domain - Domain name
   */
  recordSuccess(domain) {
    const state = this._getOrCreate(domain);
    const oldInterval = state.currentIntervalMs;
    
    state.consecutiveSuccess++;
    state.consecutiveFails = 0;
    state.lastRequest = Date.now();
    state.totalRequests++;
    this._metrics.totalRequests++;
    
    // Gradually decrease interval on success streak
    if (state.consecutiveSuccess >= this.successStreakThreshold) {
      const newInterval = Math.max(
        this.minIntervalMs,
        Math.round(state.currentIntervalMs * this.recoveryRate)
      );
      
      if (newInterval !== oldInterval) {
        state.currentIntervalMs = newInterval;
        state.consecutiveSuccess = 0;
        
        this.emit('intervalAdjusted', {
          domain,
          oldInterval,
          newInterval,
          reason: 'success-streak'
        });
      }
    }
    
    this.emit('success', { domain, interval: state.currentIntervalMs });
  }

  /**
   * Record a rate limit hit (429/403)
   * @param {string} domain - Domain name
   * @param {number} statusCode - HTTP status code (429, 403, etc)
   * @param {Object} [headers={}] - Response headers (may contain Retry-After)
   * @returns {number} - New interval to use
   */
  recordRateLimit(domain, statusCode, headers = {}) {
    const state = this._getOrCreate(domain);
    const oldInterval = state.currentIntervalMs;
    
    state.rateLimitHits++;
    state.consecutiveFails++;
    state.consecutiveSuccess = 0;
    state.lastRequest = Date.now();
    state.lastRateLimitAt = Date.now();
    this._metrics.totalRateLimits++;
    
    // Check for Retry-After header
    let newInterval;
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    
    if (retryAfter) {
      const parsedRetry = this._parseRetryAfter(retryAfter);
      if (parsedRetry) {
        newInterval = Math.min(this.maxIntervalMs, parsedRetry);
      }
    }
    
    // Default: exponential backoff
    if (!newInterval) {
      newInterval = Math.min(
        this.maxIntervalMs,
        Math.round(state.currentIntervalMs * this.backoffMultiplier)
      );
    }
    
    state.currentIntervalMs = newInterval;
    
    this.logger.warn(
      `[RateLimitTracker] ${domain} hit rate limit (${statusCode}), ` +
      `interval ${oldInterval}ms → ${newInterval}ms`
    );
    
    this.emit('rateLimit', { domain, statusCode, interval: newInterval });
    this.emit('intervalAdjusted', {
      domain,
      oldInterval,
      newInterval,
      reason: `rate-limit-${statusCode}`
    });
    
    return newInterval;
  }

  /**
   * Record a general failure (not rate limit)
   * @param {string} domain - Domain name
   * @param {Error|string} error - Error that occurred
   */
  recordFailure(domain, error) {
    const state = this._getOrCreate(domain);
    const oldInterval = state.currentIntervalMs;
    
    state.consecutiveFails++;
    state.consecutiveSuccess = 0;
    state.totalFailures++;
    this._metrics.totalFailures++;
    
    // Mild backoff for general failures
    if (state.consecutiveFails >= 3) {
      const newInterval = Math.min(
        this.maxIntervalMs,
        Math.round(state.currentIntervalMs * 1.5)
      );
      
      if (newInterval !== oldInterval) {
        state.currentIntervalMs = newInterval;
        
        this.emit('intervalAdjusted', {
          domain,
          oldInterval,
          newInterval,
          reason: 'consecutive-failures'
        });
      }
    }
    
    this.emit('failure', { 
      domain, 
      error: typeof error === 'string' ? error : error.message,
      interval: state.currentIntervalMs 
    });
  }

  /**
   * Get recommended delay before next request
   * @param {string} domain - Domain name
   * @returns {number} - Milliseconds to wait
   */
  getDelay(domain) {
    const state = this._domainState.get(domain);
    if (!state) return 0;
    
    const elapsed = Date.now() - state.lastRequest;
    const remaining = state.currentIntervalMs - elapsed;
    
    return Math.max(0, remaining);
  }

  /**
   * Get current interval for a domain
   * @param {string} domain - Domain name
   * @returns {number} - Current interval in ms
   */
  getInterval(domain) {
    const state = this._domainState.get(domain);
    return state ? state.currentIntervalMs : this.defaultIntervalMs;
  }

  /**
   * Set interval for a domain manually
   * @param {string} domain - Domain name
   * @param {number} intervalMs - Interval in ms
   */
  setInterval(domain, intervalMs) {
    const state = this._getOrCreate(domain);
    const oldInterval = state.currentIntervalMs;
    state.currentIntervalMs = Math.min(
      this.maxIntervalMs,
      Math.max(this.minIntervalMs, intervalMs)
    );
    
    this.emit('intervalAdjusted', {
      domain,
      oldInterval,
      newInterval: state.currentIntervalMs,
      reason: 'manual'
    });
  }

  /**
   * Reset a domain's state to defaults
   * @param {string} domain - Domain name
   */
  resetDomain(domain) {
    const existed = this._domainState.has(domain);
    this._domainState.delete(domain);
    
    if (existed) {
      this._metrics.domainsTracked = this._domainState.size;
    }
  }

  /**
   * Get all domain states
   * @returns {Object} - Map of domain -> state
   */
  getAllStates() {
    const result = {};
    for (const [domain, state] of this._domainState) {
      result[domain] = { ...state };
    }
    return result;
  }

  /**
   * Get a specific domain's state
   * @param {string} domain - Domain name
   * @returns {Object|null} - Domain state or null
   */
  getDomainState(domain) {
    const state = this._domainState.get(domain);
    return state ? { ...state } : null;
  }

  /**
   * Get domains with elevated rate limits
   * @returns {Array<{domain: string, interval: number, hits: number}>}
   */
  getThrottledDomains() {
    const throttled = [];
    const threshold = this.defaultIntervalMs * 2;
    
    for (const [domain, state] of this._domainState) {
      if (state.currentIntervalMs > threshold) {
        throttled.push({
          domain,
          interval: state.currentIntervalMs,
          hits: state.rateLimitHits,
          lastRateLimitAt: state.lastRateLimitAt
        });
      }
    }
    
    return throttled.sort((a, b) => b.interval - a.interval);
  }

  /**
   * Get overall metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this._metrics,
      domainsTracked: this._domainState.size
    };
  }

  /**
   * Persist state to database
   */
  async persist() {
    if (!this.db) return;
    
    try {
      const adapter = this._getRateLimitAdapter();
      if (!adapter) {
        this.logger.debug('[RateLimitTracker] No rate limit adapter available');
        return;
      }
      
      for (const [domain, state] of this._domainState) {
        await adapter.saveRateLimit(domain, state.currentIntervalMs, state.rateLimitHits);
      }
      
      this.logger.debug(`[RateLimitTracker] Persisted ${this._domainState.size} domain states`);
    } catch (err) {
      this.logger.error('[RateLimitTracker] Failed to persist:', err.message);
    }
  }

  /**
   * Load persisted state from database
   * @private
   */
  async _loadFromDb() {
    try {
      const adapter = this._getRateLimitAdapter();
      if (!adapter) {
        this.logger.debug('[RateLimitTracker] No rate limit adapter available');
        return;
      }
      
      const limits = await adapter.getAllRateLimits();
      
      for (const record of limits) {
        const state = this._getOrCreate(record.domain);
        state.currentIntervalMs = record.interval;
        state.rateLimitHits = record.hits || 0;
        state.loadedFromDb = true;
      }
      
      this.logger.debug(`[RateLimitTracker] Loaded ${limits.length} domain states from DB`);
    } catch (err) {
      this.logger.error('[RateLimitTracker] Failed to load from DB:', err.message);
    }
  }

  /**
   * Get rate limit adapter from database
   * @private
   */
  _getRateLimitAdapter() {
    if (!this.db) return null;
    
    // Try to get adapter if it exists
    if (typeof this.db.getRateLimitAdapter === 'function') {
      return this.db.getRateLimitAdapter();
    }
    
    // Return null if adapter doesn't exist (stub behavior)
    return null;
  }

  /**
   * Get or create domain state
   * @private
   */
  _getOrCreate(domain) {
    if (!this._domainState.has(domain)) {
      this._domainState.set(domain, {
        currentIntervalMs: this.defaultIntervalMs,
        lastRequest: 0,
        lastRateLimitAt: null,
        consecutiveSuccess: 0,
        consecutiveFails: 0,
        rateLimitHits: 0,
        totalRequests: 0,
        totalFailures: 0,
        loadedFromDb: false
      });
      this._metrics.domainsTracked = this._domainState.size;
    }
    return this._domainState.get(domain);
  }

  /**
   * Parse Retry-After header
   * @private
   * @param {string} value - Header value
   * @returns {number|null} - Milliseconds to wait or null
   */
  _parseRetryAfter(value) {
    if (!value) return null;
    
    // Try as integer seconds
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    
    // Try as HTTP date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const delay = date.getTime() - Date.now();
      return delay > 0 ? delay : null;
    }
    
    return null;
  }
}

module.exports = { RateLimitTracker };
