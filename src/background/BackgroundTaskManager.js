/**
 * Background Task Manager
 * 
 * Manages long-running background tasks with persistence, pause/resume, error handling, and telemetry.
 * Tasks are persisted to the database and can survive server restarts.
 */

const { EventEmitter } = require('events');
const { each, tof, is_defined } = require('lang-tools');

/**
 * Task status enum
 */
const TaskStatus = {
  PENDING: 'pending',
  RESUMING: 'resuming',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Background task manager
 */
class BackgroundTaskManager extends EventEmitter {
  /**
   * @param {Object} options - Manager options
   * @param {Database} options.db - better-sqlite3 database instance
   * @param {Function} [options.broadcastEvent] - SSE broadcast function (eventType, data)
   * @param {Function} [options.updateMetrics] - Metrics update function (metricsData)
   */
  constructor(options = {}) {
    super();
    
    this.db = options.db;
    this.broadcastEvent = options.broadcastEvent || null;
    this.updateMetrics = options.updateMetrics || null;
    
    // Task registry: taskType -> TaskClass
    this.taskRegistry = new Map();
    
    // Active task instances: taskId -> { task, controller }
    this.activeTasks = new Map();
    
    // Telemetry
    this.stats = {
      tasksStarted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksCancelled: 0
    };
  }
  
  /**
   * Register a task type
   * 
   * @param {string} taskType - Unique task type identifier
   * @param {Class} TaskClass - Task class with execute() method
   * @param {Object} [options] - Additional options to pass to task constructor
   */
  registerTaskType(taskType, TaskClass, options = {}) {
    if (!taskType || tof(taskType) !== 'string') {
      throw new Error('Task type must be a non-empty string');
    }
    
    if (!TaskClass || tof(TaskClass) !== 'function') {
      throw new Error('TaskClass must be a constructor function');
    }
    
    if (this.taskRegistry.has(taskType)) {
      throw new Error(`Task type ${taskType} is already registered`);
    }
    
    this.taskRegistry.set(taskType, { TaskClass, options });
  }
  
  /**
   * Create a new background task
   * 
   * @param {string} taskType - Type of task
   * @param {Object} config - Task configuration
   * @returns {number} Task ID
   */
  createTask(taskType, config = {}) {
    const registration = this.taskRegistry.get(taskType);
    if (!registration) {
      throw new Error(`Task type ${taskType} is not registered`);
    }
    
    const now = new Date().toISOString();
    
    const result = this.db.prepare(`
      INSERT INTO background_tasks (
        task_type,
        status,
        config,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      taskType,
      TaskStatus.PENDING,
      JSON.stringify(config),
      now,
      now
    );
    
    const taskId = result.lastInsertRowid;
    
    this.stats.tasksStarted++;
    this._updateMetrics();
    
    const task = this.getTask(taskId);
    this._broadcastEvent('task-created', task);
    
    return taskId;
  }
  
  /**
   * Start a task
   * 
   * @param {number} taskId - Task ID
   * @param {boolean} isResume - Whether this is resuming a paused/interrupted task
   * @returns {Promise<void>}
   */
  async startTask(taskId, isResume = false) {
    const taskRecord = this.getTask(taskId);
    if (!taskRecord) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (this.activeTasks.has(taskId)) {
      throw new Error(`Task already running: ${taskId}`);
    }
    
    const registration = this.taskRegistry.get(taskRecord.task_type);
    if (!registration) {
      throw new Error(`Unknown task type: ${taskRecord.task_type}`);
    }
    
    const { TaskClass, options: registrationOptions } = registration;
    
    // Determine initial status
    const hasProgress = taskRecord.progress?.current > 0;
    const isActuallyResuming = isResume || hasProgress || taskRecord.status === TaskStatus.PAUSED;
    const initialStatus = isActuallyResuming ? TaskStatus.RESUMING : TaskStatus.RUNNING;
    
    // Create task instance with merged options
    const controller = new AbortController();
    const task = new TaskClass({
      db: this.db,
      taskId,
      config: taskRecord.config,
      signal: controller.signal,
      onProgress: (progress) => this._handleProgress(taskId, progress),
      onError: (error) => this._handleError(taskId, error),
      ...registrationOptions // Inject registered options (e.g., workerPool)
    });
    
    this.activeTasks.set(taskId, { task, controller, resumeStartTime: Date.now() });
    
    // Update status to resuming or running
    const statusUpdate = { started_at: new Date().toISOString() };
    if (isActuallyResuming) {
      statusUpdate.resume_started_at = new Date().toISOString();
    }
    this._updateTaskStatus(taskId, initialStatus, statusUpdate);
    
    // Start monitoring for stuck resuming state
    if (isActuallyResuming) {
      this._monitorResumingState(taskId);
    }
    
    // Execute task (async)
    task.execute()
      .then(() => {
        this._handleCompletion(taskId);
      })
      .catch((error) => {
        this._handleError(taskId, error);
      });
    
    // Transition from RESUMING to RUNNING quickly (on first progress update or after 100ms)
    if (isActuallyResuming) {
      setTimeout(() => {
        const currentTask = this.getTask(taskId);
        if (currentTask && currentTask.status === TaskStatus.RESUMING) {
          this._updateTaskStatus(taskId, TaskStatus.RUNNING);
        }
      }, 100);
    }
  }
  
  /**
   * Pause a task
   * 
   * @param {number} taskId - Task ID
   */
  pauseTask(taskId) {
    const active = this.activeTasks.get(taskId);
    if (!active) {
      throw new Error(`Task not active: ${taskId}`);
    }
    
    const { task } = active;
    if (tof(task.pause) === 'function') {
      task.pause();
    }
    
    this._updateTaskStatus(taskId, TaskStatus.PAUSED);
  }
  
  /**
   * Resume a task
   * 
   * @param {number} taskId - Task ID
   * @returns {Promise<void>}
   */
  async resumeTask(taskId) {
    const taskRecord = this.getTask(taskId);
    if (!taskRecord) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (taskRecord.status !== TaskStatus.PAUSED) {
      throw new Error(`Task is not paused: ${taskId}`);
    }
    
    // If task is still in active tasks, just resume it
    const active = this.activeTasks.get(taskId);
    if (active && tof(active.task.resume) === 'function') {
      active.task.resume();
      this._updateTaskStatus(taskId, TaskStatus.RUNNING);
      return;
    }
    
    // Otherwise, restart the task (it will resume from saved progress)
    await this.startTask(taskId);
  }
  
  /**
   * Stop/cancel a task
   * 
   * @param {number} taskId - Task ID
   */
  stopTask(taskId) {
    const active = this.activeTasks.get(taskId);
    if (active) {
      active.controller.abort();
      this.activeTasks.delete(taskId);
    }
    
    this._updateTaskStatus(taskId, TaskStatus.CANCELLED);
    this.stats.tasksCancelled++;
    this._updateMetrics();
  }
  
  /**
   * Get task by ID
   * 
   * @param {number} taskId - Task ID
   * @returns {Object|null} Task record
   */
  getTask(taskId) {
    const row = this.db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(taskId);
    return row ? this._formatTask(row) : null;
  }
  
  /**
   * List tasks with optional filters
   * 
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.task_type] - Filter by task type
   * @param {number} limit - Maximum number of results
   * @param {number} offset - Number of results to skip
   * @returns {Array<Object>} Task records
   */
  listTasks(filters = {}, limit = 100, offset = 0) {
    let sql = 'SELECT * FROM background_tasks WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.task_type) {
      sql += ' AND task_type = ?';
      params.push(filters.task_type);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(row => this._formatTask(row));
  }
  
  /**
   * Resume all paused tasks (called on server startup)
   */
  async resumeAllPausedTasks() {
    const pausedTasks = this.listTasks({ status: TaskStatus.PAUSED });
    const runningTasks = this.listTasks({ status: TaskStatus.RUNNING });
    const resumingTasks = this.listTasks({ status: TaskStatus.RESUMING });
    
    const totalToResume = pausedTasks.length + runningTasks.length + resumingTasks.length;
    
    // Log telemetry about startup resume check
    console.log(`[BackgroundTasks] Checking for tasks to resume on startup...`);
    console.log(`[BackgroundTasks] Found: ${pausedTasks.length} paused, ${runningTasks.length} running, ${resumingTasks.length} resuming`);
    
    if (totalToResume === 0) {
      console.log(`[BackgroundTasks] No tasks to resume - starting with clean slate`);
      return;
    }
    
    let resumedCount = 0;
    let failedCount = 0;
    
    for (const task of pausedTasks) {
      try {
        await this.resumeTask(task.id);
        console.log(`[BackgroundTasks] Resumed paused task ${task.id} (${task.task_type})`);
        resumedCount++;
      } catch (error) {
        console.error(`[BackgroundTasks] Failed to resume task ${task.id}:`, error.message);
        failedCount++;
      }
    }
    
    // Also resume running tasks that were interrupted
    for (const task of runningTasks) {
      if (!this.activeTasks.has(task.id)) {
        try {
          await this.startTask(task.id, true); // Pass isResume=true
          console.log(`[BackgroundTasks] Restarted interrupted task ${task.id} (${task.task_type})`);
          resumedCount++;
        } catch (error) {
          console.error(`[BackgroundTasks] Failed to restart task ${task.id}:`, error.message);
          failedCount++;
        }
      }
    }
    
    // Check for any tasks stuck in RESUMING state (should not happen, but failsafe)
    for (const task of resumingTasks) {
      console.warn(`[BackgroundTasks] Found task ${task.id} stuck in RESUMING state, restarting...`);
      try {
        await this.startTask(task.id, true);
        resumedCount++;
      } catch (error) {
        console.error(`[BackgroundTasks] Failed to restart stuck task ${task.id}:`, error.message);
        failedCount++;
      }
    }
    
    // Summary telemetry
    console.log(`[BackgroundTasks] Resume complete: ${resumedCount} succeeded, ${failedCount} failed`);
  }
  
  /**
   * Monitor for tasks stuck in RESUMING state >4s
   * @private
   */
  _monitorResumingState(taskId) {
    const checkInterval = 1000; // Check every second
    const maxResumeDuration = 4000; // 4 seconds
    let elapsed = 0;
    
    const intervalId = setInterval(() => {
      elapsed += checkInterval;
      
      const taskRecord = this.getTask(taskId);
      
      // Stop monitoring if task is no longer resuming
      if (!taskRecord || taskRecord.status !== TaskStatus.RESUMING) {
        clearInterval(intervalId);
        return;
      }
      
      // Raise problem if stuck >4s
      if (elapsed >= maxResumeDuration) {
        clearInterval(intervalId);
        
        const problem = {
          type: 'background-task-stuck-resuming',
          severity: 'warning',
          message: `Task ${taskId} (${taskRecord.task_type}) stuck in RESUMING state for ${elapsed}ms`,
          taskId,
          taskType: taskRecord.task_type,
          timestamp: new Date().toISOString()
        };
        
        // Log the problem
        console.error(`[BackgroundTasks] PROBLEM:`, problem.message);
        
        // Broadcast via telemetry
        this._broadcastEvent('task-problem', { task: taskRecord, problem });
        
        // Update metrics
        if (this.updateMetrics) {
          this.updateMetrics({ problems: (this.stats.problems || 0) + 1 });
        }
        
        // Force transition to RUNNING
        this._updateTaskStatus(taskId, TaskStatus.RUNNING);
      }
    }, checkInterval);
  }
  
  /**
   * Handle task progress update
   * @private
   */
  _handleProgress(taskId, progress) {
    const { current, total, message, metadata } = progress;
    
    // Auto-transition from RESUMING to RUNNING on first progress update
    const taskRecord = this.getTask(taskId);
    if (taskRecord && taskRecord.status === TaskStatus.RESUMING) {
      this._updateTaskStatus(taskId, TaskStatus.RUNNING);
    }
    
    this.db.prepare(`
      UPDATE background_tasks 
      SET progress_current = ?,
          progress_total = ?,
          progress_message = ?,
          metadata = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      current,
      total,
      message || null,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString(),
      taskId
    );
    
    const updatedTaskRecord = this.getTask(taskId);
    this._broadcastEvent('task-progress', updatedTaskRecord);
    this.emit('progress', updatedTaskRecord);
  }
  
  /**
   * Handle task completion
   * @private
   */
  _handleCompletion(taskId) {
    this.activeTasks.delete(taskId);
    
    this._updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      completed_at: new Date().toISOString()
    });
    
    this.stats.tasksCompleted++;
    this._updateMetrics();
    
    const taskRecord = this.getTask(taskId);
    this._broadcastEvent('task-completed', taskRecord);
    this.emit('completed', taskRecord);
  }
  
  /**
   * Handle task error
   * @private
   */
  _handleError(taskId, error) {
    this.activeTasks.delete(taskId);
    
    const errorMessage = error?.message || String(error);
    
    this.db.prepare(`
      UPDATE background_tasks
      SET status = ?,
          error_message = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      TaskStatus.FAILED,
      errorMessage,
      new Date().toISOString(),
      taskId
    );
    
    this.stats.tasksFailed++;
    this._updateMetrics();
    
    const taskRecord = this.getTask(taskId);
    this._broadcastEvent('task-error', taskRecord);
    // Note: We don't emit 'error' event here because:
    // 1. EventEmitter 'error' has special semantics (throws if no listeners)
    // 2. We already broadcast 'task-error' for subscribers
    // 3. Tests can listen to 'task-error' without Jest treating it as unhandled
    
    console.error(`[BackgroundTasks] Task ${taskId} failed:`, errorMessage);
  }
  
  /**
   * Update task status
   * @private
   */
  _updateTaskStatus(taskId, status, extraFields = {}) {
    const updates = {
      status,
      updated_at: new Date().toISOString(),
      ...extraFields
    };
    
    const setClauses = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    this.db.prepare(`UPDATE background_tasks SET ${setClauses} WHERE id = ?`)
      .run(...values, taskId);
    
    const taskRecord = this.getTask(taskId);
    this._broadcastEvent('task-status-changed', taskRecord);
    this.emit('status-changed', taskRecord);
  }
  
  /**
   * Format task record for API
   * @private
   */
  _formatTask(row) {
    if (!row) return null;
    
    const config = row.config ? JSON.parse(row.config) : {};
    const metadata = row.metadata ? JSON.parse(row.metadata) : null;
    
    const progressPercent = row.progress_total > 0
      ? Math.round((row.progress_current / row.progress_total) * 100)
      : 0;
    
    return {
      id: row.id,
      task_type: row.task_type,
      status: row.status,
      progress: {
        current: row.progress_current || 0,
        total: row.progress_total || 0,
        percent: progressPercent,
        message: row.progress_message || null
      },
      config,
      metadata,
      error_message: row.error_message || null,
      created_at: row.created_at,
      started_at: row.started_at || null,
      updated_at: row.updated_at,
      completed_at: row.completed_at || null
    };
  }
  
  /**
   * Broadcast event via SSE
   * @private
   */
  _broadcastEvent(eventType, data) {
    if (tof(this.broadcastEvent) === 'function') {
      try {
        this.broadcastEvent(eventType, data);
      } catch (error) {
        console.error('[BackgroundTasks] Broadcast error:', error);
      }
    }
  }
  
  /**
   * Update metrics
   * @private
   */
  _updateMetrics() {
    const metricsData = {
      tasksActive: this.activeTasks.size,
      tasksStarted: this.stats.tasksStarted,
      tasksCompleted: this.stats.tasksCompleted,
      tasksFailed: this.stats.tasksFailed,
      tasksCancelled: this.stats.tasksCancelled
    };
    
    if (tof(this.updateMetrics) === 'function') {
      try {
        this.updateMetrics(metricsData);
      } catch (error) {
        console.error('[BackgroundTasks] Metrics update error:', error);
      }
    }
  }
}

module.exports = {
  BackgroundTaskManager,
  TaskStatus
};
