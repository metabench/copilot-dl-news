'use strict';

/**
 * Tests for SubscriptionService
 * 
 * @module tests/billing/SubscriptionService
 */

const Database = require('better-sqlite3');
const { 
  SubscriptionService, 
  StripeClient, 
  UsageTracker,
  PLANS 
} = require('../../src/billing');
const { 
  createBillingAdapter, 
  ensureBillingSchema
} = require('../../src/db/sqlite/v1/queries/billingAdapter');

/**
 * Create minimal users table for FK constraints
 */
function createUsersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Create test users
  db.exec(`INSERT INTO users (id, email) VALUES (1, 'user1@test.com');`);
  db.exec(`INSERT INTO users (id, email) VALUES (2, 'user2@test.com');`);
  db.exec(`INSERT INTO users (id, email) VALUES (3, 'user3@test.com');`);
  db.exec(`INSERT INTO users (id, email) VALUES (4, 'user4@test.com');`);
}

describe('SubscriptionService', () => {
  let db;
  let adapter;
  let stripeClient;
  let usageTracker;
  let service;
  const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    db = new Database(':memory:');
    createUsersTable(db);
    ensureBillingSchema(db);
    adapter = createBillingAdapter(db);
    
    stripeClient = new StripeClient({
      secretKey: null, // Test mode
      logger: mockLogger
    });
    
    usageTracker = new UsageTracker({
      billingAdapter: adapter,
      logger: mockLogger
    });
    
    service = new SubscriptionService({
      billingAdapter: adapter,
      stripeClient,
      usageTracker,
      logger: mockLogger
    });
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
  });

  describe('getSubscription', () => {
    test('returns subscription with limits', () => {
      // First call creates auto free subscription
      const sub = service.getSubscription(1);
      
      expect(sub).toBeDefined();
      expect(sub.plan).toBe('free');
      expect(sub.status).toBe('active');
      expect(sub.limits).toBeDefined();
      expect(sub.limits.apiCalls).toBe(PLANS.free.apiCalls);
    });

    test('returns existing subscription', () => {
      // First get creates it
      service.getSubscription(1);
      
      // Now update to pro using adapter directly
      adapter.updateSubscription(1, { plan: 'pro' });
      
      const sub = service.getSubscription(1);
      
      expect(sub.plan).toBe('pro');
      expect(sub.limits.apiCalls).toBe(PLANS.pro.apiCalls);
    });

    test('includes current usage', () => {
      service.getSubscription(1);
      usageTracker.increment(1, 'api_calls', 100);
      
      const sub = service.getSubscription(1);
      
      expect(sub.usage).toBeDefined();
      expect(sub.usage.api_calls).toBe(100);
    });
  });

  describe('createSubscription', () => {
    test('creates new subscription', () => {
      const result = service.createSubscription(1, 'pro');
      
      // Returns subscription, not { success, subscription }
      expect(result.plan).toBe('pro');
    });

    test('throws if subscription already exists', () => {
      service.createSubscription(1, 'free');
      
      expect(() => {
        service.createSubscription(1, 'pro');
      }).toThrow('Subscription already exists');
    });
  });

  describe('updateSubscription', () => {
    test('updates plan', () => {
      service.createSubscription(1, 'free');
      
      // updateSubscription(userId, plan, options)
      const result = service.updateSubscription(1, 'enterprise');
      
      expect(result.plan).toBe('enterprise');
    });
  });

  describe('cancelSubscription', () => {
    test('cancels paid subscription', async () => {
      service.createSubscription(1, 'pro');
      
      const result = await service.cancelSubscription(1);
      
      expect(result).toBeDefined();
    });

    test('throws on free plan cancel', async () => {
      service.createSubscription(1, 'free');
      
      await expect(
        service.cancelSubscription(1)
      ).rejects.toThrow('Cannot cancel free plan');
    });
  });

  describe('ensureStripeCustomer', () => {
    test('creates customer if none exists', async () => {
      service.createSubscription(1, 'free');
      
      const customerId = await service.ensureStripeCustomer(1, 'test@example.com');
      
      expect(customerId).toMatch(/^cus_mock_/);
    });

    test('returns existing customer if present', async () => {
      service.createSubscription(1, 'free');
      
      const first = await service.ensureStripeCustomer(1, 'test@example.com');
      const second = await service.ensureStripeCustomer(1, 'test@example.com');
      
      expect(first).toBe(second);
    });
  });

  describe('createCheckoutSession', () => {
    test('creates checkout session', async () => {
      service.createSubscription(1, 'free');
      await service.ensureStripeCustomer(1, 'test@example.com');
      
      const session = await service.createCheckoutSession(1, 'pro', {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      });
      
      expect(session.sessionId).toBeDefined();
      expect(session.url).toBeDefined();
    });

    test('throws without Stripe customer', async () => {
      service.createSubscription(1, 'free');
      
      await expect(
        service.createCheckoutSession(1, 'pro', {
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        })
      ).rejects.toThrow();
    });
  });

  describe('processWebhookEvent', () => {
    test('processes checkout.session.completed', async () => {
      service.createSubscription(1, 'free');
      await service.ensureStripeCustomer(1, 'test@example.com');
      
      // Get the customer ID and create a checkout session
      const session = await service.createCheckoutSession(1, 'pro', {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      });
      
      // Simulate checkout completion
      const { event } = stripeClient.simulateCheckoutComplete(session.sessionId, 'pro');
      
      const result = await service.processWebhookEvent(event);
      
      expect(result.status).toBe('processed');
      
      const updated = service.getSubscription(1);
      expect(updated.plan).toBe('pro');
    });

    test('skips duplicate events', async () => {
      service.createSubscription(1, 'free');
      await service.ensureStripeCustomer(1, 'test@example.com');
      
      const session = await service.createCheckoutSession(1, 'pro', {
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      });
      
      const { event } = stripeClient.simulateCheckoutComplete(session.sessionId, 'pro');
      
      // Process twice
      await service.processWebhookEvent(event);
      const result = await service.processWebhookEvent(event);
      
      expect(result.status).toBe('duplicate');
    });
  });

  describe('getAllPlans', () => {
    test('returns all plan definitions', () => {
      const plans = service.getAllPlans();
      
      expect(plans.free).toBeDefined();
      expect(plans.pro).toBeDefined();
      expect(plans.enterprise).toBeDefined();
    });
  });

  describe('getStats', () => {
    test('returns subscription statistics', () => {
      service.createSubscription(1, 'free');
      service.createSubscription(2, 'pro');
      service.createSubscription(3, 'pro');
      
      const stats = service.getStats();
      
      expect(stats.totalSubscriptions).toBe(3);
    });
  });

  describe('getSubscriptionCounts', () => {
    test('returns counts by plan', () => {
      service.createSubscription(1, 'free');
      service.createSubscription(2, 'pro');
      service.createSubscription(3, 'pro');
      service.createSubscription(4, 'enterprise');
      
      const counts = service.getSubscriptionCounts();
      
      expect(counts.free).toBe(1);
      expect(counts.pro).toBe(2);
      expect(counts.enterprise).toBe(1);
    });
  });
});
