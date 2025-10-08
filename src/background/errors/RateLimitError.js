/**
 * RateLimitError - Error thrown when rate limiting is enforced
 * 
 * This error is thrown when an operation is refused due to rate limiting,
 * such as trying to start a second task of the same type too quickly.
 * 
 * The error includes proposed actions the user can take to resolve the situation.
 */

const { ProposedAction } = require('../actions/ProposedAction');

/**
 * RateLimitError class
 * 
 * Extends Error with rate limiting context and proposed actions.
 */
class RateLimitError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} options - Additional options
   * @param {Array<ProposedAction>} [options.proposedActions=[]] - Proposed actions
   * @param {number} [options.retryAfter] - Seconds until retry is allowed
   * @param {Object} [options.context] - Additional context data
   */
  constructor(message, options = {}) {
    super(message);
    
    this.name = 'RateLimitError';
    this.statusCode = 429; // HTTP 429 Too Many Requests
    this.proposedActions = options.proposedActions || [];
    this.retryAfter = options.retryAfter; // Seconds
    this.context = options.context || {};
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitError);
    }
    
    this._validate();
  }
  
  /**
   * Validate error structure
   * @private
   */
  _validate() {
    if (!Array.isArray(this.proposedActions)) {
      throw new TypeError('proposedActions must be an array');
    }
    
    for (const action of this.proposedActions) {
      if (!(action instanceof ProposedAction)) {
        throw new TypeError('All proposedActions must be ProposedAction instances');
      }
    }
    
    if (this.retryAfter !== undefined && typeof this.retryAfter !== 'number') {
      throw new TypeError('retryAfter must be a number (seconds)');
    }
  }
  
  /**
   * Add a proposed action
   * 
   * @param {ProposedAction} proposedAction - Proposed action to add
   */
  addProposedAction(proposedAction) {
    if (!(proposedAction instanceof ProposedAction)) {
      throw new TypeError('proposedAction must be a ProposedAction instance');
    }
    
    this.proposedActions.push(proposedAction);
  }
  
  /**
   * Serialize error to JSON for API response
   * 
   * @returns {Object} JSON-serializable object
   */
  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        statusCode: this.statusCode,
        retryAfter: this.retryAfter,
        context: this.context
      },
      proposedActions: this.proposedActions.map(pa => pa.toJSON())
    };
  }
  
  /**
   * Check if error has proposed actions
   * 
   * @returns {boolean} True if error has proposed actions
   */
  hasProposedActions() {
    return this.proposedActions.length > 0;
  }
  
  /**
   * Get proposed actions sorted by priority (highest first)
   * 
   * @returns {Array<ProposedAction>} Sorted proposed actions
   */
  getSortedProposedActions() {
    return [...this.proposedActions].sort((a, b) => b.priority - a.priority);
  }
}

module.exports = { RateLimitError };
