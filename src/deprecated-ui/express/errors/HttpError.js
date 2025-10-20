/**
 * @fileoverview HTTP Error Classes
 * 
 * Provides typed error classes for consistent error handling across the API.
 * Each error includes an HTTP status code and optional metadata.
 */

/**
 * Base class for HTTP errors
 */
class HttpError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} [metadata] - Additional error metadata
   */
  constructor(message, statusCode, metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.metadata = metadata;
    
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON response format
   * @returns {Object} JSON-serializable error object
   */
  toJSON() {
    const result = {
      error: this.message,
      code: this.name
    };

    // Include metadata fields
    Object.keys(this.metadata).forEach(key => {
      if (this.metadata[key] !== undefined) {
        result[key] = this.metadata[key];
      }
    });

    return result;
  }
}

/**
 * 400 Bad Request - Client sent invalid data
 */
class BadRequestError extends HttpError {
  constructor(message = 'Bad request', metadata = {}) {
    super(message, 400, metadata);
  }
}

/**
 * 400 Validation Error - Specific field validation failed
 */
class ValidationError extends HttpError {
  /**
   * @param {string} message - Validation error message
   * @param {string} [field] - Field that failed validation
   * @param {*} [value] - Invalid value provided
   */
  constructor(message, field = null, value = undefined) {
    const metadata = {};
    if (field) metadata.field = field;
    if (value !== undefined) metadata.value = value;
    
    super(message, 400, metadata);
  }
}

/**
 * 404 Not Found - Requested resource doesn't exist
 */
class NotFoundError extends HttpError {
  /**
   * @param {string} [message] - Error message
   * @param {string} [resource] - Type of resource not found
   */
  constructor(message = 'Resource not found', resource = null) {
    const metadata = {};
    if (resource) metadata.resource = resource;
    
    super(message, 404, metadata);
  }
}

/**
 * 409 Conflict - Request conflicts with current state
 */
class ConflictError extends HttpError {
  constructor(message = 'Request conflicts with current state', metadata = {}) {
    super(message, 409, metadata);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
class InternalServerError extends HttpError {
  constructor(message = 'Internal server error', metadata = {}) {
    super(message, 500, metadata);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
class ServiceUnavailableError extends HttpError {
  /**
   * @param {string} [message] - Error message
   * @param {string} [detail] - Additional details about unavailability
   */
  constructor(message = 'Service unavailable', detail = null) {
    const metadata = {};
    if (detail) metadata.detail = detail;
    
    super(message, 503, metadata);
  }
}

module.exports = {
  HttpError,
  BadRequestError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  ServiceUnavailableError
};
