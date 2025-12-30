'use strict';

/**
 * FeatureGate - Plan-based feature access and limit enforcement
 * 
 * Provides:
 * - Limit checking with soft/hard thresholds
 * - Express middleware for route protection
 * - Grace period handling after limit exceeded
 * - Detailed status for UI display
 * 
 * @module FeatureGate
 */

const { METRICS, getCurrentPeriod } = require('../db/sqlite/v1/queries/billingAdapter');

/**
 * Default configuration
 */
const DEFAULTS = {
  SOFT_LIMIT_PERCENTAGE: 80,  // Warning at 80%
  HARD_LIMIT_PERCENTAGE: 100, // Block at 100%
  GRACE_PERIOD_HOURS: 24      // 24h grace after hard limit
};

/**
 * FeatureGate class
 */
class FeatureGate {
  /**
   * Create a FeatureGate
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.billingAdapter - Billing database adapter
   * @param {Object} [options.usageTracker] - UsageTracker instance
   * @param {Object} [options.subscriptionService] - SubscriptionService instance
   * @param {number} [options.softLimitPercentage=80] - Soft limit threshold
   * @param {number} [options.hardLimitPercentage=100] - Hard limit threshold
   * @param {number} [options.gracePeriodHours=24] - Grace period in hours
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.billingAdapter) {
      throw new Error('FeatureGate requires a billingAdapter');
    }
    
    this.billingAdapter = options.billingAdapter;
    this.usageTracker = options.usageTracker || null;
    this.subscriptionService = options.subscriptionService || null;
    this.logger = options.logger || console;
    
    this.softLimitPercentage = options.softLimitPercentage ?? DEFAULTS.SOFT_LIMIT_PERCENTAGE;
    this.hardLimitPercentage = options.hardLimitPercentage ?? DEFAULTS.HARD_LIMIT_PERCENTAGE;
    this.gracePeriodHours = options.gracePeriodHours ?? DEFAULTS.GRACE_PERIOD_HOURS;
    
    // Track grace period start times per user/metric
    this._graceStartTimes = new Map();
  }

  // =================== Limit Checking ===================

  /**
   * Check if user can access a feature based on plan limits
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric to check
   * @returns {Object} Access check result
   */
  checkLimit(userId, metric) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!metric) {
      throw new Error('Metric is required');
    }

    // Get subscription
    const subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    const plan = subscription?.plan || 'free';
    const limits = this.billingAdapter.getPlanLimits(plan);
    
    // Map metric to limit field
    const limitField = this._metricToLimitField(metric);
    const limit = limits[limitField];
    
    // Get current usage
    const period = getCurrentPeriod();
    const usage = this.billingAdapter.getUsage(userId, metric, period);
    const current = usage ? usage.count : 0;
    
    // Unlimited check
    if (limit === -1) {
      return {
        allowed: true,
        status: 'unlimited',
        current,
        limit: -1,
        percentage: 0,
        remaining: -1,
        plan,
        message: 'Unlimited access'
      };
    }
    
    const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;
    const remaining = Math.max(0, limit - current);
    
    // Check thresholds
    let status = 'ok';
    let allowed = true;
    let message = `${remaining} remaining`;
    let inGracePeriod = false;
    
    if (percentage >= this.hardLimitPercentage) {
      // Check grace period
      inGracePeriod = this._isInGracePeriod(userId, metric);
      
      if (inGracePeriod) {
        status = 'grace';
        allowed = true;
        const graceRemaining = this._getGraceTimeRemaining(userId, metric);
        message = `Limit exceeded. Grace period: ${graceRemaining} remaining`;
      } else {
        status = 'blocked';
        allowed = false;
        message = `Limit exceeded. Please upgrade your plan.`;
      }
    } else if (percentage >= this.softLimitPercentage) {
      status = 'warning';
      allowed = true;
      message = `Approaching limit: ${percentage}% used`;
    }
    
    return {
      allowed,
      status,
      current,
      limit,
      percentage,
      remaining,
      plan,
      message,
      inGracePeriod,
      softLimit: this.softLimitPercentage,
      hardLimit: this.hardLimitPercentage
    };
  }

  /**
   * Check multiple limits at once
   * 
   * @param {number} userId - User ID
   * @param {string[]} metrics - Metrics to check
   * @returns {Object} Results by metric
   */
  checkLimits(userId, metrics) {
    const results = {};
    let anyBlocked = false;
    let anyWarning = false;
    
    for (const metric of metrics) {
      const check = this.checkLimit(userId, metric);
      results[metric] = check;
      
      if (!check.allowed) {
        anyBlocked = true;
      }
      if (check.status === 'warning') {
        anyWarning = true;
      }
    }
    
    return {
      results,
      anyBlocked,
      anyWarning,
      allAllowed: !anyBlocked
    };
  }

  // =================== Grace Period ===================

  /**
   * Start grace period for a user/metric
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric
   * @returns {Object} Grace period info
   */
  startGracePeriod(userId, metric) {
    const key = `${userId}:${metric}`;
    const startTime = Date.now();
    const endTime = startTime + (this.gracePeriodHours * 60 * 60 * 1000);
    
    this._graceStartTimes.set(key, startTime);
    
    this.logger.log(`[FeatureGate] Started grace period for user ${userId}, metric ${metric}`);
    
    return {
      userId,
      metric,
      startedAt: new Date(startTime).toISOString(),
      endsAt: new Date(endTime).toISOString(),
      hoursRemaining: this.gracePeriodHours
    };
  }

  /**
   * Check if user is in grace period
   * @private
   */
  _isInGracePeriod(userId, metric) {
    const key = `${userId}:${metric}`;
    const startTime = this._graceStartTimes.get(key);
    
    if (!startTime) {
      // Auto-start grace period on first check
      this.startGracePeriod(userId, metric);
      return true;
    }
    
    const elapsed = Date.now() - startTime;
    const gracePeriodMs = this.gracePeriodHours * 60 * 60 * 1000;
    
    return elapsed < gracePeriodMs;
  }

  /**
   * Get remaining grace period time
   * @private
   */
  _getGraceTimeRemaining(userId, metric) {
    const key = `${userId}:${metric}`;
    const startTime = this._graceStartTimes.get(key);
    
    if (!startTime) {
      return `${this.gracePeriodHours}h`;
    }
    
    const elapsed = Date.now() - startTime;
    const gracePeriodMs = this.gracePeriodHours * 60 * 60 * 1000;
    const remaining = gracePeriodMs - elapsed;
    
    if (remaining <= 0) {
      return '0h';
    }
    
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Clear grace period for a user/metric
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric
   */
  clearGracePeriod(userId, metric) {
    const key = `${userId}:${metric}`;
    this._graceStartTimes.delete(key);
  }

  /**
   * Clear all grace periods for a user
   * 
   * @param {number} userId - User ID
   */
  clearAllGracePeriods(userId) {
    const prefix = `${userId}:`;
    for (const key of this._graceStartTimes.keys()) {
      if (key.startsWith(prefix)) {
        this._graceStartTimes.delete(key);
      }
    }
  }

  // =================== Express Middleware ===================

  /**
   * Create Express middleware to enforce plan limits
   * 
   * @param {string} metric - Metric to check
   * @param {Object} [options={}] - Middleware options
   * @param {boolean} [options.blockOnExceed=true] - Block requests when limit exceeded
   * @param {boolean} [options.incrementOnSuccess=false] - Increment usage after success
   * @returns {Function} Express middleware
   */
  requirePlanLimit(metric, options = {}) {
    const { blockOnExceed = true, incrementOnSuccess = false } = options;
    const self = this;

    return function planLimitMiddleware(req, res, next) {
      // Get user ID from request (assumes auth middleware ran first)
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      try {
        const check = self.checkLimit(userId, metric);
        
        // Add limit info to request for downstream use
        req.planLimit = check;
        
        // Check if blocked
        if (!check.allowed && blockOnExceed) {
          return res.status(429).json({
            success: false,
            error: 'Usage limit exceeded',
            code: 'USAGE_LIMIT_EXCEEDED',
            limit: {
              metric,
              current: check.current,
              limit: check.limit,
              percentage: check.percentage,
              plan: check.plan,
              message: check.message
            }
          });
        }
        
        // Add warning header if approaching limit
        if (check.status === 'warning') {
          res.set('X-Usage-Warning', check.message);
          res.set('X-Usage-Percentage', String(check.percentage));
        }
        
        // Add grace period header if applicable
        if (check.inGracePeriod) {
          res.set('X-Grace-Period', 'true');
          res.set('X-Grace-Message', check.message);
        }
        
        // Increment on success if requested
        if (incrementOnSuccess && self.usageTracker) {
          res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                self.usageTracker.increment(userId, metric);
              } catch (err) {
                self.logger.error(`[FeatureGate] Failed to increment usage: ${err.message}`);
              }
            }
          });
        }
        
        next();
      } catch (err) {
        self.logger.error(`[FeatureGate] Middleware error: ${err.message}`);
        next(err);
      }
    };
  }

  /**
   * Create middleware that only adds limit info (no blocking)
   * 
   * @param {string} metric - Metric to check
   * @returns {Function} Express middleware
   */
  attachLimitInfo(metric) {
    return this.requirePlanLimit(metric, { blockOnExceed: false });
  }

  /**
   * Create middleware that tracks usage on successful responses
   * 
   * @param {string} metric - Metric to track
   * @returns {Function} Express middleware
   */
  trackUsage(metric) {
    const self = this;
    
    return function trackUsageMiddleware(req, res, next) {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId || !self.usageTracker) {
        return next();
      }
      
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            self.usageTracker.increment(userId, metric);
          } catch (err) {
            self.logger.error(`[FeatureGate] Failed to track usage: ${err.message}`);
          }
        }
      });
      
      next();
    };
  }

  // =================== Helpers ===================

  /**
   * Map metric name to plan limit field
   * @private
   */
  _metricToLimitField(metric) {
    const mapping = {
      [METRICS.API_CALLS]: 'apiCalls',
      [METRICS.EXPORTS]: 'exports',
      [METRICS.ALERTS_SENT]: 'alerts',
      'api_calls': 'apiCalls',
      'exports': 'exports',
      'alerts_sent': 'alerts',
      'alerts': 'alerts',
      'workspaces': 'workspaces'
    };
    
    return mapping[metric] || metric;
  }

  /**
   * Get status for UI display
   * 
   * @param {number} userId - User ID
   * @returns {Object} Status for all metrics
   */
  getStatus(userId) {
    const subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    const plan = subscription?.plan || 'free';
    
    const status = {
      userId,
      plan,
      metrics: {}
    };
    
    for (const metric of Object.values(METRICS)) {
      status.metrics[metric] = this.checkLimit(userId, metric);
    }
    
    return status;
  }

  /**
   * Check if user has access to a feature (not limit-based)
   * 
   * @param {number} userId - User ID
   * @param {string} feature - Feature name
   * @returns {boolean} Has access
   */
  hasFeature(userId, feature) {
    const subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    const plan = subscription?.plan || 'free';
    
    // Define feature access by plan
    const featureAccess = {
      // Free plan features
      free: ['basic_search', 'basic_export', 'single_workspace'],
      // Pro plan features (includes free)
      pro: ['basic_search', 'basic_export', 'single_workspace', 
            'advanced_search', 'bulk_export', 'multi_workspace', 'priority_support'],
      // Enterprise plan features (includes all)
      enterprise: ['basic_search', 'basic_export', 'single_workspace',
                   'advanced_search', 'bulk_export', 'multi_workspace', 'priority_support',
                   'custom_integrations', 'sso', 'audit_logs', 'dedicated_support']
    };
    
    const planFeatures = featureAccess[plan] || featureAccess.free;
    return planFeatures.includes(feature);
  }
}

// Export constants
FeatureGate.METRICS = METRICS;
FeatureGate.DEFAULTS = DEFAULTS;

module.exports = { FeatureGate, METRICS, DEFAULTS };
