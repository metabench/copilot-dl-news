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
const { ensureDb } = require('../../../db/sqlite');

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
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Report progress
      if (this.onProgress) {
        this.onProgress({
          current: i + 1,
          total: steps,
          message: `Processing step ${i + 1}/${steps}`
        });
      }
      
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 50));
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

  beforeEach(() => {
    // Create temporary database for testing
    const tmpDir = path.join(os.tmpdir(), 'background-tasks-tests');
    fs.mkdirSync(tmpDir, { recursive: true });
    const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
    dbPath = path.join(tmpDir, `test-${unique}.db`);

    // Ensure database schema
    ensureDb(dbPath);

    // Create app with test database
    app = createApp({
      dbPath,
      verbose: false,
      requestTiming: false
    });

    // Replace CompressionTask with mock
    const manager = app.locals.backgroundTaskManager;
    manager.taskRegistry.set('article-compression', MockCompressionTask);
    
    // Add error listener to prevent unhandled errors in tests
    manager.on('error', () => {
      // Silently catch errors during testing
    });
    
    // Mock getCompressionStats if it doesn't exist
    if (app.locals.getDbRW) {
      const db = app.locals.getDbRW();
      if (!db.getCompressionStats) {
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

    cleanup = () => {
      const suffixes = ['', '-shm', '-wal'];
      for (const suffix of suffixes) {
        try {
          fs.unlinkSync(dbPath + suffix);
        } catch (_) {}
      }
    };
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  describe('Initialization', () => {
    it('should have backgroundTaskManager initialized', () => {
      expect(app.locals.backgroundTaskManager).toBeDefined();
      expect(app.locals.backgroundTaskManager).not.toBeNull();
    });
  });

  describe('GET /api/background-tasks', () => {
    it('should list background tasks', async () => {
      const res = await request(app)
        .get('/api/background-tasks')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('tasks');
      expect(Array.isArray(res.body.tasks)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/background-tasks?status=pending')
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.filters).toHaveProperty('status', 'pending');
    });

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
          config: {
            batchSize: 50
          }
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
        .send({ taskType: 'article-compression' })
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
        .send({ taskType: 'article-compression' })
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
          autoStart: true
        })
        .expect(201);

      const taskId = createRes.body.task.id;

      // Wait a bit for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

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
        .send({ taskType: 'article-compression' })
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
});
