'use strict';

/**
 * RemediationStrategies - Per-failure-type remediation actions
 * 
 * Each failure type maps to a remediation function that attempts
 * to fix the underlying issue. Strategies are composable and
 * can be chained.
 * 
 * @module RemediationStrategies
 */

const { FailureTypes } = require('./DiagnosticEngine');

/**
 * @typedef {Object} RemediationResult
 * @property {boolean} success - Whether remediation succeeded
 * @property {string} action - Action taken
 * @property {Object} [details] - Additional details
 * @property {string} [message] - Human-readable result
 * @property {boolean} [retry] - Whether to retry the request
 * @property {number} [delayMs] - Delay before retry (if applicable)
 */

/**
 * @typedef {Object} RemediationContext
 * @property {string} domain - Domain being remediated
 * @property {string} [url] - URL that failed
 * @property {string} [proxyName] - Proxy that was in use
 * @property {Object} [diagnosis] - Diagnosis result
 * @property {Object} [proxyManager] - ProxyManager instance
 * @property {Object} [rateLimitTracker] - RateLimitTracker instance
 * @property {Object} [puppeteerDomainManager] - PuppeteerDomainManager instance
 * @property {Object} [domainHealthTracker] - Domain health tracker
 * @property {Object} [templateLearner] - Template learner service
 */

/**
 * Default strategy implementations
 */
const DEFAULT_STRATEGIES = {
  /**
   * STALE_PROXY: Rotate to a new proxy and mark current as unhealthy
   */
  [FailureTypes.STALE_PROXY]: async (context) => {
    const { proxyManager, proxyName, domain } = context;
    
    if (!proxyManager) {
      return {
        success: false,
        action: 'rotate_proxy',
        message: 'No ProxyManager available',
        retry: false
      };
    }
    
    // Mark current proxy as failed
    if (proxyName) {
      proxyManager.recordFailure(proxyName, { 
        httpStatus: context.diagnosis?.evidence?.statusCode,
        code: 'STALE_PROXY_DETECTED'
      });
    }
    
    // Check if we have other proxies available
    const availableProxies = proxyManager.getAvailableProxyNames();
    
    if (availableProxies.length === 0) {
      return {
        success: false,
        action: 'rotate_proxy',
        message: 'No healthy proxies available',
        retry: false,
        details: { proxyName, availableCount: 0 }
      };
    }
    
    return {
      success: true,
      action: 'rotate_proxy',
      message: `Rotated away from proxy ${proxyName}, ${availableProxies.length} proxies available`,
      retry: true,
      delayMs: 1000,
      details: { 
        rotatedFrom: proxyName, 
        availableCount: availableProxies.length 
      }
    };
  },

  /**
   * LAYOUT_CHANGE: Queue domain for template relearning
   */
  [FailureTypes.LAYOUT_CHANGE]: async (context) => {
    const { domain, templateLearner, diagnosis } = context;
    
    if (!templateLearner) {
      return {
        success: false,
        action: 'queue_template_relearn',
        message: 'No template learner available',
        retry: false,
        details: { domain, flagged: true }
      };
    }
    
    // Queue for relearning
    try {
      if (typeof templateLearner.queueForRelearning === 'function') {
        await templateLearner.queueForRelearning(domain, {
          reason: 'confidence_drop',
          previousConfidence: diagnosis?.evidence?.previousConfidence,
          currentConfidence: diagnosis?.evidence?.currentConfidence
        });
      }
      
      return {
        success: true,
        action: 'queue_template_relearn',
        message: `Queued ${domain} for template relearning`,
        retry: false, // Don't retry until template is relearned
        details: { domain, queued: true }
      };
    } catch (err) {
      return {
        success: false,
        action: 'queue_template_relearn',
        message: `Failed to queue ${domain}: ${err.message}`,
        retry: false
      };
    }
  },

  /**
   * RATE_LIMITED: Increase delay via RateLimitTracker
   */
  [FailureTypes.RATE_LIMITED]: async (context) => {
    const { rateLimitTracker, domain, diagnosis } = context;
    
    if (!rateLimitTracker) {
      // Fallback: suggest a delay
      const suggestedDelay = 30000; // 30 seconds
      return {
        success: true,
        action: 'increase_delay',
        message: `No RateLimitTracker, suggest waiting ${suggestedDelay}ms`,
        retry: true,
        delayMs: suggestedDelay
      };
    }
    
    // Extract Retry-After if available
    const headers = context.headers || {};
    const statusCode = diagnosis?.evidence?.statusCode || 429;
    
    // Record the rate limit - this automatically applies backoff
    const newInterval = rateLimitTracker.recordRateLimit(domain, statusCode, headers);
    
    return {
      success: true,
      action: 'increase_delay',
      message: `Increased delay for ${domain} to ${newInterval}ms`,
      retry: true,
      delayMs: newInterval,
      details: { domain, newInterval, statusCode }
    };
  },

  /**
   * DNS_FAILURE: Pause domain and check health
   */
  [FailureTypes.DNS_FAILURE]: async (context) => {
    const { domain, domainHealthTracker } = context;
    
    // DNS failures usually indicate the domain is down or misconfigured
    // Pause the domain temporarily
    const pauseDuration = 5 * 60 * 1000; // 5 minutes
    
    if (domainHealthTracker && typeof domainHealthTracker.pauseDomain === 'function') {
      await domainHealthTracker.pauseDomain(domain, {
        reason: 'dns_failure',
        duration: pauseDuration,
        checkAfter: Date.now() + pauseDuration
      });
    }
    
    return {
      success: true,
      action: 'pause_domain',
      message: `Paused ${domain} for ${pauseDuration / 1000}s due to DNS failure`,
      retry: false,
      delayMs: pauseDuration,
      details: { domain, pauseDuration, reason: 'dns_failure' }
    };
  },

  /**
   * CONTENT_BLOCK: Upgrade to Puppeteer fetch
   */
  [FailureTypes.CONTENT_BLOCK]: async (context) => {
    const { domain, puppeteerDomainManager } = context;
    
    if (!puppeteerDomainManager) {
      return {
        success: false,
        action: 'upgrade_to_puppeteer',
        message: 'No PuppeteerDomainManager available',
        retry: false,
        details: { domain, flagged: true }
      };
    }
    
    try {
      // Add domain to Puppeteer list
      if (typeof puppeteerDomainManager.addDomain === 'function') {
        puppeteerDomainManager.addDomain(domain, {
          reason: 'javascript_required',
          addedBy: 'self-healing'
        });
      } else if (typeof puppeteerDomainManager.learnDomain === 'function') {
        // Alternative API
        puppeteerDomainManager.learnDomain(domain, {
          reason: 'javascript_required',
          autoApprove: true
        });
      }
      
      return {
        success: true,
        action: 'upgrade_to_puppeteer',
        message: `Added ${domain} to Puppeteer fetch list`,
        retry: true,
        delayMs: 1000,
        details: { domain, upgraded: true }
      };
    } catch (err) {
      return {
        success: false,
        action: 'upgrade_to_puppeteer',
        message: `Failed to add ${domain} to Puppeteer: ${err.message}`,
        retry: false
      };
    }
  },

  /**
   * SOFT_BLOCK: Route through proxy and flag for review
   */
  [FailureTypes.SOFT_BLOCK]: async (context) => {
    const { domain, proxyManager, domainHealthTracker } = context;
    const actions = [];
    let success = false;
    
    // Try to get a fresh proxy
    if (proxyManager && proxyManager.isEnabled()) {
      const proxy = proxyManager.getProxy(domain);
      if (proxy) {
        actions.push(`routed through proxy ${proxy.name}`);
        success = true;
      }
    }
    
    // Flag domain for human review
    if (domainHealthTracker && typeof domainHealthTracker.flagForReview === 'function') {
      await domainHealthTracker.flagForReview(domain, {
        reason: 'soft_block',
        type: context.diagnosis?.evidence?.matchedPatterns?.[0] || 'captcha',
        detectedAt: new Date().toISOString()
      });
      actions.push('flagged for review');
    }
    
    // Increase delay significantly to reduce detection
    const backoffDelay = 60000; // 1 minute
    
    return {
      success,
      action: 'route_through_proxy_and_flag',
      message: `Soft block on ${domain}: ${actions.join(', ') || 'flagged only'}`,
      retry: success,
      delayMs: backoffDelay,
      details: { 
        domain, 
        actions, 
        flagged: true,
        backoffDelay
      }
    };
  },

  /**
   * CONNECTION_RESET: Backoff and retry with potential Puppeteer upgrade
   */
  [FailureTypes.CONNECTION_RESET]: async (context) => {
    const { domain, rateLimitTracker, puppeteerDomainManager } = context;
    
    // Connection resets often indicate server-side rate limiting or blocking
    const backoffDelay = 10000; // 10 seconds
    
    // Track the failure
    if (rateLimitTracker) {
      rateLimitTracker.recordFailure(domain, new Error('Connection reset'));
    }
    
    // If we've seen multiple connection resets, consider Puppeteer
    const state = context.diagnosticEngine?.getDomainErrorState?.(domain);
    if (state && state.count >= 3 && puppeteerDomainManager) {
      try {
        if (typeof puppeteerDomainManager.learnDomain === 'function') {
          puppeteerDomainManager.learnDomain(domain, {
            reason: 'connection_reset_pattern',
            autoApprove: false // Needs approval
          });
        }
        
        return {
          success: true,
          action: 'backoff_and_learn_puppeteer',
          message: `Connection resets on ${domain}, suggesting Puppeteer`,
          retry: true,
          delayMs: backoffDelay,
          details: { domain, consecutiveResets: state.count, puppeteerSuggested: true }
        };
      } catch (err) {
        // Fallback to just backoff
      }
    }
    
    return {
      success: true,
      action: 'backoff',
      message: `Connection reset on ${domain}, backing off ${backoffDelay}ms`,
      retry: true,
      delayMs: backoffDelay,
      details: { domain, backoffDelay }
    };
  },

  /**
   * TIMEOUT: Increase timeout settings and retry
   */
  [FailureTypes.TIMEOUT]: async (context) => {
    const { domain, rateLimitTracker } = context;
    
    // Record failure for tracking
    if (rateLimitTracker) {
      rateLimitTracker.recordFailure(domain, new Error('Timeout'));
    }
    
    // Suggest longer timeout on retry
    const suggestedTimeout = 60000; // 60 seconds
    const backoffDelay = 5000;
    
    return {
      success: true,
      action: 'increase_timeout',
      message: `Timeout on ${domain}, suggest ${suggestedTimeout}ms timeout`,
      retry: true,
      delayMs: backoffDelay,
      details: { 
        domain, 
        suggestedTimeout,
        backoffDelay
      }
    };
  },

  /**
   * SSL_ERROR: Flag for review, don't retry
   */
  [FailureTypes.SSL_ERROR]: async (context) => {
    const { domain, domainHealthTracker, diagnosis } = context;
    
    // SSL errors usually require human intervention
    if (domainHealthTracker && typeof domainHealthTracker.flagForReview === 'function') {
      await domainHealthTracker.flagForReview(domain, {
        reason: 'ssl_error',
        errorCode: diagnosis?.evidence?.errorCode,
        detectedAt: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      action: 'flag_ssl_error',
      message: `SSL error on ${domain}, flagged for review`,
      retry: false,
      details: { 
        domain, 
        errorCode: diagnosis?.evidence?.errorCode,
        flagged: true
      }
    };
  },

  /**
   * UNKNOWN: Generic backoff
   */
  [FailureTypes.UNKNOWN]: async (context) => {
    const { domain } = context;
    const backoffDelay = 5000;
    
    return {
      success: true,
      action: 'generic_backoff',
      message: `Unknown error on ${domain}, backing off ${backoffDelay}ms`,
      retry: true,
      delayMs: backoffDelay,
      details: { domain, backoffDelay }
    };
  }
};

class RemediationStrategies {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.strategies] - Custom strategies to merge/override
   * @param {Object} [opts.logger] - Logger instance
   */
  constructor(opts = {}) {
    this.logger = opts.logger || console;
    
    // Merge default strategies with custom ones
    this._strategies = { ...DEFAULT_STRATEGIES };
    if (opts.strategies) {
      for (const [type, strategy] of Object.entries(opts.strategies)) {
        this._strategies[type] = strategy;
      }
    }
  }

  /**
   * Get the remediation strategy for a failure type
   * 
   * @param {string} failureType - The failure type
   * @returns {Function|null} The strategy function or null
   */
  getStrategy(failureType) {
    return this._strategies[failureType] || this._strategies[FailureTypes.UNKNOWN];
  }

  /**
   * Apply remediation for a failure type
   * 
   * @param {string} failureType - The failure type
   * @param {string} domain - Domain being remediated
   * @param {RemediationContext} context - Remediation context
   * @returns {Promise<RemediationResult>}
   */
  async apply(failureType, domain, context = {}) {
    const strategy = this.getStrategy(failureType);
    
    if (!strategy) {
      return {
        success: false,
        action: 'none',
        message: `No strategy for failure type: ${failureType}`,
        retry: false
      };
    }
    
    try {
      const enrichedContext = {
        ...context,
        domain,
        failureType
      };
      
      const result = await strategy(enrichedContext);
      
      this.logger.debug?.(
        `[RemediationStrategies] Applied ${failureType} strategy for ${domain}: ` +
        `${result.success ? 'success' : 'failed'} - ${result.action}`
      );
      
      return result;
    } catch (err) {
      this.logger.error?.(
        `[RemediationStrategies] Strategy ${failureType} threw error: ${err.message}`
      );
      
      return {
        success: false,
        action: 'strategy_error',
        message: `Strategy threw error: ${err.message}`,
        retry: false,
        details: { error: err.message }
      };
    }
  }

  /**
   * Get all available strategy types
   * @returns {string[]}
   */
  getAvailableStrategies() {
    return Object.keys(this._strategies);
  }

  /**
   * Register a custom strategy
   * 
   * @param {string} failureType - The failure type to handle
   * @param {Function} strategy - The strategy function
   */
  registerStrategy(failureType, strategy) {
    if (typeof strategy !== 'function') {
      throw new Error('Strategy must be a function');
    }
    this._strategies[failureType] = strategy;
  }
}

module.exports = {
  RemediationStrategies,
  DEFAULT_STRATEGIES
};
