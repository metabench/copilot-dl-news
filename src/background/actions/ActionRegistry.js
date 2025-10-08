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
    // Map: actionType -> handler function
    this.handlers = new Map();
  }
  
  /**
   * Register an action handler
   * 
   * @param {string} actionType - Action type identifier
   * @param {Function} handler - Handler function (params, context) => Promise<any>
   * @param {Object} [options] - Registration options
   * @param {string} [options.description] - Description of what the action does
   * @param {Array<string>} [options.requiredParams] - Required parameter names
   */
  register(actionType, handler, options = {}) {
    if (!actionType || tof(actionType) !== 'string') {
      throw new Error('Action type must be a non-empty string');
    }
    
    if (tof(handler) !== 'function') {
      throw new Error('Action handler must be a function');
    }
    
    if (this.handlers.has(actionType)) {
      throw new Error(`Action type already registered: ${actionType}`);
    }
    
    this.handlers.set(actionType, {
      handler,
      description: options.description || '',
      requiredParams: options.requiredParams || []
    });
  }
  
  /**
   * Check if action type is registered
   * 
   * @param {string} actionType - Action type to check
   * @returns {boolean} True if action type is registered
   */
  isRegistered(actionType) {
    return this.handlers.has(actionType);
  }
  
  /**
   * Get action handler info
   * 
   * @param {string} actionType - Action type
   * @returns {Object|null} Handler info or null if not found
   */
  getHandlerInfo(actionType) {
    const info = this.handlers.get(actionType);
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
    
    const handlerInfo = this.handlers.get(action.type);
    if (!handlerInfo) {
      throw new Error(`No handler registered for action type: ${action.type}`);
    }
    
    // Validate required parameters
    const missingParams = handlerInfo.requiredParams.filter(
      param => !action.parameters.hasOwnProperty(param)
    );
    
    if (missingParams.length > 0) {
      throw new Error(
        `Action ${action.type} missing required parameters: ${missingParams.join(', ')}`
      );
    }
    
    // Execute handler
    try {
      return await handlerInfo.handler(action.parameters, context);
    } catch (error) {
      throw new Error(`Action execution failed (${action.type}): ${error.message}`);
    }
  }
  
  /**
   * List all registered action types
   * 
   * @returns {Array<string>} Array of action type identifiers
   */
  listActionTypes() {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * Get all action handlers with descriptions
   * 
   * @returns {Array<Object>} Array of { type, description, requiredParams }
   */
  getAllHandlerInfo() {
    const result = [];
    
    for (const [type, info] of this.handlers.entries()) {
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
    async (params, ctx) => {
      const { taskId } = params;
      ctx.taskManager.stopTask(taskId);
      return { success: true, taskId };
    },
    {
      description: 'Stop a running or paused background task',
      requiredParams: ['taskId']
    }
  );
  
  // Register: pause-task
  registry.register(
    'pause-task',
    async (params, ctx) => {
      const { taskId } = params;
      ctx.taskManager.pauseTask(taskId);
      return { success: true, taskId };
    },
    {
      description: 'Pause a running background task',
      requiredParams: ['taskId']
    }
  );
  
  // Register: resume-task
  registry.register(
    'resume-task',
    async (params, ctx) => {
      const { taskId } = params;
      await ctx.taskManager.resumeTask(taskId);
      return { success: true, taskId };
    },
    {
      description: 'Resume a paused background task',
      requiredParams: ['taskId']
    }
  );
  
  // Register: start-task
  registry.register(
    'start-task',
    async (params, ctx) => {
      const { taskId } = params;
      await ctx.taskManager.startTask(taskId);
      return { success: true, taskId };
    },
    {
      description: 'Start a pending background task',
      requiredParams: ['taskId']
    }
  );
  
  return registry;
}

module.exports = {
  ActionRegistry,
  createActionRegistry
};
