/**
 * ProposedAction - Represents an action suggestion with context
 * 
 * When the system refuses an operation (e.g., rate limiting), it can propose
 * alternative actions the user can take to resolve the situation.
 * 
 * Example:
 * - User tries to start analysis task
 * - System refuses: "Analysis task started 2s ago, please wait 3s"
 * - System proposes: "Stop existing task #123" action
 */

const { tof } = require('lang-tools');
const { Action } = require('./Action');

/**
 * ProposedAction class
 * 
 * Wraps an Action with additional context about why it's being proposed.
 */
class ProposedAction {
  /**
   * @param {Object} options - Proposed action options
   * @param {Action} options.action - The action being proposed
   * @param {string} options.reason - Why this action is being proposed
   * @param {string} [options.description] - Detailed description of what the action does
   * @param {string} [options.severity='info'] - Severity level (info, warning, error)
   * @param {number} [options.priority=0] - Priority for ordering (higher = more important)
   */
  constructor(options) {
    this.action = options.action;
    this.reason = options.reason;
    this.description = options.description || '';
    this.severity = options.severity || 'info';
    this.priority = options.priority || 0;
    
    this._validate();
  }
  
  /**
   * Validate proposed action structure
   * @private
   */
  _validate() {
    if (!(this.action instanceof Action)) {
      throw new Error('ProposedAction action must be an Action instance');
    }
    
    if (!this.reason || tof(this.reason) !== 'string') {
      throw new Error('ProposedAction reason must be a non-empty string');
    }
    
    const validSeverities = ['info', 'warning', 'error'];
    if (!validSeverities.includes(this.severity)) {
      throw new Error(`ProposedAction severity must be one of: ${validSeverities.join(', ')}`);
    }
    
    if (tof(this.priority) !== 'number') {
      throw new Error('ProposedAction priority must be a number');
    }
  }
  
  /**
   * Serialize proposed action to JSON
   * 
   * @returns {Object} JSON-serializable object
   */
  toJSON() {
    return {
      action: this.action.toJSON(),
      reason: this.reason,
      description: this.description,
      severity: this.severity,
      priority: this.priority
    };
  }
  
  /**
   * Create proposed action from JSON
   * 
   * @param {Object} json - JSON object
   * @returns {ProposedAction} ProposedAction instance
   */
  static fromJSON(json) {
    return new ProposedAction({
      action: Action.fromJSON(json.action),
      reason: json.reason,
      description: json.description,
      severity: json.severity,
      priority: json.priority
    });
  }
  
  /**
   * Get action ID
   * 
   * @returns {string} Action ID
   */
  getActionId() {
    return this.action.id;
  }
  
  /**
   * Get action type
   * 
   * @returns {string} Action type
   */
  getActionType() {
    return this.action.type;
  }
  
  /**
   * Get action label
   * 
   * @returns {string} Action label
   */
  getActionLabel() {
    return this.action.label;
  }
}

module.exports = { ProposedAction };
