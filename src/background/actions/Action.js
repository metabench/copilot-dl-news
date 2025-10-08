/**
 * Action - Represents an executable action with metadata
 * 
 * Actions are operations that can be executed by the system, such as:
 * - stop-task: Stop a running background task
 * - pause-task: Pause a running task
 * - resume-task: Resume a paused task
 * 
 * Actions can be serialized to JSON for API responses and UI rendering.
 */

const { tof } = require('lang-tools');

/**
 * Action class
 * 
 * Represents a concrete action that can be executed.
 */
class Action {
  /**
   * @param {Object} options - Action options
   * @param {string} options.id - Unique action identifier (e.g., 'stop-task-123')
   * @param {string} options.type - Action type (e.g., 'stop-task', 'pause-task')
   * @param {string} options.label - Human-readable label for UI (e.g., 'Stop Analysis Task')
   * @param {Object} options.parameters - Parameters required for execution
   * @param {Object} [options.metadata] - Additional metadata about the action
   */
  constructor(options) {
    this.id = options.id;
    this.type = options.type;
    this.label = options.label;
    this.parameters = options.parameters || {};
    this.metadata = options.metadata || {};
    
    this._validate();
  }
  
  /**
   * Validate action structure
   * @private
   */
  _validate() {
    if (!this.id || tof(this.id) !== 'string') {
      throw new Error('Action id must be a non-empty string');
    }
    
    if (!this.type || tof(this.type) !== 'string') {
      throw new Error('Action type must be a non-empty string');
    }
    
    if (!this.label || tof(this.label) !== 'string') {
      throw new Error('Action label must be a non-empty string');
    }
    
    if (tof(this.parameters) !== 'object') {
      throw new Error('Action parameters must be an object');
    }
  }
  
  /**
   * Serialize action to JSON
   * 
   * @returns {Object} JSON-serializable object
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      parameters: this.parameters,
      metadata: this.metadata
    };
  }
  
  /**
   * Create action from JSON
   * 
   * @param {Object} json - JSON object
   * @returns {Action} Action instance
   */
  static fromJSON(json) {
    return new Action({
      id: json.id,
      type: json.type,
      label: json.label,
      parameters: json.parameters,
      metadata: json.metadata
    });
  }
  
  /**
   * Check if action matches a type
   * 
   * @param {string} type - Action type to check
   * @returns {boolean} True if action is of given type
   */
  isType(type) {
    return this.type === type;
  }
  
  /**
   * Get parameter value
   * 
   * @param {string} key - Parameter key
   * @param {*} [defaultValue] - Default value if parameter not found
   * @returns {*} Parameter value or default
   */
  getParameter(key, defaultValue = undefined) {
    return this.parameters.hasOwnProperty(key) 
      ? this.parameters[key] 
      : defaultValue;
  }
}

module.exports = { Action };
