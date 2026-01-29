'use strict';

/**
 * Decision Trace Helper
 * 
 * Standardizes the shape of decision traces and provides helpers to emit/persist
 * them as milestones. Traces are only persisted when explicitly enabled.
 * 
 * Decision trace schema:
 * - kind: stable identifier (e.g., 'hub-freshness-decision', 'fetch-policy-decision')
 * - message: short human-readable summary
 * - details: JSON payload with inputs/outputs
 * - scope: optional context (crawler id, run id, url)
 */

// Maximum size for details payload (to prevent DB bloat)
const MAX_DETAILS_SIZE_BYTES = 8192;

// Standard decision trace kinds
const DECISION_KINDS = {
  HUB_FRESHNESS: 'hub-freshness-decision',
  FETCH_POLICY: 'fetch-policy-decision',
  CACHE_FALLBACK: 'cache-fallback-decision',
  RATE_LIMIT: 'rate-limit-decision',
  QUEUE_PRIORITY: 'queue-priority-decision',
  SKIP_REASON: 'skip-reason-decision'
};

/**
 * Validate and normalize a decision trace
 * @param {Object} trace - Raw trace object
 * @returns {Object} - Normalized trace
 */
function normalizeDecisionTrace(trace) {
  if (!trace || typeof trace !== 'object') {
    throw new Error('Decision trace must be an object');
  }
  
  const kind = trace.kind;
  if (!kind || typeof kind !== 'string') {
    throw new Error('Decision trace must have a string "kind"');
  }
  
  const message = trace.message || null;
  
  // Normalize details
  let details = trace.details || {};
  if (typeof details !== 'object') {
    details = { value: details };
  }
  
  // Add timestamp if not present
  details.tracedAt = details.tracedAt || new Date().toISOString();
  
  // Add source if available
  if (trace.source) {
    details.source = trace.source;
  }
  
  // Enforce size limit
  const detailsJson = JSON.stringify(details);
  if (detailsJson.length > MAX_DETAILS_SIZE_BYTES) {
    details = {
      _truncated: true,
      _originalSize: detailsJson.length,
      summary: details.summary || message || kind,
      tracedAt: details.tracedAt
    };
  }
  
  return {
    kind,
    message,
    details,
    scope: trace.scope || null,
    target: trace.target || null,
    persist: trace.persist === true
  };
}

/**
 * Create a decision trace emitter bound to a crawler events instance
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.events - CrawlerEvents instance (must have emitMilestone)
 * @param {string} [options.source] - Default source identifier
 * @param {boolean} [options.persistByDefault=false] - Whether to persist by default
 * @returns {Object} - Emitter with trace methods
 */
function createDecisionTraceEmitter({
  events = null,
  source = 'unknown',
  persistByDefault = false
} = {}) {
  if (!events || typeof events.emitMilestone !== 'function') {
    throw new Error('createDecisionTraceEmitter requires events with emitMilestone');
  }
  
  /**
   * Emit a decision trace as a milestone
   * @param {Object} trace - Decision trace object
   * @param {boolean} [forcePersist] - Override persist flag
   */
  function emit(trace, forcePersist = null) {
    const normalized = normalizeDecisionTrace({
      ...trace,
      source: trace.source || source,
      persist: forcePersist !== null 
        ? forcePersist 
        : (trace.persist !== undefined ? trace.persist : persistByDefault)
    });
    
    events.emitMilestone({
      kind: normalized.kind,
      message: normalized.message,
      scope: normalized.scope,
      target: normalized.target,
      details: normalized.details,
      persist: normalized.persist
    });
    
    return normalized;
  }
  
  /**
   * Create a trace for hub freshness decisions
   */
  function hubFreshness({ url, host, effectiveMaxAge, refreshOnStartup, fallbackToCache, before, after }) {
    return emit({
      kind: DECISION_KINDS.HUB_FRESHNESS,
      message: `Hub freshness policy applied: maxAge=${effectiveMaxAge}ms, refresh=${refreshOnStartup}`,
      target: url,
      details: {
        url,
        host,
        effectiveMaxAge,
        refreshOnStartup,
        fallbackToCache,
        before,
        after
      }
    });
  }
  
  /**
   * Create a trace for fetch policy decisions
   */
  function fetchPolicy({ url, policy, reason, cacheAge, threshold }) {
    return emit({
      kind: DECISION_KINDS.FETCH_POLICY,
      message: `Fetch policy: ${policy} (${reason})`,
      target: url,
      details: {
        url,
        policy,
        reason,
        cacheAge,
        threshold
      }
    });
  }
  
  /**
   * Create a trace for cache fallback decisions
   */
  function cacheFallback({ url, networkError, fallbackUsed, cacheAge }) {
    return emit({
      kind: DECISION_KINDS.CACHE_FALLBACK,
      message: `Cache fallback ${fallbackUsed ? 'used' : 'not used'}: ${networkError}`,
      target: url,
      details: {
        url,
        networkError,
        fallbackUsed,
        cacheAge
      }
    });
  }
  
  /**
   * Create a trace for rate limit decisions
   */
  function rateLimit({ url, host, action, backoffMs, queueSize }) {
    return emit({
      kind: DECISION_KINDS.RATE_LIMIT,
      message: `Rate limit: ${action} for ${host}`,
      target: url,
      details: {
        url,
        host,
        action,
        backoffMs,
        queueSize
      }
    });
  }
  
  /**
   * Create a trace for skip decisions
   */
  function skipReason({ url, reason, classification, details: extraDetails }) {
    return emit({
      kind: DECISION_KINDS.SKIP_REASON,
      message: `Skipped: ${reason}`,
      target: url,
      details: {
        url,
        reason,
        classification,
        ...extraDetails
      }
    });
  }
  
  return {
    emit,
    hubFreshness,
    fetchPolicy,
    cacheFallback,
    rateLimit,
    skipReason,
    KINDS: DECISION_KINDS
  };
}

/**
 * Create a no-op decision trace emitter (for testing or disabled mode)
 */
function createNoOpTraceEmitter() {
  const noop = () => ({ kind: 'noop', message: null, details: {}, persist: false });
  return {
    emit: noop,
    hubFreshness: noop,
    fetchPolicy: noop,
    cacheFallback: noop,
    rateLimit: noop,
    skipReason: noop,
    KINDS: DECISION_KINDS
  };
}

module.exports = {
  createDecisionTraceEmitter,
  createNoOpTraceEmitter,
  normalizeDecisionTrace,
  DECISION_KINDS,
  MAX_DETAILS_SIZE_BYTES
};
