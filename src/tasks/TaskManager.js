'use strict';

const { EventEmitter } = require('events');

/**
 * TaskManager - Coordinates multiple BackgroundTasks and broadcasts state changes
 * 
 * Events emitted:
 *   - 'task:added' (taskInfo)
 *   - 'task:started' (taskInfo)
 *   - 'task:progress' (progressInfo)
 *   - 'task:completed' (taskInfo, result)
 *   - 'task:error' (taskInfo, error)
 *   - 'task:cancelled' (taskInfo)
 *   - 'task:paused' (taskInfo)
 *   - 'task:resumed' (taskInfo)
 *   - 'update' (allTasksInfo) - periodic consolidated update
 */
class TaskManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    /** @type {Map<string, import('./BackgroundTask').BackgroundTask>} */
    this.tasks = new Map();
    
    // Completed/cancelled tasks (keep for history)
    this.completedTasks = [];
    this.maxCompletedHistory = options.maxCompletedHistory || 50;
    
    // Throttled updates
    this._updateTimer = null;
    this._updateIntervalMs = options.updateIntervalMs || 500;
    this._pendingUpdate = false;
  }
  
  /**
   * Add a task to the manager
   * @param {import('./BackgroundTask').BackgroundTask} task 
   * @returns {string} Task ID
   */
  addTask(task) {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task with ID ${task.id} already exists`);
    }
    
    this.tasks.set(task.id, task);
    
    // Wire up events
    task.on('started', (info) => {
      this.emit('task:started', info);
      this._scheduleUpdate();
    });
    
    task.on('progress', (progress) => {
      this.emit('task:progress', progress);
      this._scheduleUpdate();
    });
    
    task.on('completed', (result) => {
      const info = task.getInfo();
      this._moveToCompleted(task);
      this.emit('task:completed', info, result);
      this._scheduleUpdate();
    });
    
    task.on('error', (err) => {
      const info = task.getInfo();
      this._moveToCompleted(task);
      this.emit('task:error', info, { message: err.message, stack: err.stack });
      this._scheduleUpdate();
    });
    
    task.on('cancelled', () => {
      const info = task.getInfo();
      this._moveToCompleted(task);
      this.emit('task:cancelled', info);
      this._scheduleUpdate();
    });
    
    task.on('paused', () => {
      this.emit('task:paused', task.getInfo());
      this._scheduleUpdate();
    });
    
    task.on('resumed', () => {
      this.emit('task:resumed', task.getInfo());
      this._scheduleUpdate();
    });
    
    this.emit('task:added', task.getInfo());
    this._scheduleUpdate();
    
    return task.id;
  }
  
  /**
   * Start a task by ID
   * @param {string} taskId 
   */
  async startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task.start();
  }
  
  /**
   * Cancel a task by ID
   * @param {string} taskId 
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.cancel();
    }
  }
  
  /**
   * Pause a task by ID
   * @param {string} taskId 
   */
  pauseTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.pause();
    }
  }
  
  /**
   * Resume a task by ID
   * @param {string} taskId 
   */
  resumeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.resume();
    }
  }
  
  /**
   * Get task by ID
   * @param {string} taskId 
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
  
  /**
   * Get all active tasks info
   */
  getActiveTasks() {
    return Array.from(this.tasks.values()).map(t => t.getInfo());
  }
  
  /**
   * Get completed/cancelled tasks history
   */
  getCompletedTasks() {
    return this.completedTasks;
  }
  
  /**
   * Get combined state for UI
   */
  getAllTasksInfo() {
    return {
      active: this.getActiveTasks(),
      completed: this.completedTasks,
      stats: {
        activeCount: this.tasks.size,
        completedCount: this.completedTasks.length,
        runningCount: Array.from(this.tasks.values()).filter(t => t.getState() === 'running').length,
        pausedCount: Array.from(this.tasks.values()).filter(t => t.getState() === 'paused').length
      }
    };
  }
  
  /**
   * Move task from active to completed history
   * @private
   */
  _moveToCompleted(task) {
    const info = task.getInfo();
    this.completedTasks.unshift(info);
    
    // Trim history
    if (this.completedTasks.length > this.maxCompletedHistory) {
      this.completedTasks = this.completedTasks.slice(0, this.maxCompletedHistory);
    }
    
    this.tasks.delete(task.id);
  }
  
  /**
   * Schedule a throttled update emission
   * @private
   */
  _scheduleUpdate() {
    if (this._updateTimer) return;
    
    this._updateTimer = setTimeout(() => {
      this._updateTimer = null;
      this.emit('update', this.getAllTasksInfo());
    }, this._updateIntervalMs);
  }
  
  /**
   * Stop the manager (cancel all tasks)
   */
  shutdown() {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    
    for (const task of this.tasks.values()) {
      if (task.getState() === 'running' || task.getState() === 'paused') {
        task.cancel();
      }
    }
  }
}

module.exports = { TaskManager };
