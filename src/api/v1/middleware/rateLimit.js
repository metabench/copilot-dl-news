'use strict';

/**
 * Rate Limiting Middleware
 * 
 * Per-key rate limiting with tier-based limits:
 * - free: 100 requests/minute
 * - premium: 1000 requests/minute  
 * - unlimited: no limit
 * 
 * Returns standard rate limit headers:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 * 
 * @module rateLimit
 */

/**
 * In-memory rate limit store
 * Key: API key ID
 * Value: { requests: [{timestamp}], windowStart }
 */
const rateLimitStore = new Map();

/**
 * Window size in milliseconds (1 minute)
 */
const WINDOW_MS = 60 * 1000;

/**
 * Tier rate limits (requests per minute)
 */
const TIER_LIMITS = {
  free: 100,
  premium: 1000,
  unlimited: Infinity
};

/**
 * Clean up old entries from a request list
 * @param {Array} requests - Array of request timestamps
 * @param {number} windowStart - Start of current window
 * @returns {Array} Filtered requests within window
 */
function cleanOldRequests(requests, windowStart) {
  return requests.filter(ts => ts >= windowStart);
}

/**
 * Create rate limiting middleware
 * @param {Object} options - Middleware options
 * @param {Object} [options.apiKeyAdapter] - API key adapter for DB-based tracking
 * @param {boolean} [options.useMemoryStore=true] - Use in-memory store (faster)
 * @param {number} [options.windowMs=60000] - Rate limit window in ms
 * @returns {Function} Express middleware
 */
function createRateLimitMiddleware(options = {}) {
  const { 
    apiKeyAdapter = null,
    useMemoryStore = true,
    windowMs = WINDOW_MS
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    // Skip rate limiting if no API key attached
    if (!req.apiKey) {
      return next();
    }

    const keyId = req.apiKey.id;
    const tier = req.apiKey.tier || 'free';
    const limit = TIER_LIMITS[tier] || TIER_LIMITS.free;

    // Unlimited tier bypasses rate limiting
    if (limit === Infinity) {
      res.setHeader('X-RateLimit-Limit', '-1');
      res.setHeader('X-RateLimit-Remaining', '-1');
      res.setHeader('X-RateLimit-Reset', '-1');
      return next();
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(keyId);
    if (!entry) {
      entry = { requests: [], windowStart: now };
      rateLimitStore.set(keyId, entry);
    }

    // Clean old requests and add current one
    entry.requests = cleanOldRequests(entry.requests, windowStart);
    const currentCount = entry.requests.length;

    // Calculate reset time (end of current window)
    const resetTime = Math.ceil((now + windowMs) / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - currentCount - 1)));
    res.setHeader('X-RateLimit-Reset', String(resetTime));

    // Check if over limit
    if (currentCount >= limit) {
      const retryAfter = Math.ceil((entry.requests[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Limit: ${limit} requests per minute.`,
        retryAfter: Math.max(1, retryAfter),
        limit,
        tier
      });
    }

    // Record this request
    entry.requests.push(now);

    // Also record in DB if adapter provided (async, don't block response)
    if (apiKeyAdapter && typeof apiKeyAdapter.recordRequest === 'function') {
      setImmediate(() => {
        try {
          apiKeyAdapter.recordRequest(keyId);
        } catch (err) {
          // Log but don't fail the request
          console.warn('[rateLimit] Failed to record request in DB:', err.message);
        }
      });
    }

    next();
  };
}

/**
 * Clear rate limit store (for testing)
 */
function clearRateLimitStore() {
  rateLimitStore.clear();
}

/**
 * Get current store size (for monitoring)
 * @returns {number} Number of keys in store
 */
function getStoreSize() {
  return rateLimitStore.size;
}

/**
 * Periodic cleanup of stale entries
 * Call this on an interval to prevent memory leaks
 */
function cleanupStaleEntries() {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  
  for (const [keyId, entry] of rateLimitStore.entries()) {
    entry.requests = cleanOldRequests(entry.requests, windowStart);
    if (entry.requests.length === 0) {
      rateLimitStore.delete(keyId);
    }
  }
}

module.exports = {
  createRateLimitMiddleware,
  clearRateLimitStore,
  getStoreSize,
  cleanupStaleEntries,
  TIER_LIMITS,
  WINDOW_MS
};
