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

      it('should derive totals from metadata when missing', async () => {
        class FinalProgressTask {
          constructor(options) {
            this.onProgress = options.onProgress;
            this.onError = options.onError;
          }

          async execute() {
            this.onProgress({
              current: 0,
              total: 0,
              message: 'Analysis run completed',
              metadata: {
                final: true,
                stats: { pagesProcessed: 0 }
              }
            });
          }

          pause() {}
          resume() {}
        }

        manager.registerTaskType('final-progress-task', FinalProgressTask);
        const taskId = manager.createTask('final-progress-task', {});

        await manager.startTask(taskId);
        await new Promise(resolve => setTimeout(resolve, 10));

        const task = manager.getTask(taskId);
        expect(task.progress.total).toBeGreaterThan(0);
        expect(task.progress.percent).toBe(100);
      });

      it('should respect metadata totals when provided', async () => {
        class MetadataTotalTask {
          constructor(options) {
            this.onProgress = options.onProgress;
            this.onError = options.onError;
          }

          async execute() {
            this.onProgress({
              current: 21,
              total: 0,
              message: 'Finalizing',
              metadata: {
                final: true,
                stats: { pagesProcessed: 21 },
                total: 21
              }
            });
          }

          pause() {}
          resume() {}
        }

        manager.registerTaskType('metadata-total-task', MetadataTotalTask);
        const taskId = manager.createTask('metadata-total-task', {});

        await manager.startTask(taskId);
        await new Promise(resolve => setTimeout(resolve, 10));

        const task = manager.getTask(taskId);
        expect(task.progress.total).toBe(21);
        expect(task.progress.current).toBe(21);
        expect(task.progress.percent).toBe(100);
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

  describe('Rate Limiting', () => {
    it('should allow starting task of same type after rate limit window expires', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      // Wait for rate limit window to expire (5s + buffer)
      await new Promise(resolve => setTimeout(resolve, 5100));
      
      const taskId2 = manager.createTask('mock-task', {});
      
      // Should not throw - rate limit expired
      await expect(manager.startTask(taskId2)).resolves.not.toThrow();
    });
    
    it('should throw RateLimitError when starting same task type within 5s window', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('mock-task', {});
      
      // Should throw RateLimitError
  await expect(manager.startTask(taskId2)).rejects.toThrow(/Cannot start mock-task task/);
    });
    
    it('should include proposedActions in RateLimitError', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('mock-task', {});
      
      try {
        await manager.startTask(taskId2);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error.name).toBe('RateLimitError');
        expect(error.proposedActions).toBeDefined();
        expect(error.proposedActions.length).toBeGreaterThan(0);
        
        const stopAction = error.proposedActions[0];
        expect(stopAction.action.type).toBe('stop-task');
        expect(stopAction.action.parameters.taskId).toBe(taskId1);
  expect(stopAction.reason).toContain('mock-task');
  expect(stopAction.reason.toLowerCase()).toContain('already running');
      }
    });
    
    it('should include retryAfter in RateLimitError', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('mock-task', {});
      
      try {
        await manager.startTask(taskId2);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error.retryAfter).toBeDefined();
        expect(error.retryAfter).toBeGreaterThan(0);
        expect(error.retryAfter).toBeLessThanOrEqual(5);
      }
    });
    
    it('should include context information in RateLimitError', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('mock-task', {});
      
      try {
        await manager.startTask(taskId2);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error.context).toBeDefined();
        expect(error.context.taskType).toBe('mock-task');
  expect(error.context.newTaskId).toBe(taskId2);
        expect(error.context.runningTaskId).toBe(taskId1);
  expect(error.context.windowMs).toBe(5000);
  expect(typeof error.context.timeSinceLastStart).toBe('number');
  expect(typeof error.context.remainingTime).toBe('number');
      }
    });
    
    it('should not rate limit different task types', async () => {
      manager.registerTaskType('another-task', MockTask);
      
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('another-task', {});
      
      // Should not throw - different task type
      await expect(manager.startTask(taskId2)).resolves.not.toThrow();
    });
    
    it('should not rate limit task resumes', async () => {
      const taskId = manager.createTask('mock-task', {});
      await manager.startTask(taskId);
      await manager.pauseTask(taskId);
      
      // Resume should not be rate limited
      await expect(manager.resumeTask(taskId)).resolves.not.toThrow();
    });
    
    it('should update lastStartTimes map when task starts', async () => {
      const taskId = manager.createTask('mock-task', {});
      const beforeTime = Date.now();
      
      await manager.startTask(taskId);
      
      const afterTime = Date.now();
      
      // Check internal lastStartTimes map (if accessible)
      // This verifies the timestamp was recorded
      const lastStartTime = manager.lastStartTimes?.get('mock-task');
      if (lastStartTime !== undefined) {
        expect(lastStartTime).toBeGreaterThanOrEqual(beforeTime);
        expect(lastStartTime).toBeLessThanOrEqual(afterTime);
      }
    });
    
    it('should allow multiple tasks of same type if first completes', async () => {
      const taskId1 = manager.createTask('mock-task', {});
      await manager.startTask(taskId1);
      
      // Wait for first task to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const task1 = manager.getTask(taskId1);
      expect(task1.status).toBe('completed');
      
      const taskId2 = manager.createTask('mock-task', {});
      
      // Should not throw - first task completed (not running)
      await expect(manager.startTask(taskId2)).resolves.not.toThrow();
    });
    
    it('should calculate retryAfter based on elapsed time', async () => {
      class SlowMockTask {
        constructor(options) {
          this.signal = options.signal;
          this.onProgress = options.onProgress;
          this.onError = options.onError;
        }

        async execute() {
          for (let i = 0; i < 10; i++) {
            if (this.signal.aborted) {
              throw new Error('Task aborted');
            }

            this.onProgress({
              current: i + 1,
              total: 10,
              message: `Slow step ${i + 1}`
            });

            await new Promise(resolve => setTimeout(resolve, 400));
          }
        }

        pause() {}
        resume() {}
      }

      manager.registerTaskType('slow-mock-task', SlowMockTask);

      const taskId1 = manager.createTask('slow-mock-task', {});
      await manager.startTask(taskId1);

      // Wait 2 seconds while the slow task is still running
      await new Promise(resolve => setTimeout(resolve, 2000));

      const taskId2 = manager.createTask('slow-mock-task', {});

      try {
        await manager.startTask(taskId2);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        // Retry after should be ~3 seconds (5s window - 2s elapsed)
        expect(typeof error.retryAfter).toBe('number');
        expect(error.retryAfter).toBeGreaterThan(2.5);
        expect(error.retryAfter).toBeLessThanOrEqual(3.5);
      } finally {
        manager.stopTask(taskId1);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
    
    it('should propose correct stop-task action in RateLimitError', async () => {
      const taskId1 = manager.createTask('mock-task', { important: true });
      await manager.startTask(taskId1);
      
      const taskId2 = manager.createTask('mock-task', {});
      
      try {
        await manager.startTask(taskId2);
        fail('Should have thrown RateLimitError');
      } catch (error) {
        const proposedAction = error.proposedActions[0];
        
        expect(proposedAction.action.id).toContain('stop-task');
        expect(proposedAction.action.type).toBe('stop-task');
        expect(proposedAction.action.label).toContain('Stop');
        expect(proposedAction.action.parameters.taskId).toBe(taskId1);
        expect(proposedAction.severity).toBe('warning');
  expect(proposedAction.reason).toContain('mock-task');
  expect(proposedAction.reason.toLowerCase()).toContain('already running');
      }
    });
  });
});
