'use strict';

/**
 * Push Subscription Database Adapter
 * 
 * Manages Web Push subscription storage in SQLite.
 * 
 * Table: user_push_subscriptions
 * - id: INTEGER PRIMARY KEY
 * - user_id: INTEGER (nullable for anonymous subscriptions)
 * - endpoint: TEXT UNIQUE
 * - p256dh: TEXT
 * - auth: TEXT
 * - user_agent: TEXT
 * - created_at: TEXT
 * 
 * @module pushAdapter
 */

/**
 * Create push subscription adapter
 * 
 * @param {Object} db - SQLite database instance
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Push adapter methods
 */
function createPushAdapter(db, options = {}) {
  const logger = options.logger || console;

  /**
   * Initialize the push subscriptions table
   * 
   * @returns {boolean}
   */
  function init() {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_push_subs_user 
          ON user_push_subscriptions(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint 
          ON user_push_subscriptions(endpoint);
      `);
      
      logger.log('[pushAdapter] Table initialized');
      return true;
    } catch (err) {
      logger.error('[pushAdapter] Init error:', err.message);
      return false;
    }
  }

  /**
   * Save a push subscription
   * 
   * @param {Object} subscription - Subscription data
   * @param {number|null} subscription.userId - User ID (null for anonymous)
   * @param {string} subscription.endpoint - Push endpoint URL
   * @param {string} subscription.p256dh - P256DH key
   * @param {string} subscription.auth - Auth secret
   * @param {string} [subscription.userAgent] - User agent string
   * @param {string} [subscription.createdAt] - ISO timestamp
   * @returns {number} Subscription ID
   */
  function saveSubscription(subscription) {
    const stmt = db.prepare(`
      INSERT INTO user_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent
    `);

    const result = stmt.run(
      subscription.userId || null,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      subscription.userAgent || null,
      subscription.createdAt || new Date().toISOString()
    );

    return result.lastInsertRowid || getSubscriptionByEndpoint(subscription.endpoint)?.id;
  }

  /**
   * Get subscription by endpoint
   * 
   * @param {string} endpoint - Push endpoint URL
   * @returns {Object|null}
   */
  function getSubscriptionByEndpoint(endpoint) {
    const stmt = db.prepare(`
      SELECT id, user_id, endpoint, p256dh, auth, user_agent, created_at
      FROM user_push_subscriptions
      WHERE endpoint = ?
    `);

    const row = stmt.get(endpoint);
    return row ? mapRow(row) : null;
  }

  /**
   * Get all subscriptions for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object[]}
   */
  function getSubscriptionsByUser(userId) {
    const stmt = db.prepare(`
      SELECT id, user_id, endpoint, p256dh, auth, user_agent, created_at
      FROM user_push_subscriptions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(userId).map(mapRow);
  }

  /**
   * Get subscriptions for multiple users
   * 
   * @param {number[]} userIds - Array of user IDs
   * @returns {Object[]}
   */
  function getSubscriptionsByUsers(userIds) {
    if (!userIds || userIds.length === 0) return [];

    const placeholders = userIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT id, user_id, endpoint, p256dh, auth, user_agent, created_at
      FROM user_push_subscriptions
      WHERE user_id IN (${placeholders})
      ORDER BY user_id, created_at DESC
    `);

    return stmt.all(...userIds).map(mapRow);
  }

  /**
   * Get all active subscriptions
   * 
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=1000] - Maximum results
   * @returns {Object[]}
   */
  function getAllSubscriptions(options = {}) {
    const limit = options.limit || 1000;

    const stmt = db.prepare(`
      SELECT id, user_id, endpoint, p256dh, auth, user_agent, created_at
      FROM user_push_subscriptions
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(mapRow);
  }

  /**
   * Delete subscription by endpoint
   * 
   * @param {string} endpoint - Push endpoint URL
   * @returns {boolean} Whether a subscription was deleted
   */
  function deleteSubscription(endpoint) {
    const stmt = db.prepare(`
      DELETE FROM user_push_subscriptions
      WHERE endpoint = ?
    `);

    const result = stmt.run(endpoint);
    return result.changes > 0;
  }

  /**
   * Delete subscription by ID
   * 
   * @param {number} id - Subscription ID
   * @returns {boolean}
   */
  function deleteSubscriptionById(id) {
    const stmt = db.prepare(`
      DELETE FROM user_push_subscriptions
      WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all subscriptions for a user
   * 
   * @param {number} userId - User ID
   * @returns {number} Number of subscriptions deleted
   */
  function deleteUserSubscriptions(userId) {
    const stmt = db.prepare(`
      DELETE FROM user_push_subscriptions
      WHERE user_id = ?
    `);

    const result = stmt.run(userId);
    return result.changes;
  }

  /**
   * Update subscription's user association
   * 
   * @param {string} endpoint - Push endpoint URL
   * @param {number} userId - New user ID
   * @returns {boolean}
   */
  function associateSubscriptionWithUser(endpoint, userId) {
    const stmt = db.prepare(`
      UPDATE user_push_subscriptions
      SET user_id = ?
      WHERE endpoint = ?
    `);

    const result = stmt.run(userId, endpoint);
    return result.changes > 0;
  }

  /**
   * Get subscription statistics
   * 
   * @returns {Object}
   */
  function getStats() {
    const stats = {};

    // Total subscriptions
    const totalStmt = db.prepare(`
      SELECT COUNT(*) as count FROM user_push_subscriptions
    `);
    stats.totalSubscriptions = totalStmt.get().count;

    // Subscriptions with users
    const withUserStmt = db.prepare(`
      SELECT COUNT(*) as count FROM user_push_subscriptions
      WHERE user_id IS NOT NULL
    `);
    stats.authenticatedSubscriptions = withUserStmt.get().count;

    // Anonymous subscriptions
    stats.anonymousSubscriptions = stats.totalSubscriptions - stats.authenticatedSubscriptions;

    // Active users with subscriptions
    const activeUsersStmt = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM user_push_subscriptions
      WHERE user_id IS NOT NULL
    `);
    stats.activeUsers = activeUsersStmt.get().count;

    // Subscriptions by age
    const ageStmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN created_at > datetime('now', '-1 day') THEN 1 ELSE 0 END) as last_24h,
        SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7d,
        SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as last_30d
      FROM user_push_subscriptions
    `);
    const ageStats = ageStmt.get();
    stats.subscriptionsLast24h = ageStats.last_24h || 0;
    stats.subscriptionsLast7d = ageStats.last_7d || 0;
    stats.subscriptionsLast30d = ageStats.last_30d || 0;

    return stats;
  }

  /**
   * Clean up old/orphaned subscriptions
   * 
   * @param {number} [daysOld=90] - Delete subscriptions older than this many days
   * @returns {number} Number of subscriptions deleted
   */
  function cleanupOldSubscriptions(daysOld = 90) {
    const stmt = db.prepare(`
      DELETE FROM user_push_subscriptions
      WHERE created_at < datetime('now', '-' || ? || ' days')
        AND user_id IS NULL
    `);

    const result = stmt.run(daysOld);
    if (result.changes > 0) {
      logger.log(`[pushAdapter] Cleaned up ${result.changes} old anonymous subscriptions`);
    }
    return result.changes;
  }

  /**
   * Map database row to object
   * 
   * @param {Object} row - Database row
   * @returns {Object}
   */
  function mapRow(row) {
    return {
      id: row.id,
      userId: row.user_id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      userAgent: row.user_agent,
      createdAt: row.created_at
    };
  }

  return {
    init,
    saveSubscription,
    getSubscriptionByEndpoint,
    getSubscriptionsByUser,
    getSubscriptionsByUsers,
    getAllSubscriptions,
    deleteSubscription,
    deleteSubscriptionById,
    deleteUserSubscriptions,
    associateSubscriptionWithUser,
    getStats,
    cleanupOldSubscriptions
  };
}

module.exports = {
  createPushAdapter
};
