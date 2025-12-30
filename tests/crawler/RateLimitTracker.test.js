'use strict';

/**
 * RateLimitTracker Tests
 * 
 * Tests the rate limit tracking and adaptive backoff functionality.
 * Run with: npm run test:by-path tests/crawler/RateLimitTracker.test.js
 */

const { RateLimitTracker } = require('../../src/crawler/RateLimitTracker');

describe('RateLimitTracker', () => {
  let tracker;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    tracker = new RateLimitTracker({
      defaultIntervalMs: 1000,
      maxIntervalMs: 60000,
      minIntervalMs: 100,
      successStreakThreshold: 5,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultTracker = new RateLimitTracker();
      expect(defaultTracker.defaultIntervalMs).toBe(1000);
      expect(defaultTracker.maxIntervalMs).toBe(60000);
    });

    it('should accept custom options', () => {
      const customTracker = new RateLimitTracker({
        defaultIntervalMs: 2000,
        maxIntervalMs: 30000,
        minIntervalMs: 500
      });
      expect(customTracker.defaultIntervalMs).toBe(2000);
      expect(customTracker.maxIntervalMs).toBe(30000);
      expect(customTracker.minIntervalMs).toBe(500);
    });
  });

  describe('recordSuccess', () => {
    it('should track successful requests', () => {
      tracker.recordSuccess('example.com');
      
      const state = tracker.getDomainState('example.com');
      expect(state.consecutiveSuccess).toBe(1);
      expect(state.consecutiveFails).toBe(0);
      expect(state.totalRequests).toBe(1);
    });

    it('should reset consecutive fails on success', () => {
      // Simulate some failures first
      tracker.recordFailure('example.com', 'timeout');
      tracker.recordFailure('example.com', 'timeout');
      
      tracker.recordSuccess('example.com');
      
      const state = tracker.getDomainState('example.com');
      expect(state.consecutiveSuccess).toBe(1);
      expect(state.consecutiveFails).toBe(0);
    });

    it('should reduce interval after success streak', () => {
      // First, inflate the interval with a rate limit
      tracker.recordRateLimit('example.com', 429);
      const stateAfterLimit = tracker.getDomainState('example.com');
      expect(stateAfterLimit.currentIntervalMs).toBeGreaterThan(1000);

      // Now record enough successes to trigger reduction
      for (let i = 0; i < 6; i++) {
        tracker.recordSuccess('example.com');
      }

      const stateAfterSuccesses = tracker.getDomainState('example.com');
      expect(stateAfterSuccesses.currentIntervalMs).toBeLessThan(stateAfterLimit.currentIntervalMs);
    });

    it('should emit success event', () => {
      const eventHandler = jest.fn();
      tracker.on('success', eventHandler);

      tracker.recordSuccess('example.com');

      expect(eventHandler).toHaveBeenCalledWith({
        domain: 'example.com',
        interval: expect.any(Number)
      });
    });
  });

  describe('recordRateLimit', () => {
    it('should increase interval on rate limit', () => {
      tracker.recordRateLimit('example.com', 429);

      const state = tracker.getDomainState('example.com');
      expect(state.currentIntervalMs).toBe(2000); // Default * 2
      expect(state.rateLimitHits).toBe(1);
    });

    it('should apply exponential backoff', () => {
      tracker.recordRateLimit('example.com', 429);
      tracker.recordRateLimit('example.com', 429);
      tracker.recordRateLimit('example.com', 429);

      const state = tracker.getDomainState('example.com');
      expect(state.currentIntervalMs).toBe(8000); // 1000 * 2 * 2 * 2
      expect(state.rateLimitHits).toBe(3);
    });

    it('should cap at maxIntervalMs', () => {
      // Keep hitting rate limits
      for (let i = 0; i < 20; i++) {
        tracker.recordRateLimit('example.com', 429);
      }

      const state = tracker.getDomainState('example.com');
      expect(state.currentIntervalMs).toBe(60000);
    });

    it('should track 403 as rate limit', () => {
      tracker.recordRateLimit('example.com', 403);

      const state = tracker.getDomainState('example.com');
      expect(state.rateLimitHits).toBe(1);
      expect(state.currentIntervalMs).toBe(2000);
    });

    it('should emit rateLimit event', () => {
      const eventHandler = jest.fn();
      tracker.on('rateLimit', eventHandler);

      tracker.recordRateLimit('example.com', 429);

      expect(eventHandler).toHaveBeenCalledWith({
        domain: 'example.com',
        statusCode: 429,
        interval: 2000
      });
    });

    it('should respect Retry-After header (seconds)', () => {
      const newInterval = tracker.recordRateLimit('example.com', 429, {
        'retry-after': '30'
      });

      expect(newInterval).toBe(30000);
      const state = tracker.getDomainState('example.com');
      expect(state.currentIntervalMs).toBe(30000);
    });

    it('should handle Retry-After header (date)', () => {
      const futureDate = new Date(Date.now() + 10000).toUTCString();
      const newInterval = tracker.recordRateLimit('example.com', 429, {
        'Retry-After': futureDate
      });

      // Should be approximately 10 seconds
      expect(newInterval).toBeGreaterThan(9000);
      expect(newInterval).toBeLessThan(11000);
    });

    it('should log warning on rate limit', () => {
      tracker.recordRateLimit('example.com', 429);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('example.com')
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('429')
      );
    });
  });

  describe('recordFailure', () => {
    it('should track failures', () => {
      tracker.recordFailure('example.com', 'connection timeout');

      const state = tracker.getDomainState('example.com');
      expect(state.consecutiveFails).toBe(1);
      expect(state.totalFailures).toBe(1);
    });

    it('should apply mild backoff after consecutive failures', () => {
      tracker.recordFailure('example.com', 'timeout');
      tracker.recordFailure('example.com', 'timeout');
      tracker.recordFailure('example.com', 'timeout');

      const state = tracker.getDomainState('example.com');
      expect(state.currentIntervalMs).toBe(1500); // 1000 * 1.5
    });

    it('should emit failure event', () => {
      const eventHandler = jest.fn();
      tracker.on('failure', eventHandler);

      const error = new Error('Connection refused');
      tracker.recordFailure('example.com', error);

      expect(eventHandler).toHaveBeenCalledWith({
        domain: 'example.com',
        error: 'Connection refused',
        interval: expect.any(Number)
      });
    });
  });

  describe('getDelay', () => {
    it('should return 0 for unknown domains', () => {
      const delay = tracker.getDelay('unknown.com');
      expect(delay).toBe(0);
    });

    it('should return remaining delay since last request', async () => {
      tracker.recordSuccess('example.com');
      
      // Immediately after request, delay should be close to interval
      const delay = tracker.getDelay('example.com');
      expect(delay).toBeGreaterThan(900);
      expect(delay).toBeLessThanOrEqual(1000);
    });

    it('should return 0 after interval has passed', async () => {
      // Create tracker with very short interval for testing
      const fastTracker = new RateLimitTracker({
        defaultIntervalMs: 50,
        logger: mockLogger
      });

      fastTracker.recordSuccess('example.com');
      
      // Wait for interval to pass
      await new Promise(r => setTimeout(r, 60));
      
      const delay = fastTracker.getDelay('example.com');
      expect(delay).toBe(0);
    });
  });

  describe('getInterval', () => {
    it('should return default for unknown domains', () => {
      const interval = tracker.getInterval('unknown.com');
      expect(interval).toBe(1000);
    });

    it('should return current interval for tracked domains', () => {
      tracker.recordRateLimit('example.com', 429);
      const interval = tracker.getInterval('example.com');
      expect(interval).toBe(2000);
    });
  });

  describe('setInterval', () => {
    it('should manually set interval', () => {
      tracker.setInterval('example.com', 5000);
      expect(tracker.getInterval('example.com')).toBe(5000);
    });

    it('should clamp to min/max', () => {
      tracker.setInterval('example.com', 10);
      expect(tracker.getInterval('example.com')).toBe(100);

      tracker.setInterval('example.com', 100000);
      expect(tracker.getInterval('example.com')).toBe(60000);
    });

    it('should emit intervalAdjusted event', () => {
      const eventHandler = jest.fn();
      tracker.on('intervalAdjusted', eventHandler);

      tracker.setInterval('example.com', 5000);

      expect(eventHandler).toHaveBeenCalledWith({
        domain: 'example.com',
        oldInterval: 1000,
        newInterval: 5000,
        reason: 'manual'
      });
    });
  });

  describe('resetDomain', () => {
    it('should remove domain state', () => {
      tracker.recordRateLimit('example.com', 429);
      expect(tracker.getDomainState('example.com')).not.toBeNull();

      tracker.resetDomain('example.com');
      expect(tracker.getDomainState('example.com')).toBeNull();
    });

    it('should handle resetting unknown domains', () => {
      expect(() => tracker.resetDomain('unknown.com')).not.toThrow();
    });
  });

  describe('getAllStates', () => {
    it('should return all domain states', () => {
      tracker.recordSuccess('domain1.com');
      tracker.recordRateLimit('domain2.com', 429);
      tracker.recordFailure('domain3.com', 'error');

      const states = tracker.getAllStates();
      expect(Object.keys(states)).toHaveLength(3);
      expect(states['domain1.com']).toBeDefined();
      expect(states['domain2.com']).toBeDefined();
      expect(states['domain3.com']).toBeDefined();
    });

    it('should return copies (not references)', () => {
      tracker.recordSuccess('example.com');
      const states = tracker.getAllStates();
      
      states['example.com'].currentIntervalMs = 99999;
      
      expect(tracker.getInterval('example.com')).toBe(1000);
    });
  });

  describe('getThrottledDomains', () => {
    it('should return domains with elevated intervals', () => {
      tracker.recordSuccess('fast.com');
      tracker.recordRateLimit('slow.com', 429);
      tracker.recordRateLimit('slow.com', 429);
      tracker.recordRateLimit('slower.com', 429);
      tracker.recordRateLimit('slower.com', 429);
      tracker.recordRateLimit('slower.com', 429);

      const throttled = tracker.getThrottledDomains();
      
      expect(throttled.length).toBe(2);
      expect(throttled[0].domain).toBe('slower.com');
      expect(throttled[0].interval).toBe(8000);
      expect(throttled[1].domain).toBe('slow.com');
      expect(throttled[1].interval).toBe(4000);
    });

    it('should return empty array when no domains are throttled', () => {
      tracker.recordSuccess('fast.com');
      tracker.recordSuccess('fast2.com');

      const throttled = tracker.getThrottledDomains();
      expect(throttled).toHaveLength(0);
    });
  });

  describe('getMetrics', () => {
    it('should return aggregate metrics', () => {
      tracker.recordSuccess('domain1.com');
      tracker.recordSuccess('domain1.com');
      tracker.recordRateLimit('domain2.com', 429);
      tracker.recordFailure('domain3.com', 'error');

      const metrics = tracker.getMetrics();
      
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.totalRateLimits).toBe(1);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.domainsTracked).toBe(3);
    });
  });

  describe('initialization', () => {
    it('should initialize without database', async () => {
      await expect(tracker.initialize()).resolves.toBeUndefined();
    });

    it('should handle db initialization', async () => {
      const mockDb = {
        getRateLimitAdapter: jest.fn().mockReturnValue(null)
      };

      const dbTracker = new RateLimitTracker({
        db: mockDb,
        logger: mockLogger
      });

      await expect(dbTracker.initialize()).resolves.toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should call persist without database', async () => {
      await expect(tracker.persist()).resolves.toBeUndefined();
    });

    it('should handle persist with mock adapter', async () => {
      const mockAdapter = {
        saveRateLimit: jest.fn().mockResolvedValue(true)
      };

      const mockDb = {
        getRateLimitAdapter: jest.fn().mockReturnValue(mockAdapter)
      };

      const dbTracker = new RateLimitTracker({
        db: mockDb,
        logger: mockLogger
      });

      dbTracker.recordRateLimit('example.com', 429);
      await dbTracker.persist();

      expect(mockAdapter.saveRateLimit).toHaveBeenCalledWith(
        'example.com',
        2000,
        1
      );
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordSuccess('example.com');
      }

      const state = tracker.getDomainState('example.com');
      expect(state.totalRequests).toBe(100);
    });

    it('should handle many different domains', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordSuccess(`domain${i}.com`);
      }

      expect(tracker.getMetrics().domainsTracked).toBe(100);
    });

    it('should handle alternating success and failure', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordSuccess('example.com');
        tracker.recordFailure('example.com', 'error');
      }

      const state = tracker.getDomainState('example.com');
      // Consecutive success should be 0 (last was failure)
      expect(state.consecutiveSuccess).toBe(0);
      expect(state.consecutiveFails).toBe(1);
    });
  });
});
