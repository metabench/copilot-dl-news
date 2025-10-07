/**
 * BackgroundTaskManager Unit Tests
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { BackgroundTaskManager } = require('../BackgroundTaskManager');
const { ensureDb } = require('../../db/sqlite');

// Simple mock task for testing
class MockTask {
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
    // Simulate some work - optimized for faster testing
    for (let i = 0; i < 5; i++) {
      if (this.signal.aborted) {
        throw new Error('Task aborted');
      }
      
      if (this.paused) {
        // Wait for resume (reduced from 100ms to 10ms)
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      this.onProgress({
        current: i + 1,
        total: 5,
        message: `Processing step ${i + 1}`
      });

      // Reduced from 50ms to 5ms - still allows async behavior but 10x faster
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

describe('BackgroundTaskManager', () => {
  let manager;
  let dbPath;
  let db;
  let cleanup;
  let broadcastEvents;
  let metricsUpdates;

  beforeEach(() => {
    // Create temporary database
    const tmpDir = path.join(os.tmpdir(), 'background-manager-tests');
    fs.mkdirSync(tmpDir, { recursive: true });
    const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
    dbPath = path.join(tmpDir, `test-${unique}.db`);

    // Initialize database
    db = ensureDb(dbPath);

    // Track broadcast events and metrics
    broadcastEvents = [];
    metricsUpdates = [];

    // Create manager
    manager = new BackgroundTaskManager({
      db,
      broadcastEvent: (type, data) => {
        broadcastEvents.push({ type, data });
      },
      updateMetrics: (stats) => {
        metricsUpdates.push(stats);
      }
    });

    // Add global error listener to prevent unhandled errors in tests
    manager.on('error', () => {
      // Silently catch errors during testing
    });

    // Register mock task type
    manager.registerTaskType('mock-task', MockTask);

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

  describe('Task Registration', () => {
    it('should register task types', () => {
      expect(() => {
        manager.registerTaskType('another-task', MockTask);
      }).not.toThrow();
    });

    it('should throw error when registering duplicate task type', () => {
      expect(() => {
        manager.registerTaskType('mock-task', MockTask);
      }).toThrow('Task type mock-task is already registered');
    });
  });

  describe('Task Creation', () => {
    it('should create a new task', () => {
      const taskId = manager.createTask('mock-task', { param: 'value' });

      expect(taskId).toBeGreaterThan(0);

      const task = manager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task.task_type).toBe('mock-task');
      expect(task.status).toBe('pending');
      expect(task.config).toEqual({ param: 'value' });
    });

    it('should throw error for unregistered task type', () => {
      expect(() => {
        manager.createTask('unregistered-task', {});
      }).toThrow('Task type unregistered-task is not registered');
    });

    it('should broadcast task-created event', () => {
      manager.createTask('mock-task', {});

      expect(broadcastEvents.length).toBeGreaterThan(0);
      const createEvent = broadcastEvents.find(e => e.type === 'task-created');
      expect(createEvent).toBeDefined();
    });
  });

  describe('Task Execution', () => {
    it('should start and complete a task', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Wait for task completion (5 steps × 5ms + 10ms pause checks + overhead = ~100ms needed)
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = manager.getTask(taskId);
      expect(task.status).toBe('completed');
      expect(task.progress.current).toBe(5);
      expect(task.progress.total).toBe(5);
    });

    it('should track progress during execution', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Wait for some progress (reduced from 200ms to 20ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const task = manager.getTask(taskId);
      // Task should have made some progress
      expect(task.progress.current).toBeGreaterThan(0);
    });

    it('should broadcast progress events', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Wait for completion (reduced from 500ms to 50ms)
      await new Promise(resolve => setTimeout(resolve, 50));

      const progressEvents = broadcastEvents.filter(e => e.type === 'task-progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should update metrics on completion', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Wait for completion (reduced from 500ms to 50ms)
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(metricsUpdates.length).toBeGreaterThan(0);
      const lastUpdate = metricsUpdates[metricsUpdates.length - 1];
      expect(lastUpdate.tasksCompleted).toBe(1);
    });
  });

  describe('Task Control', () => {
    it('should pause a running task', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Pause immediately
      await manager.pauseTask(taskId);

      const task = manager.getTask(taskId);
      expect(task.status).toBe('paused');
    });

    it('should resume a paused task', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);
      await manager.pauseTask(taskId);

      await manager.resumeTask(taskId);

      const task = manager.getTask(taskId);
      expect(['running', 'completed']).toContain(task.status);
    });

    it('should stop a running task', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      // Stop immediately
      await manager.stopTask(taskId);

      const task = manager.getTask(taskId);
      expect(task.status).toBe('cancelled');
    });

    it('should throw error when starting non-existent task', async () => {
      await expect(manager.startTask(999999)).rejects.toThrow('Task not found');
    });

    it('should throw error when pausing non-existent task', () => {
      expect(() => manager.pauseTask(999999)).toThrow(/Task not active/);
    });
  });

  describe('Task Listing', () => {
    it('should list all tasks', () => {
      manager.createTask('mock-task', { name: 'task1' });
      manager.createTask('mock-task', { name: 'task2' });
      manager.createTask('mock-task', { name: 'task3' });

      const tasks = manager.listTasks();
      expect(tasks.length).toBe(3);
    });

    it('should filter tasks by status', () => {
      const id1 = manager.createTask('mock-task', {});
      manager.createTask('mock-task', {});

      // Start one task
      manager.startTask(id1);

      const pendingTasks = manager.listTasks({ status: 'pending' });
      expect(pendingTasks.length).toBe(1);
    });

    it('should filter tasks by task type', () => {
      manager.registerTaskType('another-type', MockTask);

      manager.createTask('mock-task', {});
      manager.createTask('mock-task', {});
      manager.createTask('another-type', {});

      const mockTasks = manager.listTasks({ task_type: 'mock-task' });
      expect(mockTasks.length).toBe(2);
    });

    it('should support pagination', () => {
      for (let i = 0; i < 10; i++) {
        manager.createTask('mock-task', { index: i });
      }

      const page1 = manager.listTasks({}, 5, 0);
      const page2 = manager.listTasks({}, 5, 5);

      expect(page1.length).toBe(5);
      expect(page2.length).toBe(5);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('Task Persistence', () => {
    it('should persist task state to database', () => {
      const taskId = manager.createTask('mock-task', { data: 'test' });

      // Query database directly
      const row = db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(taskId);

      expect(row).toBeDefined();
      expect(row.task_type).toBe('mock-task');
      expect(JSON.parse(row.config)).toEqual({ data: 'test' });
    });

    it('should update task status in database', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);

      const row = db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(taskId);
      expect(['running', 'completed']).toContain(row.status);
    });

    it('should persist progress updates', async () => {
      const taskId = manager.createTask('mock-task', {});

      await manager.startTask(taskId);
      // Wait for progress (reduced from 200ms to 20ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const row = db.prepare('SELECT * FROM background_tasks WHERE id = ?').get(taskId);
      expect(row.progress_current).toBeGreaterThan(0);
    });
  });

  describe('Resume Paused Tasks', () => {
    it('should resume all paused tasks on startup', async () => {
      // Create and pause a task
      const taskId = manager.createTask('mock-task', {});
      await manager.startTask(taskId);
      await manager.pauseTask(taskId);

      // Simulate server restart - create new manager with same db
      const newManager = new BackgroundTaskManager({
        db,
        broadcastEvent: () => {},
        updateMetrics: () => {}
      });
      newManager.registerTaskType('mock-task', MockTask);

      await newManager.resumeAllPausedTasks();

      // Wait for task completion
      // MockTask: 5 steps × 5ms = 25ms, plus async overhead
      // Increased to 150ms for reliability (was 60ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      const task = newManager.getTask(taskId);
      expect(task.status).toBe('completed');
    });

    it('should not fail if no paused tasks exist', async () => {
      await expect(manager.resumeAllPausedTasks()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    class FailingTask {
      constructor(options) {
        this.onError = options.onError;
      }

      async execute() {
        throw new Error('Task execution failed');
      }

      pause() {}
      resume() {}
    }

    it('should handle task execution errors', async () => {
      manager.registerTaskType('failing-task', FailingTask);
      const taskId = manager.createTask('failing-task', {});

      await manager.startTask(taskId);

      // Wait for task to fail (reduced from 200ms to 20ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const task = manager.getTask(taskId);
      expect(task.status).toBe('failed');
      expect(task.error_message).toContain('Task execution failed');
    });

    it('should broadcast error events', async () => {
      manager.registerTaskType('failing-task', FailingTask);
      const taskId = manager.createTask('failing-task', {});

      await manager.startTask(taskId);
      // Wait for failure (reduced from 200ms to 20ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const errorEvents = broadcastEvents.filter(e => e.type === 'task-error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should update metrics on failure', async () => {
      manager.registerTaskType('failing-task', FailingTask);
      const taskId = manager.createTask('failing-task', {});

      await manager.startTask(taskId);
      // Wait for failure (reduced from 200ms to 20ms)
      await new Promise(resolve => setTimeout(resolve, 20));

      const lastUpdate = metricsUpdates[metricsUpdates.length - 1];
      expect(lastUpdate.tasksFailed).toBe(1);
    });
  });
});
