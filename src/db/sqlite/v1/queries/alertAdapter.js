'use strict';

/**
 * Alert Database Adapter
 * 
 * Provides database access for alerts and notifications:
 * - Alert rules (user-defined triggers)
 * - Alert history (sent alerts for dedup/throttling)
 * - User notifications (in-app alerts)
 * - Breaking news tracking
 * 
 * ALL SQL for alert features lives here - UI/service layers must NOT import better-sqlite3.
 * 
 * @module alertAdapter
 */

/**
 * Ensure alert-related tables exist
 * @param {import('better-sqlite3').Database} db
 */
function ensureAlertSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureAlertSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    -- Alert rules (user-defined triggers)
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      conditions TEXT NOT NULL,
      channels TEXT NOT NULL DEFAULT '["inApp"]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_triggered_at TEXT,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Alert history (for dedup and throttling)
    CREATE TABLE IF NOT EXISTS alert_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      rule_id INTEGER,
      article_id INTEGER,
      story_id INTEGER,
      channel TEXT NOT NULL,
      dedup_hash TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL
    );

    -- User notifications (in-app)
    CREATE TABLE IF NOT EXISTS user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      article_id INTEGER,
      story_id INTEGER,
      rule_id INTEGER,
      notification_type TEXT NOT NULL DEFAULT 'alert',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Breaking news detection
    CREATE TABLE IF NOT EXISTS breaking_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_count INTEGER NOT NULL DEFAULT 1,
      velocity REAL,
      keywords_matched TEXT,
      notified INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
    
    CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id);
    CREATE INDEX IF NOT EXISTS idx_alert_history_dedup ON alert_history(dedup_hash);
    CREATE INDEX IF NOT EXISTS idx_alert_history_sent ON alert_history(sent_at);
    
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON user_notifications(read);
    CREATE INDEX IF NOT EXISTS idx_user_notifications_created ON user_notifications(created_at);
    
    CREATE INDEX IF NOT EXISTS idx_breaking_news_story ON breaking_news(story_id);
    CREATE INDEX IF NOT EXISTS idx_breaking_news_detected ON breaking_news(detected_at);
  `);
}

/**
 * Create alert adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Alert adapter methods
 */
function createAlertAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createAlertAdapter requires a better-sqlite3 database handle');
  }

  ensureAlertSchema(db);

  // Prepared statements
  const stmts = {
    // =================== Alert Rules ===================
    
    createRule: db.prepare(`
      INSERT INTO alert_rules (user_id, name, conditions, channels, enabled, created_at)
      VALUES (@user_id, @name, @conditions, @channels, @enabled, datetime('now'))
    `),
    
    getRuleById: db.prepare(`
      SELECT id, user_id, name, conditions, channels, enabled, created_at, 
             updated_at, last_triggered_at, trigger_count
      FROM alert_rules
      WHERE id = ?
    `),
    
    getRulesByUser: db.prepare(`
      SELECT id, user_id, name, conditions, channels, enabled, created_at,
             updated_at, last_triggered_at, trigger_count
      FROM alert_rules
      WHERE user_id = ?
      ORDER BY created_at DESC
    `),
    
    getEnabledRules: db.prepare(`
      SELECT id, user_id, name, conditions, channels, enabled, created_at,
             updated_at, last_triggered_at, trigger_count
      FROM alert_rules
      WHERE enabled = 1
    `),
    
    getEnabledRulesForUser: db.prepare(`
      SELECT id, user_id, name, conditions, channels, enabled, created_at,
             updated_at, last_triggered_at, trigger_count
      FROM alert_rules
      WHERE user_id = ? AND enabled = 1
    `),
    
    updateRule: db.prepare(`
      UPDATE alert_rules
      SET name = COALESCE(@name, name),
          conditions = COALESCE(@conditions, conditions),
          channels = COALESCE(@channels, channels),
          enabled = COALESCE(@enabled, enabled),
          updated_at = datetime('now')
      WHERE id = @id
    `),
    
    deleteRule: db.prepare(`
      DELETE FROM alert_rules WHERE id = ?
    `),
    
    markRuleTriggered: db.prepare(`
      UPDATE alert_rules
      SET last_triggered_at = datetime('now'),
          trigger_count = trigger_count + 1
      WHERE id = ?
    `),
    
    countUserRules: db.prepare(`
      SELECT COUNT(*) as count FROM alert_rules WHERE user_id = ?
    `),
    
    // =================== Alert History ===================
    
    recordAlert: db.prepare(`
      INSERT INTO alert_history (user_id, rule_id, article_id, story_id, channel, dedup_hash, sent_at)
      VALUES (@user_id, @rule_id, @article_id, @story_id, @channel, @dedup_hash, datetime('now'))
    `),
    
    getAlertHistory: db.prepare(`
      SELECT id, user_id, rule_id, article_id, story_id, channel, dedup_hash, sent_at
      FROM alert_history
      WHERE user_id = ?
      ORDER BY sent_at DESC
      LIMIT ?
    `),
    
    getRecentAlertsForUser: db.prepare(`
      SELECT id, user_id, rule_id, article_id, story_id, channel, dedup_hash, sent_at
      FROM alert_history
      WHERE user_id = ? AND sent_at >= datetime('now', '-' || ? || ' hours')
    `),
    
    checkDedupHash: db.prepare(`
      SELECT COUNT(*) as count 
      FROM alert_history 
      WHERE dedup_hash = ? AND sent_at >= datetime('now', '-24 hours')
    `),
    
    countRecentAlerts: db.prepare(`
      SELECT COUNT(*) as count 
      FROM alert_history 
      WHERE user_id = ? AND sent_at >= datetime('now', '-1 hour')
    `),
    
    deleteOldHistory: db.prepare(`
      DELETE FROM alert_history
      WHERE sent_at < datetime('now', '-' || ? || ' days')
    `),
    
    // =================== User Notifications ===================
    
    createNotification: db.prepare(`
      INSERT INTO user_notifications (user_id, title, body, article_id, story_id, rule_id, notification_type, created_at)
      VALUES (@user_id, @title, @body, @article_id, @story_id, @rule_id, @notification_type, datetime('now'))
    `),
    
    getNotificationById: db.prepare(`
      SELECT id, user_id, title, body, article_id, story_id, rule_id, 
             notification_type, read, created_at
      FROM user_notifications
      WHERE id = ?
    `),
    
    getNotificationsForUser: db.prepare(`
      SELECT id, user_id, title, body, article_id, story_id, rule_id,
             notification_type, read, created_at
      FROM user_notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    getUnreadNotifications: db.prepare(`
      SELECT id, user_id, title, body, article_id, story_id, rule_id,
             notification_type, read, created_at
      FROM user_notifications
      WHERE user_id = ? AND read = 0
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    markNotificationRead: db.prepare(`
      UPDATE user_notifications SET read = 1 WHERE id = ?
    `),
    
    markAllNotificationsRead: db.prepare(`
      UPDATE user_notifications SET read = 1 WHERE user_id = ? AND read = 0
    `),
    
    deleteNotification: db.prepare(`
      DELETE FROM user_notifications WHERE id = ?
    `),
    
    countUnreadNotifications: db.prepare(`
      SELECT COUNT(*) as count FROM user_notifications WHERE user_id = ? AND read = 0
    `),
    
    deleteOldNotifications: db.prepare(`
      DELETE FROM user_notifications
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `),
    
    // =================== Breaking News ===================
    
    recordBreakingNews: db.prepare(`
      INSERT INTO breaking_news (story_id, detected_at, source_count, velocity, keywords_matched, expires_at)
      VALUES (@story_id, datetime('now'), @source_count, @velocity, @keywords_matched, datetime('now', '+6 hours'))
    `),
    
    getBreakingNews: db.prepare(`
      SELECT id, story_id, detected_at, source_count, velocity, keywords_matched, notified, expires_at
      FROM breaking_news
      WHERE expires_at > datetime('now')
      ORDER BY detected_at DESC
      LIMIT ?
    `),
    
    getBreakingNewsByStory: db.prepare(`
      SELECT id, story_id, detected_at, source_count, velocity, keywords_matched, notified, expires_at
      FROM breaking_news
      WHERE story_id = ? AND expires_at > datetime('now')
    `),
    
    updateBreakingNewsCount: db.prepare(`
      UPDATE breaking_news
      SET source_count = @source_count,
          velocity = @velocity
      WHERE story_id = @story_id AND expires_at > datetime('now')
    `),
    
    markBreakingNewsNotified: db.prepare(`
      UPDATE breaking_news SET notified = 1 WHERE id = ?
    `),
    
    deleteExpiredBreakingNews: db.prepare(`
      DELETE FROM breaking_news WHERE expires_at <= datetime('now')
    `),
    
    // =================== Stats ===================
    
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM alert_rules WHERE enabled = 1) as active_rules,
        (SELECT COUNT(*) FROM alert_history WHERE sent_at >= datetime('now', '-1 day')) as alerts_last_24h,
        (SELECT COUNT(*) FROM user_notifications WHERE read = 0) as unread_notifications,
        (SELECT COUNT(*) FROM breaking_news WHERE expires_at > datetime('now')) as active_breaking_news
    `)
  };

  /**
   * Normalize rule row from database
   */
  function normalizeRule(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      conditions: JSON.parse(row.conditions || '[]'),
      channels: JSON.parse(row.channels || '["inApp"]'),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count
    };
  }

  /**
   * Normalize notification row from database
   */
  function normalizeNotification(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      body: row.body,
      articleId: row.article_id,
      storyId: row.story_id,
      ruleId: row.rule_id,
      notificationType: row.notification_type,
      read: row.read === 1,
      createdAt: row.created_at
    };
  }

  /**
   * Normalize breaking news row from database
   */
  function normalizeBreakingNews(row) {
    if (!row) return null;
    return {
      id: row.id,
      storyId: row.story_id,
      detectedAt: row.detected_at,
      sourceCount: row.source_count,
      velocity: row.velocity,
      keywordsMatched: row.keywords_matched ? JSON.parse(row.keywords_matched) : [],
      notified: row.notified === 1,
      expiresAt: row.expires_at
    };
  }

  return {
    // =================== Alert Rules CRUD ===================

    /**
     * Create a new alert rule
     * @param {Object} ruleData - Rule data
     * @returns {{id: number}}
     */
    createRule({ userId, name, conditions, channels = ['inApp'], enabled = true }) {
      const result = stmts.createRule.run({
        user_id: userId,
        name,
        conditions: JSON.stringify(conditions),
        channels: JSON.stringify(channels),
        enabled: enabled ? 1 : 0
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get rule by ID
     * @param {number} ruleId - Rule ID
     * @returns {Object|null}
     */
    getRuleById(ruleId) {
      const row = stmts.getRuleById.get(ruleId);
      return normalizeRule(row);
    },

    /**
     * Get all rules for a user
     * @param {number} userId - User ID
     * @returns {Array<Object>}
     */
    getRulesByUser(userId) {
      const rows = stmts.getRulesByUser.all(userId);
      return rows.map(normalizeRule);
    },

    /**
     * Get all enabled rules
     * @returns {Array<Object>}
     */
    getEnabledRules() {
      const rows = stmts.getEnabledRules.all();
      return rows.map(normalizeRule);
    },

    /**
     * Get enabled rules for a specific user
     * @param {number} userId - User ID
     * @returns {Array<Object>}
     */
    getEnabledRulesForUser(userId) {
      const rows = stmts.getEnabledRulesForUser.all(userId);
      return rows.map(normalizeRule);
    },

    /**
     * Update an alert rule
     * @param {number} ruleId - Rule ID
     * @param {Object} updates - Fields to update
     * @returns {{changes: number}}
     */
    updateRule(ruleId, { name = null, conditions = null, channels = null, enabled = null }) {
      const result = stmts.updateRule.run({
        id: ruleId,
        name,
        conditions: conditions ? JSON.stringify(conditions) : null,
        channels: channels ? JSON.stringify(channels) : null,
        enabled: enabled !== null ? (enabled ? 1 : 0) : null
      });
      return { changes: result.changes };
    },

    /**
     * Delete an alert rule
     * @param {number} ruleId - Rule ID
     * @returns {{changes: number}}
     */
    deleteRule(ruleId) {
      const result = stmts.deleteRule.run(ruleId);
      return { changes: result.changes };
    },

    /**
     * Mark rule as triggered
     * @param {number} ruleId - Rule ID
     * @returns {{changes: number}}
     */
    markRuleTriggered(ruleId) {
      const result = stmts.markRuleTriggered.run(ruleId);
      return { changes: result.changes };
    },

    /**
     * Count rules for a user
     * @param {number} userId - User ID
     * @returns {number}
     */
    countUserRules(userId) {
      return stmts.countUserRules.get(userId).count;
    },

    // =================== Alert History ===================

    /**
     * Record an alert that was sent
     * @param {Object} alertData - Alert data
     * @returns {{id: number}}
     */
    recordAlert({ userId, ruleId = null, articleId = null, storyId = null, channel, dedupHash = null }) {
      const result = stmts.recordAlert.run({
        user_id: userId,
        rule_id: ruleId,
        article_id: articleId,
        story_id: storyId,
        channel,
        dedup_hash: dedupHash
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get alert history for a user
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max alerts
     * @returns {Array<Object>}
     */
    getAlertHistory(userId, limit = 50) {
      const rows = stmts.getAlertHistory.all(userId, limit);
      return rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        ruleId: row.rule_id,
        articleId: row.article_id,
        storyId: row.story_id,
        channel: row.channel,
        dedupHash: row.dedup_hash,
        sentAt: row.sent_at
      }));
    },

    /**
     * Get recent alerts for a user (for throttling)
     * @param {number} userId - User ID
     * @param {number} [hours=1] - Hours to look back
     * @returns {Array<Object>}
     */
    getRecentAlertsForUser(userId, hours = 1) {
      const rows = stmts.getRecentAlertsForUser.all(userId, hours);
      return rows;
    },

    /**
     * Check if a dedup hash exists (to prevent duplicate alerts)
     * @param {string} dedupHash - Dedup hash
     * @returns {boolean}
     */
    isDuplicate(dedupHash) {
      return stmts.checkDedupHash.get(dedupHash).count > 0;
    },

    /**
     * Count recent alerts for throttling
     * @param {number} userId - User ID
     * @returns {number}
     */
    countRecentAlerts(userId) {
      return stmts.countRecentAlerts.get(userId).count;
    },

    /**
     * Delete old alert history
     * @param {number} [days=30] - Delete older than this
     * @returns {{deleted: number}}
     */
    deleteOldHistory(days = 30) {
      const result = stmts.deleteOldHistory.run(days);
      return { deleted: result.changes };
    },

    // =================== User Notifications ===================

    /**
     * Create a notification
     * @param {Object} notificationData - Notification data
     * @returns {{id: number}}
     */
    createNotification({ userId, title, body = null, articleId = null, storyId = null, ruleId = null, notificationType = 'alert' }) {
      const result = stmts.createNotification.run({
        user_id: userId,
        title,
        body,
        article_id: articleId,
        story_id: storyId,
        rule_id: ruleId,
        notification_type: notificationType
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get notification by ID
     * @param {number} notificationId - Notification ID
     * @returns {Object|null}
     */
    getNotificationById(notificationId) {
      const row = stmts.getNotificationById.get(notificationId);
      return normalizeNotification(row);
    },

    /**
     * Get notifications for a user
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max notifications
     * @returns {Array<Object>}
     */
    getNotificationsForUser(userId, limit = 50) {
      const rows = stmts.getNotificationsForUser.all(userId, limit);
      return rows.map(normalizeNotification);
    },

    /**
     * Get unread notifications for a user
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max notifications
     * @returns {Array<Object>}
     */
    getUnreadNotifications(userId, limit = 50) {
      const rows = stmts.getUnreadNotifications.all(userId, limit);
      return rows.map(normalizeNotification);
    },

    /**
     * Mark a notification as read
     * @param {number} notificationId - Notification ID
     * @returns {{changes: number}}
     */
    markNotificationRead(notificationId) {
      const result = stmts.markNotificationRead.run(notificationId);
      return { changes: result.changes };
    },

    /**
     * Mark all notifications as read for a user
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    markAllNotificationsRead(userId) {
      const result = stmts.markAllNotificationsRead.run(userId);
      return { changes: result.changes };
    },

    /**
     * Delete a notification
     * @param {number} notificationId - Notification ID
     * @returns {{changes: number}}
     */
    deleteNotification(notificationId) {
      const result = stmts.deleteNotification.run(notificationId);
      return { changes: result.changes };
    },

    /**
     * Count unread notifications
     * @param {number} userId - User ID
     * @returns {number}
     */
    countUnreadNotifications(userId) {
      return stmts.countUnreadNotifications.get(userId).count;
    },

    /**
     * Delete old notifications
     * @param {number} [days=90] - Delete older than this
     * @returns {{deleted: number}}
     */
    deleteOldNotifications(days = 90) {
      const result = stmts.deleteOldNotifications.run(days);
      return { deleted: result.changes };
    },

    // =================== Breaking News ===================

    /**
     * Record breaking news detection
     * @param {Object} data - Breaking news data
     * @returns {{id: number}}
     */
    recordBreakingNews({ storyId, sourceCount, velocity, keywordsMatched = [] }) {
      const result = stmts.recordBreakingNews.run({
        story_id: storyId,
        source_count: sourceCount,
        velocity,
        keywords_matched: JSON.stringify(keywordsMatched)
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Get active breaking news
     * @param {number} [limit=20] - Max items
     * @returns {Array<Object>}
     */
    getBreakingNews(limit = 20) {
      const rows = stmts.getBreakingNews.all(limit);
      return rows.map(normalizeBreakingNews);
    },

    /**
     * Get breaking news for a specific story
     * @param {number} storyId - Story ID
     * @returns {Object|null}
     */
    getBreakingNewsByStory(storyId) {
      const row = stmts.getBreakingNewsByStory.get(storyId);
      return normalizeBreakingNews(row);
    },

    /**
     * Update breaking news source count and velocity
     * @param {number} storyId - Story ID
     * @param {number} sourceCount - New source count
     * @param {number} velocity - New velocity
     * @returns {{changes: number}}
     */
    updateBreakingNewsCount(storyId, sourceCount, velocity) {
      const result = stmts.updateBreakingNewsCount.run({
        story_id: storyId,
        source_count: sourceCount,
        velocity
      });
      return { changes: result.changes };
    },

    /**
     * Mark breaking news as notified
     * @param {number} breakingNewsId - Breaking news ID
     * @returns {{changes: number}}
     */
    markBreakingNewsNotified(breakingNewsId) {
      const result = stmts.markBreakingNewsNotified.run(breakingNewsId);
      return { changes: result.changes };
    },

    /**
     * Delete expired breaking news
     * @returns {{deleted: number}}
     */
    deleteExpiredBreakingNews() {
      const result = stmts.deleteExpiredBreakingNews.run();
      return { deleted: result.changes };
    },

    // =================== Stats ===================

    /**
     * Get alert system statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        activeRules: row.active_rules || 0,
        alertsLast24h: row.alerts_last_24h || 0,
        unreadNotifications: row.unread_notifications || 0,
        activeBreakingNews: row.active_breaking_news || 0
      };
    }
  };
}

module.exports = {
  createAlertAdapter,
  ensureAlertSchema
};
