'use strict';

/**
 * Billing Module
 * 
 * Exports all billing-related services and utilities:
 * - SubscriptionService: Subscription lifecycle management
 * - StripeClient: Stripe API integration (mocked in tests)
 * - UsageTracker: API usage tracking
 * - FeatureGate: Plan-based access control
 * 
 * @module billing
 */

const { SubscriptionService } = require('./SubscriptionService');
const { StripeClient, STRIPE_PRICE_IDS, isTestMode } = require('./StripeClient');
const { UsageTracker, METRICS } = require('./UsageTracker');
const { FeatureGate, DEFAULTS } = require('./FeatureGate');

/**
 * Plan tier definitions (imported from billingAdapter for convenience)
 */
const PLANS = {
  free: {
    name: 'free',
    price: 0,
    apiCalls: 1000,
    exports: 10,
    workspaces: 1,
    alerts: 5
  },
  pro: {
    name: 'pro',
    price: 29,
    apiCalls: 50000,
    exports: 500,
    workspaces: 5,
    alerts: 100
  },
  enterprise: {
    name: 'enterprise',
    price: 199,
    apiCalls: -1,  // unlimited
    exports: -1,
    workspaces: -1,
    alerts: -1
  }
};

/**
 * Create a complete billing system with all services wired together
 * 
 * @param {Object} options - Configuration
 * @param {Object} options.billingAdapter - Billing database adapter
 * @param {Object} [options.stripeConfig] - Stripe configuration
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Billing services
 */
function createBillingSystem(options = {}) {
  const { billingAdapter, stripeConfig = {}, logger = console } = options;
  
  if (!billingAdapter) {
    throw new Error('createBillingSystem requires a billingAdapter');
  }

  // Create Stripe client
  const stripeClient = new StripeClient({
    secretKey: stripeConfig.secretKey,
    webhookSecret: stripeConfig.webhookSecret,
    testMode: stripeConfig.testMode,
    logger
  });

  // Create usage tracker
  const usageTracker = new UsageTracker({
    billingAdapter,
    logger
  });

  // Create subscription service
  const subscriptionService = new SubscriptionService({
    billingAdapter,
    stripeClient,
    usageTracker,
    logger
  });

  // Create feature gate
  const featureGate = new FeatureGate({
    billingAdapter,
    usageTracker,
    subscriptionService,
    logger
  });

  return {
    stripeClient,
    usageTracker,
    subscriptionService,
    featureGate,
    billingAdapter
  };
}

module.exports = {
  // Services
  SubscriptionService,
  StripeClient,
  UsageTracker,
  FeatureGate,
  
  // Factory
  createBillingSystem,
  
  // Constants
  PLANS,
  METRICS,
  STRIPE_PRICE_IDS,
  DEFAULTS,
  isTestMode
};
