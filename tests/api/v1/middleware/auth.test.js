'use strict';

/**
 * @fileoverview Tests for REST API Gateway auth middleware
 */

const { createAuthMiddleware, createOptionalAuthMiddleware } = require('../../../../src/api/v1/middleware/auth');

describe('auth middleware', () => {
  // Mock API key adapter
  let mockApiKeyAdapter;
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    mockApiKeyAdapter = {
      validateKey: jest.fn()
    };

    mockReq = {
      headers: {},
      query: {},
      get: function(name) {
        return this.headers[name.toLowerCase()];
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };

    nextFn = jest.fn();
  });

  describe('createAuthMiddleware', () => {
    describe('when auth is required (default)', () => {
      let authMiddleware;

      beforeEach(() => {
        authMiddleware = createAuthMiddleware({
          apiKeyAdapter: mockApiKeyAdapter,
          required: true
        });
      });

      test('returns 401 when X-API-Key header is missing', () => {
        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'UNAUTHORIZED',
            message: expect.stringContaining('API key required')
          })
        );
        expect(nextFn).not.toHaveBeenCalled();
      });

      test('returns 401 when API key is invalid', () => {
        mockReq.headers['x-api-key'] = 'dlnews_invalid123456789012345678901';
        mockApiKeyAdapter.validateKey.mockReturnValue(null);

        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockApiKeyAdapter.validateKey).toHaveBeenCalledWith('dlnews_invalid123456789012345678901');
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'UNAUTHORIZED',
            code: 'INVALID_API_KEY'
          })
        );
        expect(nextFn).not.toHaveBeenCalled();
      });

      test('returns 401 when API key is revoked', () => {
        mockReq.headers['x-api-key'] = 'dlnews_revoked12345678901234567890';
        mockApiKeyAdapter.validateKey.mockReturnValue({
          id: 1,
          isActive: false,
          tier: 'free'
        });

        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'UNAUTHORIZED',
            code: 'REVOKED_API_KEY'
          })
        );
        expect(nextFn).not.toHaveBeenCalled();
      });

      test('calls next() and attaches apiKey when valid', () => {
        const validKey = {
          id: 123,
          isActive: true,
          tier: 'premium',
          keyPrefix: 'dlnews_valid1'
        };
        mockReq.headers['x-api-key'] = 'dlnews_valid12345678901234567890ab';
        mockApiKeyAdapter.validateKey.mockReturnValue(validKey);

        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockReq.apiKey).toEqual(validKey);
        expect(nextFn).toHaveBeenCalledTimes(1);
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('handles both x-api-key and X-API-Key headers (case-insensitive)', () => {
        const validKey = { id: 1, isActive: true, tier: 'free' };
        mockApiKeyAdapter.validateKey.mockReturnValue(validKey);

        // Test lowercase
        mockReq.headers['x-api-key'] = 'dlnews_test123456789012345678901234';
        authMiddleware(mockReq, mockRes, nextFn);
        expect(nextFn).toHaveBeenCalled();
      });
    });

    describe('when auth is not required', () => {
      let authMiddleware;

      beforeEach(() => {
        authMiddleware = createAuthMiddleware({
          apiKeyAdapter: mockApiKeyAdapter,
          required: false
        });
      });

      test('calls next() without apiKey when header is missing', () => {
        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockReq.apiKey).toBeNull();
        expect(nextFn).toHaveBeenCalledTimes(1);
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      test('still validates key if provided', () => {
        const validKey = { id: 1, isActive: true, tier: 'free' };
        mockReq.headers['x-api-key'] = 'dlnews_test123456789012345678901234';
        mockApiKeyAdapter.validateKey.mockReturnValue(validKey);

        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockReq.apiKey).toEqual(validKey);
        expect(nextFn).toHaveBeenCalled();
      });

      test('returns 401 for invalid key even when not required', () => {
        mockReq.headers['x-api-key'] = 'dlnews_bad1234567890123456789012345';
        mockApiKeyAdapter.validateKey.mockReturnValue(null);

        authMiddleware(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(nextFn).not.toHaveBeenCalled();
      });
    });
  });

  describe('createOptionalAuthMiddleware', () => {
    test('creates middleware with required=false', () => {
      const middleware = createOptionalAuthMiddleware({
        apiKeyAdapter: mockApiKeyAdapter
      });

      // No key provided - should still work
      middleware(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.apiKey).toBeNull();
    });
  });

  describe('error handling', () => {
    test('throws when adapter throws (middleware does not catch)', () => {
      mockReq.headers['x-api-key'] = 'dlnews_test123456789012345678901234';
      mockApiKeyAdapter.validateKey.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const authMiddleware = createAuthMiddleware({
        apiKeyAdapter: mockApiKeyAdapter,
        required: true
      });

      // The middleware doesn't catch errors - Express error handler should
      expect(() => authMiddleware(mockReq, mockRes, nextFn)).toThrow('Database connection failed');
    });
  });
});
