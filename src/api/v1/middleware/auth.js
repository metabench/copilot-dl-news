'use strict';

/**
 * API Authentication Middleware
 * 
 * Validates API keys from X-API-Key header and attaches key metadata to request.
 * 
 * @module auth
 */

/**
 * Create authentication middleware
 * @param {Object} options - Middleware options
 * @param {Object} options.apiKeyAdapter - API key adapter instance
 * @param {boolean} [options.required=true] - Whether auth is required
 * @returns {Function} Express middleware
 */
function createAuthMiddleware(options = {}) {
  const { apiKeyAdapter, required = true } = options;

  if (!apiKeyAdapter) {
    throw new Error('createAuthMiddleware requires an apiKeyAdapter');
  }

  return function authMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    // No key provided
    if (!apiKey) {
      if (required) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'API key required. Provide X-API-Key header.',
          code: 'MISSING_API_KEY'
        });
      }
      req.apiKey = null;
      return next();
    }

    // Validate key
    const keyData = apiKeyAdapter.validateKey(apiKey);

    if (!keyData) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    if (!keyData.isActive) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'API key has been revoked',
        code: 'REVOKED_API_KEY'
      });
    }

    // Attach key data to request
    req.apiKey = keyData;
    next();
  };
}

/**
 * Create optional auth middleware (doesn't reject missing keys)
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function createOptionalAuthMiddleware(options = {}) {
  return createAuthMiddleware({ ...options, required: false });
}

module.exports = {
  createAuthMiddleware,
  createOptionalAuthMiddleware
};
