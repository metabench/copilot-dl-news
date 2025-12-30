'use strict';

/**
 * SelfHealingService - Main orchestration for crawler error recovery
 * 
 * Coordinates diagnosis, remediation, and reporting of crawler failures.
 * Provides a unified interface for the crawler to handle errors with
 * automatic recovery attempts.
 * 
 * @module SelfHealingService
 * @example
 * const service = new SelfHealingService({
 *   db,
 *   proxyManager,
 *   rateLimitTracker,
 *   puppeteerDomainManager
 * });
 * 
 * const result = await service.handleFailure('example.com', error, { url: '...' });
 * if (result.retry) {
 *   await sleep(result.delayMs);
 *   // retry the request
 * }
 */

const { EventEmitter } = require('events');
const { DiagnosticEngine, FailureTypes } = require('./DiagnosticEngine');
const { RemediationStrategies } = require('./RemediationStrategies');
const { HealingReport } = require('./HealingReport');

/**
 * @typedef {Object} HealingResult
 * @property {boolean} success - Whether healing was successful
 * @property {string} failureType - Diagnosed failure type
 * @property {Object} diagnosis - Full diagnosis result
 * @property {Object} remediation - Full remediation result
 * @property {boolean} retry - Whether to retry the request
 * @property {number} [delayMs] - Delay before retry
 * @property {string} [message] - Summary message
 */

class SelfHealingService extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} [opts.db] - Database instance
   * @param {Object} [opts.diagnostics] - Custom DiagnosticEngine instance
   * @param {Object} [opts.strategies] - Custom RemediationStrategies instance
   * @param {Object} [opts.report] - Custom HealingReport instance
   * @param {Object} [opts.proxyManager] - ProxyManager instance
   * @param {Object} [opts.rateLimitTracker] - RateLimitTracker instance
   * @param {Object} [opts.puppeteerDomainManager] - PuppeteerDomainManager instance
   * @param {Object} [opts.domainHealthTracker] - Domain health tracker
   * @param {Object} [opts.templateLearner] - Template learner service
   * @param {Object} [opts.logger] - Logger instance
   * @param {boolean} [opts.enabled=true] - Whether healing is enabled
   */
  constructor(opts = {}) {
    super();
    this.db = opts.db || null;
    this.logger = opts.logger || console;
    this.enabled = opts.enabled !== false;
    
    // Initialize or use provided components
    this.diagnostics = opts.diagnostics || new DiagnosticEngine({
      logger: this.logger
    });
    
    this.strategies = opts.strategies || new RemediationStrategies({
      logger: this.logger
    });
    
    this.report = opts.report || new HealingReport({
      db: this.db,
      logger: this.logger
    });
    
    // External service references
    this.proxyManager = opts.proxyManager || null;
    this.rateLimitTracker = opts.rateLimitTracker || null;
    this.puppeteerDomainManager = opts.puppeteerDomainManager || null;
    this.domainHealthTracker = opts.domainHealthTracker || null;
    this.templateLearner = opts.templateLearner || null;
    
    // Statistics
    this._stats = {
      handledFailures: 0,
      successfulRemediations: 0,
      failedRemediations: 0,
      retriesRequested: 0,
      byFailureType: new Map()
    };
  }

  /**
   * Handle a crawler failure with automatic diagnosis and remediation
   * 
   * @param {string} domain - Domain that experienced the failure
   * @param {Error|Object} error - The error or failure response
   * @param {Object} [context] - Additional context
   * @param {string} [context.url] - URL that failed
   * @param {number} [context.statusCode] - HTTP status code
   * @param {Object} [context.headers] - Response headers
   * @param {string} [context.body] - Response body (truncated)
   * @param {number} [context.previousConfidence] - Previous extraction confidence
   * @param {number} [context.currentConfidence] - Current extraction confidence
   * @param {string} [context.proxyName] - Proxy used
   * @returns {Promise<HealingResult>}
   */
  async handleFailure(domain, error, context = {}) {
    if (!this.enabled) {
      return {
        success: false,
        failureType: FailureTypes.UNKNOWN,
        diagnosis: null,
        remediation: null,
        retry: false,
        message: 'Self-healing is disabled'
      };
    }
    
    this._stats.handledFailures++;
    
    // Step 1: Diagnose the error
    const diagnosis = this.diagnostics.diagnose(error, {
      ...context,
      domain
    });
    
    // Update per-type stats
    const typeStats = this._stats.byFailureType.get(diagnosis.type) || { count: 0 };
    typeStats.count++;
    this._stats.byFailureType.set(diagnosis.type, typeStats);
    
    this.logger.info?.(
      `[SelfHealingService] Diagnosed ${domain}: ${diagnosis.type} ` +
      `(confidence: ${(diagnosis.confidence * 100).toFixed(0)}%)`
    );
    
    // Emit diagnosis event
    this.emit('diagnosis', { domain, diagnosis, context });
    
    // Step 2: Apply remediation strategy
    const remediationContext = {
      ...context,
      domain,
      diagnosis,
      diagnosticEngine: this.diagnostics,
      proxyManager: this.proxyManager,
      rateLimitTracker: this.rateLimitTracker,
      puppeteerDomainManager: this.puppeteerDomainManager,
      domainHealthTracker: this.domainHealthTracker,
      templateLearner: this.templateLearner
    };
    
    const remediation = await this.strategies.apply(
      diagnosis.type,
      domain,
      remediationContext
    );
    
    // Update stats
    if (remediation.success) {
      this._stats.successfulRemediations++;
    } else {
      this._stats.failedRemediations++;
    }
    
    if (remediation.retry) {
      this._stats.retriesRequested++;
    }
    
    this.logger.info?.(
      `[SelfHealingService] Remediation for ${domain}: ` +
      `${remediation.success ? 'success' : 'failed'} - ${remediation.action}` +
      (remediation.retry ? ` (retry in ${remediation.delayMs}ms)` : ' (no retry)')
    );
    
    // Emit remediation event
    this.emit('remediation', { domain, diagnosis, remediation, context });
    
    // Step 3: Record the healing event
    const overallSuccess = remediation.success;
    await this.report.record(domain, diagnosis, remediation, overallSuccess);
    
    // Return the result
    const result = {
      success: overallSuccess,
      failureType: diagnosis.type,
      diagnosis,
      remediation,
      retry: remediation.retry,
      delayMs: remediation.delayMs,
      message: `${diagnosis.type}: ${remediation.message || remediation.action}`
    };
    
    // Emit healing complete event
    this.emit('healed', result);
    
    return result;
  }

  /**
   * Get healing statistics
   * 
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    const reportStats = await this.report.getStats();
    
    // Convert byFailureType Map to object
    const byFailureType = {};
    for (const [type, stats] of this._stats.byFailureType) {
      byFailureType[type] = stats;
    }
    
    return {
      // Service-level stats
      handledFailures: this._stats.handledFailures,
      successfulRemediations: this._stats.successfulRemediations,
      failedRemediations: this._stats.failedRemediations,
      retriesRequested: this._stats.retriesRequested,
      successRate: this._stats.handledFailures > 0
        ? this._stats.successfulRemediations / this._stats.handledFailures
        : 0,
      byFailureType,
      
      // Report-level stats (from DB or memory)
      report: reportStats
    };
  }

  /**
   * Get healing history for a domain
   * 
   * @param {string} domain - Domain to query
   * @param {number} [limit=50] - Maximum events to return
   * @returns {Promise<Object[]>} List of healing events
   */
  async getHistory(domain, limit = 50) {
    return this.report.getByDomain(domain, limit);
  }

  /**
   * Get recent healing events
   * 
   * @param {number} [limit=50] - Maximum events to return
   * @returns {Promise<Object[]>} List of healing events
   */
  async getRecentEvents(limit = 50) {
    return this.report.getRecent(limit);
  }

  /**
   * Reset domain tracking (useful after successful recovery)
   * 
   * @param {string} domain - Domain to reset
   */
  resetDomain(domain) {
    this.diagnostics.resetDomainTracking(domain);
  }

  /**
   * Check if a domain has recent healing events
   * 
   * @param {string} domain - Domain to check
   * @param {number} [windowMinutes=60] - Time window
   * @returns {Promise<boolean>}
   */
  async hasRecentIssues(domain, windowMinutes = 60) {
    const events = await this.report.getByDomain(domain, 5);
    
    if (events.length === 0) return false;
    
    const cutoff = Date.now() - (windowMinutes * 60 * 1000);
    const recentEvent = events.find(e => {
      const eventTime = new Date(e.createdAt).getTime();
      return eventTime > cutoff;
    });
    
    return !!recentEvent;
  }

  /**
   * Get failure types that a domain is experiencing
   * 
   * @param {string} domain - Domain to check
   * @returns {Promise<string[]>} List of failure types
   */
  async getDomainFailureTypes(domain) {
    const events = await this.report.getByDomain(domain, 20);
    const types = new Set(events.map(e => e.failureType));
    return Array.from(types);
  }

  /**
   * Enable or disable the service
   * 
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.emit('enabled', { enabled: this.enabled });
  }

  /**
   * Inject dependencies after construction
   * 
   * @param {Object} deps
   * @param {Object} [deps.proxyManager]
   * @param {Object} [deps.rateLimitTracker]
   * @param {Object} [deps.puppeteerDomainManager]
   * @param {Object} [deps.domainHealthTracker]
   * @param {Object} [deps.templateLearner]
   */
  injectDependencies(deps = {}) {
    if (deps.proxyManager) this.proxyManager = deps.proxyManager;
    if (deps.rateLimitTracker) this.rateLimitTracker = deps.rateLimitTracker;
    if (deps.puppeteerDomainManager) this.puppeteerDomainManager = deps.puppeteerDomainManager;
    if (deps.domainHealthTracker) this.domainHealthTracker = deps.domainHealthTracker;
    if (deps.templateLearner) this.templateLearner = deps.templateLearner;
  }

  /**
   * Get available failure types
   * @returns {Object}
   */
  static get FailureTypes() {
    return FailureTypes;
  }
}

module.exports = { SelfHealingService };
