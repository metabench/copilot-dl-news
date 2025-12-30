'use strict';

/**
 * @fileoverview Tests for REST API Gateway rate limiting middleware
 */

const {
  createRateLimitMiddleware,
  clearRateLimitStore,
  getStoreSize,
  cleanupStaleEntries,
  TIER_LIMITS,
  WINDOW_MS
} = require('../../../../src/api/v1/middleware/rateLimit');

describe('rate limit middleware', () => {
  let mockReq;
  let mockRes;
  let nextFn;
  let mockApiKeyAdapter;

  beforeEach(() => {
    // Clear rate limit store between tests
    clearRateLimitStore();

    mockApiKeyAdapter = {
      recordRequest: jest.fn()
    };

    mockReq = {
      apiKey: {
        id: 1,
        tier: 'free'
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };

    nextFn = jest.fn();
  });

  afterEach(() => {
    clearRateLimitStore();
  });

  describe('tier limits', () => {
    test('exports correct tier limits', () => {
      expect(TIER_LIMITS.free).toBe(100);
      expect(TIER_LIMITS.premium).toBe(1000);
      expect(TIER_LIMITS.unlimited).toBe(Infinity);
    });

    test('exports window size', () => {
      expect(WINDOW_MS).toBe(60 * 1000);
    });
  });

  describe('createRateLimitMiddleware', () => {
    test('skips rate limiting when no apiKey attached', () => {
      const middleware = createRateLimitMiddleware({});
      delete mockReq.apiKey;

      middleware(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      expect(mockRes.setHeader).not.toHaveBeenCalled();
    });

    test('sets rate limit headers for free tier', () => {
      const middleware = createRateLimitMiddleware({});
      mockReq.apiKey = { id: 1, tier: 'free' };

      middleware(mockReq, mockRes, nextFn);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        expect.any(String)
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String)
      );
      expect(nextFn).toHaveBeenCalled();
    });

    test('sets rate limit headers for premium tier', () => {
      const middleware = createRateLimitMiddleware({});
      mockReq.apiKey = { id: 2, tier: 'premium' };

      middleware(mockReq, mockRes, nextFn);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
      expect(nextFn).toHaveBeenCalled();
    });

    test('sets -1 headers for unlimited tier', () => {
      const middleware = createRateLimitMiddleware({});
      mockReq.apiKey = { id: 3, tier: 'unlimited' };

      middleware(mockReq, mockRes, nextFn);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '-1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '-1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', '-1');
      expect(nextFn).toHaveBeenCalled();
    });

    test('defaults to free tier for unknown tier', () => {
      const middleware = createRateLimitMiddleware({});
      mockReq.apiKey = { id: 4, tier: 'unknown' };

      middleware(mockReq, mockRes, nextFn);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(nextFn).toHaveBeenCalled();
    });

    test('tracks requests per key', () => {
      const middleware = createRateLimitMiddleware({});
      
      // First request
      middleware(mockReq, mockRes, nextFn);
      expect(getStoreSize()).toBe(1);
      
      // Reset mocks
      nextFn.mockClear();
      mockRes.setHeader.mockClear();
      
      // Second request with same key
      middleware(mockReq, mockRes, nextFn);
      
      // Should have decremented remaining
      const remainingCalls = mockRes.setHeader.mock.calls.filter(
        call => call[0] === 'X-RateLimit-Remaining'
      );
      expect(remainingCalls.length).toBe(1);
      expect(parseInt(remainingCalls[0][1], 10)).toBe(98); // 100 - 2 requests
    });

    test('tracks separate keys independently', () => {
      const middleware = createRateLimitMiddleware({});
      
      // Request from key 1
      mockReq.apiKey = { id: 1, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      
      // Request from key 2
      mockReq.apiKey = { id: 2, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      
      expect(getStoreSize()).toBe(2);
    });

    test('returns 429 when rate limit exceeded', () => {
      // Create middleware with very low limit for testing
      const middleware = createRateLimitMiddleware({
        windowMs: 60000
      });
      
      // Create an artificial entry that's at the limit
      mockReq.apiKey = { id: 99, tier: 'free' };
      
      // Simulate 100 requests (the limit for free tier)
      for (let i = 0; i < 100; i++) {
        nextFn.mockClear();
        mockRes.status.mockClear();
        mockRes.json.mockClear();
        middleware(mockReq, mockRes, nextFn);
      }
      
      // The 101st request should be rate limited
      nextFn.mockClear();
      mockRes.status.mockClear();
      mockRes.json.mockClear();
      mockRes.setHeader.mockClear();
      
      middleware(mockReq, mockRes, nextFn);
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('Rate limit exceeded'),
          limit: 100,
          tier: 'free'
        })
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    test('records request in DB if adapter provided', (done) => {
      const middleware = createRateLimitMiddleware({
        apiKeyAdapter: mockApiKeyAdapter
      });
      
      middleware(mockReq, mockRes, nextFn);
      
      // Recording is async via setImmediate
      setImmediate(() => {
        expect(mockApiKeyAdapter.recordRequest).toHaveBeenCalledWith(1);
        done();
      });
    });

    test('does not fail if DB recording throws', (done) => {
      mockApiKeyAdapter.recordRequest.mockImplementation(() => {
        throw new Error('DB error');
      });
      
      const middleware = createRateLimitMiddleware({
        apiKeyAdapter: mockApiKeyAdapter
      });
      
      middleware(mockReq, mockRes, nextFn);
      
      // Should still call next
      expect(nextFn).toHaveBeenCalled();
      
      // Recording is async
      setImmediate(() => {
        // Should have attempted to record
        expect(mockApiKeyAdapter.recordRequest).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('clearRateLimitStore', () => {
    test('clears all entries', () => {
      const middleware = createRateLimitMiddleware({});
      
      // Add some entries
      mockReq.apiKey = { id: 1, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      mockReq.apiKey = { id: 2, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      
      expect(getStoreSize()).toBe(2);
      
      clearRateLimitStore();
      
      expect(getStoreSize()).toBe(0);
    });
  });

  describe('cleanupStaleEntries', () => {
    test('removes entries with no recent requests', () => {
      const middleware = createRateLimitMiddleware({});
      
      // Add an entry
      mockReq.apiKey = { id: 1, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      
      expect(getStoreSize()).toBe(1);
      
      // Mock time passing by manipulating the store directly
      // This is a bit hacky but tests the cleanup logic
      jest.useFakeTimers();
      
      // Fast-forward past the window
      jest.advanceTimersByTime(WINDOW_MS + 1000);
      
      cleanupStaleEntries();
      
      // Entry should be removed since all requests are stale
      expect(getStoreSize()).toBe(0);
      
      jest.useRealTimers();
    });
  });

  describe('getStoreSize', () => {
    test('returns correct count', () => {
      expect(getStoreSize()).toBe(0);
      
      const middleware = createRateLimitMiddleware({});
      
      mockReq.apiKey = { id: 1, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      expect(getStoreSize()).toBe(1);
      
      mockReq.apiKey = { id: 2, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      expect(getStoreSize()).toBe(2);
      
      mockReq.apiKey = { id: 3, tier: 'free' };
      middleware(mockReq, mockRes, nextFn);
      expect(getStoreSize()).toBe(3);
    });
  });
});
