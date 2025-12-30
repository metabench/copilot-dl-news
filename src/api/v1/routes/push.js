'use strict';

/**
 * Push Notification API Routes
 * 
 * REST endpoints for managing Web Push subscriptions:
 * - POST   /api/v1/push/subscribe      - Register push subscription
 * - DELETE /api/v1/push/subscribe      - Unregister push subscription
 * - POST   /api/v1/push/test           - Send test notification (dev only)
 * - GET    /api/v1/push/vapid-key      - Get public VAPID key
 * - GET    /api/v1/push/status         - Get push notification status
 * 
 * Requires web-push library and VAPID keys in environment:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_EMAIL (mailto: format)
 * 
 * @module api/v1/routes/push
 */

const express = require('express');
const router = express.Router();

/**
 * Factory to create push notification router with dependencies
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.pushAdapter - Database adapter for push subscriptions
 * @param {Object} [deps.userService] - UserService for auth
 * @param {Object} [deps.webPush] - web-push library instance
 * @param {Object} [deps.config] - Configuration
 * @param {string} [deps.config.vapidPublicKey] - Public VAPID key
 * @param {string} [deps.config.vapidPrivateKey] - Private VAPID key
 * @param {string} [deps.config.vapidEmail] - VAPID contact email
 * @param {Object} [deps.logger] - Logger instance
 * @returns {express.Router}
 */
function createPushRouter(deps = {}) {
  const { 
    pushAdapter, 
    userService, 
    webPush,
    config = {},
    logger = console 
  } = deps;

  // VAPID configuration
  const vapidPublicKey = config.vapidPublicKey || process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = config.vapidPrivateKey || process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = config.vapidEmail || process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  // Configure web-push if available
  let pushEnabled = false;
  if (webPush && vapidPublicKey && vapidPrivateKey) {
    try {
      webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
      pushEnabled = true;
      logger.log('[Push API] Web Push configured successfully');
    } catch (err) {
      logger.error('[Push API] Failed to configure web-push:', err.message);
    }
  } else {
    logger.warn('[Push API] Web Push not configured - missing webPush library or VAPID keys');
  }

  /**
   * Auth middleware - validates session and attaches user
   */
  const requireAuth = async (req, res, next) => {
    try {
      const sessionId = req.headers['x-session-id'] || 
                        req.headers.authorization?.replace('Bearer ', '') ||
                        req.cookies?.sessionId;
      
      if (!sessionId) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
      }

      if (userService) {
        const session = userService.validateSession(sessionId);
        if (!session || !session.valid) {
          return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired session' 
          });
        }
        req.userId = session.userId;
        req.sessionId = sessionId;
      } else {
        // Fallback for testing without userService
        req.userId = parseInt(req.headers['x-user-id'], 10) || 1;
      }

      next();
    } catch (err) {
      logger.error('[Push/auth] Error:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Authentication error' 
      });
    }
  };

  /**
   * Optional auth - allows both authenticated and anonymous requests
   */
  const optionalAuth = async (req, res, next) => {
    try {
      const sessionId = req.headers['x-session-id'] || 
                        req.headers.authorization?.replace('Bearer ', '') ||
                        req.cookies?.sessionId;
      
      if (sessionId && userService) {
        const session = userService.validateSession(sessionId);
        if (session && session.valid) {
          req.userId = session.userId;
          req.sessionId = sessionId;
        }
      }
      
      // Also check x-user-id header for testing
      if (!req.userId && req.headers['x-user-id']) {
        req.userId = parseInt(req.headers['x-user-id'], 10);
      }

      next();
    } catch (err) {
      // Silent fail for optional auth
      next();
    }
  };

  // =================== Public Endpoints ===================

  /**
   * GET /api/v1/push/vapid-key
   * Get public VAPID key for client subscription
   */
  router.get('/vapid-key', (req, res) => {
    if (!vapidPublicKey) {
      return res.status(503).json({
        success: false,
        error: 'Push notifications not configured'
      });
    }

    res.json({
      success: true,
      publicKey: vapidPublicKey
    });
  });

  /**
   * GET /api/v1/push/status
   * Get push notification configuration status
   */
  router.get('/status', optionalAuth, (req, res) => {
    res.json({
      success: true,
      status: {
        enabled: pushEnabled,
        configured: !!vapidPublicKey,
        userSubscribed: false // Will be updated if user is authenticated
      }
    });
  });

  // =================== Subscription Management ===================

  /**
   * POST /api/v1/push/subscribe
   * Register a push subscription
   * 
   * Body: {
   *   subscription: {
   *     endpoint: string,
   *     keys: { p256dh: string, auth: string }
   *   },
   *   userAgent?: string
   * }
   */
  router.post('/subscribe', optionalAuth, async (req, res) => {
    try {
      const { subscription, userAgent } = req.body;

      // Validate subscription object
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({
          success: false,
          error: 'Invalid subscription object',
          required: ['endpoint', 'keys.p256dh', 'keys.auth']
        });
      }

      if (!subscription.keys.p256dh || !subscription.keys.auth) {
        return res.status(400).json({
          success: false,
          error: 'Missing encryption keys',
          required: ['keys.p256dh', 'keys.auth']
        });
      }

      // Check if push is configured
      if (!pushEnabled) {
        return res.status(503).json({
          success: false,
          error: 'Push notifications not configured on server'
        });
      }

      // Create subscription record
      const record = {
        userId: req.userId || null,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || req.get('User-Agent') || null,
        createdAt: new Date().toISOString()
      };

      // Save to database
      let subscriptionId;
      if (pushAdapter && pushAdapter.saveSubscription) {
        subscriptionId = await pushAdapter.saveSubscription(record);
      } else {
        // In-memory fallback for testing
        subscriptionId = Date.now();
        logger.warn('[Push API] No pushAdapter - subscription not persisted');
      }

      logger.log('[Push API] Subscription registered:', subscriptionId);

      res.status(201).json({
        success: true,
        subscriptionId,
        message: 'Push subscription registered'
      });

    } catch (err) {
      logger.error('[POST /push/subscribe] Error:', err.message);
      
      // Handle duplicate subscription
      if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
        return res.status(409).json({
          success: false,
          error: 'Subscription already exists'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to register subscription'
      });
    }
  });

  /**
   * DELETE /api/v1/push/subscribe
   * Unregister a push subscription
   * 
   * Body: { endpoint: string }
   */
  router.delete('/subscribe', optionalAuth, async (req, res) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({
          success: false,
          error: 'Endpoint is required'
        });
      }

      let deleted = false;
      if (pushAdapter && pushAdapter.deleteSubscription) {
        deleted = await pushAdapter.deleteSubscription(endpoint);
      } else {
        logger.warn('[Push API] No pushAdapter - cannot delete subscription');
      }

      if (deleted) {
        logger.log('[Push API] Subscription unregistered:', endpoint.substring(0, 50) + '...');
      }

      res.json({
        success: true,
        deleted,
        message: deleted ? 'Subscription removed' : 'Subscription not found'
      });

    } catch (err) {
      logger.error('[DELETE /push/subscribe] Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to unregister subscription'
      });
    }
  });

  /**
   * GET /api/v1/push/subscriptions
   * Get user's push subscriptions (authenticated)
   */
  router.get('/subscriptions', requireAuth, async (req, res) => {
    try {
      let subscriptions = [];
      
      if (pushAdapter && pushAdapter.getSubscriptionsByUser) {
        subscriptions = await pushAdapter.getSubscriptionsByUser(req.userId);
      }

      res.json({
        success: true,
        count: subscriptions.length,
        subscriptions: subscriptions.map(sub => ({
          id: sub.id,
          endpoint: sub.endpoint.substring(0, 50) + '...',
          userAgent: sub.userAgent,
          createdAt: sub.createdAt
        }))
      });

    } catch (err) {
      logger.error('[GET /push/subscriptions] Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscriptions'
      });
    }
  });

  // =================== Testing & Admin ===================

  /**
   * POST /api/v1/push/test
   * Send a test push notification (dev/testing only)
   */
  router.post('/test', requireAuth, async (req, res) => {
    try {
      // Only allow in development
      if (process.env.NODE_ENV === 'production' && !req.headers['x-admin-key']) {
        return res.status(403).json({
          success: false,
          error: 'Test notifications disabled in production'
        });
      }

      if (!pushEnabled || !webPush) {
        return res.status(503).json({
          success: false,
          error: 'Push notifications not configured'
        });
      }

      const { title, body, url } = req.body;

      const payload = JSON.stringify({
        title: title || 'Test Notification',
        body: body || 'This is a test push notification from News Crawler',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'test-notification',
        data: {
          url: url || '/',
          testAt: new Date().toISOString()
        }
      });

      // Get user's subscriptions
      let subscriptions = [];
      if (pushAdapter && pushAdapter.getSubscriptionsByUser) {
        subscriptions = await pushAdapter.getSubscriptionsByUser(req.userId);
      }

      if (subscriptions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No push subscriptions found for user'
        });
      }

      // Send to all user's subscriptions
      const results = await Promise.allSettled(
        subscriptions.map(sub => {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };
          return webPush.sendNotification(pushSubscription, payload);
        })
      );

      const sent = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Clean up failed subscriptions (expired endpoints)
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const error = results[i].reason;
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription expired - remove it
            if (pushAdapter && pushAdapter.deleteSubscription) {
              await pushAdapter.deleteSubscription(subscriptions[i].endpoint);
              logger.log('[Push API] Removed expired subscription:', subscriptions[i].id);
            }
          }
        }
      }

      logger.log('[Push API] Test notification sent:', { sent, failed });

      res.json({
        success: true,
        sent,
        failed,
        message: `Test notification sent to ${sent} device(s)`
      });

    } catch (err) {
      logger.error('[POST /push/test] Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to send test notification'
      });
    }
  });

  /**
   * POST /api/v1/push/send
   * Send push notification to specific users (admin/internal use)
   */
  router.post('/send', async (req, res) => {
    try {
      // Require admin key
      const adminKey = req.headers['x-admin-key'];
      if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      if (!pushEnabled || !webPush) {
        return res.status(503).json({
          success: false,
          error: 'Push notifications not configured'
        });
      }

      const { userIds, notification } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'userIds array is required'
        });
      }

      if (!notification || !notification.title) {
        return res.status(400).json({
          success: false,
          error: 'notification.title is required'
        });
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body || '',
        icon: notification.icon || '/icons/icon-192.png',
        badge: notification.badge || '/icons/icon-192.png',
        tag: notification.tag || 'news-notification',
        data: notification.data || {},
        actions: notification.actions || [],
        requireInteraction: notification.requireInteraction || false
      });

      // Get subscriptions for all users
      let allSubscriptions = [];
      if (pushAdapter && pushAdapter.getSubscriptionsByUsers) {
        allSubscriptions = await pushAdapter.getSubscriptionsByUsers(userIds);
      } else if (pushAdapter && pushAdapter.getSubscriptionsByUser) {
        for (const userId of userIds) {
          const subs = await pushAdapter.getSubscriptionsByUser(userId);
          allSubscriptions.push(...subs);
        }
      }

      if (allSubscriptions.length === 0) {
        return res.json({
          success: true,
          sent: 0,
          message: 'No subscriptions found for specified users'
        });
      }

      // Send notifications
      const results = await Promise.allSettled(
        allSubscriptions.map(sub => {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };
          return webPush.sendNotification(pushSubscription, payload);
        })
      );

      const sent = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.log('[Push API] Notification sent:', { userCount: userIds.length, sent, failed });

      res.json({
        success: true,
        sent,
        failed,
        total: allSubscriptions.length
      });

    } catch (err) {
      logger.error('[POST /push/send] Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to send notifications'
      });
    }
  });

  // =================== Stats ===================

  /**
   * GET /api/v1/push/stats
   * Get push notification statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      // Require admin key in production
      if (process.env.NODE_ENV === 'production') {
        const adminKey = req.headers['x-admin-key'];
        if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
          return res.status(403).json({
            success: false,
            error: 'Admin access required'
          });
        }
      }

      let stats = {
        enabled: pushEnabled,
        totalSubscriptions: 0,
        activeUsers: 0
      };

      if (pushAdapter && pushAdapter.getStats) {
        const adapterStats = await pushAdapter.getStats();
        stats = { ...stats, ...adapterStats };
      }

      res.json({
        success: true,
        stats
      });

    } catch (err) {
      logger.error('[GET /push/stats] Error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get stats'
      });
    }
  });

  return router;
}

/**
 * Database schema for push subscriptions
 * 
 * CREATE TABLE user_push_subscriptions (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   user_id INTEGER,
 *   endpoint TEXT NOT NULL UNIQUE,
 *   p256dh TEXT NOT NULL,
 *   auth TEXT NOT NULL,
 *   user_agent TEXT,
 *   created_at TEXT NOT NULL,
 *   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
 * );
 * 
 * CREATE INDEX idx_push_subs_user ON user_push_subscriptions(user_id);
 * CREATE INDEX idx_push_subs_endpoint ON user_push_subscriptions(endpoint);
 */

/**
 * Helper to generate VAPID keys (run once during setup)
 * 
 * @example
 * const webPush = require('web-push');
 * const vapidKeys = webPush.generateVAPIDKeys();
 * console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
 * console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
 */

module.exports = {
  createPushRouter
};
