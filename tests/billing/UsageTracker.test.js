'use strict';

/**
 * Tests for UsageTracker
 * 
 * @module tests/billing/UsageTracker
 */

const Database = require('better-sqlite3');
const { UsageTracker, METRICS } = require('../../src/billing');
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
}

describe('UsageTracker', () => {
  let db;
  let adapter;
  let tracker;

  beforeEach(() => {
    db = new Database(':memory:');
    createUsersTable(db);
    ensureBillingSchema(db);
    adapter = createBillingAdapter(db);
    tracker = new UsageTracker({
      billingAdapter: adapter,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    // Create a test subscription with pro plan
    adapter.createSubscription({ userId: 1, plan: 'pro' });
    adapter.createSubscription({ userId: 2, plan: 'free' });
    adapter.createSubscription({ userId: 3, plan: 'enterprise' });
  });

  afterEach(() => {
    db.close();
  });

  describe('increment', () => {
    test('increments usage and returns result', () => {
      const result = tracker.increment(1, METRICS.API_CALLS, 5);
      
      // Returns { userId, metric, count, period }
      expect(result.count).toBe(5);
      expect(result.metric).toBe(METRICS.API_CALLS);
      expect(result.userId).toBe(1);
    });

    test('accumulates multiple increments', () => {
      tracker.increment(1, METRICS.API_CALLS, 10);
      const result = tracker.increment(1, METRICS.API_CALLS, 15);
      
      expect(result.count).toBe(25);
    });

    test('increments by 1 by default', () => {
      tracker.increment(1, METRICS.EXPORTS);
      const result = tracker.increment(1, METRICS.EXPORTS);
      
      expect(result.count).toBe(2);
    });
  });

  describe('getUsage', () => {
    test('returns null for unused metric', () => {
      const usage = tracker.getUsage(1, METRICS.EXPORTS);
      expect(usage).toBeNull();
    });

    test('returns usage object after increment', () => {
      tracker.increment(1, METRICS.API_CALLS, 100);
      
      const usage = tracker.getUsage(1, METRICS.API_CALLS);
      expect(usage).not.toBeNull();
      expect(usage.count).toBe(100);
    });
  });

  describe('getAllUsage', () => {
    test('returns all metrics for user', () => {
      tracker.increment(1, METRICS.API_CALLS, 100);
      tracker.increment(1, METRICS.EXPORTS, 5);
      
      const all = tracker.getAllUsage(1);
      expect(all.usage[METRICS.API_CALLS]).toBe(100);
      expect(all.usage[METRICS.EXPORTS]).toBe(5);
    });
  });

  describe('resetUsage', () => {
    test('resets usage for period', () => {
      tracker.increment(1, METRICS.API_CALLS, 500);
      
      tracker.resetUsage(1);
      
      const usage = tracker.getUsage(1, METRICS.API_CALLS);
      expect(usage).toBeNull();
    });
  });

  describe('checkLimit', () => {
    test('returns allowed when under limit', () => {
      tracker.increment(1, METRICS.API_CALLS, 100);
      
      const check = tracker.checkLimit(1, METRICS.API_CALLS);
      expect(check.allowed).toBe(true);
      expect(check.warning).toBe(false);
    });

    test('returns warning near limit', () => {
      // Pro plan: 50000 * 0.8 = 40000 is warning threshold
      tracker.increment(1, METRICS.API_CALLS, 45000);
      
      const check = tracker.checkLimit(1, METRICS.API_CALLS);
      expect(check.allowed).toBe(true);
      expect(check.warning).toBe(true);
    });

    test('returns not allowed over limit', () => {
      tracker.increment(2, METRICS.API_CALLS, 1001); // Free plan limit is 1000
      
      const check = tracker.checkLimit(2, METRICS.API_CALLS);
      expect(check.allowed).toBe(false);
    });

    test('unlimited plan never blocks', () => {
      tracker.increment(3, METRICS.API_CALLS, 1000000);
      
      const check = tracker.checkLimit(3, METRICS.API_CALLS);
      expect(check.allowed).toBe(true);
      expect(check.unlimited).toBe(true);
    });
  });

  describe('track', () => {
    test('tracks usage and returns result', () => {
      const result = tracker.track(1, METRICS.API_CALLS);
      
      // Returns { tracked, userId, metric, count, period, limit, remaining, percentage, warning }
      expect(result.tracked).toBe(true);
      expect(result.count).toBe(1);
    });

    test('tracks by specified amount', () => {
      const result = tracker.track(1, METRICS.EXPORTS, 5);
      
      expect(result.count).toBe(5);
    });

    test('throws when limit exceeded', () => {
      // Use all of free user's limit
      tracker.increment(2, METRICS.API_CALLS, 1000);
      
      expect(() => {
        tracker.track(2, METRICS.API_CALLS, 1);
      }).toThrow('Usage limit exceeded');
    });
  });

  describe('getUsageSummary', () => {
    test('returns summary for all metrics', () => {
      tracker.increment(1, METRICS.API_CALLS, 1000);
      tracker.increment(1, METRICS.EXPORTS, 50);
      
      const summary = tracker.getUsageSummary(1);
      
      expect(summary).toBeDefined();
      expect(summary.metrics).toBeDefined();
      expect(summary.metrics[METRICS.API_CALLS]).toBeDefined();
      expect(summary.metrics[METRICS.API_CALLS].current).toBe(1000);
      expect(summary.metrics[METRICS.API_CALLS].limit).toBe(50000); // Pro limit
    });
  });

  describe('Free plan limits', () => {
    test('free plan has 1000 API call limit', () => {
      const check1 = tracker.checkLimit(2, METRICS.API_CALLS);
      expect(check1.limit).toBe(1000);
      
      tracker.increment(2, METRICS.API_CALLS, 1001);
      
      const check2 = tracker.checkLimit(2, METRICS.API_CALLS);
      expect(check2.allowed).toBe(false);
    });

    test('free plan has 10 export limit', () => {
      const check = tracker.checkLimit(2, METRICS.EXPORTS);
      expect(check.limit).toBe(10);
    });
  });
});
