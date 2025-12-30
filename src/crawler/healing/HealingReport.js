'use strict';

/**
 * HealingReport - Tracks and persists healing actions
 * 
 * Provides methods to record healing events, query history,
 * and generate statistics for monitoring.
 * 
 * @module HealingReport
 */

const { EventEmitter } = require('events');

class HealingReport extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} [opts.db] - Database instance (with healingAdapter)
   * @param {Object} [opts.healingAdapter] - Direct healing adapter
   * @param {Object} [opts.logger] - Logger instance
   * @param {number} [opts.maxInMemory=1000] - Max events to keep in memory
   */
  constructor(opts = {}) {
    super();
    this.db = opts.db || null;
    this._healingAdapter = opts.healingAdapter || null;
    this.logger = opts.logger || console;
    this.maxInMemory = opts.maxInMemory || 1000;
    
    // In-memory cache for fast access
    this._events = [];
    this._stats = {
      total: 0,
      successful: 0,
      failed: 0,
      byType: new Map(),
      byDomain: new Map()
    };
  }

  /**
   * Get the healing adapter (lazy load from db if needed)
   * @private
   */
  _getAdapter() {
    if (this._healingAdapter) return this._healingAdapter;
    
    if (this.db) {
      // Try to get adapter from db if it has that capability
      if (typeof this.db.getHealingAdapter === 'function') {
        this._healingAdapter = this.db.getHealingAdapter();
      }
    }
    
    return this._healingAdapter;
  }

  /**
   * Record a healing event
   * 
   * @param {string} domain - Domain affected
   * @param {Object} diagnosis - Diagnosis result from DiagnosticEngine
   * @param {Object} remediation - Remediation result from RemediationStrategies
   * @param {boolean} success - Whether the overall healing was successful
   * @returns {Object} The recorded event
   */
  async record(domain, diagnosis, remediation, success) {
    const event = {
      domain,
      failureType: diagnosis?.type || 'UNKNOWN',
      diagnosis: {
        type: diagnosis?.type,
        confidence: diagnosis?.confidence,
        evidence: diagnosis?.evidence,
        message: diagnosis?.message
      },
      remediation: {
        action: remediation?.action,
        success: remediation?.success,
        message: remediation?.message,
        retry: remediation?.retry,
        delayMs: remediation?.delayMs,
        details: remediation?.details
      },
      success,
      confidence: diagnosis?.confidence,
      createdAt: new Date().toISOString()
    };
    
    // Update in-memory stats
    this._updateStats(event);
    
    // Add to in-memory cache
    this._events.unshift(event);
    if (this._events.length > this.maxInMemory) {
      this._events.pop();
    }
    
    // Persist to database if adapter available
    const adapter = this._getAdapter();
    if (adapter && typeof adapter.recordHealingEvent === 'function') {
      try {
        const dbEvent = await adapter.recordHealingEvent(this.db, {
          domain: event.domain,
          failureType: event.failureType,
          diagnosis: event.diagnosis,
          remediation: event.remediation,
          success: event.success,
          confidence: event.confidence,
          evidence: event.diagnosis.evidence,
          context: { remediation: event.remediation }
        });
        event.id = dbEvent?.id;
      } catch (err) {
        this.logger.warn?.(`[HealingReport] Failed to persist event: ${err.message}`);
      }
    }
    
    // Emit event for subscribers
    this.emit('healing', event);
    
    return event;
  }

  /**
   * Update in-memory statistics
   * @private
   */
  _updateStats(event) {
    this._stats.total++;
    
    if (event.success) {
      this._stats.successful++;
    } else {
      this._stats.failed++;
    }
    
    // By failure type
    const typeStats = this._stats.byType.get(event.failureType) || {
      count: 0,
      successful: 0,
      failed: 0
    };
    typeStats.count++;
    if (event.success) typeStats.successful++;
    else typeStats.failed++;
    this._stats.byType.set(event.failureType, typeStats);
    
    // By domain
    const domainStats = this._stats.byDomain.get(event.domain) || {
      count: 0,
      successful: 0,
      failed: 0,
      lastAt: null
    };
    domainStats.count++;
    if (event.success) domainStats.successful++;
    else domainStats.failed++;
    domainStats.lastAt = event.createdAt;
    this._stats.byDomain.set(event.domain, domainStats);
  }

  /**
   * Get recent healing events
   * 
   * @param {number} [limit=50] - Maximum events to return
   * @returns {Promise<Object[]>} List of recent events
   */
  async getRecent(limit = 50) {
    // Try database first for persistence
    const adapter = this._getAdapter();
    if (adapter && typeof adapter.getRecentHealingEvents === 'function') {
      try {
        return await adapter.getRecentHealingEvents(this.db, limit);
      } catch (err) {
        this.logger.warn?.(`[HealingReport] DB query failed, using cache: ${err.message}`);
      }
    }
    
    // Fallback to in-memory cache
    return this._events.slice(0, limit);
  }

  /**
   * Get healing events for a specific domain
   * 
   * @param {string} domain - Domain to query
   * @param {number} [limit=50] - Maximum events to return
   * @returns {Promise<Object[]>} List of events for the domain
   */
  async getByDomain(domain, limit = 50) {
    // Try database first
    const adapter = this._getAdapter();
    if (adapter && typeof adapter.getHealingEventsByDomain === 'function') {
      try {
        return await adapter.getHealingEventsByDomain(this.db, domain, limit);
      } catch (err) {
        this.logger.warn?.(`[HealingReport] DB query failed, using cache: ${err.message}`);
      }
    }
    
    // Fallback to in-memory cache
    return this._events
      .filter(e => e.domain === domain)
      .slice(0, limit);
  }

  /**
   * Get healing events by failure type
   * 
   * @param {string} failureType - Failure type to query
   * @param {number} [limit=50] - Maximum events to return
   * @returns {Promise<Object[]>} List of events for the failure type
   */
  async getByType(failureType, limit = 50) {
    // Try database first
    const adapter = this._getAdapter();
    if (adapter && typeof adapter.getHealingEventsByType === 'function') {
      try {
        return await adapter.getHealingEventsByType(this.db, failureType, limit);
      } catch (err) {
        this.logger.warn?.(`[HealingReport] DB query failed, using cache: ${err.message}`);
      }
    }
    
    // Fallback to in-memory cache
    return this._events
      .filter(e => e.failureType === failureType)
      .slice(0, limit);
  }

  /**
   * Get healing statistics
   * 
   * @param {Object} [opts] - Options
   * @param {string} [opts.domain] - Filter by domain
   * @param {string} [opts.since] - ISO timestamp to filter from
   * @returns {Promise<Object>} Statistics object
   */
  async getStats(opts = {}) {
    // Try database first for accurate stats
    const adapter = this._getAdapter();
    if (adapter && typeof adapter.getHealingStats === 'function') {
      try {
        return await adapter.getHealingStats(this.db, opts);
      } catch (err) {
        this.logger.warn?.(`[HealingReport] DB stats failed, using cache: ${err.message}`);
      }
    }
    
    // Return in-memory stats
    const result = {
      total: this._stats.total,
      successful: this._stats.successful,
      failed: this._stats.failed,
      successRate: this._stats.total > 0 
        ? this._stats.successful / this._stats.total 
        : 0,
      byFailureType: [],
      topDomains: []
    };
    
    // Convert Maps to arrays
    for (const [type, stats] of this._stats.byType) {
      result.byFailureType.push({
        failureType: type,
        count: stats.count,
        successful: stats.successful,
        avgConfidence: null // Not tracked in memory
      });
    }
    
    // Top domains by count
    const domainEntries = Array.from(this._stats.byDomain.entries());
    domainEntries.sort((a, b) => b[1].count - a[1].count);
    
    for (const [domain, stats] of domainEntries.slice(0, 20)) {
      result.topDomains.push({
        domain,
        count: stats.count,
        successful: stats.successful
      });
    }
    
    return result;
  }

  /**
   * Clear all in-memory data
   */
  clear() {
    this._events = [];
    this._stats = {
      total: 0,
      successful: 0,
      failed: 0,
      byType: new Map(),
      byDomain: new Map()
    };
  }

  /**
   * Get in-memory event count
   * @returns {number}
   */
  get size() {
    return this._events.length;
  }
}

module.exports = { HealingReport };
