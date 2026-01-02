'use strict';

const express = require('express');
const request = require('supertest');
const { createBackgroundTasksRouter } = require('../../../src/api/routes/background-tasks');
const { RateLimitError } = require('../../../src/background/errors/RateLimitError');
const { ProposedAction } = require('../../../src/background/actions/ProposedAction');
const { Action } = require('../../../src/background/actions/Action');

jest.mock('../../../src/background/tasks/taskDefinitions', () => ({
  getTaskDefinition: jest.fn(),
  getTaskSummaries: jest.fn(),
  validateTaskParameters: jest.fn()
}));

const {
  getTaskDefinition,
  getTaskSummaries,
  validateTaskParameters
} = require('../../../src/background/tasks/taskDefinitions');

function createRateLimitError() {
  const action = new Action({
    id: 'stop-123',
    type: 'stop-task',
    label: 'Stop Task #123',
    parameters: { taskId: 123 }
  });

  const proposedAction = new ProposedAction({
    action,
    reason: 'Task already running',
    severity: 'warning',
    priority: 10
  });

  return new RateLimitError('Rate limited', {
    retryAfter: 30,
    proposedActions: [proposedAction],
    context: { taskType: 'analysis' }
  });
}

function createApp(overrides = {}) {
  const hasTaskManager = Object.prototype.hasOwnProperty.call(overrides, 'taskManager');
  const taskManager = hasTaskManager ? overrides.taskManager : {
    listTasks: jest.fn().mockReturnValue([]),
    getTask: jest.fn(),
    createTask: jest.fn().mockReturnValue(100),
    startTask: jest.fn().mockResolvedValue(undefined),
    pauseTask: jest.fn().mockResolvedValue({ ok: true }),
    resumeTask: jest.fn().mockResolvedValue({ ok: true }),
    stopTask: jest.fn().mockResolvedValue({ ok: true })
  };

  if (!overrides.skipDb && taskManager && !taskManager.db) {
    const run = jest.fn();
    const statement = { run };
    const prepare = jest.fn(() => statement);
    taskManager.db = { prepare, _run: run };
  }

  const getDbRW = Object.prototype.hasOwnProperty.call(overrides, 'getDbRW')
    ? overrides.getDbRW
    : (() => (taskManager ? taskManager.db : null));
  const logger = overrides.logger ?? { error: jest.fn(), info: jest.fn(), log: jest.fn() };

  const router = createBackgroundTasksRouter({
    taskManager,
    getDbRW,
    logger
  });

  const app = express();
  app.use(express.json());
  app.use(router);

  return { app, taskManager, logger, getDbRW };
}

describe('background tasks router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTaskSummaries.mockReturnValue([{ type: 'sync', label: 'Sync Task' }]);
    getTaskDefinition.mockImplementation((taskType) => (taskType === 'sync' ? { type: 'sync', parameters: [] } : null));
    validateTaskParameters.mockReturnValue({ valid: true, errors: [] });
  });

  test('GET /types returns task summaries', async () => {
    const { app } = createApp();

    const response = await request(app).get('/types');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      taskTypes: [{ type: 'sync', label: 'Sync Task' }]
    });
    expect(getTaskSummaries).toHaveBeenCalledTimes(1);
  });

  test('GET /types handles errors', async () => {
    getTaskSummaries.mockImplementation(() => {
      throw new Error('boom');
    });
    const { app, logger } = createApp();

    const response = await request(app).get('/types');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('INTERNAL_ERROR');
    expect(logger.error).toHaveBeenCalled();
  });

  test('GET /types/:taskType returns definition', async () => {
    const { app } = createApp();

    const response = await request(app).get('/types/sync');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.definition).toEqual({ type: 'sync', parameters: [] });
  });

  test('GET /types/:taskType returns 404 for unknown type', async () => {
    const { app } = createApp();

    const response = await request(app).get('/types/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('TASK_TYPE_NOT_FOUND');
  });

  test('GET / lists tasks with filters and pagination', async () => {
    const { app, taskManager } = createApp();
    const tasks = [{ id: 1, status: 'running' }];
    taskManager.listTasks.mockReturnValue(tasks);

    const response = await request(app)
      .get('/')
      .query({ status: 'running', taskType: 'sync', limit: '5', offset: '3' });

    expect(response.status).toBe(200);
    expect(taskManager.listTasks).toHaveBeenCalledWith({ status: 'running', task_type: 'sync' }, 5, 3);
    expect(response.body).toEqual({
      success: true,
      tasks,
      filters: { status: 'running', task_type: 'sync' },
      limit: 5,
      offset: 3
    });
  });

  test('GET / returns 503 when task manager unavailable', async () => {
    const { app } = createApp({ taskManager: null, skipDb: true, getDbRW: jest.fn() });

    const response = await request(app).get('/');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('TASK_MANAGER_UNAVAILABLE');
  });

  test('GET /:id rejects invalid task id', async () => {
    const { app } = createApp();

    const response = await request(app).get('/abc');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TASK_ID');
  });

  test('GET /:id returns 404 when task missing', async () => {
    const { app, taskManager } = createApp();
    taskManager.getTask.mockReturnValue(null);

    const response = await request(app).get('/42');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('TASK_NOT_FOUND');
  });

  test('POST / validates taskType is required', async () => {
    const { app } = createApp();

    const response = await request(app)
      .post('/')
      .send({ parameters: {} });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TASK_TYPE_REQUIRED');
  });

  test('POST / validates parameters using task definition', async () => {
    validateTaskParameters.mockReturnValue({ valid: false, errors: [{ field: 'foo', message: 'invalid' }] });
    const { app } = createApp();

    const response = await request(app)
      .post('/')
      .send({ taskType: 'sync', parameters: { foo: 'bar' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TASK_PARAMETERS');
    expect(response.body.details.validationErrors).toEqual([{ field: 'foo', message: 'invalid' }]);
  });

  test('POST / creates task and returns 201 without auto start', async () => {
    const { app, taskManager } = createApp();
    const task = { id: 100, status: 'pending' };
    taskManager.getTask.mockReturnValue(task);

    const response = await request(app)
      .post('/')
      .send({ taskType: 'sync', parameters: { foo: 'bar' } });

    expect(response.status).toBe(201);
    expect(taskManager.createTask).toHaveBeenCalledWith('sync', { foo: 'bar' });
    expect(taskManager.startTask).not.toHaveBeenCalled();
    expect(response.body).toEqual({
      success: true,
      task,
      message: 'Task created'
    });
  });

  test('POST / creates task and starts it when autoStart true', async () => {
    const { app, taskManager } = createApp();
    const task = { id: 100, status: 'running' };
    taskManager.getTask.mockReturnValue(task);

    const response = await request(app)
      .post('/')
      .send({ taskType: 'sync', parameters: {}, autoStart: true });

    expect(response.status).toBe(201);
    expect(taskManager.startTask).toHaveBeenCalledWith(100);
    expect(response.body.message).toBe('Task created and started');
  });

  test('POST /:id/start surfaces rate limit errors', async () => {
    const rateLimitError = createRateLimitError();
    const { app, taskManager } = createApp();
    taskManager.startTask.mockRejectedValue(rateLimitError);

    const response = await request(app)
      .post('/123/start');

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Rate limited',
      retryAfter: 30,
      context: { taskType: 'analysis' }
    });
    expect(response.body.retryAfter).toBe(30);
    expect(response.body.context).toEqual({ taskType: 'analysis' });
    expect(Array.isArray(response.body.proposedActions)).toBe(true);
    expect(response.body.proposedActions).toHaveLength(1);
    expect(response.body.proposedActions[0]).toEqual({
      action: {
        id: 'stop-123',
        type: 'stop-task',
        label: 'Stop Task #123',
        parameters: { taskId: 123 }
      },
      reason: 'Task already running',
      description: null,
      severity: 'warning',
      priority: 10
    });
  });

  test('POST /:id/pause returns mutated task payload', async () => {
    const task = { id: 123, status: 'paused' };
    const { app, taskManager } = createApp();
    taskManager.getTask.mockReturnValue(task);

    const response = await request(app)
      .post('/123/pause');

    expect(response.status).toBe(200);
    expect(taskManager.pauseTask).toHaveBeenCalledWith(123);
    expect(response.body).toEqual({ success: true, task, message: 'Task paused', result: { ok: true } });
  });

  test('DELETE /:id rejects when task not terminal', async () => {
    const { app, taskManager } = createApp();
    taskManager.getTask.mockReturnValue({ id: 55, status: 'running' });

    const response = await request(app).delete('/55');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TASK_NOT_TERMINAL');
  });

  test('DELETE /:id removes task and cleans database when terminal', async () => {
    const run = jest.fn();
    const statement = { run };
    const prepare = jest.fn(() => statement);
    const taskManager = {
      listTasks: jest.fn(),
      getTask: jest.fn().mockReturnValue({ id: 77, status: 'completed' }),
      createTask: jest.fn(),
      startTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      stopTask: jest.fn(),
      db: { prepare }
    };

    const { app } = createApp({ taskManager, skipDb: true, getDbRW: () => taskManager.db });

    const response = await request(app).delete('/77');

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(77);
    expect(response.body).toEqual({ success: true, message: 'Task deleted' });
  });

  test('GET /stats/compression returns 503 when database unavailable', async () => {
    const taskManager = {
      listTasks: jest.fn(),
      getTask: jest.fn(),
      createTask: jest.fn(),
      startTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      stopTask: jest.fn()
    };

    const { app } = createApp({ taskManager, skipDb: true, getDbRW: () => null });

    const response = await request(app).get('/stats/compression');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('DATABASE_UNAVAILABLE');
  });

  test('GET /stats/compression returns zeroed stats when accessor lacks method', async () => {
    const taskManager = {
      listTasks: jest.fn(),
      getTask: jest.fn(),
      createTask: jest.fn(),
      startTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      stopTask: jest.fn()
    };

    const { app } = createApp({ taskManager, skipDb: true, getDbRW: () => ({}) });

    const response = await request(app).get('/stats/compression');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
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
  });

  test('GET /stats/compression returns computed stats when accessor available', async () => {
    const stats = { totalArticles: 5 };
    const taskManager = {
      listTasks: jest.fn(),
      getTask: jest.fn(),
      createTask: jest.fn(),
      startTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      stopTask: jest.fn()
    };

    const db = { getCompressionStats: jest.fn(() => stats) };
    const { app } = createApp({ taskManager, skipDb: true, getDbRW: () => db });

    const response = await request(app).get('/stats/compression');

    expect(response.status).toBe(200);
    expect(db.getCompressionStats).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({ success: true, stats });
  });

  test('POST /actions/execute validates payload structure', async () => {
    const { app } = createApp();

    const response = await request(app)
      .post('/actions/execute')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_ACTION');
  });

  test('POST /actions/execute executes known actions', async () => {
    const { app, taskManager } = createApp();
    taskManager.getTask.mockReturnValue({ id: 5, status: 'paused' });

    const response = await request(app)
      .post('/actions/execute')
      .send({ action: { type: 'pause-task', parameters: { taskId: 5 } } });

    expect(response.status).toBe(200);
    expect(taskManager.pauseTask).toHaveBeenCalledWith(5);
    expect(response.body.task).toEqual({ id: 5, status: 'paused' });
  });

  test('POST /actions/execute handles rate limit errors', async () => {
    const rateLimitError = createRateLimitError();
    const { app, taskManager } = createApp();
    taskManager.pauseTask.mockRejectedValue(rateLimitError);

    const response = await request(app)
      .post('/actions/execute')
      .send({ action: { type: 'pause-task', parameters: { taskId: 5 } } });

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Rate limited',
      retryAfter: 30,
      context: { taskType: 'analysis' }
    });
    expect(response.body.retryAfter).toBe(30);
    expect(response.body.context).toEqual({ taskType: 'analysis' });
    expect(Array.isArray(response.body.proposedActions)).toBe(true);
    expect(response.body.proposedActions).toHaveLength(1);
    expect(response.body.proposedActions[0]).toEqual({
      action: {
        id: 'stop-123',
        type: 'stop-task',
        label: 'Stop Task #123',
        parameters: { taskId: 123 }
      },
      reason: 'Task already running',
      description: null,
      severity: 'warning',
      priority: 10
    });
  });
});
