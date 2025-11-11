'use strict';

const express = require('express');
const {
  getTaskDefinition,
  getTaskSummaries,
  validateTaskParameters
} = require('../../background/tasks/taskDefinitions');
const { RateLimitError } = require('../../background/errors/RateLimitError');

function defaultLogger(logger) {
  if (logger && typeof logger.error === 'function') {
    return logger;
  }
  return console;
}

function createErrorPayload(code, message, details) {
  const payload = {
    error: code,
    message
  };

  if (details !== undefined) {
    payload.details = details;
  }

  payload.timestamp = new Date().toISOString();
  return payload;
}

function createBackgroundTasksRouter({ taskManager, getDbRW, logger } = {}) {
  const router = express.Router();
  const log = defaultLogger(logger);

  function ensureTaskManager(res) {
    if (taskManager) {
      return taskManager;
    }

    res.status(503).json(createErrorPayload(
      'TASK_MANAGER_UNAVAILABLE',
      'Background task manager is not available. Ensure the API server is started with a configured BackgroundTaskManager.'
    ));
    return null;
  }

  function parseTaskId(value, res) {
    const numericId = Number.parseInt(value, 10);
    if (Number.isNaN(numericId) || numericId < 0) {
      res.status(400).json(createErrorPayload('INVALID_TASK_ID', 'The supplied task id must be a positive integer.'));
      return null;
    }
    return numericId;
  }

  function resolveDb() {
    if (taskManager && taskManager.db) {
      return taskManager.db;
    }

    if (typeof getDbRW === 'function') {
      try {
        return getDbRW();
      } catch (err) {
        log.error('Failed to resolve writable database for background tasks:', err);
        return null;
      }
    }

    return null;
  }

  router.get('/types', (req, res) => {
    try {
      const summaries = getTaskSummaries();
      res.json({
        success: true,
        taskTypes: summaries
      });
    } catch (error) {
      log.error('Failed to load background task types:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch task definitions.'));
    }
  });

  router.get('/types/:taskType', (req, res) => {
    try {
      const { taskType } = req.params;
      const definition = getTaskDefinition(taskType);

      if (!definition) {
        return res.status(404).json(createErrorPayload('TASK_TYPE_NOT_FOUND', `Unknown task type: ${taskType}`));
      }

      res.json({
        success: true,
        definition
      });
    } catch (error) {
      log.error('Failed to fetch background task definition:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch task definition.'));
    }
  });

  router.get('/', (req, res) => {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return;
    }

    try {
      const { status, taskType } = req.query;
      const limit = Number.parseInt(req.query.limit, 10);
      const offset = Number.parseInt(req.query.offset, 10);

      const filters = {};
      if (status) filters.status = status;
      if (taskType) filters.task_type = taskType;

      const tasks = manager.listTasks(
        filters,
        Number.isNaN(limit) ? 100 : limit,
        Number.isNaN(offset) ? 0 : offset
      );

      res.json({
        success: true,
        tasks,
        filters,
        limit: Number.isNaN(limit) ? 100 : limit,
        offset: Number.isNaN(offset) ? 0 : offset
      });
    } catch (error) {
      log.error('Failed to list background tasks:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to list background tasks.'));
    }
  });

  router.get('/:id', (req, res) => {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return;
    }

    const taskId = parseTaskId(req.params.id, res);
    if (taskId == null) {
      return;
    }

    try {
      const task = manager.getTask(taskId);

      if (!task) {
        return res.status(404).json(createErrorPayload('TASK_NOT_FOUND', 'Task not found.'));
      }

      res.json({
        success: true,
        task
      });
    } catch (error) {
      log.error('Failed to get background task:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch background task.'));
    }
  });

  router.post('/', async (req, res) => {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return;
    }

    try {
      const { taskType, parameters = {}, autoStart = false } = req.body || {};

      if (!taskType) {
        return res.status(400).json(createErrorPayload('TASK_TYPE_REQUIRED', 'taskType is required.'));
      }

      const definition = getTaskDefinition(taskType);
      if (!definition) {
        return res.status(400).json(createErrorPayload('TASK_TYPE_UNKNOWN', `Unknown task type: ${taskType}`));
      }

      const validation = validateTaskParameters(taskType, parameters);
      if (!validation.valid) {
        return res.status(400).json(
          createErrorPayload('INVALID_TASK_PARAMETERS', 'Invalid task parameters.', { validationErrors: validation.errors })
        );
      }

      const taskId = manager.createTask(taskType, parameters);

      if (autoStart) {
        await manager.startTask(taskId);
      }

      const task = manager.getTask(taskId);

      res.status(201).json({
        success: true,
        task,
        message: autoStart ? 'Task created and started' : 'Task created'
      });
    } catch (error) {
      log.error('Failed to create background task:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to create background task.'));
    }
  });

  async function mutateTask(req, res, action, mutateFn) {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return null;
    }

    const taskId = parseTaskId(req.params.id, res);
    if (taskId == null) {
      return null;
    }

    try {
      const mutationResult = await mutateFn(manager, taskId);
      const task = manager.getTask(taskId);

      if (!task) {
        return res.status(404).json(createErrorPayload('TASK_NOT_FOUND', 'Task not found.'));
      }

      const payload = {
        success: true,
        task,
        message: `Task ${action}`
      };

      if (mutationResult !== undefined) {
        payload.result = mutationResult;
      }

      return res.json(payload);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: error.message,
            retryAfter: error.retryAfter,
            context: error.context
          },
          proposedActions: Array.isArray(error.proposedActions) ? error.proposedActions.map((action) => action.toJSON()) : [],
          retryAfter: error.retryAfter,
          context: error.context
        });
      }

      log.error(`Failed to ${action} background task:`, error);
      return res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || `Failed to ${action} background task.`));
    }
  }

  router.post('/:id/start', (req, res) => mutateTask(req, res, 'started', (manager, taskId) => manager.startTask(taskId)));
  router.post('/:id/pause', (req, res) => mutateTask(req, res, 'paused', (manager, taskId) => manager.pauseTask(taskId)));
  router.post('/:id/resume', (req, res) => mutateTask(req, res, 'resumed', (manager, taskId) => manager.resumeTask(taskId)));
  router.post('/:id/stop', (req, res) => mutateTask(req, res, 'stopped', (manager, taskId) => manager.stopTask(taskId)));

  router.delete('/:id', (req, res) => {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return;
    }

    const taskId = parseTaskId(req.params.id, res);
    if (taskId == null) {
      return;
    }

    try {
      const task = manager.getTask(taskId);
      if (!task) {
        return res.status(404).json(createErrorPayload('TASK_NOT_FOUND', 'Task not found.'));
      }

      if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
        return res.status(400).json(createErrorPayload('TASK_NOT_TERMINAL', 'Cannot delete a task that is not in a terminal state. Stop the task first.'));
      }

      const db = resolveDb();
      if (db && typeof db.prepare === 'function') {
        db.prepare('DELETE FROM background_tasks WHERE id = ?').run(taskId);
      }

      res.json({
        success: true,
        message: 'Task deleted'
      });
    } catch (error) {
      log.error('Failed to delete background task:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to delete background task.'));
    }
  });

  router.get('/stats/compression', (req, res) => {
    try {
      const db = resolveDb();

      if (!db) {
        return res.status(503).json(createErrorPayload('DATABASE_UNAVAILABLE', 'Writable database not available.'));
      }

      if (typeof db.getCompressionStats !== 'function') {
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
      log.error('Failed to fetch compression stats:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to fetch compression stats.'));
    }
  });

  router.post('/actions/execute', async (req, res) => {
    const manager = ensureTaskManager(res);
    if (!manager) {
      return;
    }

    try {
      const { action } = req.body || {};

      if (!action || typeof action !== 'object') {
        return res.status(400).json(createErrorPayload('INVALID_ACTION', 'Action payload is required.'));
      }

      const { type, parameters } = action;
      if (!type) {
        return res.status(400).json(createErrorPayload('ACTION_TYPE_REQUIRED', 'Action type is required.'));
      }

      if (!parameters || typeof parameters !== 'object') {
        return res.status(400).json(createErrorPayload('ACTION_PARAMETERS_REQUIRED', 'Action parameters are required.'));
      }

      const taskId = Number.parseInt(parameters.taskId, 10);
      if (Number.isNaN(taskId) || taskId < 0) {
        return res.status(400).json(createErrorPayload('INVALID_TASK_ID', 'Task id must be provided as a positive integer.'));
      }

      switch (type) {
        case 'stop-task':
          await manager.stopTask(taskId);
          break;
        case 'pause-task':
          await manager.pauseTask(taskId);
          break;
        case 'resume-task':
          await manager.resumeTask(taskId);
          break;
        case 'start-task':
          await manager.startTask(taskId);
          break;
        default:
          return res.status(400).json(createErrorPayload('UNKNOWN_ACTION', `Unknown action type: ${type}`));
      }

      const task = manager.getTask(taskId);

      res.json({
        success: true,
        message: 'Action executed successfully',
        task
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: error.message,
            retryAfter: error.retryAfter,
            context: error.context
          },
          proposedActions: Array.isArray(error.proposedActions) ? error.proposedActions.map((action) => action.toJSON()) : [],
          retryAfter: error.retryAfter,
          context: error.context
        });
      }

      log.error('Failed to execute background task action:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to execute action.'));
    }
  });

  return router;
}

module.exports = {
  createBackgroundTasksRouter
};
