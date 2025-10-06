/**
 * API Routes for Background Tasks
 * 
 * Endpoints:
 * - GET /api/background-tasks - List tasks with filters
 * - GET /api/background-tasks/:id - Get task details
 * - POST /api/background-tasks - Create new task
 * - POST /api/background-tasks/:id/pause - Pause task
 * - POST /api/background-tasks/:id/resume - Resume task
 * - POST /api/background-tasks/:id/stop - Stop/cancel task
 * - DELETE /api/background-tasks/:id - Delete task
 * - GET /api/background-tasks/stats/compression - Get compression statistics
 */

const express = require('express');
const router = express.Router();

/**
 * Create background tasks router
 * @param {BackgroundTaskManager} taskManager - Background task manager instance
 * @param {Function} getDbRW - Function to get writable database accessor
 * @returns {express.Router} Express router
 */
function createBackgroundTasksRouter(taskManager, getDbRW) {
  
  /**
   * GET /api/background-tasks - List tasks with filters
   * Query params:
   * - status: Filter by status (pending|running|paused|completed|failed|cancelled)
   * - taskType: Filter by task type
   * - limit: Maximum number of results (default: 100)
   * - offset: Number of results to skip (default: 0)
   */
  router.get('/', async (req, res) => {
    try {
      const { status, taskType, limit = 100, offset = 0 } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (taskType) filters.task_type = taskType;
      
      const tasks = taskManager.listTasks(filters, parseInt(limit), parseInt(offset));
      
      res.json({
        success: true,
        tasks,
        filters,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
    } catch (error) {
      console.error('[API] Error listing background tasks:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/background-tasks/:id - Get task details
   */
  router.get('/:id', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      const task = taskManager.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }
      
      res.json({
        success: true,
        task
      });
      
    } catch (error) {
      console.error('[API] Error getting background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/background-tasks - Create new task
   * Body:
   * - taskType: Type of task (e.g., 'article-compression')
   * - config: Task configuration object (optional)
   * - autoStart: Whether to automatically start the task (default: false)
   */
  router.post('/', async (req, res) => {
    try {
      const { taskType, config = {}, autoStart = false } = req.body;
      
      if (!taskType) {
        return res.status(400).json({
          success: false,
          error: 'taskType is required'
        });
      }
      
      // Create task
      const taskId = taskManager.createTask(taskType, config);
      
      // Optionally start immediately
      if (autoStart) {
        await taskManager.startTask(taskId);
      }
      
      const task = taskManager.getTask(taskId);
      
      res.status(201).json({
        success: true,
        task,
        message: autoStart ? 'Task created and started' : 'Task created'
      });
      
    } catch (error) {
      console.error('[API] Error creating background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/background-tasks/:id/start - Start task
   */
  router.post('/:id/start', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      await taskManager.startTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task started'
      });
      
    } catch (error) {
      console.error('[API] Error starting background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/background-tasks/:id/pause - Pause task
   */
  router.post('/:id/pause', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      await taskManager.pauseTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task paused'
      });
      
    } catch (error) {
      console.error('[API] Error pausing background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/background-tasks/:id/resume - Resume task
   */
  router.post('/:id/resume', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      await taskManager.resumeTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task resumed'
      });
      
    } catch (error) {
      console.error('[API] Error resuming background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * POST /api/background-tasks/:id/stop - Stop/cancel task
   */
  router.post('/:id/stop', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      await taskManager.stopTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task stopped'
      });
      
    } catch (error) {
      console.error('[API] Error stopping background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * DELETE /api/background-tasks/:id - Delete task
   * Only allowed for completed, failed, or cancelled tasks
   */
  router.delete('/:id', async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid task ID'
        });
      }
      
      const task = taskManager.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }
      
      // Only allow deletion of terminal states
      if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete task in non-terminal state. Stop the task first.'
        });
      }
      
      // Delete from database
      taskManager.db.prepare('DELETE FROM background_tasks WHERE id = ?').run(taskId);
      
      res.json({
        success: true,
        message: 'Task deleted'
      });
      
    } catch (error) {
      console.error('[API] Error deleting background task:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  /**
   * GET /api/background-tasks/stats/compression - Get compression statistics
   */
  router.get('/stats/compression', async (req, res) => {
    try {
      const db = getDbRW();
      const stats = db.getCompressionStats();
      
      res.json({
        success: true,
        stats
      });
      
    } catch (error) {
      console.error('[API] Error getting compression statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  return router;
}

module.exports = { createBackgroundTasksRouter };
