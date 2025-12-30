'use strict';

/**
 * Users API Routes (v1)
 * 
 * REST endpoints for user management and personalization:
 * - POST /register - Create new account
 * - POST /login - Authenticate and get session
 * - POST /logout - Invalidate session
 * - GET /:id - Get user profile
 * - PATCH /:id - Update profile
 * - GET /:id/feed - Get personalized feed
 * - POST /:id/events - Record user events
 * - GET /:id/preferences - Get learned preferences
 * 
 * @module users routes
 */

const express = require('express');

/**
 * Create users router
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.userService - UserService instance
 * @param {Object} options.preferenceLearner - PreferenceLearner instance
 * @param {Object} options.personalizedFeed - PersonalizedFeed instance
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Users router
 */
function createUsersRouter(options = {}) {
  const { userService, preferenceLearner, personalizedFeed, logger = console } = options;
  
  if (!userService) {
    throw new Error('createUsersRouter requires userService');
  }
  
  const router = express.Router();

  // =================== Authentication ===================

  /**
   * POST /api/v1/users/register
   * Register a new user
   */
  router.post('/register', async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }
      
      const result = await userService.register({
        email,
        password,
        displayName
      });
      
      res.status(201).json({
        success: true,
        user: {
          id: result.id,
          email: result.email
        },
        message: result.message
      });
    } catch (err) {
      logger.error('[Users API] Registration error:', err.message);
      
      // Handle specific errors
      if (err.message.includes('already registered')) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered'
        });
      }
      
      if (err.message.includes('Invalid') || err.message.includes('Password')) {
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  });

  /**
   * POST /api/v1/users/login
   * Authenticate user and create session
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }
      
      const userAgent = req.get('User-Agent');
      const ipAddress = req.ip || req.connection?.remoteAddress;
      
      const result = await userService.login({
        email,
        password,
        userAgent,
        ipAddress
      });
      
      res.json({
        success: true,
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user
      });
    } catch (err) {
      logger.error('[Users API] Login error:', err.message);
      
      if (err.message.includes('Invalid')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  });

  /**
   * POST /api/v1/users/logout
   * Logout and invalidate session
   */
  router.post('/logout', async (req, res) => {
    try {
      const token = extractToken(req);
      
      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'No session token provided'
        });
      }
      
      const result = await userService.logout(token);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Users API] Logout error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  });

  // =================== Profile Management ===================

  /**
   * GET /api/v1/users/:id
   * Get user profile
   */
  router.get('/:id', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only view their own profile
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const user = userService.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.json({
        success: true,
        user
      });
    } catch (err) {
      logger.error('[Users API] Get profile error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  });

  /**
   * PATCH /api/v1/users/:id
   * Update user profile
   */
  router.patch('/:id', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only update their own profile
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const { displayName, settings } = req.body;
      
      const updated = await userService.updateProfile(userId, {
        displayName,
        settings
      });
      
      res.json({
        success: true,
        user: updated
      });
    } catch (err) {
      logger.error('[Users API] Update profile error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  });

  /**
   * DELETE /api/v1/users/:id
   * Delete user account
   */
  router.delete('/:id', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only delete their own account
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const result = await userService.deleteAccount(userId);
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (err) {
      logger.error('[Users API] Delete account error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to delete account'
      });
    }
  });

  // =================== Personalized Feed ===================

  /**
   * GET /api/v1/users/:id/feed
   * Get personalized feed for user
   */
  router.get('/:id/feed', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only view their own feed
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      if (!personalizedFeed) {
        return res.status(503).json({
          success: false,
          error: 'Personalized feeds not available'
        });
      }
      
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
      const offset = parseInt(req.query.offset, 10) || 0;
      const excludeViewed = req.query.excludeViewed !== 'false';
      
      const feed = await personalizedFeed.generateFeed(userId, {
        limit,
        offset,
        excludeViewed
      });
      
      res.json({
        success: true,
        ...feed
      });
    } catch (err) {
      logger.error('[Users API] Get feed error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to generate feed'
      });
    }
  });

  // =================== Event Tracking ===================

  /**
   * POST /api/v1/users/:id/events
   * Record user events (article views, etc.)
   */
  router.post('/:id/events', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      // Users can only record their own events
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const { events } = req.body;
      
      // Single event
      if (!events && req.body.eventType) {
        const { eventType, contentId, durationMs, metadata } = req.body;
        
        const result = userService.recordEvent({
          userId,
          eventType,
          contentId,
          durationMs,
          metadata
        });
        
        return res.status(201).json({
          success: true,
          eventId: result.id
        });
      }
      
      // Batch events
      if (Array.isArray(events)) {
        if (events.length > 100) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 100 events per batch'
          });
        }
        
        let recorded = 0;
        for (const event of events) {
          userService.recordEvent({
            userId,
            eventType: event.eventType,
            contentId: event.contentId,
            durationMs: event.durationMs,
            metadata: event.metadata
          });
          recorded++;
        }
        
        return res.status(201).json({
          success: true,
          recorded
        });
      }
      
      res.status(400).json({
        success: false,
        error: 'Invalid event format'
      });
    } catch (err) {
      logger.error('[Users API] Record event error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to record event'
      });
    }
  });

  /**
   * GET /api/v1/users/:id/events
   * Get user's recent events
   */
  router.get('/:id/events', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
      
      const events = userService.getRecentEvents(userId, limit);
      
      res.json({
        success: true,
        events,
        count: events.length
      });
    } catch (err) {
      logger.error('[Users API] Get events error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get events'
      });
    }
  });

  // =================== Preferences ===================

  /**
   * GET /api/v1/users/:id/preferences
   * Get user's learned preferences
   */
  router.get('/:id/preferences', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      if (!preferenceLearner) {
        return res.status(503).json({
          success: false,
          error: 'Preference learning not available'
        });
      }
      
      const preferences = preferenceLearner.getPreferences(userId);
      const readiness = preferenceLearner.checkPersonalizationReadiness(userId);
      const topInterests = preferenceLearner.getTopInterests(userId, 5);
      
      res.json({
        success: true,
        preferences,
        readiness,
        topInterests
      });
    } catch (err) {
      logger.error('[Users API] Get preferences error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get preferences'
      });
    }
  });

  /**
   * POST /api/v1/users/:id/preferences/learn
   * Trigger preference learning from behavior
   */
  router.post('/:id/preferences/learn', requireAuth(userService), async (req, res) => {
    try {
      const userId = parseInt(req.params.id, 10);
      
      if (req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      if (!preferenceLearner) {
        return res.status(503).json({
          success: false,
          error: 'Preference learning not available'
        });
      }
      
      const lookbackDays = parseInt(req.query.lookbackDays, 10) || 60;
      
      const result = await preferenceLearner.learnPreferences(userId, {
        lookbackDays,
        save: true
      });
      
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('[Users API] Learn preferences error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to learn preferences'
      });
    }
  });

  // =================== Stats ===================

  /**
   * GET /api/v1/users/stats
   * Get user system statistics (admin only in future)
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = userService.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (err) {
      logger.error('[Users API] Get stats error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get stats'
      });
    }
  });

  return router;
}

// =================== Middleware Helpers ===================

/**
 * Extract token from Authorization header or query
 * 
 * @param {express.Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check query parameter (for SSE/WebSocket)
  if (req.query.token) {
    return req.query.token;
  }
  
  return null;
}

/**
 * Create auth middleware
 * 
 * @param {Object} userService - UserService instance
 * @returns {Function} Express middleware
 */
function requireAuth(userService) {
  return (req, res, next) => {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const user = userService.validateSession(token);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }
    
    req.user = user;
    next();
  };
}

module.exports = {
  createUsersRouter,
  extractToken,
  requireAuth
};
