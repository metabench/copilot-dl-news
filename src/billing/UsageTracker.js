'use strict';

/**
 * UsageTracker - API usage tracking and limit checking
 * 
 * Tracks:
 * - API calls per user per billing period
 * - Export operations per user per billing period
 * - Alert sends per user per billing period
 * 
 * Provides real-time limit checking with plan awareness.
 * 
 * @module UsageTracker
 */

const { METRICS, getCurrentPeriod } = require('../db/sqlite/v1/queries/billingAdapter');

/**
 * UsageTracker class
 */
class UsageTracker {
  /**
   * Create a UsageTracker
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.billingAdapter - Billing database adapter
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.billingAdapter) {
      throw new Error('UsageTracker requires a billingAdapter');
    }
    
    this.billingAdapter = options.billingAdapter;
    this.logger = options.logger || console;
  }

  // =================== Usage Tracking ===================

  /**
   * Increment usage for a metric
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name (api_calls, exports, alerts_sent)
   * @param {number} [count=1] - Amount to increment
   * @returns {Object} Updated usage with new count
   */
  increment(userId, metric, count = 1) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!metric) {
      throw new Error('Metric is required');
    }
    if (count < 1) {
      throw new Error('Count must be at least 1');
    }

    const period = getCurrentPeriod();
    this.billingAdapter.incrementUsage(userId, metric, count, period);
    
    // Return updated usage
    const usage = this.billingAdapter.getUsage(userId, metric, period);
    return {
      userId,
      metric,
      count: usage ? usage.count : count,
      period
    };
  }

  /**
   * Get usage for a specific metric
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name
   * @param {string} [period] - Period (defaults to current)
   * @returns {Object|null} Usage data or null
   */
  getUsage(userId, metric, period = null) {
    if (!userId || !metric) {
      return null;
    }
    
    const usePeriod = period || getCurrentPeriod();
    return this.billingAdapter.getUsage(userId, metric, usePeriod);
  }

  /**
   * Get all usage for a user in current period
   * 
   * @param {number} userId - User ID
   * @param {string} [period] - Period (defaults to current)
   * @returns {Object} Usage by metric
   */
  getAllUsage(userId, period = null) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const usePeriod = period || getCurrentPeriod();
    const usageList = this.billingAdapter.getUserUsageForPeriod(userId, usePeriod);
    
    // Convert to map
    const usage = {
      [METRICS.API_CALLS]: 0,
      [METRICS.EXPORTS]: 0,
      [METRICS.ALERTS_SENT]: 0
    };
    
    for (const item of usageList) {
      usage[item.metric] = item.count;
    }
    
    return {
      userId,
      period: usePeriod,
      usage
    };
  }

  /**
   * Reset usage for a user in a period
   * 
   * @param {number} userId - User ID
   * @param {string} [period] - Period to reset (defaults to current)
   * @returns {Object} Result with changes count
   */
  resetUsage(userId, period = null) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const usePeriod = period || getCurrentPeriod();
    const result = this.billingAdapter.resetUsage(userId, usePeriod);
    
    this.logger.log(`[UsageTracker] Reset usage for user ${userId} in period ${usePeriod}`);
    
    return {
      userId,
      period: usePeriod,
      cleared: result.changes
    };
  }

  /**
   * Reset all usage for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object} Result with changes count
   */
  resetAllUsage(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = this.billingAdapter.resetAllUserUsage(userId);
    
    this.logger.log(`[UsageTracker] Reset all usage for user ${userId}`);
    
    return {
      userId,
      cleared: result.changes
    };
  }

  // =================== Limit Checking ===================

  /**
   * Check if user is over limit for a metric
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name
   * @param {Object} [options={}] - Options
   * @param {Object} [options.subscription] - Pre-fetched subscription
   * @returns {boolean} True if over limit
   */
  isOverLimit(userId, metric, options = {}) {
    const check = this.checkLimit(userId, metric, options);
    return !check.allowed;
  }

  /**
   * Get detailed limit check
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name
   * @param {Object} [options={}] - Options
   * @param {Object} [options.subscription] - Pre-fetched subscription
   * @returns {Object} Limit check result
   */
  checkLimit(userId, metric, options = {}) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!metric) {
      throw new Error('Metric is required');
    }

    // Get subscription to determine limits
    const subscription = options.subscription || 
      this.billingAdapter.getSubscriptionByUserId(userId);
    
    const plan = subscription?.plan || 'free';
    const limits = this.billingAdapter.getPlanLimits(plan);
    
    // Map metric to limit field
    const limitField = this._metricToLimitField(metric);
    const limit = limits[limitField];
    
    // Get current usage
    const usage = this.getUsage(userId, metric);
    const current = usage ? usage.count : 0;
    
    // -1 means unlimited
    if (limit === -1) {
      return {
        allowed: true,
        current,
        limit: -1,
        unlimited: true,
        percentage: 0,
        remaining: -1
      };
    }
    
    const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;
    const remaining = Math.max(0, limit - current);
    const allowed = current < limit;
    
    // Soft limit warning at 80%
    const warning = percentage >= 80 && percentage < 100;
    
    return {
      allowed,
      current,
      limit,
      unlimited: false,
      percentage,
      remaining,
      warning,
      plan
    };
  }

  /**
   * Check if user can perform an action (increment + check)
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name
   * @param {number} [count=1] - Amount needed
   * @returns {Object} Result with allowed status
   */
  canPerform(userId, metric, count = 1) {
    const check = this.checkLimit(userId, metric);
    
    if (check.unlimited) {
      return {
        allowed: true,
        current: check.current,
        after: check.current + count,
        remaining: -1
      };
    }
    
    const after = check.current + count;
    const allowed = after <= check.limit;
    
    return {
      allowed,
      current: check.current,
      after,
      limit: check.limit,
      remaining: check.remaining,
      wouldExceed: !allowed
    };
  }

  /**
   * Track an action with automatic limit checking
   * 
   * @param {number} userId - User ID
   * @param {string} metric - Metric name
   * @param {number} [count=1] - Amount to track
   * @returns {Object} Result with allowed status and new usage
   * @throws {Error} If over limit
   */
  track(userId, metric, count = 1) {
    const canDo = this.canPerform(userId, metric, count);
    
    if (!canDo.allowed) {
      const err = new Error(`Usage limit exceeded for ${metric}`);
      err.code = 'USAGE_LIMIT_EXCEEDED';
      err.metric = metric;
      err.current = canDo.current;
      err.limit = canDo.limit;
      throw err;
    }
    
    const result = this.increment(userId, metric, count);
    
    // Check if we hit warning threshold
    const check = this.checkLimit(userId, metric);
    
    return {
      tracked: true,
      ...result,
      limit: check.limit,
      remaining: check.remaining,
      percentage: check.percentage,
      warning: check.warning
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
      'alerts': 'alerts'
    };
    
    return mapping[metric] || metric;
  }

  /**
   * Get usage summary for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object} Usage summary with all metrics
   */
  getUsageSummary(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const period = getCurrentPeriod();
    const subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    const plan = subscription?.plan || 'free';
    const limits = this.billingAdapter.getPlanLimits(plan);
    
    const summary = {
      userId,
      plan,
      period,
      metrics: {}
    };
    
    for (const metric of Object.values(METRICS)) {
      const check = this.checkLimit(userId, metric, { subscription });
      summary.metrics[metric] = {
        current: check.current,
        limit: check.limit,
        unlimited: check.unlimited,
        percentage: check.percentage,
        remaining: check.remaining,
        allowed: check.allowed
      };
    }
    
    return summary;
  }

  // =================== Maintenance ===================

  /**
   * Clean up old usage data
   * 
   * @param {number} [monthsToKeep=12] - Keep this many months of history
   * @returns {Object} Cleanup result
   */
  cleanup(monthsToKeep = 12) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - monthsToKeep);
    
    const cutoffPeriod = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    
    const result = this.billingAdapter.deleteOldUsageMetrics(cutoffPeriod);
    
    this.logger.log(`[UsageTracker] Cleaned up ${result.deleted} old usage records (before ${cutoffPeriod})`);
    
    return {
      deleted: result.deleted,
      beforePeriod: cutoffPeriod
    };
  }
}

// Export metric constants for convenience
UsageTracker.METRICS = METRICS;

module.exports = { UsageTracker, METRICS };
