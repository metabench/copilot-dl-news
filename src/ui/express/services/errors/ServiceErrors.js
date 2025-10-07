/**
 * Domain-level errors for service layer
 * These are business logic errors, not HTTP errors.
 * Routes convert these to appropriate HTTP status codes.
 */

/**
 * Thrown when attempting to start a crawl while one is already running
 */
class CrawlAlreadyRunningError extends Error {
  constructor(message = 'Cannot start crawl: crawler already running') {
    super(message);
    this.name = 'CrawlAlreadyRunningError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when crawl options are invalid
 */
class InvalidCrawlOptionsError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'InvalidCrawlOptionsError';
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a queue cannot be found
 */
class QueueNotFoundError extends Error {
  constructor(queueId) {
    super(`Queue ${queueId} not found`);
    this.name = 'QueueNotFoundError';
    this.queueId = queueId;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a queue cannot be resumed
 */
class QueueNotResumableError extends Error {
  constructor(queueId, reasons = []) {
    const reasonText = reasons.length ? `: ${reasons.join(', ')}` : '';
    super(`Queue ${queueId} cannot be resumed${reasonText}`);
    this.name = 'QueueNotResumableError';
    this.queueId = queueId;
    this.reasons = reasons;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a job cannot be found
 */
class JobNotFoundError extends Error {
  constructor(jobId) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
    this.jobId = jobId;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when attempting an invalid job state transition
 */
class InvalidJobStateError extends Error {
  constructor(jobId, currentState, attemptedAction) {
    super(`Cannot ${attemptedAction} job ${jobId} in state '${currentState}'`);
    this.name = 'InvalidJobStateError';
    this.jobId = jobId;
    this.currentState = currentState;
    this.attemptedAction = attemptedAction;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when database is unavailable
 */
class DatabaseUnavailableError extends Error {
  constructor(message = 'Database is not available') {
    super(message);
    this.name = 'DatabaseUnavailableError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when capacity limits are exceeded
 */
class CapacityExceededError extends Error {
  constructor(currentCount, maxAllowed) {
    super(`Capacity exceeded: ${currentCount}/${maxAllowed} jobs running`);
    this.name = 'CapacityExceededError';
    this.currentCount = currentCount;
    this.maxAllowed = maxAllowed;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  CrawlAlreadyRunningError,
  InvalidCrawlOptionsError,
  QueueNotFoundError,
  QueueNotResumableError,
  JobNotFoundError,
  InvalidJobStateError,
  DatabaseUnavailableError,
  CapacityExceededError
};
