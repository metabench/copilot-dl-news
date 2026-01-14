'use strict';

/**
 * Tests for billingAdapter
 * 
 * @module tests/billing/billingAdapter
 */

const Database = require('better-sqlite3');
const {
  createBillingAdapter,
  ensureBillingSchema,
  PLANS,
  METRICS,
  SUBSCRIPTION_STATUS,
  getCurrentPeriod
} = require('../../src/data/db/sqlite/v1/queries/billingAdapter');

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

describe('billingAdapter', () => {
  let db;
  let adapter;

  beforeEach(() => {
    db = new Database(':memory:');
    createUsersTable(db);
    ensureBillingSchema(db);
    adapter = createBillingAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  // =================== Constants ===================
  
  describe('Constants', () => {
    test('PLANS contains expected tiers', () => {
      expect(PLANS.free).toBeDefined();
      expect(PLANS.pro).toBeDefined();
      expect(PLANS.enterprise).toBeDefined();
    });

    test('PLANS have correct pricing', () => {
      expect(PLANS.free.price).toBe(0);
      expect(PLANS.pro.price).toBe(29);
      expect(PLANS.enterprise.price).toBe(199);
    });

    test('PLANS have correct API call limits', () => {
      expect(PLANS.free.apiCalls).toBe(1000);
      expect(PLANS.pro.apiCalls).toBe(50000);
      expect(PLANS.enterprise.apiCalls).toBe(-1); // Unlimited
    });

    test('METRICS has expected values', () => {
      expect(METRICS.API_CALLS).toBe('api_calls');
      expect(METRICS.EXPORTS).toBe('exports');
      expect(METRICS.ALERTS_SENT).toBe('alerts_sent');
    });

    test('SUBSCRIPTION_STATUS has expected values', () => {
      expect(SUBSCRIPTION_STATUS.ACTIVE).toBe('active');
      expect(SUBSCRIPTION_STATUS.CANCELLED).toBe('cancelled');
      expect(SUBSCRIPTION_STATUS.PAST_DUE).toBe('past_due');
    });
  });

  // =================== getCurrentPeriod ===================

  describe('getCurrentPeriod', () => {
    test('returns YYYY-MM format', () => {
      const period = getCurrentPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });

    test('returns correct current month', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(getCurrentPeriod()).toBe(expected);
    });
  });

  // =================== Subscriptions ===================

  describe('Subscription operations', () => {
    const testUserId = 1;

    test('createSubscription creates a new subscription', () => {
      const result = adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      
      expect(result.id).toBeDefined();
    });

    test('getSubscriptionByUserId returns null for non-existent user', () => {
      const sub = adapter.getSubscriptionByUserId(999);
      expect(sub).toBeNull();
    });

    test('getSubscriptionByUserId returns created subscription', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      
      const sub = adapter.getSubscriptionByUserId(testUserId);
      expect(sub).not.toBeNull();
      expect(sub.plan).toBe('pro');
      expect(sub.status).toBe('active');
      expect(sub.userId).toBe(testUserId);
    });

    test('updateSubscription changes plan', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'free' });
      
      const result = adapter.updateSubscription(testUserId, { plan: 'enterprise' });
      expect(result.changes).toBe(1);
      
      const sub = adapter.getSubscriptionByUserId(testUserId);
      expect(sub.plan).toBe('enterprise');
    });

    test('updateSubscription changes status', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      
      adapter.updateSubscription(testUserId, { status: 'cancelled' });
      
      const sub = adapter.getSubscriptionByUserId(testUserId);
      expect(sub.status).toBe('cancelled');
    });

    test('updateSubscription sets Stripe IDs', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      
      adapter.updateSubscription(testUserId, { 
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_456'
      });
      
      const sub = adapter.getSubscriptionByUserId(testUserId);
      expect(sub.stripeCustomerId).toBe('cus_123');
      expect(sub.stripeSubscriptionId).toBe('sub_456');
    });

    test('deleteSubscription removes subscription', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      
      const result = adapter.deleteSubscription(testUserId);
      expect(result.changes).toBe(1);
      
      const sub = adapter.getSubscriptionByUserId(testUserId);
      expect(sub).toBeNull();
    });

    test('getSubscriptionByStripeSubscriptionId finds by stripe sub ID', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      adapter.updateSubscription(testUserId, { stripeSubscriptionId: 'sub_test' });
      
      const sub = adapter.getSubscriptionByStripeSubscriptionId('sub_test');
      expect(sub).not.toBeNull();
      expect(sub.userId).toBe(testUserId);
    });

    test('getSubscriptionByStripeCustomerId finds by customer ID', () => {
      adapter.createSubscription({ userId: testUserId, plan: 'pro' });
      adapter.updateSubscription(testUserId, { stripeCustomerId: 'cus_test' });
      
      const sub = adapter.getSubscriptionByStripeCustomerId('cus_test');
      expect(sub).not.toBeNull();
      expect(sub.userId).toBe(testUserId);
    });
  });

  // =================== Usage Tracking ===================

  describe('Usage operations', () => {
    const testUserId = 2;

    test('getUsage returns null for new user', () => {
      const usage = adapter.getUsage(testUserId, METRICS.API_CALLS);
      expect(usage).toBeNull();
    });

    test('incrementUsage increases count', () => {
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 5);
      
      const usage = adapter.getUsage(testUserId, METRICS.API_CALLS);
      expect(usage.count).toBe(5);
    });

    test('incrementUsage accumulates', () => {
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 10);
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 15);
      
      const usage = adapter.getUsage(testUserId, METRICS.API_CALLS);
      expect(usage.count).toBe(25);
    });

    test('incrementUsage defaults to 1', () => {
      adapter.incrementUsage(testUserId, METRICS.EXPORTS);
      adapter.incrementUsage(testUserId, METRICS.EXPORTS);
      
      const usage = adapter.getUsage(testUserId, METRICS.EXPORTS);
      expect(usage.count).toBe(2);
    });

    test('getUserUsageForPeriod returns all metrics', () => {
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 100);
      adapter.incrementUsage(testUserId, METRICS.EXPORTS, 5);
      adapter.incrementUsage(testUserId, METRICS.ALERTS_SENT, 10);
      
      const allUsage = adapter.getUserUsageForPeriod(testUserId);
      expect(allUsage.length).toBe(3);
    });

    test('resetUsage clears metrics for period', () => {
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 500);
      adapter.incrementUsage(testUserId, METRICS.EXPORTS, 50);
      
      adapter.resetUsage(testUserId);
      
      const usage = adapter.getUsage(testUserId, METRICS.API_CALLS);
      expect(usage).toBeNull();
    });

    test('resetAllUserUsage clears all usage', () => {
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 100, '2024-01');
      adapter.incrementUsage(testUserId, METRICS.API_CALLS, 100, '2024-02');
      
      adapter.resetAllUserUsage(testUserId);
      
      const allUsage = adapter.getAllUserUsage(testUserId);
      expect(allUsage.length).toBe(0);
    });
  });

  // =================== Billing Events ===================

  describe('Event operations', () => {
    const testUserId = 3;

    test('logBillingEvent stores event', () => {
      const result = adapter.logBillingEvent({
        userId: testUserId,
        eventType: 'subscription.created',
        data: { plan: 'pro', amount: 2900 }
      });
      
      expect(result.id).toBeDefined();
    });

    test('getUserBillingEvents returns user events', () => {
      adapter.logBillingEvent({
        userId: testUserId,
        eventType: 'checkout.completed',
        stripeEventId: 'evt_123'
      });
      
      adapter.logBillingEvent({
        userId: testUserId,
        eventType: 'invoice.paid',
        stripeEventId: 'evt_456'
      });
      
      const events = adapter.getUserBillingEvents(testUserId);
      expect(events).toHaveLength(2);
    });

    test('getUserBillingEvents respects limit', () => {
      for (let i = 0; i < 10; i++) {
        adapter.logBillingEvent({
          userId: testUserId,
          eventType: 'test.event',
          data: { index: i }
        });
      }
      
      const events = adapter.getUserBillingEvents(testUserId, 5);
      expect(events).toHaveLength(5);
    });

    test('isEventProcessed detects duplicates', () => {
      adapter.logBillingEvent({
        userId: testUserId,
        eventType: 'invoice.paid',
        stripeEventId: 'evt_unique'
      });
      
      expect(adapter.isEventProcessed('evt_unique')).toBe(true);
      expect(adapter.isEventProcessed('evt_other')).toBe(false);
    });
  });

  // =================== Stats ===================

  describe('Statistics', () => {
    test('countSubscriptionsByPlan returns counts by plan', () => {
      adapter.createSubscription({ userId: 1, plan: 'free' });
      adapter.createSubscription({ userId: 2, plan: 'pro' });
      adapter.createSubscription({ userId: 3, plan: 'pro' });
      adapter.createSubscription({ userId: 4, plan: 'enterprise' });
      
      const counts = adapter.countSubscriptionsByPlan();
      expect(counts.free).toBe(1);
      expect(counts.pro).toBe(2);
      expect(counts.enterprise).toBe(1);
    });

    test('listActiveSubscriptions returns active subs', () => {
      adapter.createSubscription({ userId: 1, plan: 'pro' });
      adapter.createSubscription({ userId: 2, plan: 'enterprise' });
      
      const active = adapter.listActiveSubscriptions();
      expect(active).toHaveLength(2);
    });
  });
});

