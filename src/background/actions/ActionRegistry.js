/**
 * ActionRegistry - Central registry for executable actions
 * 
 * Manages the registration and execution of actions within the system.
 * Actions are registered with handler functions that know how to execute them.
 * 
 * Example:
 * registry.register('stop-task', (params, context) => {
 *   context.taskManager.stopTask(params.taskId);
 * });
 */

const { tof } = require('lang-tools');
const { Action } = require('./Action');

/**
 * ActionRegistry class
 * 
 * Maintains a registry of action types and their execution handlers.
 */
class ActionRegistry {
  constructor() {
    // Plain object for handler storage (tests expect object syntax)
    this.handlers = {};
  }
  
  /**
   * Register an action handler
   * 
   * @param {string} actionType - Action type identifier
   * @param {Function} handler - Handler function (action, context) => Promise<any>
   * @param {Array<string>} [requiredParams] - Required parameter names
   */
  register(actionType, handler, requiredParams = []) {
    if (!actionType) {
      throw new Error('Action type is required');
    }
    if (tof(actionType) !== 'string') {
      throw new Error('Action type must be a string');
    }
    
    if (tof(handler) !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    if (requiredParams && !Array.isArray(requiredParams)) {
      throw new Error('Required parameters must be an array');
    }
    
    // Allow overwriting (remove the check)
    this.handlers[actionType] = {
      handler,
      requiredParams: requiredParams || []
    };
  }
  
  /**
   * Check if action type is registered
   * 
   * @param {string} actionType - Action type to check
   * @returns {boolean} True if action type is registered
   */
  isRegistered(actionType) {
    return this.handlers.hasOwnProperty(actionType);
  }
  
  /**
   * Get action handler info
   * 
   * @param {string} actionType - Action type
   * @returns {Object|null} Handler info or null if not found
   */
  getHandlerInfo(actionType) {
    const info = this.handlers[actionType];
    if (!info) return null;
    
    return {
      description: info.description,
      requiredParams: info.requiredParams
    };
  }
  
  /**
   * Execute an action
   * 
   * @param {Action} action - Action to execute
   * @param {Object} context - Execution context (e.g., { taskManager, db })
   * @returns {Promise<any>} Result of action execution
   */
  async execute(action, context = {}) {
    if (!(action instanceof Action)) {
      throw new Error('Execute requires an Action instance');
    }
    
    const handlerInfo = this.handlers[action.type];
    if (!handlerInfo) {
      throw new Error(`No handler registered for action type: ${action.type}`);
    }
    
    // Validate required parameters
    const missingParams = handlerInfo.requiredParams.filter(
      param => !action.parameters.hasOwnProperty(param)
    );
    
    if (missingParams.length > 0) {
      const paramWord = missingParams.length === 1 ? 'parameter' : 'parameters';
      throw new Error(
        `Action ${action.type} missing required ${paramWord}: ${missingParams.join(', ')}`
      );
    }
    
    // Execute handler - pass full action object, not just parameters
    return await handlerInfo.handler(action, context);
  }
  
  /**
   * List all registered action types
   * 
   * @returns {Array<string>} Array of action type identifiers
   */
  listActionTypes() {
    return Object.keys(this.handlers);
  }
  
  /**
   * Get all registered action types (alias for listActionTypes)
   * 
   * @returns {Array<string>} Array of action type identifiers
   */
  getRegisteredTypes() {
    return this.listActionTypes();
  }
  
  /**
   * Get all action handlers with descriptions
   * 
   * @returns {Array<Object>} Array of { type, description, requiredParams }
   */
  getAllHandlerInfo() {
    const result = [];
    
    for (const [type, info] of Object.entries(this.handlers)) {
      result.push({
        type,
        description: info.description,
        requiredParams: info.requiredParams
      });
    }
    
    return result;
  }
}

/**
 * Create and configure the global action registry
 * 
 * @param {Object} context - Application context
 * @param {BackgroundTaskManager} context.taskManager - Task manager instance
 * @returns {ActionRegistry} Configured action registry
 */
function createActionRegistry(context) {
  const registry = new ActionRegistry();
  
  // Register: stop-task
  registry.register(
    'stop-task',
    async (action, ctx) => {
      if (!ctx.backgroundTaskManager) {
        throw new Error('BackgroundTaskManager not found in context');
      }
      const { taskId } = action.parameters;
      await ctx.backgroundTaskManager.cancelTask(taskId);
      return { success: true, message: 'Task stopped successfully' };
    },
    ['taskId']
  );
  
  // Register: pause-task
  registry.register(
    'pause-task',
    async (action, ctx) => {
      if (!ctx.backgroundTaskManager) {
        throw new Error('BackgroundTaskManager not found in context');
      }
      const { taskId } = action.parameters;
      await ctx.backgroundTaskManager.pauseTask(taskId);
      return { success: true, message: 'Task paused successfully' };
    },
    ['taskId']
  );
  
  // Register: resume-task
  registry.register(
    'resume-task',
    async (action, ctx) => {
      if (!ctx.backgroundTaskManager) {
        throw new Error('BackgroundTaskManager not found in context');
      }
      const { taskId } = action.parameters;
      await ctx.backgroundTaskManager.resumeTask(taskId);
      return { success: true, message: 'Task resumed successfully' };
    },
    ['taskId']
  );
  
  // Register: start-task
  registry.register(
    'start-task',
    async (action, ctx) => {
      if (!ctx.backgroundTaskManager) {
        throw new Error('BackgroundTaskManager not found in context');
      }
      const { taskId } = action.parameters;
      await ctx.backgroundTaskManager.startTask(taskId);
      return { success: true, message: 'Task started successfully' };
    },
    ['taskId']
  );
  
  return registry;
}

module.exports = {
  ActionRegistry,
  createActionRegistry
};
