'use strict';

/**
 * Tests for FeatureGate
 * 
 * @module tests/billing/FeatureGate
 */

const Database = require('better-sqlite3');
const { FeatureGate, UsageTracker, METRICS } = require('../../src/billing');
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
  db.exec(`INSERT INTO users (id, email) VALUES (1, 'free@test.com');`);
  db.exec(`INSERT INTO users (id, email) VALUES (2, 'pro@test.com');`);
  db.exec(`INSERT INTO users (id, email) VALUES (3, 'enterprise@test.com');`);
}

describe('FeatureGate', () => {
  let db;
  let adapter;
  let tracker;
  let gate;

  beforeEach(() => {
    db = new Database(':memory:');
    createUsersTable(db);
    ensureBillingSchema(db);
    adapter = createBillingAdapter(db);
    tracker = new UsageTracker({
      billingAdapter: adapter,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });
    gate = new FeatureGate({
      billingAdapter: adapter,
      usageTracker: tracker,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    // Create test subscriptions
    adapter.createSubscription({ userId: 1, plan: 'free' });
    adapter.createSubscription({ userId: 2, plan: 'pro' });
    adapter.createSubscription({ userId: 3, plan: 'enterprise' });
  });

  afterEach(() => {
    db.close();
  });

  describe('checkLimit', () => {
    test('returns allowed for under-limit user', () => {
      const result = gate.checkLimit(2, METRICS.API_CALLS);
      
      expect(result.allowed).toBe(true);
      expect(result.status).toBe('ok');
    });

    test('returns warning near limit', () => {
      // Pro limit is 50000, 80% = 40000
      tracker.increment(2, METRICS.API_CALLS, 42000);
      
      const result = gate.checkLimit(2, METRICS.API_CALLS);
      
      expect(result.allowed).toBe(true);
      expect(result.status).toBe('warning');
    });

    test('returns grace status on first over-limit check', () => {
      tracker.increment(1, METRICS.API_CALLS, 1001); // Free plan: 1000 limit
      
      // First check over limit auto-starts grace period
      const result = gate.checkLimit(1, METRICS.API_CALLS);
      
      // Grace period is auto-started on first exceed
      expect(result.status).toBe('grace');
      expect(result.allowed).toBe(true);
      expect(result.inGracePeriod).toBe(true);
    });
  });

  describe('requirePlanLimit middleware', () => {
    test('creates middleware function', () => {
      const middleware = gate.requirePlanLimit(METRICS.API_CALLS);
      
      expect(typeof middleware).toBe('function');
    });

    test('middleware calls next() when allowed', () => {
      const middleware = gate.requirePlanLimit(METRICS.API_CALLS);
      const req = { user: { id: 2 } }; // Pro user
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
      const next = jest.fn();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('middleware returns 429 after grace period expires (simulated)', () => {
      // Exceed limit first
      tracker.increment(1, METRICS.API_CALLS, 1001);
      
      // Create gate with grace period of 0 hours
      const strictGate = new FeatureGate({
        billingAdapter: adapter,
        usageTracker: tracker,
        gracePeriodHours: 0,
        logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
      });
      
      // First call auto-starts grace period, let it expire immediately
      strictGate.checkLimit(1, METRICS.API_CALLS);
      
      // Second call should be blocked (grace expired with 0 hours)
      const middleware = strictGate.requirePlanLimit(METRICS.API_CALLS);
      const req = { user: { id: 1 } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn(),
        set: jest.fn()
      };
      const next = jest.fn();
      
      middleware(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('attachLimitInfo middleware (via requirePlanLimit)', () => {
    test('attaches limit info to request via blockOnExceed: false', () => {
      const middleware = gate.requirePlanLimit(METRICS.API_CALLS, { blockOnExceed: false });
      const req = { user: { id: 2 } };
      const res = { set: jest.fn() };
      const next = jest.fn();
      
      middleware(req, res, next);
      
      // The limit info is attached to req when blockOnExceed: false
      expect(next).toHaveBeenCalled();
    });
  });

  describe('trackUsage middleware', () => {
    test('creates tracking middleware', () => {
      const middleware = gate.trackUsage(METRICS.API_CALLS);
      expect(typeof middleware).toBe('function');
    });

    test('middleware calls next', () => {
      const middleware = gate.trackUsage(METRICS.API_CALLS);
      const req = { user: { id: 2 } };
      
      // Mock res with EventEmitter-like on method
      const finishCallback = jest.fn();
      const res = { 
        set: jest.fn(),
        statusCode: 200,
        on: jest.fn((event, cb) => {
          if (event === 'finish') finishCallback.mockImplementation(cb);
        })
      };
      const next = jest.fn();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    test('returns status for all metrics', () => {
      tracker.increment(2, METRICS.API_CALLS, 1000);
      tracker.increment(2, METRICS.EXPORTS, 50);
      
      const status = gate.getStatus(2);
      
      expect(status).toBeDefined();
      expect(status.metrics).toBeDefined();
      expect(status.metrics[METRICS.API_CALLS]).toBeDefined();
      expect(status.metrics[METRICS.API_CALLS].current).toBe(1000);
    });
  });

  describe('Grace period', () => {
    test('startGracePeriod returns grace period info', () => {
      const result = gate.startGracePeriod(1, METRICS.API_CALLS);
      
      expect(result.userId).toBe(1);
      expect(result.metric).toBe(METRICS.API_CALLS);
      expect(result.startedAt).toBeDefined();
      expect(result.endsAt).toBeDefined();
    });
  });

  describe('Enterprise unlimited', () => {
    test('enterprise user never hits limits', () => {
      tracker.increment(3, METRICS.API_CALLS, 1000000);
      
      const result = gate.checkLimit(3, METRICS.API_CALLS);
      
      expect(result.allowed).toBe(true);
      expect(result.status).toBe('unlimited');
    });
  });

  describe('hasFeature', () => {
    test('free user has basic features', () => {
      expect(gate.hasFeature(1, 'basic_search')).toBe(true);
      expect(gate.hasFeature(1, 'basic_export')).toBe(true);
    });

    test('free user lacks pro features', () => {
      expect(gate.hasFeature(1, 'advanced_search')).toBe(false);
      expect(gate.hasFeature(1, 'bulk_export')).toBe(false);
    });

    test('pro user has pro features', () => {
      expect(gate.hasFeature(2, 'advanced_search')).toBe(true);
      expect(gate.hasFeature(2, 'bulk_export')).toBe(true);
    });

    test('enterprise user has all features', () => {
      expect(gate.hasFeature(3, 'sso')).toBe(true);
      expect(gate.hasFeature(3, 'custom_integrations')).toBe(true);
    });
  });
});
