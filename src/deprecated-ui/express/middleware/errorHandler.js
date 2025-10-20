/**
 * @fileoverview Express Error Handling Middleware
 * 
 * Centralized error handling for the Express application.
 * Catches both typed HttpError instances and generic errors,
 * formatting them consistently for API responses.
 */

const { HttpError } = require('../errors/HttpError');

/**
 * Express error handling middleware
 * Must be registered after all routes
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle HttpError instances (typed errors with status codes)
  if (err instanceof HttpError) {
    const errorJson = err.toJSON();
    return res.status(err.statusCode).json({
      success: false,
      ...errorJson
    });
  }

  // Handle generic errors
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  // Build error response
  const errorResponse = {
    success: false,
    error: message
  };

  // Include additional fields if present
  if (err.code) {
    errorResponse.code = err.code;
  }
  if (err.field) {
    errorResponse.field = err.field;
  }
  if (err.detail) {
    errorResponse.detail = err.detail;
  }

  // Log server errors (5xx) but not client errors (4xx)
  if (statusCode >= 500) {
    const isTestEnv = process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
    if (!isTestEnv) {
      console.error('[ErrorHandler] Server error:', {
        message: err.message,
        stack: err.stack,
        statusCode,
        path: req.path,
        method: req.method
      });
    }
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Express 404 handler (for routes that don't exist)
 * Should be registered after all routes but before error handler
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.path}`);
  error.statusCode = 404;
  next(error);
}

module.exports = {
  errorHandler,
  notFoundHandler
};
