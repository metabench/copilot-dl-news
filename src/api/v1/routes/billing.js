'use strict';

/**
 * Billing API Routes (v1)
 * 
 * REST endpoints for subscription and billing management:
 * - GET  /subscription - Get current subscription and usage
 * - POST /checkout     - Create Stripe checkout session
 * - POST /portal       - Create Stripe billing portal session
 * - POST /webhooks/stripe - Handle Stripe webhooks
 * - GET  /usage        - Get current usage metrics
 * - GET  /plans        - Get available plans
 * 
 * @module billing routes
 */

const express = require('express');

/**
 * Create billing router
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.subscriptionService - SubscriptionService instance
 * @param {Object} options.usageTracker - UsageTracker instance
 * @param {Object} options.featureGate - FeatureGate instance
 * @param {Object} options.stripeClient - StripeClient instance
 * @param {Function} [options.requireAuth] - Auth middleware factory
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Billing router
 */
function createBillingRouter(options = {}) {
  const { 
    subscriptionService, 
    usageTracker, 
    featureGate,
    stripeClient,
    requireAuth,
    logger = console 
  } = options;
  
  if (!subscriptionService) {
    throw new Error('createBillingRouter requires subscriptionService');
  }
  
  const router = express.Router();

  // =================== Subscription Management ===================

  /**
   * GET /api/v1/billing/subscription
   * Get current subscription with plan limits and usage
   */
  router.get('/subscription', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const subscription = subscriptionService.getSubscription(userId);
      
      res.json({
        success: true,
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          limits: subscription.limits,
          usage: subscription.usage
        }
      });
    } catch (err) {
      logger.error('[Billing API] Get subscription error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription'
      });
    }
  });

  /**
   * GET /api/v1/billing/plans
   * Get available subscription plans
   */
  router.get('/plans', (req, res) => {
    try {
      const plans = subscriptionService.getAllPlans();
      
      res.json({
        success: true,
        plans: Object.values(plans).map(plan => ({
          name: plan.name,
          price: plan.price,
          limits: {
            apiCalls: plan.apiCalls,
            exports: plan.exports,
            workspaces: plan.workspaces,
            alerts: plan.alerts
          },
          unlimited: plan.apiCalls === -1
        }))
      });
    } catch (err) {
      logger.error('[Billing API] Get plans error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get plans'
      });
    }
  });

  // =================== Stripe Checkout ===================

  /**
   * POST /api/v1/billing/checkout
   * Create a Stripe checkout session for plan upgrade
   */
  router.post('/checkout', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const { plan, successUrl, cancelUrl } = req.body;
      
      if (!plan || !['pro', 'enterprise'].includes(plan)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid plan. Must be "pro" or "enterprise".'
        });
      }
      
      if (!successUrl || !cancelUrl) {
        return res.status(400).json({
          success: false,
          error: 'successUrl and cancelUrl are required'
        });
      }
      
      // Ensure user has Stripe customer
      // Note: In production, get email from user service
      const userEmail = req.user?.email || `user${userId}@example.com`;
      await subscriptionService.ensureStripeCustomer(userId, userEmail);
      
      const session = await subscriptionService.createCheckoutSession(userId, plan, {
        successUrl,
        cancelUrl
      });
      
      res.json({
        success: true,
        sessionId: session.sessionId,
        url: session.url
      });
    } catch (err) {
      logger.error('[Billing API] Create checkout error:', err.message);
      
      if (err.message.includes('not configured')) {
        return res.status(503).json({
          success: false,
          error: 'Billing not configured'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  });

  /**
   * POST /api/v1/billing/portal
   * Create a Stripe billing portal session
   */
  router.post('/portal', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const { returnUrl } = req.body;
      
      if (!returnUrl) {
        return res.status(400).json({
          success: false,
          error: 'returnUrl is required'
        });
      }
      
      const session = await subscriptionService.createPortalSession(userId, returnUrl);
      
      res.json({
        success: true,
        url: session.url
      });
    } catch (err) {
      logger.error('[Billing API] Create portal error:', err.message);
      
      if (err.message.includes('No Stripe customer')) {
        return res.status(400).json({
          success: false,
          error: 'No billing account found'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create portal session'
      });
    }
  });

  /**
   * POST /api/v1/billing/cancel
   * Cancel current subscription
   */
  router.post('/cancel', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      const { immediate = false } = req.body;
      
      const subscription = await subscriptionService.cancelSubscription(userId, { immediate });
      
      res.json({
        success: true,
        message: immediate 
          ? 'Subscription cancelled immediately'
          : 'Subscription will be cancelled at end of billing period',
        subscription: {
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        }
      });
    } catch (err) {
      logger.error('[Billing API] Cancel subscription error:', err.message);
      
      if (err.message.includes('Cannot cancel free')) {
        return res.status(400).json({
          success: false,
          error: 'Cannot cancel free plan'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription'
      });
    }
  });

  // =================== Usage ===================

  /**
   * GET /api/v1/billing/usage
   * Get current usage metrics
   */
  router.get('/usage', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      if (!usageTracker) {
        return res.status(503).json({
          success: false,
          error: 'Usage tracking not available'
        });
      }
      
      const summary = usageTracker.getUsageSummary(userId);
      
      res.json({
        success: true,
        usage: summary
      });
    } catch (err) {
      logger.error('[Billing API] Get usage error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get usage'
      });
    }
  });

  /**
   * GET /api/v1/billing/limits
   * Get current limit status for all metrics
   */
  router.get('/limits', requireAuth ? requireAuth() : noAuth, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      if (!featureGate) {
        return res.status(503).json({
          success: false,
          error: 'Limit checking not available'
        });
      }
      
      const status = featureGate.getStatus(userId);
      
      res.json({
        success: true,
        limits: status
      });
    } catch (err) {
      logger.error('[Billing API] Get limits error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get limits'
      });
    }
  });

  // =================== Stripe Webhooks ===================

  /**
   * POST /api/v1/webhooks/stripe
   * Handle Stripe webhook events
   * 
   * Note: This should be mounted at /api/v1/webhooks/stripe, not under /billing
   */
  router.post('/webhooks/stripe', 
    // Use raw body for signature verification
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const signature = req.headers['stripe-signature'];
        const payload = req.body;
        
        if (!stripeClient) {
          logger.warn('[Billing API] Webhook received but Stripe not configured');
          return res.status(503).json({
            success: false,
            error: 'Stripe not configured'
          });
        }
        
        // Verify and parse webhook
        let event;
        try {
          event = await stripeClient.handleWebhook(payload, signature);
        } catch (err) {
          logger.error('[Billing API] Webhook verification failed:', err.message);
          return res.status(400).json({
            success: false,
            error: 'Webhook verification failed'
          });
        }
        
        // Process the event
        const result = await subscriptionService.processWebhookEvent(event);
        
        logger.log(`[Billing API] Webhook processed: ${event.type} -> ${result.status}`);
        
        res.json({
          received: true,
          eventType: event.type,
          result: result.status
        });
      } catch (err) {
        logger.error('[Billing API] Webhook error:', err.message);
        res.status(500).json({
          success: false,
          error: 'Webhook processing failed'
        });
      }
    }
  );

  // =================== Stats (Admin) ===================

  /**
   * GET /api/v1/billing/stats
   * Get billing statistics (admin only in production)
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = subscriptionService.getStats();
      const counts = subscriptionService.getSubscriptionCounts();
      
      res.json({
        success: true,
        stats: {
          ...stats,
          planCounts: counts
        }
      });
    } catch (err) {
      logger.error('[Billing API] Get stats error:', err.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get stats'
      });
    }
  });

  return router;
}

/**
 * No-op auth middleware for when requireAuth is not provided
 */
function noAuth(req, res, next) {
  next();
}

/**
 * Extract token from Authorization header
 * 
 * @param {express.Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.query.token || null;
}

module.exports = {
  createBillingRouter,
  extractToken
};
