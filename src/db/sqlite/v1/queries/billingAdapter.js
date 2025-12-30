'use strict';

/**
 * Billing Database Adapter
 * 
 * Provides database access for subscription and billing features:
 * - Subscription management (plans, status, Stripe data)
 * - Usage metrics tracking (API calls, exports, alerts)
 * - Billing event logging (Stripe webhooks, plan changes)
 * 
 * ALL SQL for billing features lives here - service layers must NOT import better-sqlite3.
 * 
 * @module billingAdapter
 */

/**
 * Plan tier definitions with limits
 * -1 indicates unlimited
 */
const PLANS = {
  free: {
    name: 'free',
    price: 0,
    apiCalls: 1000,
    exports: 10,
    workspaces: 1,
    alerts: 5
  },
  pro: {
    name: 'pro',
    price: 29,
    apiCalls: 50000,
    exports: 500,
    workspaces: 5,
    alerts: 100
  },
  enterprise: {
    name: 'enterprise',
    price: 199,
    apiCalls: -1,  // unlimited
    exports: -1,
    workspaces: -1,
    alerts: -1
  }
};

/**
 * Usage metric types
 */
const METRICS = {
  API_CALLS: 'api_calls',
  EXPORTS: 'exports',
  ALERTS_SENT: 'alerts_sent'
};

/**
 * Subscription status types
 */
const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
  PAUSED: 'paused'
};

/**
 * Ensure billing-related tables exist
 * @param {import('better-sqlite3').Database} db
 */
function ensureBillingSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureBillingSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    -- Subscriptions table (one per user)
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Usage metrics (per user, per metric, per period)
    CREATE TABLE IF NOT EXISTS usage_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      metric TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      period TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, metric, period),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Billing events (audit log for Stripe and internal events)
    CREATE TABLE IF NOT EXISTS billing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      stripe_event_id TEXT,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_user ON usage_metrics(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period);
    CREATE INDEX IF NOT EXISTS idx_usage_metrics_user_metric_period ON usage_metrics(user_id, metric, period);
    
    CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_id ON billing_events(stripe_event_id);
    CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events(created_at);
  `);
}

/**
 * Get the current billing period string (YYYY-MM format)
 * @returns {string}
 */
function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Create billing adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Billing adapter methods
 */
function createBillingAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createBillingAdapter requires a better-sqlite3 database handle');
  }

  ensureBillingSchema(db);

  // Prepared statements
  const stmts = {
    // =================== Subscriptions ===================
    
    createSubscription: db.prepare(`
      INSERT INTO subscriptions (
        user_id, plan, stripe_customer_id, stripe_subscription_id,
        status, current_period_start, current_period_end, created_at
      )
      VALUES (
        @user_id, @plan, @stripe_customer_id, @stripe_subscription_id,
        @status, @current_period_start, @current_period_end, datetime('now')
      )
    `),
    
    getSubscriptionByUserId: db.prepare(`
      SELECT id, user_id, plan, stripe_customer_id, stripe_subscription_id,
             status, current_period_start, current_period_end, created_at, updated_at
      FROM subscriptions
      WHERE user_id = ?
    `),
    
    getSubscriptionByStripeCustomerId: db.prepare(`
      SELECT id, user_id, plan, stripe_customer_id, stripe_subscription_id,
             status, current_period_start, current_period_end, created_at, updated_at
      FROM subscriptions
      WHERE stripe_customer_id = ?
    `),
    
    getSubscriptionByStripeSubscriptionId: db.prepare(`
      SELECT id, user_id, plan, stripe_customer_id, stripe_subscription_id,
             status, current_period_start, current_period_end, created_at, updated_at
      FROM subscriptions
      WHERE stripe_subscription_id = ?
    `),
    
    updateSubscription: db.prepare(`
      UPDATE subscriptions
      SET plan = COALESCE(@plan, plan),
          stripe_customer_id = COALESCE(@stripe_customer_id, stripe_customer_id),
          stripe_subscription_id = COALESCE(@stripe_subscription_id, stripe_subscription_id),
          status = COALESCE(@status, status),
          current_period_start = COALESCE(@current_period_start, current_period_start),
          current_period_end = COALESCE(@current_period_end, current_period_end),
          updated_at = datetime('now')
      WHERE user_id = @user_id
    `),
    
    deleteSubscription: db.prepare(`
      DELETE FROM subscriptions WHERE user_id = ?
    `),
    
    listActiveSubscriptions: db.prepare(`
      SELECT id, user_id, plan, stripe_customer_id, stripe_subscription_id,
             status, current_period_start, current_period_end, created_at, updated_at
      FROM subscriptions
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    countSubscriptionsByPlan: db.prepare(`
      SELECT plan, COUNT(*) as count
      FROM subscriptions
      WHERE status = 'active'
      GROUP BY plan
    `),
    
    // =================== Usage Metrics ===================
    
    incrementUsage: db.prepare(`
      INSERT INTO usage_metrics (user_id, metric, count, period, updated_at)
      VALUES (@user_id, @metric, @count, @period, datetime('now'))
      ON CONFLICT(user_id, metric, period) DO UPDATE SET
        count = count + @count,
        updated_at = datetime('now')
    `),
    
    getUsage: db.prepare(`
      SELECT id, user_id, metric, count, period, updated_at
      FROM usage_metrics
      WHERE user_id = ? AND metric = ? AND period = ?
    `),
    
    getUserUsageForPeriod: db.prepare(`
      SELECT id, user_id, metric, count, period, updated_at
      FROM usage_metrics
      WHERE user_id = ? AND period = ?
    `),
    
    getAllUserUsage: db.prepare(`
      SELECT id, user_id, metric, count, period, updated_at
      FROM usage_metrics
      WHERE user_id = ?
      ORDER BY period DESC, metric ASC
    `),
    
    resetUsage: db.prepare(`
      DELETE FROM usage_metrics
      WHERE user_id = ? AND period = ?
    `),
    
    resetAllUserUsage: db.prepare(`
      DELETE FROM usage_metrics
      WHERE user_id = ?
    `),
    
    deleteOldUsageMetrics: db.prepare(`
      DELETE FROM usage_metrics
      WHERE period < ?
    `),
    
    // =================== Billing Events ===================
    
    logBillingEvent: db.prepare(`
      INSERT INTO billing_events (user_id, event_type, stripe_event_id, data, created_at)
      VALUES (@user_id, @event_type, @stripe_event_id, @data, datetime('now'))
    `),
    
    getBillingEventByStripeId: db.prepare(`
      SELECT id, user_id, event_type, stripe_event_id, data, created_at
      FROM billing_events
      WHERE stripe_event_id = ?
    `),
    
    getUserBillingEvents: db.prepare(`
      SELECT id, user_id, event_type, stripe_event_id, data, created_at
      FROM billing_events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    getRecentBillingEvents: db.prepare(`
      SELECT id, user_id, event_type, stripe_event_id, data, created_at
      FROM billing_events
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    countBillingEventsByType: db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM billing_events
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY event_type
    `),
    
    deleteOldBillingEvents: db.prepare(`
      DELETE FROM billing_events
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `),
    
    // =================== Stats ===================
    
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE plan = 'pro') as pro_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE plan = 'enterprise') as enterprise_subscriptions,
        (SELECT COUNT(*) FROM billing_events WHERE created_at >= datetime('now', '-1 day')) as events_last_24h
    `)
  };

  /**
   * Normalize subscription row from database
   */
  function normalizeSubscription(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      plan: row.plan,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Normalize usage metric row from database
   */
  function normalizeUsageMetric(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      metric: row.metric,
      count: row.count,
      period: row.period,
      updatedAt: row.updated_at
    };
  }

  /**
   * Normalize billing event row from database
   */
  function normalizeBillingEvent(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      stripeEventId: row.stripe_event_id,
      data: row.data ? JSON.parse(row.data) : null,
      createdAt: row.created_at
    };
  }

  return {
    // =================== Constants ===================
    
    PLANS,
    METRICS,
    SUBSCRIPTION_STATUS,
    getCurrentPeriod,

    // =================== Subscription CRUD ===================

    /**
     * Create a subscription for a user
     * @param {Object} subscriptionData - Subscription data
     * @param {number} subscriptionData.userId - User ID
     * @param {string} [subscriptionData.plan='free'] - Plan name
     * @param {string} [subscriptionData.stripeCustomerId] - Stripe customer ID
     * @param {string} [subscriptionData.stripeSubscriptionId] - Stripe subscription ID
     * @param {string} [subscriptionData.status='active'] - Subscription status
     * @param {string} [subscriptionData.currentPeriodStart] - Period start ISO date
     * @param {string} [subscriptionData.currentPeriodEnd] - Period end ISO date
     * @returns {{id: number}}
     */
    createSubscription({
      userId,
      plan = 'free',
      stripeCustomerId = null,
      stripeSubscriptionId = null,
      status = 'active',
      currentPeriodStart = null,
      currentPeriodEnd = null
    }) {
      if (!userId) {
        throw new Error('userId is required');
      }
      
      if (!PLANS[plan]) {
        throw new Error(`Invalid plan: ${plan}`);
      }
      
      try {
        const result = stmts.createSubscription.run({
          user_id: userId,
          plan,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          status,
          current_period_start: currentPeriodStart || new Date().toISOString(),
          current_period_end: currentPeriodEnd
        });
        
        return { id: result.lastInsertRowid };
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('Subscription already exists for this user');
        }
        throw err;
      }
    },

    /**
     * Get subscription by user ID
     * @param {number} userId - User ID
     * @returns {Object|null} Subscription or null
     */
    getSubscriptionByUserId(userId) {
      const row = stmts.getSubscriptionByUserId.get(userId);
      return normalizeSubscription(row);
    },

    /**
     * Get subscription by Stripe customer ID
     * @param {string} stripeCustomerId - Stripe customer ID
     * @returns {Object|null} Subscription or null
     */
    getSubscriptionByStripeCustomerId(stripeCustomerId) {
      const row = stmts.getSubscriptionByStripeCustomerId.get(stripeCustomerId);
      return normalizeSubscription(row);
    },

    /**
     * Get subscription by Stripe subscription ID
     * @param {string} stripeSubscriptionId - Stripe subscription ID
     * @returns {Object|null} Subscription or null
     */
    getSubscriptionByStripeSubscriptionId(stripeSubscriptionId) {
      const row = stmts.getSubscriptionByStripeSubscriptionId.get(stripeSubscriptionId);
      return normalizeSubscription(row);
    },

    /**
     * Update a subscription
     * @param {number} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {{changes: number}}
     */
    updateSubscription(userId, {
      plan = null,
      stripeCustomerId = null,
      stripeSubscriptionId = null,
      status = null,
      currentPeriodStart = null,
      currentPeriodEnd = null
    }) {
      if (plan && !PLANS[plan]) {
        throw new Error(`Invalid plan: ${plan}`);
      }
      
      const result = stmts.updateSubscription.run({
        user_id: userId,
        plan,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd
      });
      
      return { changes: result.changes };
    },

    /**
     * Delete a subscription
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    deleteSubscription(userId) {
      const result = stmts.deleteSubscription.run(userId);
      return { changes: result.changes };
    },

    /**
     * List active subscriptions
     * @param {number} [limit=100] - Max results
     * @returns {Array<Object>}
     */
    listActiveSubscriptions(limit = 100) {
      const rows = stmts.listActiveSubscriptions.all(limit);
      return rows.map(normalizeSubscription);
    },

    /**
     * Get subscription counts by plan
     * @returns {Object} Map of plan to count
     */
    countSubscriptionsByPlan() {
      const rows = stmts.countSubscriptionsByPlan.all();
      const counts = { free: 0, pro: 0, enterprise: 0 };
      for (const row of rows) {
        counts[row.plan] = row.count;
      }
      return counts;
    },

    // =================== Usage Metrics ===================

    /**
     * Increment usage for a metric
     * @param {number} userId - User ID
     * @param {string} metric - Metric name
     * @param {number} [count=1] - Amount to increment
     * @param {string} [period] - Period (defaults to current)
     * @returns {{changes: number}}
     */
    incrementUsage(userId, metric, count = 1, period = null) {
      const usePeriod = period || getCurrentPeriod();
      
      const result = stmts.incrementUsage.run({
        user_id: userId,
        metric,
        count,
        period: usePeriod
      });
      
      return { changes: result.changes };
    },

    /**
     * Get usage for a specific metric and period
     * @param {number} userId - User ID
     * @param {string} metric - Metric name
     * @param {string} [period] - Period (defaults to current)
     * @returns {Object|null} Usage metric or null
     */
    getUsage(userId, metric, period = null) {
      const usePeriod = period || getCurrentPeriod();
      const row = stmts.getUsage.get(userId, metric, usePeriod);
      return normalizeUsageMetric(row);
    },

    /**
     * Get all usage for a user in a period
     * @param {number} userId - User ID
     * @param {string} [period] - Period (defaults to current)
     * @returns {Array<Object>} Usage metrics
     */
    getUserUsageForPeriod(userId, period = null) {
      const usePeriod = period || getCurrentPeriod();
      const rows = stmts.getUserUsageForPeriod.all(userId, usePeriod);
      return rows.map(normalizeUsageMetric);
    },

    /**
     * Get all usage history for a user
     * @param {number} userId - User ID
     * @returns {Array<Object>} Usage metrics
     */
    getAllUserUsage(userId) {
      const rows = stmts.getAllUserUsage.all(userId);
      return rows.map(normalizeUsageMetric);
    },

    /**
     * Reset usage for a user in a period
     * @param {number} userId - User ID
     * @param {string} [period] - Period (defaults to current)
     * @returns {{changes: number}}
     */
    resetUsage(userId, period = null) {
      const usePeriod = period || getCurrentPeriod();
      const result = stmts.resetUsage.run(userId, usePeriod);
      return { changes: result.changes };
    },

    /**
     * Reset all usage for a user
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    resetAllUserUsage(userId) {
      const result = stmts.resetAllUserUsage.run(userId);
      return { changes: result.changes };
    },

    /**
     * Delete old usage metrics
     * @param {string} beforePeriod - Delete periods before this (YYYY-MM)
     * @returns {{deleted: number}}
     */
    deleteOldUsageMetrics(beforePeriod) {
      const result = stmts.deleteOldUsageMetrics.run(beforePeriod);
      return { deleted: result.changes };
    },

    // =================== Billing Events ===================

    /**
     * Log a billing event
     * @param {Object} eventData - Event data
     * @param {number} [eventData.userId] - User ID
     * @param {string} eventData.eventType - Event type
     * @param {string} [eventData.stripeEventId] - Stripe event ID
     * @param {Object} [eventData.data] - Event data (JSON)
     * @returns {{id: number}}
     */
    logBillingEvent({ userId = null, eventType, stripeEventId = null, data = null }) {
      if (!eventType) {
        throw new Error('eventType is required');
      }
      
      const result = stmts.logBillingEvent.run({
        user_id: userId,
        event_type: eventType,
        stripe_event_id: stripeEventId,
        data: data ? JSON.stringify(data) : null
      });
      
      return { id: result.lastInsertRowid };
    },

    /**
     * Check if a Stripe event was already processed
     * @param {string} stripeEventId - Stripe event ID
     * @returns {boolean}
     */
    isEventProcessed(stripeEventId) {
      const row = stmts.getBillingEventByStripeId.get(stripeEventId);
      return !!row;
    },

    /**
     * Get billing event by Stripe event ID
     * @param {string} stripeEventId - Stripe event ID
     * @returns {Object|null}
     */
    getBillingEventByStripeId(stripeEventId) {
      const row = stmts.getBillingEventByStripeId.get(stripeEventId);
      return normalizeBillingEvent(row);
    },

    /**
     * Get user's billing events
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max results
     * @returns {Array<Object>}
     */
    getUserBillingEvents(userId, limit = 50) {
      const rows = stmts.getUserBillingEvents.all(userId, limit);
      return rows.map(normalizeBillingEvent);
    },

    /**
     * Get recent billing events
     * @param {number} [limit=100] - Max results
     * @returns {Array<Object>}
     */
    getRecentBillingEvents(limit = 100) {
      const rows = stmts.getRecentBillingEvents.all(limit);
      return rows.map(normalizeBillingEvent);
    },

    /**
     * Count billing events by type (last 30 days)
     * @returns {Object} Map of event type to count
     */
    countBillingEventsByType() {
      const rows = stmts.countBillingEventsByType.all();
      const counts = {};
      for (const row of rows) {
        counts[row.event_type] = row.count;
      }
      return counts;
    },

    /**
     * Delete old billing events
     * @param {number} [days=365] - Delete events older than this
     * @returns {{deleted: number}}
     */
    deleteOldBillingEvents(days = 365) {
      const result = stmts.deleteOldBillingEvents.run(days);
      return { deleted: result.changes };
    },

    // =================== Plan Helpers ===================

    /**
     * Get plan limits
     * @param {string} plan - Plan name
     * @returns {Object} Plan limits
     */
    getPlanLimits(plan) {
      const planDef = PLANS[plan];
      if (!planDef) {
        return PLANS.free;
      }
      return {
        apiCalls: planDef.apiCalls,
        exports: planDef.exports,
        workspaces: planDef.workspaces,
        alerts: planDef.alerts
      };
    },

    /**
     * Get plan details
     * @param {string} plan - Plan name
     * @returns {Object|null} Plan details
     */
    getPlan(plan) {
      return PLANS[plan] || null;
    },

    /**
     * Get all plans
     * @returns {Object} All plans
     */
    getAllPlans() {
      return { ...PLANS };
    },

    // =================== Stats ===================

    /**
     * Get billing statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        totalSubscriptions: row.total_subscriptions || 0,
        activeSubscriptions: row.active_subscriptions || 0,
        proSubscriptions: row.pro_subscriptions || 0,
        enterpriseSubscriptions: row.enterprise_subscriptions || 0,
        eventsLast24h: row.events_last_24h || 0
      };
    }
  };
}

module.exports = {
  createBillingAdapter,
  ensureBillingSchema,
  PLANS,
  METRICS,
  SUBSCRIPTION_STATUS,
  getCurrentPeriod
};
