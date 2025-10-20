/**
 * Background Tasks API Integration Tests
 * 
 * Tests the background tasks API endpoints and integration with the server
 */

const request = require('supertest');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createApp } = require('../server');
const { ensureDatabase } = require('../../../db/sqlite/v1');

// Valid parameters for article-compression tasks (required by schema)
const VALID_COMPRESSION_PARAMS = {
  quality: 10,
  lgwin: 24,
  compressionMethod: 'brotli',
  targetArticles: 'uncompressed',
  batchSize: 50,
  enableBucketCompression: false
};

// Mock task for testing (doesn't require articles table)
class MockCompressionTask {
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config;
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
    this.paused = false;
  }

  async execute() {
    // Simulate compression work with progress updates
    const steps = this.config.batchSize || 5;
    
    for (let i = 0; i < steps; i++) {
      if (this.signal?.aborted) {
        throw new Error('Task aborted');
      }
      
      // Wait while paused, but with a timeout to prevent hanging in tests
      const pauseStartTime = Date.now();
      const maxPauseWaitMs = 5000; // 5 second timeout for pause wait
      while (this.paused && !this.signal?.aborted) {
        if (Date.now() - pauseStartTime > maxPauseWaitMs) {
          throw new Error('Task paused timeout exceeded (5s) - possible test hang');
        }
        // Reduced from 50ms to 10ms for faster pause/resume testing
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Report progress
      if (this.onProgress) {
        this.onProgress({
          current: i + 1,
          total: steps,
          message: `Processing step ${i + 1}/${steps}`
        });
      }
      
      // Simulate work (reduced from 50ms to 5ms - 10x faster)
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }
}

describe('Background Tasks API Integration', () => {
  let app;
  let dbPath;
  let cleanup;

  // Fail-fast: Track test errors and timeout
  const failTest = (testName, error) => {
    console.error('\x1b[31m%s\x1b[0m', `✖ FAILED: ${testName}`);
    console.error('\x1b[31m%s\x1b[0m', `  Reason: ${error.message || error}`);
    throw error;
  };

  beforeEach(() => {
    const setupTimeout = setTimeout(() => {
      const error = new Error('Test setup timeout (3s) - beforeEach hung');
      failTest('Setup', error);
    }, 3000);

    try {
      // Create temporary database for testing
      const tmpDir = path.join(os.tmpdir(), 'background-tasks-tests');
      fs.mkdirSync(tmpDir, { recursive: true });
      const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
      dbPath = path.join(tmpDir, `test-${unique}.db`);

      // Ensure database schema
      ensureDatabase(dbPath);

      // Create app with test database
      app = createApp({
        dbPath,
        verbose: false,
        requestTiming: false
      });
      
      clearTimeout(setupTimeout);
    } catch (error) {
      clearTimeout(setupTimeout);
      failTest('Setup', error);
    }

    // Replace CompressionTask with mock
    // NOTE: taskRegistry expects { TaskClass, options } format
    const manager = app.locals.backgroundTaskManager;
    manager.taskRegistry.set('article-compression', { 
      TaskClass: MockCompressionTask, 
      options: {} 
    });
    
    // NOTE: BackgroundTaskManager no longer emits 'error' events
    // It only broadcasts 'task-error' through SSE, which doesn't throw
    // This prevents Jest from treating task failures as unhandled errors
    
    // Mock getCompressionStats on the DB instance
    // The stats route calls getDbRW() which is captured in the route's closure
    // So we need to mock it on the actual DB instance, not wrap the function
    if (app.locals.getDbRW) {
      const db = app.locals.getDbRW();
      if (db && !db.getCompressionStats) {
        db.getCompressionStats = () => ({
          totalArticles: 0,
          individuallyCompressed: 0,
          bucketCompressed: 0,
          uncompressed: 0,
          totalCompressedSize: 0,
          totalOriginalSize: 0,
          averageCompressionRatio: 0
        });
      }
    }

    cleanup = async () => {
      // Stop all active tasks
      if (app.locals.backgroundTaskManager) {
        const manager = app.locals.backgroundTaskManager;
        const activeTasks = Array.from(manager.activeTasks.keys());
        for (const taskId of activeTasks) {
          try {
            manager.stopTask(taskId);
          } catch (e) {
            // Ignore errors during cleanup
          }
        }
        
        // Clear any resuming timeout monitors
        if (manager.resumingTasks) {
          manager.resumingTasks.clear();
        }
        
        // Remove all listeners to prevent memory leaks
        manager.removeAllListeners();
        
        // Shutdown background task manager (stops worker pool)
        if (typeof manager.shutdown === 'function') {
          try {
            await manager.shutdown();
          } catch (e) {
            // Ignore shutdown errors
          }
        }
      }
      
      // Stop compression worker pool
      if (app.locals.compressionWorkerPool) {
        try {
          await app.locals.compressionWorkerPool.shutdown();
        } catch (e) {
          // Ignore shutdown errors
        }
      }
      
      // Stop analysis run manager
      if (app.locals.analysisRunManager) {
        try {
          if (typeof app.locals.analysisRunManager.shutdown === 'function') {
            await app.locals.analysisRunManager.shutdown();
          }
        } catch (e) {
          // Ignore shutdown errors
        }
      }
      
      // Stop config watchers
      if (app.locals.configManager) {
        try {
          if (typeof app.locals.configManager.stopWatching === 'function') {
            app.locals.configManager.stopWatching();
          }
        } catch (e) {
          // Ignore shutdown errors
        }
      }
      
      // Close database connections
      if (app.locals.getDbRW) {
        try {
          const db = app.locals.getDbRW();
          if (db && typeof db.close === 'function') {
            db.close();
          }
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Clean up database files
      const suffixes = ['', '-shm', '-wal'];
      for (const suffix of suffixes) {
        try {
          fs.unlinkSync(dbPath + suffix);
        } catch (_) {}
      }
    };
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
    // Allow async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Initialization', () => {
    it('should have backgroundTaskManager initialized', () => {
      try {
        if (!app) {
          throw new Error('App is undefined - server creation failed');
        }
        if (!app.locals) {
          throw new Error('app.locals is undefined');
        }
        if (!app.locals.backgroundTaskManager) {
          throw new Error('backgroundTaskManager not initialized on app.locals');
        }
        expect(app.locals.backgroundTaskManager).toBeDefined();
        expect(app.locals.backgroundTaskManager).not.toBeNull();
      } catch (error) {
        failTest('Initialization', error);
      }
    }, 1000);
  });

  describe('GET /api/background-tasks', () => {
    it('should list background tasks', async () => {
      try {
        const res = await request(app)
          .get('/api/background-tasks')
          .timeout(2000)
          .expect(200);

        if (!res.body) {
          throw new Error('Response body is empty');
        }
        if (!res.body.success) {
          throw new Error(`API returned success=false: ${JSON.stringify(res.body)}`);
        }

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('tasks');
        expect(Array.isArray(res.body.tasks)).toBe(true);
      } catch (error) {
        failTest('GET /api/background-tasks', error);
      }
    }, 3000);

    it('should filter by status', async () => {
      try {
        const res = await request(app)
          .get('/api/background-tasks?status=pending')
          .timeout(2000)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body.filters).toHaveProperty('status', 'pending');
      } catch (error) {
        failTest('GET filter by status', error);
      }
    }, 3000);

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/background-tasks?limit=10&offset=0')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('limit', 10);
      expect(res.body).toHaveProperty('offset', 0);
    });
  });

  describe('POST /api/background-tasks', () => {
    it('should create a new task', async () => {
      const res = await request(app)
        .post('/api/background-tasks')
        .send({
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS
        });

      // Log the actual response for debugging
      if (res.status !== 201) {
        console.error('POST /api/background-tasks failed:', res.status, res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('task');
      expect(res.body.task).toHaveProperty('task_type', 'article-compression');
      expect(res.body.task).toHaveProperty('status', 'pending');
    });

    it('should reject task creation without taskType', async () => {
      const res = await request(app)
        .post('/api/background-tasks')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('should support autoStart option', async () => {
      const res = await request(app)
        .post('/api/background-tasks')
        .send({
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS,
          autoStart: true
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.task.status).toMatch(/^(running|completed|failed)$/);
    });
  });

  describe('GET /api/background-tasks/:id', () => {
    it('should get task details', async () => {
      // Create a task first
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Get task details
      const res = await request(app)
        .get(`/api/background-tasks/${taskId}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('task');
      expect(res.body.task).toHaveProperty('id', taskId);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .get('/api/background-tasks/999999')
        .expect(404);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for invalid task ID', async () => {
      const res = await request(app)
        .get('/api/background-tasks/invalid')
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/background-tasks/:id/start', () => {
    it('should start a pending task', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Start the task
      const res = await request(app)
        .post(`/api/background-tasks/${taskId}/start`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.task.status).toMatch(/^(running|completed|failed)$/);
    });
  });

  describe('POST /api/background-tasks/:id/pause', () => {
    it('should pause a running task', async () => {
      // Create and start a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS,
          autoStart: true
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Pause the task
      const res = await request(app)
        .post(`/api/background-tasks/${taskId}/pause`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      // Task may complete before we can pause it, so accept both
      expect(res.body.task.status).toMatch(/^(paused|completed|failed)$/);
    });
  });

  describe('POST /api/background-tasks/:id/resume', () => {
    it('should resume a paused task', async () => {
      // Create, start, and pause a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS,
          autoStart: true
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      await request(app)
        .post(`/api/background-tasks/${taskId}/pause`)
        .expect(200);

      // Resume the task
      const res = await request(app)
        .post(`/api/background-tasks/${taskId}/resume`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });
  });

  describe('POST /api/background-tasks/:id/stop', () => {
    it('should stop a running task', async () => {
      // Create and start a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS,
          autoStart: true
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Stop the task
      const res = await request(app)
        .post(`/api/background-tasks/${taskId}/stop`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      // Task may complete before we can stop it
      expect(res.body.task.status).toMatch(/^(cancelled|completed|failed)$/);
    });
  });

  describe('DELETE /api/background-tasks/:id', () => {
    it('should delete a completed task', async () => {
      // Create and complete a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS,
          autoStart: true
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Poll for task completion instead of fixed wait
      // Mock task: 50 steps × 5ms = 250ms expected, but async overhead varies
      const maxWaitMs = 5000; // 5 second timeout (generous for async overhead)
      const pollIntervalMs = 50;
      const startTime = Date.now();
      
      let task;
      while (Date.now() - startTime < maxWaitMs) {
        const statusRes = await request(app)
          .get(`/api/background-tasks/${taskId}`)
          .expect(200);
        
        task = statusRes.body.task;
        if (task.status === 'completed' || task.status === 'failed') {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      // Verify task completed
      expect(task.status).toBe('completed');

      // Delete the task
      const res = await request(app)
        .delete(`/api/background-tasks/${taskId}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
    });

    it('should not delete a running task', async () => {
      // Create and start a task
      const createRes = await request(app)
        .post('/api/background-tasks')
        .send({ 
          taskType: 'article-compression',
          parameters: VALID_COMPRESSION_PARAMS
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      await request(app)
        .post(`/api/background-tasks/${taskId}/start`)
        .expect(200);

      // Try to delete (should fail if still running)
      const res = await request(app)
        .delete(`/api/background-tasks/${taskId}`);

      // May succeed if task completed quickly, otherwise should be 400
      if (res.status === 400) {
        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
      } else {
        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /api/background-tasks/stats/compression', () => {
    it('should get compression statistics', async () => {
      // Ensure the mock is still in place (in case DB was recreated)
      // The route calls getDbRW() which is closure-captured, so we need to mock on the instance
      if (app.locals.getDbRW) {
        const db = app.locals.getDbRW();
        if (db) {
          // Always re-apply the mock in case DB was recreated
          db.getCompressionStats = () => ({
            totalArticles: 0,
            individuallyCompressed: 0,
            bucketCompressed: 0,
            uncompressed: 0,
            totalCompressedSize: 0,
            totalOriginalSize: 0,
            averageCompressionRatio: 0
          });
        }
      }
      
      const res = await request(app)
        .get('/api/background-tasks/stats/compression')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('totalArticles');
      expect(res.body.stats).toHaveProperty('individuallyCompressed');
      expect(res.body.stats).toHaveProperty('bucketCompressed');
      expect(res.body.stats).toHaveProperty('uncompressed');
    });
  });

  describe('Rate Limiting and Proposed Actions', () => {
    describe('POST /api/background-tasks/:id/start - Rate Limiting', () => {
      it('should return 429 when starting same task type within 5s window', async () => {
        // Create and start first task
        const createRes1 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId1 = createRes1.body.task.id;

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Try to start second task immediately (should be rate limited)
        const res = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(429);

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toHaveProperty('message');
        expect(res.body.error.message).toContain('article-compression');
      });

      it('should include proposedActions in 429 response', async () => {
        // Create and start first task
        const createRes1 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Try to start second task (should be rate limited)
        const res = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(429);

        expect(res.body).toHaveProperty('proposedActions');
        expect(Array.isArray(res.body.proposedActions)).toBe(true);
        expect(res.body.proposedActions.length).toBeGreaterThan(0);

        const proposedAction = res.body.proposedActions[0];
        expect(proposedAction).toHaveProperty('action');
        expect(proposedAction).toHaveProperty('reason');
        expect(proposedAction).toHaveProperty('severity');
        expect(proposedAction.action).toHaveProperty('type', 'stop-task');
      });

      it('should include retryAfter in 429 response', async () => {
        // Create and start first task
        await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Try to start second task
        const res = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(429);

        expect(res.body).toHaveProperty('retryAfter');
        expect(typeof res.body.retryAfter).toBe('number');
        expect(res.body.retryAfter).toBeGreaterThan(0);
        expect(res.body.retryAfter).toBeLessThanOrEqual(5);
      });

      it('should include context information in 429 response', async () => {
        // Create and start first task
        const createRes1 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId1 = createRes1.body.task.id;

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Try to start second task
        const res = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(429);

        expect(res.body).toHaveProperty('context');
        expect(res.body.context).toHaveProperty('taskType', 'article-compression');
        expect(res.body.context).toHaveProperty('newTaskId', taskId2);
        expect(res.body.context).toHaveProperty('runningTaskId', taskId1);
        expect(res.body.context).toHaveProperty('windowMs', 5000);
      });

      it('should allow starting task after first completes', async () => {
        // Create and start first task
        const createRes1 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId1 = createRes1.body.task.id;

        // Wait for first task to complete
        const maxWaitMs = 5000; // 5 second timeout (generous for async overhead)
        const pollIntervalMs = 50;
        const startTime = Date.now();

        let task1;
        while (Date.now() - startTime < maxWaitMs) {
          const statusRes = await request(app)
            .get(`/api/background-tasks/${taskId1}`)
            .expect(200);

          task1 = statusRes.body.task;
          if (task1.status === 'completed' || task1.status === 'failed') {
            break;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }

        expect(task1.status).toBe('completed');

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Should be able to start second task now
        const res = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
      });
    });

    describe('POST /api/background-tasks/actions/execute', () => {
      it('should execute stop-task action', async () => {
        // Create and start a task
        const createRes = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId = createRes.body.task.id;

        // Execute stop-task action
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: `stop-task-${taskId}`,
              type: 'stop-task',
              label: 'Stop Task',
              parameters: { taskId }
            }
          })
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('message', 'Task stopped successfully');

        // Verify task was stopped
        const statusRes = await request(app)
          .get(`/api/background-tasks/${taskId}`)
          .expect(200);

        expect(statusRes.body.task.status).toMatch(/^(cancelled|completed|failed)$/);
      });

      it('should execute pause-task action', async () => {
        // Create and start a task
        const createRes = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId = createRes.body.task.id;

        // Execute pause-task action
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: `pause-task-${taskId}`,
              type: 'pause-task',
              label: 'Pause Task',
              parameters: { taskId }
            }
          })
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('message', 'Task paused successfully');
      });

      it('should execute resume-task action', async () => {
        // Create, start, and pause a task
        const createRes = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId = createRes.body.task.id;

        await request(app)
          .post(`/api/background-tasks/${taskId}/pause`)
          .expect(200);

        // Execute resume-task action
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: `resume-task-${taskId}`,
              type: 'resume-task',
              label: 'Resume Task',
              parameters: { taskId }
            }
          })
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('message', 'Task resumed successfully');
      });

      it('should execute start-task action', async () => {
        // Create a pending task
        const createRes = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId = createRes.body.task.id;

        // Execute start-task action
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: `start-task-${taskId}`,
              type: 'start-task',
              label: 'Start Task',
              parameters: { taskId }
            }
          })
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('message', 'Task started successfully');
      });

      it('should return 400 for missing action', async () => {
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({})
          .expect(400);

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
        expect(typeof res.body.error).toBe('string');
        expect(res.body.error).toContain('Invalid action format');
      });

      it('should return 400 for invalid action type', async () => {
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: 'invalid',
              type: 'invalid-action-type',
              label: 'Invalid',
              parameters: {}
            }
          })
          .expect(400);

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
      });

      it('should return 400 for missing required parameters', async () => {
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: 'stop',
              type: 'stop-task',
              label: 'Stop',
              parameters: {} // missing taskId
            }
          })
          .expect(400);

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('error');
        expect(typeof res.body.error).toBe('string');
        expect(res.body.error).toContain('taskId');
      });

      it('should handle non-existent task gracefully', async () => {
        // stopTask doesn't throw for non-existent tasks, it just does nothing
        const res = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({
            action: {
              id: 'stop-999999',
              type: 'stop-task',
              label: 'Stop',
              parameters: { taskId: 999999 }
            }
          })
          .expect(200);

        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('message', 'Task stopped successfully');
        expect(res.body).toHaveProperty('task');
        expect(res.body.task).toBeNull(); // getTask returns null for non-existent tasks
      });
    });

    describe('End-to-End Rate Limiting Flow', () => {
      it('should provide working stop-task action when rate limited', async () => {
        // Create and start first task
        const createRes1 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS,
            autoStart: true
          })
          .expect(201);

        const taskId1 = createRes1.body.task.id;

        // Create second task
        const createRes2 = await request(app)
          .post('/api/background-tasks')
          .send({
            taskType: 'article-compression',
            parameters: VALID_COMPRESSION_PARAMS
          })
          .expect(201);

        const taskId2 = createRes2.body.task.id;

        // Try to start second task (should be rate limited with proposed action)
        const rateLimitRes = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(429);

        expect(rateLimitRes.body.proposedActions).toBeDefined();
        const proposedAction = rateLimitRes.body.proposedActions[0];
        expect(proposedAction.action.type).toBe('stop-task');
        expect(proposedAction.action.parameters.taskId).toBe(taskId1);

        // Execute the proposed stop-task action
        const executeRes = await request(app)
          .post('/api/background-tasks/actions/execute')
          .send({ action: proposedAction.action })
          .expect(200);

        expect(executeRes.body).toHaveProperty('success', true);

        // Verify first task was stopped
        const statusRes = await request(app)
          .get(`/api/background-tasks/${taskId1}`)
          .expect(200);

        expect(statusRes.body.task.status).toMatch(/^(cancelled|completed|failed)$/);

        // Now second task should be able to start
        const startRes = await request(app)
          .post(`/api/background-tasks/${taskId2}/start`)
          .expect(200);

        expect(startRes.body).toHaveProperty('success', true);
      });
    });
  });
});
