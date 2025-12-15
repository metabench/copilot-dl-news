'use strict';

/**
 * CrawlTelemetrySchema - Standard event schema for crawler telemetry.
 * 
 * This module defines the canonical event types and payload structures
 * that any crawler implementation must emit. The UI and CLI adapters
 * consume this standardized format, enabling:
 * 
 * - Consistent UI displays regardless of crawler internals
 * - Forward compatibility when crawler implementations change
 * - Easy migration between crawler versions
 * 
 * @module src/crawler/telemetry/CrawlTelemetrySchema
 */

/**
 * Crawl lifecycle phases (ordered)
 * @readonly
 * @enum {string}
 */
const CRAWL_PHASES = Object.freeze({
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  PLANNING: 'planning',
  DISCOVERING: 'discovering',
  CRAWLING: 'crawling',
  PROCESSING: 'processing',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  STOPPED: 'stopped'
});

/**
 * Standard event types emitted by crawlers
 * @readonly
 * @enum {string}
 */
const CRAWL_EVENT_TYPES = Object.freeze({
  // Lifecycle events
  STARTED: 'crawl:started',
  STOPPED: 'crawl:stopped',
  PAUSED: 'crawl:paused',
  RESUMED: 'crawl:resumed',
  COMPLETED: 'crawl:completed',
  FAILED: 'crawl:failed',

  // Phase transitions
  PHASE_CHANGED: 'crawl:phase:changed',

  // Progress events
  PROGRESS: 'crawl:progress',
  URL_VISITED: 'crawl:url:visited',
  URL_QUEUED: 'crawl:url:queued',
  URL_ERROR: 'crawl:url:error',
  URL_SKIPPED: 'crawl:url:skipped',

  // Goal/budget events
  GOAL_SATISFIED: 'crawl:goal:satisfied',
  GOAL_PROGRESS: 'crawl:goal:progress',
  BUDGET_UPDATED: 'crawl:budget:updated',
  BUDGET_EXHAUSTED: 'crawl:budget:exhausted',

  // Worker events
  WORKER_SPAWNED: 'crawl:worker:spawned',
  WORKER_STOPPED: 'crawl:worker:stopped',
  WORKER_SCALED: 'crawl:worker:scaled',

  // Checkpoint events
  CHECKPOINT_SAVED: 'crawl:checkpoint:saved',
  CHECKPOINT_RESTORED: 'crawl:checkpoint:restored',

  // Metrics/telemetry
  METRICS_SNAPSHOT: 'crawl:metrics:snapshot',
  RATE_LIMITED: 'crawl:rate:limited',
  STALLED: 'crawl:stalled'
});

/**
 * Severity levels for telemetry events
 * @readonly
 * @enum {string}
 */
const SEVERITY_LEVELS = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical'
});

/**
 * Create a standardized telemetry event payload.
 * All crawlers should use this factory to ensure consistent event structure.
 * 
 * @param {string} type - Event type from CRAWL_EVENT_TYPES
 * @param {Object} data - Event-specific data
 * @param {Object} [options] - Additional options
 * @param {string} [options.jobId] - Crawl job identifier
 * @param {string} [options.crawlType] - Type of crawl (standard, intelligent, gazetteer)
 * @param {string} [options.severity='info'] - Event severity level
 * @param {string} [options.message] - Human-readable message
 * @param {string} [options.source] - Source component name
 * @returns {Object} Standardized event payload
 */
function createTelemetryEvent(type, data = {}, options = {}) {
  const now = new Date();
  
  return {
    id: `${type}-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    timestamp: now.toISOString(),
    timestampMs: now.getTime(),
    jobId: options.jobId || null,
    crawlType: options.crawlType || 'standard',
    severity: options.severity || SEVERITY_LEVELS.INFO,
    message: options.message || null,
    source: options.source || 'crawler',
    data: Object.freeze({ ...data })
  };
}

/**
 * Create a progress snapshot event.
 * This is the primary event for UI progress displays.
 * 
 * @param {Object} stats - Progress statistics
 * @param {number} stats.visited - URLs visited
 * @param {number} stats.queued - URLs in queue
 * @param {number} stats.errors - Error count
 * @param {number} [stats.total] - Optional known total count for determinate progress
 * @param {number} [stats.downloaded] - Successfully downloaded count
 * @param {number} [stats.articles] - Articles found
 * @param {number} [stats.skipped] - Skipped URLs
 * @param {string} [stats.currentUrl] - Optional current URL being processed (UI hint)
 * @param {string} [stats.currentAction] - Optional current action (UI hint)
 * @param {string} [stats.phase] - Optional phase hint (UI hint)
 * @param {boolean} [stats.throttled] - Optional throttle flag (UI hint)
 * @param {string} [stats.throttleReason] - Optional throttle reason (UI hint)
 * @param {string} [stats.throttleDomain] - Optional throttle domain (UI hint)
 * @param {Object} [options] - Event options
 * @returns {Object} Progress event payload
 */
function createProgressEvent(stats, options = {}) {
  const data = {
    visited: stats.visited ?? 0,
    queued: stats.queued ?? 0,
    errors: stats.errors ?? 0,
    total: stats.total ?? null,
    downloaded: stats.downloaded ?? stats.visited ?? 0,
    articles: stats.articles ?? 0,
    skipped: stats.skipped ?? 0,
    // Rates (if available)
    requestsPerSec: stats.requestsPerSec ?? null,
    bytesPerSec: stats.bytesPerSec ?? null,
    // Completion estimate (if available)
    estimatedRemaining: stats.estimatedRemaining ?? null,
    percentComplete: stats.percentComplete ?? null,

    // Optional UI hints (snapshot fields)
    currentUrl: stats.currentUrl ?? null,
    currentAction: stats.currentAction ?? null,
    phase: stats.phase ?? null,
    throttled: stats.throttled ?? null,
    throttleReason: stats.throttleReason ?? null,
    throttleDomain: stats.throttleDomain ?? null
  };

  return createTelemetryEvent(CRAWL_EVENT_TYPES.PROGRESS, data, {
    ...options,
    severity: SEVERITY_LEVELS.INFO,
    message: `Progress: ${data.visited} visited, ${data.queued} queued, ${data.errors} errors`
  });
}

/**
 * Create a phase change event.
 * 
 * @param {string} phase - New phase from CRAWL_PHASES
 * @param {string} [previousPhase] - Previous phase
 * @param {Object} [options] - Event options
 * @returns {Object} Phase change event payload
 */
function createPhaseChangeEvent(phase, previousPhase = null, options = {}) {
  return createTelemetryEvent(CRAWL_EVENT_TYPES.PHASE_CHANGED, {
    phase,
    previousPhase,
    phaseName: formatPhaseName(phase)
  }, {
    ...options,
    message: `Phase: ${formatPhaseName(phase)}`
  });
}

/**
 * Create a goal satisfaction event.
 * 
 * @param {Object} goal - Goal that was satisfied
 * @param {string} goal.id - Goal identifier
 * @param {string} goal.type - Goal type
 * @param {*} goal.target - Target value
 * @param {*} goal.current - Current value
 * @param {Object} [options] - Event options
 * @returns {Object} Goal satisfied event payload
 */
function createGoalSatisfiedEvent(goal, options = {}) {
  return createTelemetryEvent(CRAWL_EVENT_TYPES.GOAL_SATISFIED, {
    goalId: goal.id,
    goalType: goal.type,
    target: goal.target,
    current: goal.current
  }, {
    ...options,
    message: `Goal satisfied: ${goal.type} (${goal.current}/${goal.target})`
  });
}

/**
 * Create a budget update event.
 * 
 * @param {Object} budget - Budget state
 * @param {Object} budget.limits - Budget limits { requests, time, bytes, etc. }
 * @param {Object} budget.spent - Budget spent { requests, time, bytes, etc. }
 * @param {Object} [options] - Event options
 * @returns {Object} Budget update event payload
 */
function createBudgetEvent(budget, options = {}) {
  const limits = budget.limits || {};
  const spent = budget.spent || {};
  
  // Calculate percentages
  const percentages = {};
  for (const key of Object.keys(limits)) {
    if (limits[key] > 0 && spent[key] != null) {
      percentages[key] = Math.round((spent[key] / limits[key]) * 100);
    }
  }

  return createTelemetryEvent(CRAWL_EVENT_TYPES.BUDGET_UPDATED, {
    limits,
    spent,
    percentages,
    exhausted: budget.exhausted || false
  }, {
    ...options,
    severity: budget.exhausted ? SEVERITY_LEVELS.WARN : SEVERITY_LEVELS.INFO,
    message: budget.exhausted ? 'Budget exhausted' : 'Budget updated'
  });
}

/**
 * Create a worker scaling event.
 * 
 * @param {Object} scaling - Scaling info
 * @param {number} scaling.from - Previous worker count
 * @param {number} scaling.to - New worker count
 * @param {string} [scaling.reason] - Reason for scaling
 * @param {Object} [options] - Event options
 * @returns {Object} Worker scaled event payload
 */
function createWorkerScaledEvent(scaling, options = {}) {
  const direction = scaling.to > scaling.from ? 'up' : 'down';
  return createTelemetryEvent(CRAWL_EVENT_TYPES.WORKER_SCALED, {
    from: scaling.from,
    to: scaling.to,
    direction,
    reason: scaling.reason || null
  }, {
    ...options,
    message: `Workers scaled ${direction}: ${scaling.from} → ${scaling.to}`
  });
}

/**
 * Create a URL visited event.
 * 
 * @param {Object} urlInfo - URL information
 * @param {string} urlInfo.url - The URL
 * @param {number} [urlInfo.httpStatus] - HTTP status code
 * @param {number} [urlInfo.contentLength] - Content length in bytes
 * @param {number} [urlInfo.durationMs] - Request duration
 * @param {boolean} [urlInfo.cached] - Whether response was cached
 * @param {Object} [options] - Event options
 * @returns {Object} URL visited event payload
 */
function createUrlVisitedEvent(urlInfo, options = {}) {
  return createTelemetryEvent(CRAWL_EVENT_TYPES.URL_VISITED, {
    url: urlInfo.url,
    httpStatus: urlInfo.httpStatus ?? null,
    contentLength: urlInfo.contentLength ?? null,
    durationMs: urlInfo.durationMs ?? null,
    cached: urlInfo.cached ?? false
  }, {
    ...options,
    severity: SEVERITY_LEVELS.DEBUG
  });
}

/**
 * Create a URL error event.
 * 
 * @param {Object} errorInfo - Error information
 * @param {string} errorInfo.url - The URL
 * @param {string} errorInfo.error - Error message
 * @param {string} [errorInfo.code] - Error code
 * @param {boolean} [errorInfo.retryable] - Whether error is retryable
 * @param {Object} [options] - Event options
 * @returns {Object} URL error event payload
 */
function createUrlErrorEvent(errorInfo, options = {}) {
  return createTelemetryEvent(CRAWL_EVENT_TYPES.URL_ERROR, {
    url: errorInfo.url,
    error: errorInfo.error,
    code: errorInfo.code ?? null,
    retryable: errorInfo.retryable ?? false
  }, {
    ...options,
    severity: SEVERITY_LEVELS.WARN,
    message: `Error: ${errorInfo.url} - ${errorInfo.error}`
  });
}

/**
 * Format a phase name for display.
 * @param {string} phase - Phase constant
 * @returns {string} Human-readable phase name
 */
function formatPhaseName(phase) {
  if (!phase) return 'Unknown';
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

/**
 * Validate that an event has the required schema.
 * @param {Object} event - Event to validate
 * @returns {boolean} True if valid
 */
function isValidTelemetryEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (!event.type || typeof event.type !== 'string') return false;
  if (!event.timestamp && !event.timestampMs) return false;
  return true;
}

module.exports = {
  // Enums
  CRAWL_PHASES,
  CRAWL_EVENT_TYPES,
  SEVERITY_LEVELS,
  
  // Factories
  createTelemetryEvent,
  createProgressEvent,
  createPhaseChangeEvent,
  createGoalSatisfiedEvent,
  createBudgetEvent,
  createWorkerScaledEvent,
  createUrlVisitedEvent,
  createUrlErrorEvent,
  
  // Utilities
  formatPhaseName,
  isValidTelemetryEvent
};
