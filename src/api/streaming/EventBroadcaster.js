'use strict';

/**
 * EventBroadcaster - Singleton Event Hub for Real-Time Event Streaming
 *
 * Central pub/sub hub for crawl and system events. Crawler, analysis, and
 * background task code emits events here; SSE and WebSocket handlers subscribe.
 *
 * Event types:
 *   crawl: crawl:started, crawl:completed, crawl:failed, crawl:progress
 *   article: article:new, article:updated, article:classified
 *   system: system:healthcheck, system:stats
 *
 * Usage:
 *   const { broadcaster } = require('./EventBroadcaster');
 *   broadcaster.emit('article:new', { id: 123, url: '...', title: '...', host: '...' });
 *   broadcaster.subscribe(handler, { types: ['article:new'], domains: ['example.com'] });
 *
 * @module streaming/EventBroadcaster
 */

const { EventEmitter } = require('events');

// Event type definitions
const EVENT_TYPES = {
  // Crawl lifecycle events
  CRAWL_STARTED: 'crawl:started',
  CRAWL_COMPLETED: 'crawl:completed',
  CRAWL_FAILED: 'crawl:failed',
  CRAWL_PROGRESS: 'crawl:progress',

  // Article events
  ARTICLE_NEW: 'article:new',
  ARTICLE_UPDATED: 'article:updated',
  ARTICLE_CLASSIFIED: 'article:classified',

  // System events
  SYSTEM_HEALTHCHECK: 'system:healthcheck',
  SYSTEM_STATS: 'system:stats'
};

// All known event types as array
const ALL_EVENT_TYPES = Object.values(EVENT_TYPES);

/**
 * Event broadcaster singleton
 */
class EventBroadcaster extends EventEmitter {
  constructor(options = {}) {
    super();
    this.setMaxListeners(options.maxListeners || 100);

    // Event history for replay on connect (circular buffer)
    this.historyLimit = options.historyLimit || 100;
    this.eventHistory = [];

    // Subscriber tracking for cleanup
    this.subscribers = new Map();
    this.subscriberId = 0;

    // Rate limiting config
    this.rateLimitPerSecond = options.rateLimitPerSecond || 50;
    this.eventCounts = new Map(); // eventType -> { count, resetAt }

    // Stats
    this.stats = {
      totalEmitted: 0,
      totalDropped: 0,
      subscriberCount: 0,
      byType: {}
    };

    // Ensure stats structure for all event types
    for (const type of ALL_EVENT_TYPES) {
      this.stats.byType[type] = 0;
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventType - Event type (e.g., 'article:new')
   * @param {Object} payload - Event payload
   * @returns {boolean} Whether event was emitted (false if rate limited)
   */
  emitEvent(eventType, payload = {}) {
    // Validate event type
    if (!eventType || typeof eventType !== 'string') {
      return false;
    }

    // Rate limiting check
    if (this._isRateLimited(eventType)) {
      this.stats.totalDropped++;
      return false;
    }

    // Create event wrapper
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      payload: payload
    };

    // Extract domain if present for filtering
    if (payload.host) {
      event.domain = payload.host;
    } else if (payload.url) {
      try {
        event.domain = new URL(payload.url).hostname;
      } catch {
        // Ignore URL parse errors
      }
    }

    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.historyLimit) {
      this.eventHistory.shift();
    }

    // Update stats
    this.stats.totalEmitted++;
    if (this.stats.byType[eventType] !== undefined) {
      this.stats.byType[eventType]++;
    } else {
      this.stats.byType[eventType] = 1;
    }

    // Emit on internal EventEmitter for subscribers
    this.emit('event', event);

    return true;
  }

  /**
   * Subscribe to events with optional filtering
   * @param {Function} handler - Handler function(event)
   * @param {Object} [options] - Filter options
   * @param {string[]} [options.types] - Event types to receive (empty = all)
   * @param {string[]} [options.domains] - Domains to filter by (empty = all)
   * @returns {Object} Subscription object with unsubscribe method and id
   */
  subscribe(handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    const types = options.types && Array.isArray(options.types) ? options.types : [];
    const domains = options.domains && Array.isArray(options.domains) ? options.domains : [];

    // Validate types
    for (const type of types) {
      if (!ALL_EVENT_TYPES.includes(type)) {
        // Allow custom event types but warn
        console.warn(`[EventBroadcaster] Unknown event type: ${type}`);
      }
    }

    const id = ++this.subscriberId;

    // Create filtered handler
    const filteredHandler = (event) => {
      // Type filter
      if (types.length > 0 && !types.includes(event.type)) {
        return;
      }

      // Domain filter
      if (domains.length > 0) {
        const eventDomain = event.domain || event.payload?.host;
        if (!eventDomain || !domains.some(d => eventDomain.includes(d))) {
          return;
        }
      }

      // Call handler
      try {
        handler(event);
      } catch (err) {
        console.error('[EventBroadcaster] Handler error:', err);
      }
    };

    // Store subscription
    this.subscribers.set(id, {
      handler,
      filteredHandler,
      types,
      domains,
      createdAt: new Date().toISOString()
    });

    // Listen to events
    this.on('event', filteredHandler);
    this.stats.subscriberCount++;

    // Return subscription handle
    return {
      id,
      unsubscribe: () => {
        const sub = this.subscribers.get(id);
        if (sub) {
          this.removeListener('event', sub.filteredHandler);
          this.subscribers.delete(id);
          this.stats.subscriberCount--;
        }
      }
    };
  }

  /**
   * Get recent event history
   * @param {Object} [options] - Filter options
   * @param {number} [options.limit] - Max events to return
   * @param {string[]} [options.types] - Event types to filter
   * @param {string[]} [options.domains] - Domains to filter
   * @returns {Object[]} Recent events matching filters
   */
  getHistory(options = {}) {
    const limit = options.limit || this.historyLimit;
    const types = options.types || [];
    const domains = options.domains || [];

    let history = this.eventHistory.slice(-limit);

    // Filter by type
    if (types.length > 0) {
      history = history.filter(e => types.includes(e.type));
    }

    // Filter by domain
    if (domains.length > 0) {
      history = history.filter(e => {
        const d = e.domain || e.payload?.host;
        return d && domains.some(domain => d.includes(domain));
      });
    }

    return history;
  }

  /**
   * Get current stats
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.eventHistory.length,
      historyLimit: this.historyLimit
    };
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Check if event type is rate limited
   * @private
   */
  _isRateLimited(eventType) {
    const now = Date.now();
    let bucket = this.eventCounts.get(eventType);

    if (!bucket || bucket.resetAt < now) {
      // Reset bucket
      bucket = { count: 0, resetAt: now + 1000 };
      this.eventCounts.set(eventType, bucket);
    }

    if (bucket.count >= this.rateLimitPerSecond) {
      return true;
    }

    bucket.count++;
    return false;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the singleton broadcaster instance
 * @param {Object} [options] - Options for new instance
 * @returns {EventBroadcaster}
 */
function getBroadcaster(options = {}) {
  if (!instance) {
    instance = new EventBroadcaster(options);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
function resetBroadcaster() {
  if (instance) {
    instance.removeAllListeners();
    instance.subscribers.clear();
    instance.eventHistory = [];
  }
  instance = null;
}

// Export singleton and types
module.exports = {
  EventBroadcaster,
  getBroadcaster,
  resetBroadcaster,
  EVENT_TYPES,
  ALL_EVENT_TYPES,
  // Convenience export of singleton
  broadcaster: getBroadcaster()
};
