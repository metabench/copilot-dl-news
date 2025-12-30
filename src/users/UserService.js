'use strict';

/**
 * UserService - User account management
 * 
 * Handles:
 * - User registration and validation
 * - Login/logout with session management
 * - Profile management
 * - Session validation for auth middleware
 * 
 * All database operations go through the userAdapter (no SQL here).
 * 
 * @module UserService
 */

/**
 * Event types for user tracking
 */
const EVENT_TYPES = {
  ARTICLE_VIEW: 'article_view',
  ARTICLE_COMPLETE: 'article_complete',
  ARTICLE_SHARE: 'article_share',
  SEARCH_QUERY: 'search_query',
  CATEGORY_CLICK: 'category_click',
  LOGIN: 'login',
  LOGOUT: 'logout'
};

/**
 * Session duration (24 hours)
 */
const SESSION_DURATION_HOURS = 24;

/**
 * UserService class
 */
class UserService {
  /**
   * Create a UserService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.userAdapter - User database adapter
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.userAdapter) {
      throw new Error('UserService requires a userAdapter');
    }
    
    this.userAdapter = options.userAdapter;
    this.logger = options.logger || console;
  }

  // =================== Registration ===================

  /**
   * Register a new user
   * 
   * @param {Object} data - Registration data
   * @param {string} data.email - Email address
   * @param {string} data.password - Password (min 8 chars)
   * @param {string} [data.displayName] - Display name
   * @returns {Promise<Object>} Created user with verification token
   * @throws {Error} If validation fails or email exists
   */
  async register({ email, password, displayName = null }) {
    // Validate email
    if (!email || !this._isValidEmail(email)) {
      throw new Error('Invalid email address');
    }
    
    // Validate password
    const passwordError = this._validatePassword(password);
    if (passwordError) {
      throw new Error(passwordError);
    }
    
    // Check if email already exists
    const existing = this.userAdapter.getUserByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }
    
    // Create user
    try {
      const result = this.userAdapter.createUser({
        email: email.trim().toLowerCase(),
        password,
        displayName
      });
      
      this.logger.log(`[UserService] User registered: ${email} (id: ${result.id})`);
      
      return {
        id: result.id,
        email: result.email,
        verificationToken: result.verificationToken,
        message: 'Registration successful. Please verify your email.'
      };
    } catch (err) {
      this.logger.error(`[UserService] Registration failed for ${email}:`, err.message);
      throw err;
    }
  }

  // =================== Authentication ===================

  /**
   * Login user and create session
   * 
   * @param {Object} data - Login data
   * @param {string} data.email - Email address
   * @param {string} data.password - Password
   * @param {string} [data.userAgent] - User agent for session
   * @param {string} [data.ipAddress] - IP address for session
   * @returns {Promise<Object>} Session token and user info
   * @throws {Error} If authentication fails
   */
  async login({ email, password, userAgent = null, ipAddress = null }) {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    // Authenticate
    const user = this.userAdapter.authenticateUser(email, password);
    if (!user) {
      // Log failed attempt but don't reveal whether email exists
      this.logger.log(`[UserService] Failed login attempt for: ${email}`);
      throw new Error('Invalid email or password');
    }
    
    // Create session
    const session = this.userAdapter.createSession({
      userId: user.id,
      userAgent,
      ipAddress,
      durationHours: SESSION_DURATION_HOURS
    });
    
    // Record login event
    this.userAdapter.recordEvent({
      userId: user.id,
      eventType: EVENT_TYPES.LOGIN,
      metadata: { userAgent, ipAddress }
    });
    
    this.logger.log(`[UserService] User logged in: ${user.email} (id: ${user.id})`);
    
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        settings: user.settings
      }
    };
  }

  /**
   * Logout user (invalidate session)
   * 
   * @param {string} token - Session token
   * @returns {Promise<Object>} Logout result
   */
  async logout(token) {
    if (!token) {
      return { success: false, message: 'No token provided' };
    }
    
    // Get session info before deleting (for event recording)
    const session = this.userAdapter.validateSession(token);
    
    // Delete session
    const result = this.userAdapter.deleteSession(token);
    
    // Record logout event if we had a valid session
    if (session && session.userId) {
      this.userAdapter.recordEvent({
        userId: session.userId,
        eventType: EVENT_TYPES.LOGOUT
      });
    }
    
    return {
      success: result.changes > 0,
      message: result.changes > 0 ? 'Logged out successfully' : 'Session not found'
    };
  }

  /**
   * Logout all sessions for a user
   * 
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Logout result
   */
  async logoutAll(userId) {
    const result = this.userAdapter.deleteUserSessions(userId);
    
    this.logger.log(`[UserService] All sessions deleted for user ${userId}: ${result.changes} sessions`);
    
    return {
      success: true,
      sessionsDeleted: result.changes
    };
  }

  // =================== Session Validation ===================

  /**
   * Validate session token and get user
   * Used by auth middleware
   * 
   * @param {string} token - Session token
   * @returns {Object|null} User info or null if invalid
   */
  validateSession(token) {
    if (!token) return null;
    
    const session = this.userAdapter.validateSession(token);
    if (!session) return null;
    
    return session.user;
  }

  /**
   * Get session with full info
   * 
   * @param {string} token - Session token
   * @returns {Object|null} Session info or null
   */
  getSession(token) {
    return this.userAdapter.validateSession(token);
  }

  // =================== Profile Management ===================

  /**
   * Get user by ID
   * 
   * @param {number} userId - User ID
   * @returns {Object|null} User info
   */
  getUserById(userId) {
    return this.userAdapter.getUserById(userId);
  }

  /**
   * Get user by email
   * 
   * @param {string} email - Email address
   * @returns {Object|null} User info
   */
  getUserByEmail(email) {
    return this.userAdapter.getUserByEmail(email);
  }

  /**
   * Update user profile
   * 
   * @param {number} userId - User ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.displayName] - Display name
   * @param {Object} [updates.settings] - User settings
   * @returns {Promise<Object>} Updated user
   */
  async updateProfile(userId, { displayName = null, settings = null }) {
    const user = this.userAdapter.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    this.userAdapter.updateUser(userId, { displayName, settings });
    
    // Get updated user
    const updated = this.userAdapter.getUserById(userId);
    
    this.logger.log(`[UserService] Profile updated for user ${userId}`);
    
    return updated;
  }

  /**
   * Delete user account
   * 
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteAccount(userId) {
    const user = this.userAdapter.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Delete user (cascades to sessions, events, preferences)
    const result = this.userAdapter.deleteUser(userId);
    
    this.logger.log(`[UserService] User deleted: ${user.email} (id: ${userId})`);
    
    return {
      success: result.changes > 0,
      message: 'Account deleted successfully'
    };
  }

  /**
   * Verify user email
   * 
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Verification result
   */
  async verifyEmail(userId) {
    const result = this.userAdapter.verifyEmail(userId);
    
    return {
      success: result.changes > 0,
      message: result.changes > 0 ? 'Email verified' : 'Verification failed'
    };
  }

  // =================== Event Tracking ===================

  /**
   * Record a user event
   * 
   * @param {Object} eventData - Event data
   * @param {number} eventData.userId - User ID
   * @param {string} eventData.eventType - Event type
   * @param {number} [eventData.contentId] - Content ID
   * @param {number} [eventData.durationMs] - Duration in ms
   * @param {Object} [eventData.metadata] - Additional metadata
   * @returns {Object} Recorded event
   */
  recordEvent({ userId, eventType, contentId = null, durationMs = null, metadata = null }) {
    // Validate event type
    const validTypes = Object.values(EVENT_TYPES);
    if (!validTypes.includes(eventType)) {
      this.logger.warn(`[UserService] Unknown event type: ${eventType}`);
    }
    
    return this.userAdapter.recordEvent({
      userId,
      eventType,
      contentId,
      durationMs,
      metadata
    });
  }

  /**
   * Record article view event
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Article content ID
   * @param {Object} [metadata] - Additional metadata
   * @returns {Object} Recorded event
   */
  recordArticleView(userId, contentId, metadata = null) {
    return this.recordEvent({
      userId,
      eventType: EVENT_TYPES.ARTICLE_VIEW,
      contentId,
      metadata
    });
  }

  /**
   * Record article completion (user read >80%)
   * 
   * @param {number} userId - User ID
   * @param {number} contentId - Article content ID
   * @param {number} durationMs - Time spent reading
   * @returns {Object} Recorded event
   */
  recordArticleComplete(userId, contentId, durationMs) {
    return this.recordEvent({
      userId,
      eventType: EVENT_TYPES.ARTICLE_COMPLETE,
      contentId,
      durationMs
    });
  }

  /**
   * Get recent events for a user
   * 
   * @param {number} userId - User ID
   * @param {number} [limit=50] - Max events
   * @returns {Array<Object>} Events
   */
  getRecentEvents(userId, limit = 50) {
    return this.userAdapter.getRecentEvents(userId, limit);
  }

  // =================== Stats & Maintenance ===================

  /**
   * Get user system statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return this.userAdapter.getStats();
  }

  /**
   * Clean up expired sessions
   * Should be called periodically
   * 
   * @returns {Object} Cleanup result
   */
  cleanupExpiredSessions() {
    const result = this.userAdapter.cleanupExpiredSessions();
    
    if (result.deleted > 0) {
      this.logger.log(`[UserService] Cleaned up ${result.deleted} expired sessions`);
    }
    
    return result;
  }

  /**
   * Clean up old events
   * 
   * @param {number} [days=90] - Delete events older than this
   * @returns {Object} Cleanup result
   */
  cleanupOldEvents(days = 90) {
    const result = this.userAdapter.deleteOldEvents(days);
    
    if (result.deleted > 0) {
      this.logger.log(`[UserService] Cleaned up ${result.deleted} old events`);
    }
    
    return result;
  }

  // =================== Private Helpers ===================

  /**
   * Validate email format
   * @private
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   * @private
   * @returns {string|null} Error message or null if valid
   */
  _validatePassword(password) {
    if (!password) {
      return 'Password is required';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (password.length > 128) {
      return 'Password must be less than 128 characters';
    }
    return null;
  }
}

module.exports = {
  UserService,
  EVENT_TYPES
};
