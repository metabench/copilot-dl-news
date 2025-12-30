'use strict';

/**
 * Admin Database Adapter
 * 
 * Provides database access for admin operations:
 * - User management (list, suspend, unsuspend, role changes)
 * - Audit logging
 * - System statistics
 * 
 * ALL SQL for admin features lives here - UI/service layers must NOT import better-sqlite3.
 * 
 * @module adminAdapter
 */

/**
 * Ensure audit_log table exists
 * @param {import('better-sqlite3').Database} db
 */
function ensureAdminSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureAdminSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    -- Audit log for admin actions
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- User role column (add if not exists)
    -- SQLite doesn't have ADD COLUMN IF NOT EXISTS, so we check first
    
    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  `);

  // Check if role column exists on users table
  const tableInfo = db.pragma('table_info(users)');
  const hasRoleColumn = tableInfo.some(col => col.name === 'role');
  
  if (!hasRoleColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
  }

  // Check if suspended_at column exists on users table
  const hasSuspendedColumn = tableInfo.some(col => col.name === 'suspended_at');
  
  if (!hasSuspendedColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN suspended_at TEXT`);
  }

  // Check if suspended_reason column exists on users table
  const hasSuspendedReasonColumn = tableInfo.some(col => col.name === 'suspended_reason');
  
  if (!hasSuspendedReasonColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN suspended_reason TEXT`);
  }
}

/**
 * Create admin adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Admin adapter methods
 */
function createAdminAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createAdminAdapter requires a better-sqlite3 database handle');
  }

  ensureAdminSchema(db);

  // Prepared statements
  const stmts = {
    // =================== Users ===================
    
    listUsers: db.prepare(`
      SELECT 
        id, email, display_name, role, is_active, email_verified,
        created_at, updated_at, last_login_at, suspended_at, suspended_reason
      FROM users
      WHERE (@search IS NULL OR email LIKE '%' || @search || '%' OR display_name LIKE '%' || @search || '%')
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    
    countUsers: db.prepare(`
      SELECT COUNT(*) as total
      FROM users
      WHERE (@search IS NULL OR email LIKE '%' || @search || '%' OR display_name LIKE '%' || @search || '%')
    `),
    
    getUserById: db.prepare(`
      SELECT 
        id, email, display_name, role, settings, is_active, email_verified,
        created_at, updated_at, last_login_at, suspended_at, suspended_reason
      FROM users
      WHERE id = ?
    `),
    
    getUserStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM user_events WHERE user_id = @user_id) as total_events,
        (SELECT COUNT(*) FROM user_events WHERE user_id = @user_id AND event_type = 'article_view') as article_views,
        (SELECT COUNT(*) FROM user_sessions WHERE user_id = @user_id AND expires_at > datetime('now')) as active_sessions,
        (SELECT MAX(timestamp) FROM user_events WHERE user_id = @user_id) as last_activity
    `),
    
    suspendUser: db.prepare(`
      UPDATE users
      SET is_active = 0, 
          suspended_at = datetime('now'),
          suspended_reason = @reason,
          updated_at = datetime('now')
      WHERE id = @user_id
    `),
    
    unsuspendUser: db.prepare(`
      UPDATE users
      SET is_active = 1,
          suspended_at = NULL,
          suspended_reason = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `),
    
    updateUserRole: db.prepare(`
      UPDATE users
      SET role = @role,
          updated_at = datetime('now')
      WHERE id = @user_id
    `),
    
    deleteUserSessions: db.prepare(`
      DELETE FROM user_sessions WHERE user_id = ?
    `),
    
    // =================== Audit Log ===================
    
    insertAuditLog: db.prepare(`
      INSERT INTO audit_log (admin_id, action, target_type, target_id, details, created_at)
      VALUES (@admin_id, @action, @target_type, @target_id, @details, datetime('now'))
    `),
    
    getAuditLog: db.prepare(`
      SELECT 
        al.id, al.admin_id, al.action, al.target_type, al.target_id, al.details, al.created_at,
        u.email as admin_email, u.display_name as admin_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.admin_id
      WHERE (@action IS NULL OR al.action = @action)
        AND (@target_type IS NULL OR al.target_type = @target_type)
        AND (@admin_id IS NULL OR al.admin_id = @admin_id)
      ORDER BY al.created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    
    countAuditLog: db.prepare(`
      SELECT COUNT(*) as total
      FROM audit_log
      WHERE (@action IS NULL OR action = @action)
        AND (@target_type IS NULL OR target_type = @target_type)
        AND (@admin_id IS NULL OR admin_id = @admin_id)
    `),
    
    // =================== System Stats ===================
    
    getSystemStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
        (SELECT COUNT(*) FROM users WHERE suspended_at IS NOT NULL) as suspended_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_users,
        (SELECT COUNT(*) FROM user_sessions WHERE expires_at > datetime('now')) as active_sessions,
        (SELECT COUNT(*) FROM user_events WHERE timestamp >= datetime('now', '-1 day')) as events_today
    `),
    
    getDbStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM urls) as url_count,
        (SELECT COUNT(*) FROM http_responses) as response_count,
        (SELECT COUNT(*) FROM content_analysis) as analysis_count
    `),
    
    // =================== Crawl Stats (if crawl tables exist) ===================
    
    getCrawlStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM crawl_jobs WHERE status = 'pending') as pending_crawls,
        (SELECT COUNT(*) FROM crawl_jobs WHERE status = 'running') as running_crawls,
        (SELECT COUNT(*) FROM crawl_jobs WHERE status = 'completed' AND created_at >= datetime('now', '-1 day')) as crawls_today
    `),
    
    getRecentCrawls: db.prepare(`
      SELECT id, status, urls_found, urls_processed, started_at, completed_at, created_at
      FROM crawl_jobs
      ORDER BY created_at DESC
      LIMIT @limit
    `),
    
    // =================== Cleanup ===================
    
    pruneAuditLog: db.prepare(`
      DELETE FROM audit_log
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `)
  };

  /**
   * Normalize user row from database
   */
  function normalizeUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role || 'user',
      settings: row.settings ? JSON.parse(row.settings) : {},
      isActive: row.is_active === 1,
      emailVerified: row.email_verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      suspendedAt: row.suspended_at,
      suspendedReason: row.suspended_reason
    };
  }

  /**
   * Normalize audit log row
   */
  function normalizeAuditEntry(row) {
    if (!row) return null;
    return {
      id: row.id,
      adminId: row.admin_id,
      adminEmail: row.admin_email,
      adminName: row.admin_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details ? JSON.parse(row.details) : null,
      createdAt: row.created_at
    };
  }

  return {
    // =================== User Management ===================

    /**
     * List users with pagination and search
     * @param {Object} options - Query options
     * @param {string} [options.search] - Search term for email/name
     * @param {number} [options.limit=50] - Max results
     * @param {number} [options.offset=0] - Pagination offset
     * @returns {{ users: Array, total: number }}
     */
    listUsers({ search = null, limit = 50, offset = 0 } = {}) {
      const users = stmts.listUsers.all({
        search: search || null,
        limit,
        offset
      }).map(normalizeUser);
      
      const { total } = stmts.countUsers.get({
        search: search || null
      });
      
      return { users, total };
    },

    /**
     * Get user by ID with stats
     * @param {number} userId - User ID
     * @returns {Object|null}
     */
    getUser(userId) {
      const user = stmts.getUserById.get(userId);
      if (!user) return null;
      
      const stats = stmts.getUserStats.get({ user_id: userId });
      
      return {
        ...normalizeUser(user),
        stats: {
          totalEvents: stats.total_events || 0,
          articleViews: stats.article_views || 0,
          activeSessions: stats.active_sessions || 0,
          lastActivity: stats.last_activity
        }
      };
    },

    /**
     * Suspend a user account
     * @param {number} userId - User ID to suspend
     * @param {string} [reason] - Reason for suspension
     * @returns {{ changes: number }}
     */
    suspendUser(userId, reason = null) {
      // Also delete all active sessions
      stmts.deleteUserSessions.run(userId);
      
      const result = stmts.suspendUser.run({
        user_id: userId,
        reason
      });
      
      return { changes: result.changes };
    },

    /**
     * Unsuspend a user account
     * @param {number} userId - User ID to unsuspend
     * @returns {{ changes: number }}
     */
    unsuspendUser(userId) {
      const result = stmts.unsuspendUser.run(userId);
      return { changes: result.changes };
    },

    /**
     * Update user role
     * @param {number} userId - User ID
     * @param {string} role - New role ('user', 'admin', 'moderator')
     * @returns {{ changes: number }}
     */
    updateUserRole(userId, role) {
      const validRoles = ['user', 'admin', 'moderator'];
      if (!validRoles.includes(role)) {
        throw new Error(`Invalid role: ${role}. Valid roles: ${validRoles.join(', ')}`);
      }
      
      const result = stmts.updateUserRole.run({
        user_id: userId,
        role
      });
      
      return { changes: result.changes };
    },

    // =================== Audit Log ===================

    /**
     * Insert audit log entry
     * @param {Object} entry - Audit entry
     * @param {number} entry.adminId - Admin who performed action
     * @param {string} entry.action - Action type
     * @param {string} [entry.targetType] - Target entity type
     * @param {number} [entry.targetId] - Target entity ID
     * @param {Object} [entry.details] - Additional details
     * @returns {{ id: number }}
     */
    logAction({ adminId, action, targetType = null, targetId = null, details = null }) {
      const result = stmts.insertAuditLog.run({
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        details: details ? JSON.stringify(details) : null
      });
      
      return { id: result.lastInsertRowid };
    },

    /**
     * Get audit log entries with pagination
     * @param {Object} options - Query options
     * @param {string} [options.action] - Filter by action type
     * @param {string} [options.targetType] - Filter by target type
     * @param {number} [options.adminId] - Filter by admin
     * @param {number} [options.limit=50] - Max results
     * @param {number} [options.offset=0] - Pagination offset
     * @returns {{ entries: Array, total: number }}
     */
    getAuditLog({ action = null, targetType = null, adminId = null, limit = 50, offset = 0 } = {}) {
      const entries = stmts.getAuditLog.all({
        action: action || null,
        target_type: targetType || null,
        admin_id: adminId || null,
        limit,
        offset
      }).map(normalizeAuditEntry);
      
      const { total } = stmts.countAuditLog.get({
        action: action || null,
        target_type: targetType || null,
        admin_id: adminId || null
      });
      
      return { entries, total };
    },

    /**
     * Prune old audit log entries
     * @param {number} [days=365] - Delete entries older than this
     * @returns {{ deleted: number }}
     */
    pruneAuditLog(days = 365) {
      const result = stmts.pruneAuditLog.run(days);
      return { deleted: result.changes };
    },

    // =================== System Stats ===================

    /**
     * Get system statistics
     * @returns {Object}
     */
    getSystemStats() {
      const userStats = stmts.getSystemStats.get();
      
      let dbStats = { url_count: 0, response_count: 0, analysis_count: 0 };
      try {
        dbStats = stmts.getDbStats.get();
      } catch (err) {
        // Tables might not exist
      }
      
      let crawlStats = { pending_crawls: 0, running_crawls: 0, crawls_today: 0 };
      try {
        crawlStats = stmts.getCrawlStats.get();
      } catch (err) {
        // Crawl tables might not exist
      }
      
      return {
        users: {
          total: userStats.total_users || 0,
          active: userStats.active_users || 0,
          suspended: userStats.suspended_users || 0,
          admins: userStats.admin_users || 0
        },
        sessions: {
          active: userStats.active_sessions || 0
        },
        events: {
          today: userStats.events_today || 0
        },
        database: {
          urls: dbStats.url_count || 0,
          responses: dbStats.response_count || 0,
          analyses: dbStats.analysis_count || 0
        },
        crawls: {
          pending: crawlStats.pending_crawls || 0,
          running: crawlStats.running_crawls || 0,
          today: crawlStats.crawls_today || 0
        }
      };
    },

    /**
     * Get recent crawl jobs
     * @param {number} [limit=10] - Max results
     * @returns {Array}
     */
    getRecentCrawls(limit = 10) {
      try {
        return stmts.getRecentCrawls.all({ limit }).map(row => ({
          id: row.id,
          status: row.status,
          urlsFound: row.urls_found,
          urlsProcessed: row.urls_processed,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          createdAt: row.created_at
        }));
      } catch (err) {
        // Crawl tables might not exist
        return [];
      }
    }
  };
}

module.exports = {
  createAdminAdapter,
  ensureAdminSchema
};
