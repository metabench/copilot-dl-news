'use strict';

/**
 * Alert API Routes
 * 
 * REST endpoints for managing alert rules, notifications, and alert history.
 * 
 * Endpoints:
 * - POST   /api/v1/alerts/rules      - Create new alert rule
 * - GET    /api/v1/alerts/rules      - List user's alert rules
 * - GET    /api/v1/alerts/rules/:id  - Get specific rule
 * - PUT    /api/v1/alerts/rules/:id  - Update rule
 * - DELETE /api/v1/alerts/rules/:id  - Delete rule
 * - GET    /api/v1/alerts/history    - Get alert history for user
 * - GET    /api/v1/notifications     - Get in-app notifications
 * - PUT    /api/v1/notifications/:id/read - Mark notification as read
 * - PUT    /api/v1/notifications/read-all - Mark all as read
 * - GET    /api/v1/alerts/breaking   - Get current breaking news
 * 
 * @module api/v1/routes/alerts
 */

const express = require('express');
const router = express.Router();

/**
 * Factory to create alerts router with dependencies
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.alertEngine - AlertEngine instance
 * @param {Object} deps.userService - UserService for auth
 * @param {Object} [deps.logger] - Logger instance
 * @returns {express.Router}
 */
function createAlertsRouter(deps) {
  const { alertEngine, userService, logger = console } = deps;

  /**
   * Auth middleware - validates session and attaches user
   */
  const requireAuth = async (req, res, next) => {
    try {
      const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
      
      if (!sessionId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (userService) {
        const session = userService.validateSession(sessionId);
        if (!session || !session.valid) {
          return res.status(401).json({ error: 'Invalid or expired session' });
        }
        req.userId = session.userId;
        req.sessionId = sessionId;
      } else {
        // Fallback for testing without userService
        req.userId = parseInt(req.headers['x-user-id'], 10) || 1;
      }

      next();
    } catch (err) {
      logger.error('[alerts/auth] Error:', err.message);
      res.status(500).json({ error: 'Authentication error' });
    }
  };

  // =================== Alert Rules ===================

  /**
   * POST /api/v1/alerts/rules
   * Create a new alert rule
   */
  router.post('/rules', requireAuth, async (req, res) => {
    try {
      const { name, conditions, channels, enabled } = req.body;

      if (!name || !conditions) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['name', 'conditions']
        });
      }

      const result = alertEngine.createRule({
        userId: req.userId,
        name,
        conditions,
        channels: channels || ['inApp'],
        enabled: enabled !== false
      });

      if (!result.valid) {
        return res.status(400).json({
          error: 'Invalid rule',
          errors: result.errors
        });
      }

      res.status(201).json({
        success: true,
        ruleId: result.id,
        message: 'Alert rule created'
      });

    } catch (err) {
      logger.error('[POST /alerts/rules] Error:', err.message);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  });

  /**
   * GET /api/v1/alerts/rules
   * List user's alert rules
   */
  router.get('/rules', requireAuth, async (req, res) => {
    try {
      const rules = alertEngine.getRules(req.userId);

      res.json({
        success: true,
        count: rules.length,
        rules
      });

    } catch (err) {
      logger.error('[GET /alerts/rules] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch rules' });
    }
  });

  /**
   * GET /api/v1/alerts/rules/:id
   * Get specific rule
   */
  router.get('/rules/:id', requireAuth, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id, 10);
      
      if (isNaN(ruleId)) {
        return res.status(400).json({ error: 'Invalid rule ID' });
      }

      const rule = alertEngine.getRule(ruleId);

      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      // Ensure user owns the rule
      if (rule.userId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        success: true,
        rule
      });

    } catch (err) {
      logger.error('[GET /alerts/rules/:id] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch rule' });
    }
  });

  /**
   * PUT /api/v1/alerts/rules/:id
   * Update a rule
   */
  router.put('/rules/:id', requireAuth, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id, 10);
      
      if (isNaN(ruleId)) {
        return res.status(400).json({ error: 'Invalid rule ID' });
      }

      // Verify ownership
      const rule = alertEngine.getRule(ruleId);
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      if (rule.userId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { name, conditions, channels, enabled } = req.body;
      const updates = {};

      if (name !== undefined) updates.name = name;
      if (conditions !== undefined) updates.conditions = conditions;
      if (channels !== undefined) updates.channels = channels;
      if (enabled !== undefined) updates.enabled = enabled;

      const result = alertEngine.updateRule(ruleId, updates);

      if (!result.success) {
        return res.status(400).json({
          error: 'Failed to update rule',
          errors: result.errors
        });
      }

      res.json({
        success: true,
        message: 'Rule updated'
      });

    } catch (err) {
      logger.error('[PUT /alerts/rules/:id] Error:', err.message);
      res.status(500).json({ error: 'Failed to update rule' });
    }
  });

  /**
   * DELETE /api/v1/alerts/rules/:id
   * Delete a rule
   */
  router.delete('/rules/:id', requireAuth, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id, 10);
      
      if (isNaN(ruleId)) {
        return res.status(400).json({ error: 'Invalid rule ID' });
      }

      // Verify ownership
      const rule = alertEngine.getRule(ruleId);
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      if (rule.userId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = alertEngine.deleteRule(ruleId);

      res.json({
        success: result.success,
        message: result.success ? 'Rule deleted' : 'Failed to delete rule'
      });

    } catch (err) {
      logger.error('[DELETE /alerts/rules/:id] Error:', err.message);
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  // =================== Alert History ===================

  /**
   * GET /api/v1/alerts/history
   * Get alert history for user
   */
  router.get('/history', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      
      const history = alertEngine.getAlertHistory(req.userId, limit);

      res.json({
        success: true,
        count: history.length,
        history
      });

    } catch (err) {
      logger.error('[GET /alerts/history] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch alert history' });
    }
  });

  // =================== Notifications ===================

  /**
   * GET /api/v1/notifications
   * Get in-app notifications
   */
  router.get('/notifications', requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const unreadOnly = req.query.unreadOnly === 'true';
      
      const notifications = alertEngine.getNotifications(req.userId, { limit, unreadOnly });
      const unreadCount = alertEngine.getUnreadCount(req.userId);

      res.json({
        success: true,
        count: notifications.length,
        unreadCount,
        notifications
      });

    } catch (err) {
      logger.error('[GET /notifications] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  /**
   * PUT /api/v1/notifications/:id/read
   * Mark notification as read
   */
  router.put('/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id, 10);
      
      if (isNaN(notificationId)) {
        return res.status(400).json({ error: 'Invalid notification ID' });
      }

      const result = alertEngine.markNotificationRead(notificationId);

      res.json({
        success: result.success
      });

    } catch (err) {
      logger.error('[PUT /notifications/:id/read] Error:', err.message);
      res.status(500).json({ error: 'Failed to mark notification read' });
    }
  });

  /**
   * PUT /api/v1/notifications/read-all
   * Mark all notifications as read
   */
  router.put('/notifications/read-all', requireAuth, async (req, res) => {
    try {
      const result = alertEngine.markAllNotificationsRead(req.userId);

      res.json({
        success: result.success,
        count: result.count
      });

    } catch (err) {
      logger.error('[PUT /notifications/read-all] Error:', err.message);
      res.status(500).json({ error: 'Failed to mark notifications read' });
    }
  });

  // =================== Breaking News ===================

  /**
   * GET /api/v1/alerts/breaking
   * Get current breaking news
   */
  router.get('/breaking', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      
      const breakingNews = alertEngine.getBreakingNews(limit);

      res.json({
        success: true,
        count: breakingNews.length,
        breakingNews
      });

    } catch (err) {
      logger.error('[GET /alerts/breaking] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch breaking news' });
    }
  });

  // =================== Stats ===================

  /**
   * GET /api/v1/alerts/stats
   * Get alert engine stats (admin only)
   */
  router.get('/stats', requireAuth, async (req, res) => {
    try {
      // TODO: Add admin check
      const stats = alertEngine.getStats();

      res.json({
        success: true,
        stats
      });

    } catch (err) {
      logger.error('[GET /alerts/stats] Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  return router;
}

module.exports = {
  createAlertsRouter
};
