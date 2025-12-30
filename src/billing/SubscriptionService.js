'use strict';

/**
 * SubscriptionService - Subscription lifecycle management
 * 
 * Handles:
 * - Subscription CRUD operations
 * - Plan management and upgrades/downgrades
 * - Stripe integration for paid plans
 * - Usage limits checking
 * 
 * All database operations go through the billingAdapter (no SQL here).
 * 
 * @module SubscriptionService
 */

const { PLANS, METRICS } = require('../db/sqlite/v1/queries/billingAdapter');

/**
 * SubscriptionService class
 */
class SubscriptionService {
  /**
   * Create a SubscriptionService
   * 
   * @param {Object} options - Configuration
   * @param {Object} options.billingAdapter - Billing database adapter
   * @param {Object} [options.stripeClient] - Stripe client instance
   * @param {Object} [options.usageTracker] - UsageTracker instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.billingAdapter) {
      throw new Error('SubscriptionService requires a billingAdapter');
    }
    
    this.billingAdapter = options.billingAdapter;
    this.stripeClient = options.stripeClient || null;
    this.usageTracker = options.usageTracker || null;
    this.logger = options.logger || console;
  }

  // =================== Subscription CRUD ===================

  /**
   * Get subscription for a user
   * 
   * @param {number} userId - User ID
   * @returns {Object} Subscription with plan limits and usage
   */
  getSubscription(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    let subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    
    // Create default free subscription if none exists
    if (!subscription) {
      const result = this.billingAdapter.createSubscription({
        userId,
        plan: 'free',
        status: 'active',
        currentPeriodStart: new Date().toISOString()
      });
      
      subscription = this.billingAdapter.getSubscriptionByUserId(userId);
      
      this.billingAdapter.logBillingEvent({
        userId,
        eventType: 'subscription_created',
        data: { plan: 'free', auto: true }
      });
    }

    const limits = this.getPlanLimits(subscription.plan);
    
    // Get current usage if tracker is available
    let usage = {};
    if (this.usageTracker) {
      for (const metric of Object.values(METRICS)) {
        const metricUsage = this.usageTracker.getUsage(userId, metric);
        usage[metric] = metricUsage ? metricUsage.count : 0;
      }
    }

    return {
      ...subscription,
      limits,
      usage
    };
  }

  /**
   * Create a subscription for a user
   * 
   * @param {number} userId - User ID
   * @param {string} plan - Plan name
   * @param {Object} [stripeData={}] - Stripe customer/subscription IDs
   * @returns {Object} Created subscription
   */
  createSubscription(userId, plan, stripeData = {}) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!PLANS[plan]) {
      throw new Error(`Invalid plan: ${plan}. Valid plans: ${Object.keys(PLANS).join(', ')}`);
    }

    // Check if subscription already exists
    const existing = this.billingAdapter.getSubscriptionByUserId(userId);
    if (existing) {
      throw new Error('Subscription already exists for this user');
    }

    // Calculate period end (30 days from now)
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const result = this.billingAdapter.createSubscription({
      userId,
      plan,
      stripeCustomerId: stripeData.stripeCustomerId || null,
      stripeSubscriptionId: stripeData.stripeSubscriptionId || null,
      status: 'active',
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString()
    });

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: 'subscription_created',
      data: { plan, stripeData }
    });

    this.logger.log(`[SubscriptionService] Created subscription for user ${userId}: ${plan}`);

    return this.getSubscription(userId);
  }

  /**
   * Update a subscription (plan change)
   * 
   * @param {number} userId - User ID
   * @param {string} plan - New plan name
   * @param {Object} [options={}] - Update options
   * @returns {Object} Updated subscription
   */
  updateSubscription(userId, plan, options = {}) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!PLANS[plan]) {
      throw new Error(`Invalid plan: ${plan}. Valid plans: ${Object.keys(PLANS).join(', ')}`);
    }

    const existing = this.billingAdapter.getSubscriptionByUserId(userId);
    if (!existing) {
      throw new Error('No subscription found for this user');
    }

    const oldPlan = existing.plan;
    const isUpgrade = this._isPlanUpgrade(oldPlan, plan);
    const isDowngrade = this._isPlanDowngrade(oldPlan, plan);

    // Update subscription
    const updateData = {
      plan,
      status: 'active'
    };

    if (options.stripeSubscriptionId) {
      updateData.stripeSubscriptionId = options.stripeSubscriptionId;
    }

    // If upgrading, reset period
    if (isUpgrade) {
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 30);
      
      updateData.currentPeriodStart = periodStart.toISOString();
      updateData.currentPeriodEnd = periodEnd.toISOString();
    }

    this.billingAdapter.updateSubscription(userId, updateData);

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: isUpgrade ? 'subscription_upgraded' : 
                 isDowngrade ? 'subscription_downgraded' : 'subscription_updated',
      data: { oldPlan, newPlan: plan }
    });

    this.logger.log(
      `[SubscriptionService] Updated subscription for user ${userId}: ${oldPlan} → ${plan}`
    );

    return this.getSubscription(userId);
  }

  /**
   * Cancel a subscription
   * 
   * @param {number} userId - User ID
   * @param {Object} [options={}] - Cancel options
   * @param {boolean} [options.immediate=false] - Cancel immediately vs at period end
   * @returns {Object} Updated subscription
   */
  async cancelSubscription(userId, options = {}) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const existing = this.billingAdapter.getSubscriptionByUserId(userId);
    if (!existing) {
      throw new Error('No subscription found for this user');
    }

    if (existing.plan === 'free') {
      throw new Error('Cannot cancel free plan');
    }

    const { immediate = false } = options;

    // Cancel in Stripe if connected
    if (this.stripeClient && existing.stripeSubscriptionId) {
      try {
        await this.stripeClient.cancelSubscription(existing.stripeSubscriptionId, {
          cancelAtPeriodEnd: !immediate
        });
      } catch (err) {
        this.logger.error(`[SubscriptionService] Stripe cancel failed: ${err.message}`);
        // Continue with local cancellation
      }
    }

    if (immediate) {
      // Immediate downgrade to free
      this.billingAdapter.updateSubscription(userId, {
        plan: 'free',
        status: 'active',
        stripeSubscriptionId: null
      });
    } else {
      // Mark as cancelled, will downgrade at period end
      this.billingAdapter.updateSubscription(userId, {
        status: 'cancelled'
      });
    }

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: 'subscription_cancelled',
      data: { 
        previousPlan: existing.plan, 
        immediate,
        effectiveDate: immediate ? new Date().toISOString() : existing.currentPeriodEnd
      }
    });

    this.logger.log(
      `[SubscriptionService] Cancelled subscription for user ${userId} (immediate: ${immediate})`
    );

    return this.getSubscription(userId);
  }

  /**
   * Reactivate a cancelled subscription
   * 
   * @param {number} userId - User ID
   * @returns {Object} Reactivated subscription
   */
  reactivateSubscription(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const existing = this.billingAdapter.getSubscriptionByUserId(userId);
    if (!existing) {
      throw new Error('No subscription found for this user');
    }

    if (existing.status !== 'cancelled') {
      throw new Error('Subscription is not cancelled');
    }

    this.billingAdapter.updateSubscription(userId, {
      status: 'active'
    });

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: 'subscription_reactivated',
      data: { plan: existing.plan }
    });

    this.logger.log(`[SubscriptionService] Reactivated subscription for user ${userId}`);

    return this.getSubscription(userId);
  }

  // =================== Plan Helpers ===================

  /**
   * Get plan limits
   * 
   * @param {string} plan - Plan name
   * @returns {Object} Plan limits
   */
  getPlanLimits(plan) {
    return this.billingAdapter.getPlanLimits(plan);
  }

  /**
   * Get all available plans
   * 
   * @returns {Object} All plans with details
   */
  getAllPlans() {
    return this.billingAdapter.getAllPlans();
  }

  /**
   * Get plan details
   * 
   * @param {string} plan - Plan name
   * @returns {Object|null} Plan details
   */
  getPlan(plan) {
    return this.billingAdapter.getPlan(plan);
  }

  /**
   * Check if a plan change is an upgrade
   * @private
   */
  _isPlanUpgrade(fromPlan, toPlan) {
    const order = { free: 0, pro: 1, enterprise: 2 };
    return (order[toPlan] || 0) > (order[fromPlan] || 0);
  }

  /**
   * Check if a plan change is a downgrade
   * @private
   */
  _isPlanDowngrade(fromPlan, toPlan) {
    const order = { free: 0, pro: 1, enterprise: 2 };
    return (order[toPlan] || 0) < (order[fromPlan] || 0);
  }

  // =================== Stripe Integration ===================

  /**
   * Create a Stripe checkout session for plan upgrade
   * 
   * @param {number} userId - User ID
   * @param {string} plan - Target plan
   * @param {Object} urls - Redirect URLs
   * @param {string} urls.successUrl - Success redirect URL
   * @param {string} urls.cancelUrl - Cancel redirect URL
   * @returns {Promise<Object>} Checkout session with URL
   */
  async createCheckoutSession(userId, plan, { successUrl, cancelUrl }) {
    if (!this.stripeClient) {
      throw new Error('Stripe client not configured');
    }
    if (!PLANS[plan] || plan === 'free') {
      throw new Error(`Invalid plan for checkout: ${plan}`);
    }

    const subscription = this.getSubscription(userId);
    
    // Get or create Stripe customer
    let stripeCustomerId = subscription.stripeCustomerId;
    if (!stripeCustomerId) {
      // We need user email - this should be passed in or fetched
      throw new Error('Stripe customer not found. Create customer first.');
    }

    const priceId = this.stripeClient.getPriceId(plan);
    if (!priceId) {
      throw new Error(`No price configured for plan: ${plan}`);
    }

    const session = await this.stripeClient.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      metadata: { userId: String(userId), plan }
    });

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: 'checkout_session_created',
      data: { plan, sessionId: session.id }
    });

    return {
      sessionId: session.id,
      url: session.url
    };
  }

  /**
   * Create a Stripe billing portal session
   * 
   * @param {number} userId - User ID
   * @param {string} returnUrl - Return URL after portal
   * @returns {Promise<Object>} Portal session with URL
   */
  async createPortalSession(userId, returnUrl) {
    if (!this.stripeClient) {
      throw new Error('Stripe client not configured');
    }

    const subscription = this.getSubscription(userId);
    
    if (!subscription.stripeCustomerId) {
      throw new Error('No Stripe customer found for this user');
    }

    const session = await this.stripeClient.createPortalSession(
      subscription.stripeCustomerId,
      returnUrl
    );

    return {
      url: session.url
    };
  }

  /**
   * Create or get Stripe customer for a user
   * 
   * @param {number} userId - User ID
   * @param {string} email - User email
   * @returns {Promise<string>} Stripe customer ID
   */
  async ensureStripeCustomer(userId, email) {
    if (!this.stripeClient) {
      throw new Error('Stripe client not configured');
    }

    const subscription = this.billingAdapter.getSubscriptionByUserId(userId);
    
    if (subscription?.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    const customer = await this.stripeClient.createCustomer(email, {
      userId: String(userId)
    });

    // Update or create subscription with customer ID
    if (subscription) {
      this.billingAdapter.updateSubscription(userId, {
        stripeCustomerId: customer.id
      });
    } else {
      this.billingAdapter.createSubscription({
        userId,
        plan: 'free',
        stripeCustomerId: customer.id,
        status: 'active'
      });
    }

    this.billingAdapter.logBillingEvent({
      userId,
      eventType: 'stripe_customer_created',
      data: { stripeCustomerId: customer.id }
    });

    return customer.id;
  }

  // =================== Webhook Processing ===================

  /**
   * Process a Stripe webhook event
   * 
   * @param {Object} event - Stripe event object
   * @returns {Object} Processing result
   */
  async processWebhookEvent(event) {
    if (!event || !event.type) {
      throw new Error('Invalid webhook event');
    }

    // Check if already processed (idempotency)
    if (this.billingAdapter.isEventProcessed(event.id)) {
      this.logger.log(`[SubscriptionService] Skipping duplicate event: ${event.id}`);
      return { status: 'duplicate', eventId: event.id };
    }

    const data = event.data?.object;
    let result = { status: 'processed', eventType: event.type };

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          result = await this._handleCheckoutComplete(data, event);
          break;

        case 'invoice.paid':
          result = await this._handleInvoicePaid(data, event);
          break;

        case 'customer.subscription.updated':
          result = await this._handleSubscriptionUpdated(data, event);
          break;

        case 'customer.subscription.deleted':
          result = await this._handleSubscriptionDeleted(data, event);
          break;

        default:
          this.logger.log(`[SubscriptionService] Unhandled event type: ${event.type}`);
          result = { status: 'ignored', eventType: event.type };
      }
    } catch (err) {
      this.logger.error(`[SubscriptionService] Webhook error: ${err.message}`);
      result = { status: 'error', error: err.message };
    }

    // Log the event
    this.billingAdapter.logBillingEvent({
      userId: result.userId || null,
      eventType: event.type,
      stripeEventId: event.id,
      data: { result, eventData: data }
    });

    return result;
  }

  /**
   * Handle checkout.session.completed event
   * @private
   */
  async _handleCheckoutComplete(session, event) {
    const userId = session.metadata?.userId ? parseInt(session.metadata.userId, 10) : null;
    const plan = session.metadata?.plan || 'pro';
    
    if (!userId) {
      return { status: 'error', error: 'No userId in session metadata' };
    }

    // Get subscription ID from session
    const stripeSubscriptionId = session.subscription;
    const stripeCustomerId = session.customer;

    // Calculate period from Stripe subscription if available
    let periodStart = new Date();
    let periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    if (this.stripeClient && stripeSubscriptionId) {
      try {
        const stripeSub = await this.stripeClient.getSubscription(stripeSubscriptionId);
        if (stripeSub) {
          periodStart = new Date(stripeSub.current_period_start * 1000);
          periodEnd = new Date(stripeSub.current_period_end * 1000);
        }
      } catch (err) {
        this.logger.warn(`[SubscriptionService] Could not fetch Stripe subscription: ${err.message}`);
      }
    }

    // Update local subscription
    const existing = this.billingAdapter.getSubscriptionByUserId(userId);
    if (existing) {
      this.billingAdapter.updateSubscription(userId, {
        plan,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'active',
        currentPeriodStart: periodStart.toISOString(),
        currentPeriodEnd: periodEnd.toISOString()
      });
    } else {
      this.billingAdapter.createSubscription({
        userId,
        plan,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'active',
        currentPeriodStart: periodStart.toISOString(),
        currentPeriodEnd: periodEnd.toISOString()
      });
    }

    this.logger.log(`[SubscriptionService] Checkout complete for user ${userId}: ${plan}`);

    return { 
      status: 'processed', 
      userId, 
      plan,
      stripeSubscriptionId 
    };
  }

  /**
   * Handle invoice.paid event
   * @private
   */
  async _handleInvoicePaid(invoice, event) {
    const stripeSubscriptionId = invoice.subscription;
    const stripeCustomerId = invoice.customer;

    if (!stripeSubscriptionId) {
      return { status: 'ignored', reason: 'No subscription on invoice' };
    }

    // Find subscription by Stripe subscription ID
    let subscription = this.billingAdapter.getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
    
    if (!subscription) {
      subscription = this.billingAdapter.getSubscriptionByStripeCustomerId(stripeCustomerId);
    }

    if (!subscription) {
      return { status: 'error', error: 'Subscription not found' };
    }

    // Extend subscription period
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    this.billingAdapter.updateSubscription(subscription.userId, {
      status: 'active',
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString()
    });

    this.logger.log(`[SubscriptionService] Invoice paid for user ${subscription.userId}`);

    return { 
      status: 'processed', 
      userId: subscription.userId 
    };
  }

  /**
   * Handle customer.subscription.updated event
   * @private
   */
  async _handleSubscriptionUpdated(stripeSub, event) {
    const stripeSubscriptionId = stripeSub.id;
    
    const subscription = this.billingAdapter.getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
    
    if (!subscription) {
      return { status: 'error', error: 'Subscription not found' };
    }

    // Map Stripe status to our status
    let status = subscription.status;
    if (stripeSub.status === 'active') {
      status = 'active';
    } else if (stripeSub.status === 'past_due') {
      status = 'past_due';
    } else if (stripeSub.status === 'canceled') {
      status = 'cancelled';
    } else if (stripeSub.status === 'trialing') {
      status = 'trialing';
    }

    // Update period from Stripe
    const periodStart = stripeSub.current_period_start 
      ? new Date(stripeSub.current_period_start * 1000).toISOString()
      : null;
    const periodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : null;

    this.billingAdapter.updateSubscription(subscription.userId, {
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd
    });

    this.logger.log(`[SubscriptionService] Subscription updated for user ${subscription.userId}: ${status}`);

    return { 
      status: 'processed', 
      userId: subscription.userId,
      newStatus: status
    };
  }

  /**
   * Handle customer.subscription.deleted event
   * @private
   */
  async _handleSubscriptionDeleted(stripeSub, event) {
    const stripeSubscriptionId = stripeSub.id;
    
    const subscription = this.billingAdapter.getSubscriptionByStripeSubscriptionId(stripeSubscriptionId);
    
    if (!subscription) {
      return { status: 'error', error: 'Subscription not found' };
    }

    // Downgrade to free plan
    this.billingAdapter.updateSubscription(subscription.userId, {
      plan: 'free',
      status: 'active',
      stripeSubscriptionId: null
    });

    this.logger.log(`[SubscriptionService] Subscription deleted for user ${subscription.userId}, downgraded to free`);

    return { 
      status: 'processed', 
      userId: subscription.userId,
      downgraded: true
    };
  }

  // =================== Stats ===================

  /**
   * Get billing statistics
   * 
   * @returns {Object} Billing stats
   */
  getStats() {
    return this.billingAdapter.getStats();
  }

  /**
   * Get subscription counts by plan
   * 
   * @returns {Object} Counts by plan
   */
  getSubscriptionCounts() {
    return this.billingAdapter.countSubscriptionsByPlan();
  }
}

module.exports = { SubscriptionService };
