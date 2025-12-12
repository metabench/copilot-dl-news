'use strict';

const EventEmitter = require('events');

/**
 * RetryCoordinator - Unified retry handling across all levels.
 *
 * Consolidates retry logic previously scattered across:
 * - NetworkRetryPolicy (network-level retries)
 * - HostRetryBudgetManager (per-host error tracking)
 * - DomainThrottleManager (rate limiting)
 * - ErrorTracker (connection reset detection)
 *
 * Hierarchy of retry decisions:
 * 1. Network level - transient errors, timeouts (retry with backoff)
 * 2. Host level - per-host error budgets (lockout if too many errors)
 * 3. Domain level - rate limiting, throttling (defer requests)
 *
 * @extends EventEmitter
 */
class RetryCoordinator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {CrawlContext} options.context - CrawlContext for state tracking
   * @param {Object} options.network - Network retry config
   * @param {Object} options.host - Host budget config
   * @param {Object} options.domain - Domain throttle config
   */
  constructor(options = {}) {
    super();

    this.context = options.context;

    // Network retry configuration
    this.networkConfig = {
      maxRetries: options.maxRetries ?? options.network?.maxRetries ?? 3,
      baseDelayMs: options.baseDelayMs ?? options.network?.baseDelayMs ?? 1000,
      maxDelayMs: options.maxDelayMs ?? options.network?.maxDelayMs ?? 30000,
      jitterFactor: options.jitterFactor ?? options.network?.jitterFactor ?? 0.25,
      retryableStatuses: options.retryableStatuses ?? options.network?.retryableStatuses ?? [429, 500, 502, 503, 504]
    };

    // Host error budget configuration
    this.hostConfig = {
      windowMs: options.host?.windowMs ?? 60000,
      maxErrors: options.host?.maxErrors ?? 5,
      lockoutMs: options.host?.lockoutMs ?? 300000,
      cooldownMs: options.host?.cooldownMs ?? 60000
    };

    // Domain throttle configuration
    this.domainConfig = {
      requestsPerMinute: options.domain?.requestsPerMinute ?? 60,
      burstSize: options.domain?.burstSize ?? 10,
      minDelayMs: options.domain?.minDelayMs ?? 100,
      throttleDurationMs: options.domain?.throttleDurationMs ?? 5000
    };

    // Internal state (not using context to allow standalone usage)
    this._hostState = new Map();       // host -> { errors: [], lockedUntil, successCount }
    this._domainTokens = new Map();    // domain -> { tokens, lastRefill }
    this._connectionResets = new Map(); // host -> { count, firstSeen, lastSeen }
    this._recentRequests = new Map();   // host -> [timestamps]
  }

  // ============================================================
  // MAIN DECISION API
  // ============================================================

  /**
   * Determine if a request should be retried.
   *
   * @param {Object} request - Request information
   * @param {string} request.url - The URL that was requested
   * @param {number} request.attempt - Current attempt number (0-indexed)
   * @param {Error} request.error - Error that occurred (if any)
   * @param {Object} request.response - Response object (if any)
   * @returns {RetryDecision}
   *
   * @typedef {Object} RetryDecision
   * @property {boolean} shouldRetry - Whether to retry
   * @property {string} action - 'retry', 'defer', 'abandon', 'block-host'
   * @property {string} reason - Human-readable reason
   * @property {number} [delay] - Delay before retry in ms
   * @property {number} [retryAfter] - Timestamp when to retry
   */
  async shouldRetry(request) {
    const { url, attempt = 0, error, response } = request;

    let host;
    try {
      host = new URL(url).hostname;
    } catch (e) {
      return {
        shouldRetry: false,
        action: 'abandon',
        reason: 'invalid-url'
      };
    }

    // 1. Check if host is locked out
    const hostLockout = this._getHostLockout(host);
    if (hostLockout) {
      return {
        shouldRetry: false,
        action: 'defer',
        reason: 'host-locked-out',
        retryAfter: hostLockout.until,
        delay: hostLockout.remainingMs
      };
    }

    // 2. Classify the error/response
    const classification = this._classifyError(error, response);

    // 3. Handle based on classification
    let decision;
    switch (classification.type) {
      case 'success':
        this._recordSuccess(host);
        return { shouldRetry: false, action: 'success', reason: 'request-succeeded' };

      case 'transient':
        decision = this._handleTransient(host, attempt, classification);
        break;

      case 'rate-limited':
        decision = this._handleRateLimited(host, response, classification);
        break;

      case 'server-error':
        decision = this._handleServerError(host, attempt, classification);
        break;

      case 'connection-reset':
        decision = this._handleConnectionReset(host, attempt, classification);
        break;

      case 'timeout':
        decision = this._handleTimeout(host, attempt, classification);
        break;

      case 'permanent':
        decision = { shouldRetry: false, action: 'abandon', reason: classification.reason };
        break;

      default:
        decision = { shouldRetry: false, action: 'abandon', reason: 'unknown-error' };
    }

    // Emit event for monitoring
    this.emit('decision', { url, host, attempt, classification, decision });

    return decision;
  }

  /**
   * Record a successful request (clears/reduces error state).
   */
  recordSuccess(url) {
    try {
      const host = new URL(url).hostname;
      this._recordSuccess(host);
    } catch (e) {
      // Ignore invalid URLs
    }
  }

  /**
   * Pre-check if a request to this host should be attempted.
   * Call this before making the request.
   *
   * @param {string} url - URL to check
   * @returns {PreflightResult}
   *
   * @typedef {Object} PreflightResult
   * @property {boolean} allowed - Whether request should proceed
   * @property {string} [reason] - Reason if not allowed
   * @property {number} [waitMs] - Suggested wait time if not allowed
   */
  preflight(url) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch (e) {
      return { allowed: false, reason: 'invalid-url' };
    }

    // Check host lockout
    const lockout = this._getHostLockout(host);
    if (lockout) {
      return {
        allowed: false,
        reason: 'host-locked-out',
        waitMs: lockout.remainingMs
      };
    }

    // Check domain throttle (via context if available)
    if (this.context?.isDomainThrottled(host)) {
      const remaining = this.context.getDomainThrottleRemaining(host);
      return {
        allowed: false,
        reason: 'domain-throttled',
        waitMs: remaining
      };
    }

    return { allowed: true };
  }

  // ============================================================
  // TOKEN BUCKET RATE LIMITING
  // ============================================================

  /**
   * Acquire a rate limit token for a domain.
   * @param {string} domain - Domain to acquire token for
   * @returns {boolean} true if token acquired, false if should wait
   */
  acquireToken(domain) {
    const state = this._getDomainTokenState(domain);
    this._refillTokens(state);

    if (state.tokens > 0) {
      state.tokens--;
      return true;
    }
    return false;
  }

  /**
   * Get wait time until a token is available.
   * @param {string} domain - Domain to check
   * @returns {number} Milliseconds to wait, or 0 if token available
   */
  getTokenWaitTime(domain) {
    const state = this._getDomainTokenState(domain);
    this._refillTokens(state);

    if (state.tokens > 0) return 0;

    // Calculate time until next token
    const msPerToken = 60000 / this.domainConfig.requestsPerMinute;
    const elapsed = Date.now() - state.lastRefill;
    return Math.max(this.domainConfig.minDelayMs, msPerToken - elapsed);
  }

  /**
   * Wait for a token to become available.
   * @param {string} domain - Domain to wait for
   * @param {number} maxWaitMs - Maximum time to wait
   * @returns {Promise<boolean>} true if token acquired within timeout
   */
  async waitForToken(domain, maxWaitMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (this.acquireToken(domain)) {
        return true;
      }

      const waitTime = Math.min(
        this.getTokenWaitTime(domain),
        maxWaitMs - (Date.now() - startTime)
      );

      if (waitTime <= 0) break;

      await this._sleep(waitTime);
    }

    return false;
  }

  // ============================================================
  // ERROR CLASSIFICATION
  // ============================================================

  /**
   * Classify an error or response into a retry category.
   * @private
   */
  _classifyError(error, response) {
    // Check response status first
    if (response) {
      const status = response.status || response.statusCode;

      if (status >= 200 && status < 300) {
        return { type: 'success', reason: 'ok' };
      }
      if (status === 429) {
        return { type: 'rate-limited', reason: 'http-429', status };
      }
      if (status >= 500 && status < 600) {
        return { type: 'server-error', reason: `http-${status}`, status };
      }
      if (status === 403) {
        return { type: 'permanent', reason: 'forbidden' };
      }
      if (status === 404) {
        return { type: 'permanent', reason: 'not-found' };
      }
      if (status === 410) {
        return { type: 'permanent', reason: 'gone' };
      }
      if (status === 400) {
        return { type: 'permanent', reason: 'bad-request' };
      }
      if (status === 401) {
        return { type: 'permanent', reason: 'unauthorized' };
      }
    }

    // Check error type
    if (error) {
      const msg = (error.message || error.code || String(error)).toLowerCase();
      const code = error.code || '';

      // Connection reset
      if (code === 'ECONNRESET' || msg.includes('econnreset') || msg.includes('socket hang up')) {
        return { type: 'connection-reset', reason: 'connection-reset' };
      }

      // Timeout
      if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' ||
          msg.includes('timeout') || msg.includes('timed out')) {
        return { type: 'timeout', reason: 'timeout' };
      }

      // DNS failure - permanent
      if (code === 'ENOTFOUND' || msg.includes('getaddrinfo') || msg.includes('enotfound')) {
        return { type: 'permanent', reason: 'dns-failure' };
      }

      // Connection refused - might be temporary
      if (code === 'ECONNREFUSED' || msg.includes('econnrefused')) {
        return { type: 'server-error', reason: 'connection-refused' };
      }

      // Network unreachable
      if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
        return { type: 'transient', reason: 'network-unreachable' };
      }

      // SSL/TLS errors - usually permanent
      if (msg.includes('ssl') || msg.includes('tls') || msg.includes('certificate')) {
        return { type: 'permanent', reason: 'ssl-error' };
      }

      // Aborted (client-side cancellation)
      if (code === 'ECONNABORTED' || msg.includes('aborted')) {
        return { type: 'transient', reason: 'aborted' };
      }
    }

    return { type: 'unknown', reason: 'unclassified' };
  }

  // ============================================================
  // RETRY HANDLERS
  // ============================================================

  _handleTransient(host, attempt, classification) {
    if (attempt >= this.networkConfig.maxRetries) {
      this._recordHostError(host, classification.reason);
      return {
        shouldRetry: false,
        action: 'abandon',
        reason: 'max-retries-exceeded'
      };
    }

    const delay = this._calculateBackoff(attempt);
    return {
      shouldRetry: true,
      action: 'retry',
      reason: classification.reason,
      delay
    };
  }

  _handleRateLimited(host, response, classification) {
    // Parse Retry-After header if present
    let retryAfter = this.domainConfig.throttleDurationMs;

    const ra = this._getHeader(response, 'retry-after');
    if (ra != null) {
      const raText = String(ra).trim();

      // Per RFC: either delta-seconds OR an HTTP-date.
      if (/^\d+$/.test(raText)) {
        const seconds = parseInt(raText, 10);
        if (!isNaN(seconds)) {
          retryAfter = seconds * 1000;
        }
      } else {
        const dateMs = Date.parse(raText);
        if (!Number.isNaN(dateMs)) {
          retryAfter = Math.max(0, dateMs - Date.now());
        }
      }
    }

    retryAfter = Math.max(retryAfter, this.domainConfig.throttleDurationMs);

    // Apply throttling via context if available
    if (this.context) {
      this.context.throttleDomain(host, retryAfter);
    }

    this.emit('rate-limited', { host, retryAfter });

    return {
      shouldRetry: true,
      action: 'defer',
      reason: 'rate-limited',
      delay: retryAfter,
      retryAfter: Date.now() + retryAfter
    };
  }

  _handleServerError(host, attempt, classification) {
    this._recordHostError(host, classification.reason);

    // Check if host should be locked out
    const errorCount = this._getHostErrorCount(host);
    if (errorCount >= this.hostConfig.maxErrors) {
      this._lockoutHost(host, 'too-many-errors');
      return {
        shouldRetry: false,
        action: 'block-host',
        reason: 'host-error-budget-exceeded'
      };
    }

    if (attempt >= this.networkConfig.maxRetries) {
      return {
        shouldRetry: false,
        action: 'abandon',
        reason: 'max-retries-exceeded'
      };
    }

    // Longer backoff for server errors
    const delay = this._calculateBackoff(attempt) * 1.5;
    return {
      shouldRetry: true,
      action: 'retry',
      reason: classification.reason,
      delay: Math.round(delay)
    };
  }

  _handleConnectionReset(host, attempt, classification) {
    // Track connection resets
    if (!this._connectionResets.has(host)) {
      this._connectionResets.set(host, { count: 0, firstSeen: Date.now(), lastSeen: null });
    }
    const resets = this._connectionResets.get(host);
    resets.count++;
    resets.lastSeen = Date.now();

    // Check for repeated resets in short time
    const resetWindow = 60000; // 1 minute
    if (resets.count >= 3 && (resets.lastSeen - resets.firstSeen) < resetWindow) {
      this._lockoutHost(host, 'repeated-connection-resets');
      if (this.context) {
        this.context.blockDomain(host, 'connection-unstable');
      }
      return {
        shouldRetry: false,
        action: 'block-host',
        reason: 'connection-unstable'
      };
    }

    if (attempt >= this.networkConfig.maxRetries) {
      return {
        shouldRetry: false,
        action: 'abandon',
        reason: 'max-retries-exceeded'
      };
    }

    // Longer delay for connection resets (server might be restarting)
    const delay = this._calculateBackoff(attempt) * 2;
    return {
      shouldRetry: true,
      action: 'retry',
      reason: 'connection-reset',
      delay: Math.round(delay)
    };
  }

  _handleTimeout(host, attempt, classification) {
    this._recordHostError(host, 'timeout');

    if (attempt >= this.networkConfig.maxRetries) {
      return {
        shouldRetry: false,
        action: 'abandon',
        reason: 'max-retries-exceeded'
      };
    }

    // Standard backoff for timeouts
    const delay = this._calculateBackoff(attempt);
    return {
      shouldRetry: true,
      action: 'retry',
      reason: 'timeout',
      delay
    };
  }

  // ============================================================
  // HOST STATE MANAGEMENT
  // ============================================================

  _getHostState(host) {
    if (!this._hostState.has(host)) {
      this._hostState.set(host, {
        errors: [],
        lockedUntil: null,
        successCount: 0
      });
    }
    return this._hostState.get(host);
  }

  _recordHostError(host, reason) {
    const state = this._getHostState(host);
    const now = Date.now();

    state.errors.push({ timestamp: now, reason });
    state.successCount = 0; // Reset success streak

    // Prune old errors outside window
    const cutoff = now - this.hostConfig.windowMs;
    state.errors = state.errors.filter(e => e.timestamp > cutoff);

    // Update context if available
    if (this.context) {
      this.context.recordDomainError(host, reason);
    }

    this.emit('host-error', { host, reason, errorCount: state.errors.length });
  }

  _recordSuccess(host) {
    const state = this._getHostState(host);
    state.successCount++;

    // Consecutive successes reduce error pressure
    if (state.successCount >= 3 && state.errors.length > 0) {
      state.errors.shift(); // Remove oldest error
    }

    // Clear lockout if enough successes (rare, but supports recovery)
    if (state.lockedUntil && state.successCount >= 5) {
      state.lockedUntil = null;
      this.emit('host-unlocked', { host, reason: 'success-recovery' });
    }

    // Clear connection reset tracking on success
    if (this._connectionResets.has(host)) {
      const resets = this._connectionResets.get(host);
      resets.count = Math.max(0, resets.count - 1);
    }
  }

  _getHostErrorCount(host) {
    const state = this._hostState.get(host);
    if (!state) return 0;

    const now = Date.now();
    const cutoff = now - this.hostConfig.windowMs;
    return state.errors.filter(e => e.timestamp > cutoff).length;
  }

  _lockoutHost(host, reason) {
    const state = this._getHostState(host);
    state.lockedUntil = Date.now() + this.hostConfig.lockoutMs;
    state.successCount = 0;

    this.emit('host-locked', { host, reason, until: state.lockedUntil });
  }

  _getHostLockout(host) {
    const state = this._hostState.get(host);
    if (!state || !state.lockedUntil) return null;

    const remaining = state.lockedUntil - Date.now();
    if (remaining <= 0) {
      state.lockedUntil = null;
      return null;
    }

    return {
      until: state.lockedUntil,
      remainingMs: remaining
    };
  }

  // ============================================================
  // TOKEN BUCKET HELPERS
  // ============================================================

  _getDomainTokenState(domain) {
    if (!this._domainTokens.has(domain)) {
      this._domainTokens.set(domain, {
        tokens: this.domainConfig.burstSize,
        lastRefill: Date.now()
      });
    }
    return this._domainTokens.get(domain);
  }

  _refillTokens(state) {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const msPerToken = 60000 / this.domainConfig.requestsPerMinute;
    const newTokens = Math.floor(elapsed / msPerToken);

    if (newTokens > 0) {
      state.tokens = Math.min(state.tokens + newTokens, this.domainConfig.burstSize);
      state.lastRefill = now;
    }
  }

  // ============================================================
  // BACKOFF CALCULATION
  // ============================================================

  /**
   * Calculate exponential backoff with jitter.
   * @private
   */
  _calculateBackoff(attempt) {
    // Exponential: base * 2^attempt
    const exponential = this.networkConfig.baseDelayMs * Math.pow(2, attempt);

    // Cap at max
    const capped = Math.min(exponential, this.networkConfig.maxDelayMs);

    // Add jitter (random factor)
    const jitter = capped * this.networkConfig.jitterFactor * Math.random();

    return Math.round(capped + jitter);
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _getHeader(response, name) {
    if (!response || !response.headers || !name) return undefined;

    const headers = response.headers;
    const lowerName = String(name).toLowerCase();

    // Fetch/undici/node-fetch Headers
    if (typeof headers.get === 'function') {
      const v = headers.get(name);
      if (v != null) return v;
      const vLower = headers.get(lowerName);
      if (vLower != null) return vLower;
      return undefined;
    }

    // Map-like headers
    if (headers instanceof Map) {
      if (headers.has(name)) return headers.get(name);
      if (headers.has(lowerName)) return headers.get(lowerName);

      for (const [k, v] of headers.entries()) {
        if (String(k).toLowerCase() === lowerName) return v;
      }
      return undefined;
    }

    // Plain object headers (case-insensitive)
    if (typeof headers === 'object') {
      if (headers[name] != null) return headers[name];
      if (headers[lowerName] != null) return headers[lowerName];

      const keys = Object.keys(headers);
      const match = keys.find(k => String(k).toLowerCase() === lowerName);
      if (match) return headers[match];
    }

    return undefined;
  }

  /**
   * Reset all state (for testing or re-initialization).
   */
  reset() {
    this._hostState.clear();
    this._domainTokens.clear();
    this._connectionResets.clear();
    this._recentRequests.clear();
  }

  /**
   * Get status summary.
   */
  getStatus() {
    const lockedHosts = [];
    for (const [host, state] of this._hostState) {
      if (state.lockedUntil && state.lockedUntil > Date.now()) {
        lockedHosts.push({
          host,
          remainingMs: state.lockedUntil - Date.now(),
          errorCount: state.errors.length
        });
      }
    }

    return {
      lockedHosts,
      trackedHosts: this._hostState.size,
      trackedDomains: this._domainTokens.size,
      connectionResetHosts: this._connectionResets.size
    };
  }

  /**
   * Get detailed host information.
   */
  getHostInfo(host) {
    const state = this._hostState.get(host);
    const tokens = this._domainTokens.get(host);
    const resets = this._connectionResets.get(host);

    return {
      host,
      errors: state?.errors?.length || 0,
      lockedUntil: state?.lockedUntil || null,
      successStreak: state?.successCount || 0,
      tokens: tokens?.tokens ?? this.domainConfig.burstSize,
      connectionResets: resets?.count || 0
    };
  }
}

module.exports = RetryCoordinator;
