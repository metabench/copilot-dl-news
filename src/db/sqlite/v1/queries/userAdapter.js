'use strict';

/**
 * User Database Adapter
 * 
 * Provides database access for user accounts and personalization:
 * - User registration, authentication, sessions
 * - User event tracking (views, engagement)
 * - Preference weights for personalization
 * 
 * ALL SQL for user features lives here - UI/service layers must NOT import better-sqlite3.
 * 
 * @module userAdapter
 */

const crypto = require('crypto');

/**
 * Session token length (bytes)
 */
const SESSION_TOKEN_BYTES = 32;

/**
 * Default session duration (24 hours)
 */
const DEFAULT_SESSION_DURATION_HOURS = 24;

/**
 * Hash a password using SHA-256 with salt
 * Uses PBKDF2 with 100k iterations for password hashing
 * 
 * @param {string} password - Plain text password
 * @param {string} [salt] - Optional salt (generated if not provided)
 * @returns {{hash: string, salt: string}}
 */
function hashPassword(password, salt = null) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: useSalt };
}

/**
 * Verify a password against stored hash/salt
 * 
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored hash
 * @param {string} storedSalt - Stored salt
 * @returns {boolean}
 */
function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

/**
 * Generate a secure session token
 * 
 * @returns {string} Hex-encoded token
 */
function generateSessionToken() {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

/**
 * Ensure user-related tables exist
 * @param {import('better-sqlite3').Database} db
 */
function ensureUserSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureUserSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT,
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT
    );

    -- User sessions
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- User events (reading behavior tracking)
    CREATE TABLE IF NOT EXISTS user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      content_id INTEGER,
      duration_ms INTEGER,
      metadata TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(content_id) REFERENCES content_storage(id) ON DELETE SET NULL
    );

    -- User preferences (learned from behavior)
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      category_weights TEXT DEFAULT '{}',
      topic_weights TEXT DEFAULT '{}',
      entity_weights TEXT DEFAULT '{}',
      source_weights TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    
    CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_user_events_content ON user_events(content_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_timestamp ON user_events(timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
  `);
}

/**
 * Create user adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} User adapter methods
 */
function createUserAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createUserAdapter requires a better-sqlite3 database handle');
  }

  ensureUserSchema(db);

  // Prepared statements
  const stmts = {
    // =================== Users ===================
    
    createUser: db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, display_name, settings, created_at, verification_token)
      VALUES (@email, @password_hash, @password_salt, @display_name, @settings, datetime('now'), @verification_token)
    `),
    
    getUserById: db.prepare(`
      SELECT id, email, password_hash, password_salt, display_name, settings, 
             created_at, updated_at, last_login_at, is_active, email_verified
      FROM users
      WHERE id = ?
    `),
    
    getUserByEmail: db.prepare(`
      SELECT id, email, password_hash, password_salt, display_name, settings, 
             created_at, updated_at, last_login_at, is_active, email_verified
      FROM users
      WHERE email = ? COLLATE NOCASE
    `),
    
    updateUser: db.prepare(`
      UPDATE users
      SET display_name = COALESCE(@display_name, display_name),
          settings = COALESCE(@settings, settings),
          updated_at = datetime('now')
      WHERE id = @id
    `),
    
    updateLastLogin: db.prepare(`
      UPDATE users SET last_login_at = datetime('now') WHERE id = ?
    `),
    
    deleteUser: db.prepare(`
      DELETE FROM users WHERE id = ?
    `),
    
    verifyEmail: db.prepare(`
      UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?
    `),
    
    countUsers: db.prepare(`
      SELECT COUNT(*) as total FROM users WHERE is_active = 1
    `),
    
    // =================== Sessions ===================
    
    createSession: db.prepare(`
      INSERT INTO user_sessions (user_id, token, expires_at, user_agent, ip_address)
      VALUES (@user_id, @token, @expires_at, @user_agent, @ip_address)
    `),
    
    getSessionByToken: db.prepare(`
      SELECT s.id, s.user_id, s.token, s.expires_at, s.created_at,
             u.email, u.display_name, u.is_active
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `),
    
    deleteSession: db.prepare(`
      DELETE FROM user_sessions WHERE token = ?
    `),
    
    deleteUserSessions: db.prepare(`
      DELETE FROM user_sessions WHERE user_id = ?
    `),
    
    deleteExpiredSessions: db.prepare(`
      DELETE FROM user_sessions WHERE expires_at <= datetime('now')
    `),
    
    countActiveSessions: db.prepare(`
      SELECT COUNT(*) as total FROM user_sessions WHERE expires_at > datetime('now')
    `),
    
    // =================== Events ===================
    
    recordEvent: db.prepare(`
      INSERT INTO user_events (user_id, event_type, content_id, duration_ms, metadata, timestamp)
      VALUES (@user_id, @event_type, @content_id, @duration_ms, @metadata, datetime('now'))
    `),
    
    getRecentEvents: db.prepare(`
      SELECT id, user_id, event_type, content_id, duration_ms, metadata, timestamp
      FROM user_events
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    
    getEventsByType: db.prepare(`
      SELECT id, user_id, event_type, content_id, duration_ms, metadata, timestamp
      FROM user_events
      WHERE user_id = ? AND event_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    
    getEventsSince: db.prepare(`
      SELECT id, user_id, event_type, content_id, duration_ms, metadata, timestamp
      FROM user_events
      WHERE user_id = ? AND timestamp >= ?
      ORDER BY timestamp DESC
    `),
    
    getArticleViews: db.prepare(`
      SELECT 
        e.content_id,
        e.duration_ms,
        e.timestamp,
        ca.title,
        ac.category,
        u.host
      FROM user_events e
      LEFT JOIN content_analysis ca ON ca.content_id = e.content_id
      LEFT JOIN article_categories ac ON ac.content_id = e.content_id
      LEFT JOIN content_storage cs ON cs.id = e.content_id
      LEFT JOIN http_responses hr ON hr.id = cs.http_response_id
      LEFT JOIN urls u ON u.id = hr.url_id
      WHERE e.user_id = ? AND e.event_type = 'article_view'
      ORDER BY e.timestamp DESC
      LIMIT ?
    `),
    
    countEventsByType: db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM user_events
      WHERE user_id = ? AND timestamp >= ?
      GROUP BY event_type
    `),
    
    deleteOldEvents: db.prepare(`
      DELETE FROM user_events
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `),
    
    // =================== Preferences ===================
    
    getPreferences: db.prepare(`
      SELECT user_id, category_weights, topic_weights, entity_weights, source_weights, updated_at
      FROM user_preferences
      WHERE user_id = ?
    `),
    
    savePreferences: db.prepare(`
      INSERT INTO user_preferences (user_id, category_weights, topic_weights, entity_weights, source_weights, updated_at)
      VALUES (@user_id, @category_weights, @topic_weights, @entity_weights, @source_weights, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        category_weights = @category_weights,
        topic_weights = @topic_weights,
        entity_weights = @entity_weights,
        source_weights = @source_weights,
        updated_at = datetime('now')
    `),
    
    deletePreferences: db.prepare(`
      DELETE FROM user_preferences WHERE user_id = ?
    `),
    
    // =================== Feed Generation (personalized articles) ===================
    
    getArticlesByCategory: db.prepare(`
      SELECT 
        cs.id as content_id,
        ca.title,
        ca.summary,
        u.url,
        u.host,
        ac.category,
        cs.created_at,
        ac.confidence as category_confidence
      FROM content_storage cs
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      LEFT JOIN article_categories ac ON ac.content_id = cs.id
      WHERE ac.category = ?
        AND cs.created_at >= datetime('now', '-7 days')
      ORDER BY cs.created_at DESC
      LIMIT ?
    `),
    
    getRecentArticles: db.prepare(`
      SELECT 
        cs.id as content_id,
        ca.title,
        ca.summary,
        u.url,
        u.host,
        ac.category,
        cs.created_at
      FROM content_storage cs
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      LEFT JOIN article_categories ac ON ac.content_id = cs.id
      WHERE cs.created_at >= datetime('now', '-7 days')
      ORDER BY cs.created_at DESC
      LIMIT ?
    `),
    
    getTrendingArticles: db.prepare(`
      SELECT 
        cs.id as content_id,
        ca.title,
        ca.summary,
        u.url,
        u.host,
        ac.category,
        at.trend_score
      FROM article_trending at
      INNER JOIN content_storage cs ON cs.id = at.content_id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      LEFT JOIN article_categories ac ON ac.content_id = cs.id
      WHERE at.trend_score > 0
      ORDER BY at.trend_score DESC
      LIMIT ?
    `),
    
    getArticlesByTopic: db.prepare(`
      SELECT 
        cs.id as content_id,
        ca.title,
        ca.summary,
        u.url,
        u.host,
        atp.topic_id,
        atp.probability as topic_probability
      FROM article_topics atp
      INNER JOIN content_storage cs ON cs.id = atp.content_id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      WHERE atp.topic_id = ?
        AND cs.created_at >= datetime('now', '-7 days')
      ORDER BY atp.probability DESC, cs.created_at DESC
      LIMIT ?
    `),
    
    // Exclude articles user already viewed
    getExcludedContentIds: db.prepare(`
      SELECT DISTINCT content_id
      FROM user_events
      WHERE user_id = ? 
        AND event_type = 'article_view'
        AND timestamp >= datetime('now', '-7 days')
    `),
    
    // =================== Stats ===================
    
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
        (SELECT COUNT(*) FROM user_sessions WHERE expires_at > datetime('now')) as active_sessions,
        (SELECT COUNT(*) FROM user_events WHERE timestamp >= datetime('now', '-1 day')) as events_last_24h,
        (SELECT COUNT(*) FROM user_preferences) as users_with_preferences
    `)
  };

  /**
   * Normalize user row from database
   */
  function normalizeUser(row, includeAuth = false) {
    if (!row) return null;
    const user = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      settings: row.settings ? JSON.parse(row.settings) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      isActive: row.is_active === 1,
      emailVerified: row.email_verified === 1
    };
    if (includeAuth) {
      user.passwordHash = row.password_hash;
      user.passwordSalt = row.password_salt;
    }
    return user;
  }

  /**
   * Normalize event row from database
   */
  function normalizeEvent(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      contentId: row.content_id,
      durationMs: row.duration_ms,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      timestamp: row.timestamp
    };
  }

  /**
   * Normalize preferences row from database
   */
  function normalizePreferences(row) {
    if (!row) return null;
    return {
      userId: row.user_id,
      categoryWeights: row.category_weights ? JSON.parse(row.category_weights) : {},
      topicWeights: row.topic_weights ? JSON.parse(row.topic_weights) : {},
      entityWeights: row.entity_weights ? JSON.parse(row.entity_weights) : {},
      sourceWeights: row.source_weights ? JSON.parse(row.source_weights) : {},
      updatedAt: row.updated_at
    };
  }

  return {
    // =================== User CRUD ===================

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @param {string} userData.email - Email address
     * @param {string} userData.password - Plain text password
     * @param {string} [userData.displayName] - Display name
     * @param {Object} [userData.settings={}] - User settings
     * @returns {{id: number, email: string, verificationToken: string}}
     */
    createUser({ email, password, displayName = null, settings = {} }) {
      // Validate email format
      if (!email || !email.includes('@')) {
        throw new Error('Invalid email address');
      }
      
      // Validate password strength
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      
      // Hash password
      const { hash, salt } = hashPassword(password);
      const verificationToken = generateSessionToken();
      
      try {
        const result = stmts.createUser.run({
          email: email.trim(),
          password_hash: hash,
          password_salt: salt,
          display_name: displayName,
          settings: JSON.stringify(settings),
          verification_token: verificationToken
        });
        
        return {
          id: result.lastInsertRowid,
          email: email.trim(),
          verificationToken
        };
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('Email already registered');
        }
        throw err;
      }
    },

    /**
     * Get user by ID
     * @param {number} userId - User ID
     * @returns {Object|null}
     */
    getUserById(userId) {
      const row = stmts.getUserById.get(userId);
      return normalizeUser(row);
    },

    /**
     * Get user by email
     * @param {string} email - Email address
     * @returns {Object|null}
     */
    getUserByEmail(email) {
      const row = stmts.getUserByEmail.get(email);
      return normalizeUser(row);
    },

    /**
     * Authenticate user with email and password
     * @param {string} email - Email address
     * @param {string} password - Plain text password
     * @returns {Object|null} User object if authenticated, null otherwise
     */
    authenticateUser(email, password) {
      const row = stmts.getUserByEmail.get(email);
      if (!row) return null;
      if (row.is_active !== 1) return null;
      
      const valid = verifyPassword(password, row.password_hash, row.password_salt);
      if (!valid) return null;
      
      // Update last login
      stmts.updateLastLogin.run(row.id);
      
      return normalizeUser(row);
    },

    /**
     * Update user profile
     * @param {number} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {{changes: number}}
     */
    updateUser(userId, { displayName = null, settings = null }) {
      const result = stmts.updateUser.run({
        id: userId,
        display_name: displayName,
        settings: settings ? JSON.stringify(settings) : null
      });
      return { changes: result.changes };
    },

    /**
     * Delete user and all related data
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    deleteUser(userId) {
      // Sessions, events, preferences are cascaded
      const result = stmts.deleteUser.run(userId);
      return { changes: result.changes };
    },

    /**
     * Verify user email
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    verifyEmail(userId) {
      const result = stmts.verifyEmail.run(userId);
      return { changes: result.changes };
    },

    // =================== Sessions ===================

    /**
     * Create a login session
     * @param {Object} sessionData - Session data
     * @param {number} sessionData.userId - User ID
     * @param {string} [sessionData.userAgent] - User agent string
     * @param {string} [sessionData.ipAddress] - IP address
     * @param {number} [sessionData.durationHours=24] - Session duration in hours
     * @returns {{token: string, expiresAt: string}}
     */
    createSession({ userId, userAgent = null, ipAddress = null, durationHours = DEFAULT_SESSION_DURATION_HOURS }) {
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      
      stmts.createSession.run({
        user_id: userId,
        token,
        expires_at: expiresAt,
        user_agent: userAgent,
        ip_address: ipAddress
      });
      
      return { token, expiresAt };
    },

    /**
     * Validate session token and get user
     * @param {string} token - Session token
     * @returns {Object|null} Session with user info or null
     */
    validateSession(token) {
      const row = stmts.getSessionByToken.get(token);
      if (!row) return null;
      
      return {
        sessionId: row.id,
        userId: row.user_id,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          email: row.email,
          displayName: row.display_name,
          isActive: row.is_active === 1
        }
      };
    },

    /**
     * Delete session (logout)
     * @param {string} token - Session token
     * @returns {{changes: number}}
     */
    deleteSession(token) {
      const result = stmts.deleteSession.run(token);
      return { changes: result.changes };
    },

    /**
     * Delete all sessions for a user
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    deleteUserSessions(userId) {
      const result = stmts.deleteUserSessions.run(userId);
      return { changes: result.changes };
    },

    /**
     * Clean up expired sessions
     * @returns {{deleted: number}}
     */
    cleanupExpiredSessions() {
      const result = stmts.deleteExpiredSessions.run();
      return { deleted: result.changes };
    },

    // =================== Events ===================

    /**
     * Record a user event
     * @param {Object} eventData - Event data
     * @param {number} eventData.userId - User ID
     * @param {string} eventData.eventType - Event type (article_view, article_complete, search, etc.)
     * @param {number} [eventData.contentId] - Related content ID
     * @param {number} [eventData.durationMs] - Duration in milliseconds
     * @param {Object} [eventData.metadata] - Additional metadata
     * @returns {{id: number}}
     */
    recordEvent({ userId, eventType, contentId = null, durationMs = null, metadata = null }) {
      const result = stmts.recordEvent.run({
        user_id: userId,
        event_type: eventType,
        content_id: contentId,
        duration_ms: durationMs,
        metadata: metadata ? JSON.stringify(metadata) : null
      });
      return { id: result.lastInsertRowid };
    },

    /**
     * Bulk record events in a transaction
     * @param {Array<Object>} events - Events to record
     * @returns {{recorded: number}}
     */
    bulkRecordEvents(events) {
      const recordMany = db.transaction((items) => {
        let recorded = 0;
        for (const event of items) {
          stmts.recordEvent.run({
            user_id: event.userId,
            event_type: event.eventType,
            content_id: event.contentId || null,
            duration_ms: event.durationMs || null,
            metadata: event.metadata ? JSON.stringify(event.metadata) : null
          });
          recorded++;
        }
        return recorded;
      });
      
      const recorded = recordMany(events);
      return { recorded };
    },

    /**
     * Get recent events for a user
     * @param {number} userId - User ID
     * @param {number} [limit=50] - Max events
     * @returns {Array<Object>}
     */
    getRecentEvents(userId, limit = 50) {
      const rows = stmts.getRecentEvents.all(userId, limit);
      return rows.map(normalizeEvent);
    },

    /**
     * Get events by type for a user
     * @param {number} userId - User ID
     * @param {string} eventType - Event type
     * @param {number} [limit=50] - Max events
     * @returns {Array<Object>}
     */
    getEventsByType(userId, eventType, limit = 50) {
      const rows = stmts.getEventsByType.all(userId, eventType, limit);
      return rows.map(normalizeEvent);
    },

    /**
     * Get events since a timestamp
     * @param {number} userId - User ID
     * @param {string} sinceTimestamp - ISO timestamp
     * @returns {Array<Object>}
     */
    getEventsSince(userId, sinceTimestamp) {
      const rows = stmts.getEventsSince.all(userId, sinceTimestamp);
      return rows.map(normalizeEvent);
    },

    /**
     * Get article views with metadata for preference learning
     * @param {number} userId - User ID
     * @param {number} [limit=100] - Max views
     * @returns {Array<Object>}
     */
    getArticleViewsWithMetadata(userId, limit = 100) {
      const rows = stmts.getArticleViews.all(userId, limit);
      return rows.map(row => ({
        contentId: row.content_id,
        durationMs: row.duration_ms,
        timestamp: row.timestamp,
        title: row.title,
        category: row.category,
        host: row.host
      }));
    },

    /**
     * Get event counts by type
     * @param {number} userId - User ID
     * @param {number} [days=30] - Days to look back
     * @returns {Object} Map of event type to count
     */
    getEventCounts(userId, days = 30) {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const rows = stmts.countEventsByType.all(userId, sinceDate);
      
      const counts = {};
      for (const row of rows) {
        counts[row.event_type] = row.count;
      }
      return counts;
    },

    /**
     * Delete old events
     * @param {number} [days=90] - Delete events older than this
     * @returns {{deleted: number}}
     */
    deleteOldEvents(days = 90) {
      const result = stmts.deleteOldEvents.run(days);
      return { deleted: result.changes };
    },

    // =================== Preferences ===================

    /**
     * Get user preferences
     * @param {number} userId - User ID
     * @returns {Object|null}
     */
    getPreferences(userId) {
      const row = stmts.getPreferences.get(userId);
      return normalizePreferences(row);
    },

    /**
     * Save user preferences
     * @param {Object} preferences - Preference data
     * @param {number} preferences.userId - User ID
     * @param {Object} [preferences.categoryWeights={}] - Category weights
     * @param {Object} [preferences.topicWeights={}] - Topic weights
     * @param {Object} [preferences.entityWeights={}] - Entity weights
     * @param {Object} [preferences.sourceWeights={}] - Source weights
     * @returns {{changes: number}}
     */
    savePreferences({ userId, categoryWeights = {}, topicWeights = {}, entityWeights = {}, sourceWeights = {} }) {
      const result = stmts.savePreferences.run({
        user_id: userId,
        category_weights: JSON.stringify(categoryWeights),
        topic_weights: JSON.stringify(topicWeights),
        entity_weights: JSON.stringify(entityWeights),
        source_weights: JSON.stringify(sourceWeights)
      });
      return { changes: result.changes };
    },

    /**
     * Delete user preferences
     * @param {number} userId - User ID
     * @returns {{changes: number}}
     */
    deletePreferences(userId) {
      const result = stmts.deletePreferences.run(userId);
      return { changes: result.changes };
    },

    // =================== Feed Generation ===================

    /**
     * Get articles by category for feed generation
     * @param {string} category - Category name
     * @param {number} [limit=20] - Max articles
     * @returns {Array<Object>}
     */
    getArticlesByCategory(category, limit = 20) {
      const rows = stmts.getArticlesByCategory.all(category, limit);
      return rows.map(row => ({
        contentId: row.content_id,
        title: row.title,
        summary: row.summary,
        url: row.url,
        host: row.host,
        category: row.category,
        createdAt: row.created_at,
        categoryConfidence: row.category_confidence
      }));
    },

    /**
     * Get recent articles for cold-start feeds
     * @param {number} [limit=50] - Max articles
     * @returns {Array<Object>}
     */
    getRecentArticles(limit = 50) {
      const rows = stmts.getRecentArticles.all(limit);
      return rows.map(row => ({
        contentId: row.content_id,
        title: row.title,
        summary: row.summary,
        url: row.url,
        host: row.host,
        category: row.category,
        createdAt: row.created_at
      }));
    },

    /**
     * Get trending articles
     * @param {number} [limit=20] - Max articles
     * @returns {Array<Object>}
     */
    getTrendingArticles(limit = 20) {
      try {
        const rows = stmts.getTrendingArticles.all(limit);
        return rows.map(row => ({
          contentId: row.content_id,
          title: row.title,
          summary: row.summary,
          url: row.url,
          host: row.host,
          category: row.category,
          trendScore: row.trend_score
        }));
      } catch (err) {
        // article_trending table might not exist
        return [];
      }
    },

    /**
     * Get articles by topic
     * @param {number} topicId - Topic ID
     * @param {number} [limit=20] - Max articles
     * @returns {Array<Object>}
     */
    getArticlesByTopic(topicId, limit = 20) {
      try {
        const rows = stmts.getArticlesByTopic.all(topicId, limit);
        return rows.map(row => ({
          contentId: row.content_id,
          title: row.title,
          summary: row.summary,
          url: row.url,
          host: row.host,
          topicId: row.topic_id,
          topicProbability: row.topic_probability
        }));
      } catch (err) {
        // article_topics table might not exist
        return [];
      }
    },

    /**
     * Get content IDs the user has already viewed (for exclusion)
     * @param {number} userId - User ID
     * @returns {Set<number>}
     */
    getViewedContentIds(userId) {
      const rows = stmts.getExcludedContentIds.all(userId);
      return new Set(rows.map(r => r.content_id).filter(Boolean));
    },

    // =================== Stats ===================

    /**
     * Get user system statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        totalUsers: row.total_users || 0,
        activeSessions: row.active_sessions || 0,
        eventsLast24h: row.events_last_24h || 0,
        usersWithPreferences: row.users_with_preferences || 0
      };
    },

    /**
     * Count active users
     * @returns {number}
     */
    countUsers() {
      return stmts.countUsers.get().total;
    },

    /**
     * Count active sessions
     * @returns {number}
     */
    countActiveSessions() {
      return stmts.countActiveSessions.get().total;
    }
  };
}

module.exports = {
  createUserAdapter,
  ensureUserSchema,
  hashPassword,
  verifyPassword,
  generateSessionToken
};
