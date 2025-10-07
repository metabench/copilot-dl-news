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
const { getTaskDefinition, getTaskSummaries, validateTaskParameters } = require('../../../background/tasks/taskDefinitions');
const { BadRequestError, NotFoundError, InternalServerError, ServiceUnavailableError } = require('../errors/HttpError');

/**
 * Create background tasks router
 * @param {BackgroundTaskManager} taskManager - Background task manager instance
 * @param {Function} getDbRW - Function to get writable database accessor
 * @returns {express.Router} Express router
 */
function createBackgroundTasksRouter(taskManager, getDbRW) {
  
  /**
   * GET /api/background-tasks/types - Get available task types
   * Returns list of task types with summaries (for UI task creation)
   */
  router.get('/types', (req, res, next) => {
    try {
      const summaries = getTaskSummaries();
      
      res.json({
        success: true,
        taskTypes: summaries
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * GET /api/background-tasks/types/:taskType - Get task definition with schema
   * Returns complete schema for property editor rendering
   */
  router.get('/types/:taskType', (req, res, next) => {
    try {
      const { taskType } = req.params;
      const definition = getTaskDefinition(taskType);
      
      if (!definition) {
        return next(new NotFoundError(`Unknown task type: ${taskType}`, 'task-type'));
      }
      
      res.json({
        success: true,
        definition
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * GET /api/background-tasks - List tasks with filters
   * Query params:
   * - status: Filter by status (pending|running|paused|completed|failed|cancelled)
   * - taskType: Filter by task type
   * - limit: Maximum number of results (default: 100)
   * - offset: Number of results to skip (default: 0)
   */
  router.get('/', async (req, res, next) => {
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
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * GET /api/background-tasks/:id - Get task details
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      const task = taskManager.getTask(taskId);
      
      if (!task) {
        return next(new NotFoundError('Task not found', 'background-task'));
      }
      
      res.json({
        success: true,
        task
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * POST /api/background-tasks - Create new task
   * Body:
   * - taskType: Type of task (e.g., 'article-compression')
   * - parameters: Task parameters object (validated against schema)
   * - autoStart: Whether to automatically start the task (default: false)
   */
  router.post('/', async (req, res, next) => {
    try {
      const { taskType, parameters = {}, autoStart = false } = req.body;
      
      if (!taskType) {
        return next(new BadRequestError('taskType is required'));
      }
      
      // Validate task type exists
      const definition = getTaskDefinition(taskType);
      if (!definition) {
        return next(new BadRequestError(`Unknown task type: ${taskType}`));
      }
      
      // Validate parameters against schema
      const validation = validateTaskParameters(taskType, parameters);
      if (!validation.valid) {
        return next(new BadRequestError('Invalid task parameters', { validationErrors: validation.errors }));
      }
      
      // Create task with validated parameters
      const taskId = taskManager.createTask(taskType, parameters);
      
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
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * POST /api/background-tasks/:id/start - Start task
   */
  router.post('/:id/start', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      await taskManager.startTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task started'
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * POST /api/background-tasks/:id/pause - Pause task
   */
  router.post('/:id/pause', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      await taskManager.pauseTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task paused'
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * POST /api/background-tasks/:id/resume - Resume task
   */
  router.post('/:id/resume', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      await taskManager.resumeTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task resumed'
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * POST /api/background-tasks/:id/stop - Stop/cancel task
   */
  router.post('/:id/stop', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      await taskManager.stopTask(taskId);
      const task = taskManager.getTask(taskId);
      
      res.json({
        success: true,
        task,
        message: 'Task stopped'
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * DELETE /api/background-tasks/:id - Delete task
   * Only allowed for completed, failed, or cancelled tasks
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const taskId = parseInt(req.params.id);
      
      if (isNaN(taskId)) {
        return next(new BadRequestError('Invalid task ID'));
      }
      
      const task = taskManager.getTask(taskId);
      
      if (!task) {
        return next(new NotFoundError('Task not found', 'background-task'));
      }
      
      // Only allow deletion of terminal states
      if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
        return next(new BadRequestError('Cannot delete task in non-terminal state. Stop the task first.'));
      }
      
      // Delete from database
      taskManager.db.prepare('DELETE FROM background_tasks WHERE id = ?').run(taskId);
      
      res.json({
        success: true,
        message: 'Task deleted'
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  /**
   * GET /api/background-tasks/stats/compression - Get compression statistics
   */
  router.get('/stats/compression', async (req, res, next) => {
    try {
      const db = getDbRW();
      
      // Check if database and method are available
      if (!db) {
        return next(new ServiceUnavailableError('Database not available'));
      }
      
      if (typeof db.getCompressionStats !== 'function') {
        // Method not implemented - return empty stats
        return res.json({
          success: true,
          stats: {
            totalArticles: 0,
            individuallyCompressed: 0,
            bucketCompressed: 0,
            uncompressed: 0,
            totalCompressedSize: 0,
            totalOriginalSize: 0,
            averageCompressionRatio: 0
          }
        });
      }
      
      const stats = db.getCompressionStats();
      
      res.json({
        success: true,
        stats
      });
      
    } catch (error) {
      next(new InternalServerError(error.message));
    }
  });
  
  return router;
}

module.exports = { createBackgroundTasksRouter };
