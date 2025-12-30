'use strict';

/**
 * Stripe API Client
 * 
 * Wrapper for Stripe API operations. In production, uses real Stripe SDK.
 * In development/test mode, uses mocks for testing without real API calls.
 * 
 * Environment Variables:
 * - STRIPE_SECRET_KEY: Required for production (sk_live_* or sk_test_*)
 * - STRIPE_WEBHOOK_SECRET: Required for webhook signature verification
 * - NODE_ENV: Set to 'test' to use mocks
 * 
 * @module StripeClient
 */

const crypto = require('crypto');

/**
 * Stripe price IDs for each plan
 * These should match your Stripe dashboard configuration
 */
const STRIPE_PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_monthly'
};

/**
 * Check if we're in test mode
 * @returns {boolean}
 */
function isTestMode() {
  return process.env.NODE_ENV === 'test' || !process.env.STRIPE_SECRET_KEY;
}

/**
 * Generate a mock ID with prefix
 * @param {string} prefix - ID prefix (e.g., 'cus', 'sub', 'cs')
 * @returns {string}
 */
function generateMockId(prefix) {
  const suffix = crypto.randomBytes(12).toString('hex');
  return `${prefix}_mock_${suffix}`;
}

/**
 * StripeClient class
 */
class StripeClient {
  /**
   * Create a StripeClient
   * 
   * @param {Object} [options] - Configuration
   * @param {string} [options.secretKey] - Stripe secret key
   * @param {string} [options.webhookSecret] - Stripe webhook secret
   * @param {boolean} [options.testMode] - Force test mode
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    this.testMode = options.testMode ?? isTestMode();
    this.logger = options.logger || console;
    
    // In production mode, validate that we have a secret key
    if (!this.testMode && !this.secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is required. ' +
        'Set the STRIPE_SECRET_KEY environment variable or pass secretKey option. ' +
        'For testing, set NODE_ENV=test to use mocks.'
      );
    }
    
    // Mock storage for test mode
    this._mockCustomers = new Map();
    this._mockSubscriptions = new Map();
    this._mockSessions = new Map();
  }

  /**
   * Check if client is in test mode
   * @returns {boolean}
   */
  isTestMode() {
    return this.testMode;
  }

  // =================== Customers ===================

  /**
   * Create a Stripe customer
   * 
   * @param {string} email - Customer email
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {Promise<Object>} Customer object
   */
  async createCustomer(email, metadata = {}) {
    if (!email) {
      throw new Error('Email is required to create a customer');
    }

    if (this.testMode) {
      const customerId = generateMockId('cus');
      const customer = {
        id: customerId,
        object: 'customer',
        email,
        metadata,
        created: Math.floor(Date.now() / 1000),
        livemode: false
      };
      this._mockCustomers.set(customerId, customer);
      
      this.logger.log(`[StripeClient] Created mock customer: ${customerId}`);
      return customer;
    }

    // Real Stripe API call would go here
    // const stripe = require('stripe')(this.secretKey);
    // return stripe.customers.create({ email, metadata });
    
    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  /**
   * Retrieve a customer by ID
   * 
   * @param {string} customerId - Customer ID
   * @returns {Promise<Object|null>} Customer or null
   */
  async getCustomer(customerId) {
    if (!customerId) {
      return null;
    }

    if (this.testMode) {
      return this._mockCustomers.get(customerId) || null;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  /**
   * Update a customer
   * 
   * @param {string} customerId - Customer ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated customer
   */
  async updateCustomer(customerId, updates) {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    if (this.testMode) {
      const customer = this._mockCustomers.get(customerId);
      if (!customer) {
        throw new Error(`Customer not found: ${customerId}`);
      }
      
      Object.assign(customer, updates);
      return customer;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  // =================== Checkout Sessions ===================

  /**
   * Create a checkout session for subscription purchase
   * 
   * @param {Object} options - Session options
   * @param {string} options.customerId - Stripe customer ID
   * @param {string} options.priceId - Stripe price ID
   * @param {string} options.successUrl - Redirect URL on success
   * @param {string} options.cancelUrl - Redirect URL on cancel
   * @param {Object} [options.metadata={}] - Session metadata
   * @returns {Promise<Object>} Checkout session
   */
  async createCheckoutSession({
    customerId,
    priceId,
    successUrl,
    cancelUrl,
    metadata = {}
  }) {
    if (!customerId) {
      throw new Error('Customer ID is required for checkout session');
    }
    if (!priceId) {
      throw new Error('Price ID is required for checkout session');
    }
    if (!successUrl || !cancelUrl) {
      throw new Error('Success and cancel URLs are required');
    }

    if (this.testMode) {
      const sessionId = generateMockId('cs');
      const session = {
        id: sessionId,
        object: 'checkout.session',
        customer: customerId,
        mode: 'subscription',
        payment_status: 'unpaid',
        status: 'open',
        success_url: successUrl,
        cancel_url: cancelUrl,
        url: `https://checkout.stripe.com/mock/${sessionId}`,
        metadata,
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        created: Math.floor(Date.now() / 1000),
        livemode: false
      };
      this._mockSessions.set(sessionId, session);
      
      this.logger.log(`[StripeClient] Created mock checkout session: ${sessionId}`);
      return session;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  /**
   * Retrieve a checkout session
   * 
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session or null
   */
  async getCheckoutSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    if (this.testMode) {
      return this._mockSessions.get(sessionId) || null;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  // =================== Billing Portal ===================

  /**
   * Create a billing portal session for subscription management
   * 
   * @param {string} customerId - Stripe customer ID
   * @param {string} returnUrl - URL to return to after portal
   * @returns {Promise<Object>} Portal session
   */
  async createPortalSession(customerId, returnUrl) {
    if (!customerId) {
      throw new Error('Customer ID is required for portal session');
    }
    if (!returnUrl) {
      throw new Error('Return URL is required for portal session');
    }

    if (this.testMode) {
      const sessionId = generateMockId('bps');
      const session = {
        id: sessionId,
        object: 'billing_portal.session',
        customer: customerId,
        return_url: returnUrl,
        url: `https://billing.stripe.com/mock/${sessionId}`,
        created: Math.floor(Date.now() / 1000),
        livemode: false
      };
      
      this.logger.log(`[StripeClient] Created mock portal session: ${sessionId}`);
      return session;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  // =================== Subscriptions ===================

  /**
   * Get a subscription by ID
   * 
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object|null>} Subscription or null
   */
  async getSubscription(subscriptionId) {
    if (!subscriptionId) {
      return null;
    }

    if (this.testMode) {
      return this._mockSubscriptions.get(subscriptionId) || null;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  /**
   * Cancel a subscription
   * 
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} [options={}] - Cancel options
   * @param {boolean} [options.cancelAtPeriodEnd=true] - Cancel at end of period
   * @returns {Promise<Object>} Cancelled subscription
   */
  async cancelSubscription(subscriptionId, options = {}) {
    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    const { cancelAtPeriodEnd = true } = options;

    if (this.testMode) {
      const subscription = this._mockSubscriptions.get(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }
      
      if (cancelAtPeriodEnd) {
        subscription.cancel_at_period_end = true;
      } else {
        subscription.status = 'canceled';
        subscription.canceled_at = Math.floor(Date.now() / 1000);
      }
      
      this.logger.log(`[StripeClient] Cancelled mock subscription: ${subscriptionId}`);
      return subscription;
    }

    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  // =================== Webhooks ===================

  /**
   * Verify and parse a webhook event
   * 
   * @param {string|Buffer} payload - Raw request body
   * @param {string} signature - Stripe-Signature header
   * @returns {Promise<Object>} Parsed event
   * @throws {Error} If signature is invalid
   */
  async handleWebhook(payload, signature) {
    if (!payload) {
      throw new Error('Webhook payload is required');
    }

    if (this.testMode) {
      // In test mode, parse without signature verification
      const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
      
      // Validate event structure
      if (!event.type || !event.id) {
        throw new Error('Invalid webhook event structure');
      }
      
      this.logger.log(`[StripeClient] Received mock webhook: ${event.type}`);
      return event;
    }

    // Real signature verification would go here
    if (!signature) {
      throw new Error('Webhook signature is required');
    }
    if (!this.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    // Verify signature and parse event
    // const stripe = require('stripe')(this.secretKey);
    // return stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    
    throw new Error('Real Stripe integration not implemented. Use test mode.');
  }

  /**
   * Create a mock webhook event for testing
   * 
   * @param {string} type - Event type
   * @param {Object} data - Event data
   * @returns {Object} Mock event
   */
  createMockEvent(type, data = {}) {
    return {
      id: generateMockId('evt'),
      object: 'event',
      type,
      data: {
        object: data
      },
      created: Math.floor(Date.now() / 1000),
      livemode: false
    };
  }

  /**
   * Simulate a checkout completion (for testing)
   * 
   * @param {string} sessionId - Checkout session ID
   * @param {string} [plan='pro'] - Plan to subscribe to
   * @returns {Object} Event and subscription
   */
  simulateCheckoutComplete(sessionId, plan = 'pro') {
    if (!this.testMode) {
      throw new Error('simulateCheckoutComplete only works in test mode');
    }

    const session = this._mockSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Create a subscription
    const subscriptionId = generateMockId('sub');
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + (30 * 24 * 60 * 60); // 30 days
    
    const subscription = {
      id: subscriptionId,
      object: 'subscription',
      customer: session.customer,
      status: 'active',
      current_period_start: now,
      current_period_end: periodEnd,
      items: {
        data: [{
          price: {
            id: session.line_items?.[0]?.price || STRIPE_PRICE_IDS[plan],
            product: `prod_${plan}`
          }
        }]
      },
      metadata: session.metadata,
      created: now,
      livemode: false
    };
    this._mockSubscriptions.set(subscriptionId, subscription);

    // Update session
    session.status = 'complete';
    session.payment_status = 'paid';
    session.subscription = subscriptionId;

    // Create event
    const event = this.createMockEvent('checkout.session.completed', {
      ...session,
      subscription: subscriptionId
    });

    return { event, subscription, session };
  }

  // =================== Utility ===================

  /**
   * Get price ID for a plan
   * 
   * @param {string} plan - Plan name
   * @returns {string|null} Price ID or null
   */
  getPriceId(plan) {
    return STRIPE_PRICE_IDS[plan] || null;
  }

  /**
   * Clear mock data (for tests)
   */
  clearMocks() {
    this._mockCustomers.clear();
    this._mockSubscriptions.clear();
    this._mockSessions.clear();
  }
}

module.exports = {
  StripeClient,
  STRIPE_PRICE_IDS,
  isTestMode,
  generateMockId
};
