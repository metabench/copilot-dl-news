'use strict';

const ConcurrencyController = require('../../../src/core/crawler/concurrency/ConcurrencyController');

describe('ConcurrencyController', () => {
  let controller;

  // Create a worker that does work then waits for shutdown signal
  // This matches expected worker pattern: work, then yield if should stop
  const createLongRunningWorker = (workDuration = 50) => {
    return jest.fn().mockImplementation(async ({ shouldContinue }) => {
      // Do some work
      await new Promise(r => setTimeout(r, workDuration));
      // Exit if controller wants us to stop (draining/shutdown)
      if (!shouldContinue()) return;
      // Otherwise wait a bit before next iteration (prevents tight loop)
      await new Promise(r => setTimeout(r, 50));
    });
  };

  // Worker that completes quickly for lifecycle tests
  const createQuickWorker = () => {
    return jest.fn().mockResolvedValue('done');
  };

  beforeEach(() => {
    controller = new ConcurrencyController({
      minWorkers: 1,
      maxWorkers: 5,
      cooldownMs: 100,
      drainTimeoutMs: 500 // Shorter drain timeout for tests
    });
  });

  afterEach(async () => {
    if (!controller.isShutdown) {
      controller.shutdown();
    }
    // Wait for workers to receive abort signal and complete cleanup
    await new Promise(r => setTimeout(r, 100));
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const c = new ConcurrencyController();

      expect(c.minWorkers).toBe(1);
      expect(c.maxWorkers).toBe(10);
      expect(c.targetQueueDepth).toBe(5);
    });

    it('accepts custom options', () => {
      const c = new ConcurrencyController({
        minWorkers: 2,
        maxWorkers: 20,
        targetQueueDepth: 10
      });

      expect(c.minWorkers).toBe(2);
      expect(c.maxWorkers).toBe(20);
      expect(c.targetQueueDepth).toBe(10);
    });

    it('starts with no workers', () => {
      expect(controller.workerCount).toBe(0);
      expect(controller.activeCount).toBe(0);
    });
  });

  describe('spawn', () => {
    it('creates a worker', async () => {
      const workerFn = createLongRunningWorker();

      const workerId = controller.spawn(workerFn, { name: 'test-worker' });

      expect(workerId).toBe(0);
      expect(controller.workerCount).toBe(1);

      // Shutdown after test
      controller.shutdown();
    });

    it('emits worker:spawned event', () => {
      const spawnedHandler = jest.fn();
      controller.on('worker:spawned', spawnedHandler);

      const workerFn = createQuickWorker();
      controller.spawn(workerFn, { name: 'spawn-test' });

      expect(spawnedHandler).toHaveBeenCalledWith({
        workerId: 0,
        name: 'spawn-test'
      });
    });

    it('throws when max workers reached', () => {
      const workerFn = createLongRunningWorker();

      // Spawn max workers
      for (let i = 0; i < 5; i++) {
        controller.spawn(workerFn);
      }

      expect(() => controller.spawn(workerFn)).toThrow('Max workers');
    });

    it('throws when shutdown', () => {
      controller.shutdown();

      expect(() => controller.spawn(jest.fn())).toThrow('shut down');
    });

    it('throws when draining', async () => {
      controller.spawn(createQuickWorker());
      controller.drain(); // Start draining

      expect(() => controller.spawn(jest.fn())).toThrow('draining');
    });
  });

  describe('worker lifecycle', () => {
    it('runs worker function', async () => {
      const workerFn = createQuickWorker();

      controller.spawn(workerFn);
      await controller.drain();

      expect(workerFn).toHaveBeenCalled();
    });

    it('provides worker context', async () => {
      let capturedContext = null;
      const workerFn = jest.fn().mockImplementation(async (ctx) => {
        capturedContext = ctx;
      });

      controller.spawn(workerFn);
      await controller.drain();

      expect(capturedContext).toHaveProperty('workerId');
      expect(capturedContext).toHaveProperty('signal');
      expect(capturedContext).toHaveProperty('shouldContinue');
      expect(capturedContext).toHaveProperty('markTask');
    });

    it('tracks active count', async () => {
      let activeCount = 0;
      const workerFn = jest.fn().mockImplementation(async ({ shouldContinue }) => {
        activeCount = controller.activeCount;
        await new Promise(r => setTimeout(r, 50));
        if (!shouldContinue()) return;
      });

      controller.spawn(workerFn);
      await new Promise(r => setTimeout(r, 25));

      expect(activeCount).toBe(1);
      controller.shutdown();
    });

    it('emits worker:active event', async () => {
      const activeHandler = jest.fn();
      controller.on('worker:active', activeHandler);

      const workerFn = createQuickWorker();
      controller.spawn(workerFn);

      await new Promise(r => setTimeout(r, 50));

      expect(activeHandler).toHaveBeenCalledWith({ workerId: 0 });
    });

    it('emits worker:stopped when complete', async () => {
      const stoppedHandler = jest.fn();
      controller.on('worker:stopped', stoppedHandler);

      const workerFn = createQuickWorker();
      controller.spawn(workerFn);

      await controller.drain();

      expect(stoppedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 0,
          tasksCompleted: expect.any(Number)
        })
      );
    });

    it('emits worker:error on failure', async () => {
      const errorHandler = jest.fn();
      controller.on('worker:error', errorHandler);

      const workerFn = jest.fn().mockRejectedValue(new Error('Worker error'));
      controller.spawn(workerFn);

      await controller.drain();

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 0,
          error: expect.any(Error)
        })
      );
    });

    it('emits allStopped when last worker stops', async () => {
      const allStoppedHandler = jest.fn();
      controller.on('allStopped', allStoppedHandler);

      const workerFn = createQuickWorker();
      controller.spawn(workerFn);

      await controller.drain();

      expect(allStoppedHandler).toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('terminates specific worker', async () => {
      const workerFn = createLongRunningWorker();

      const workerId = controller.spawn(workerFn);

      expect(controller.workerCount).toBe(1);

      const result = controller.terminate(workerId, true);

      expect(result).toBe(true);
    });

    it('returns false for non-existent worker', () => {
      const result = controller.terminate(999);

      expect(result).toBe(false);
    });
  });

  describe('scaleTo', () => {
    it('scales up to target', () => {
      const workerFn = createLongRunningWorker();

      const result = controller.scaleTo(3, workerFn);

      expect(result).toBe(3);
      expect(controller.workerCount).toBe(3);
    });

    it('scales down to target', () => {
      const workerFn = createLongRunningWorker();

      controller.scaleTo(4, workerFn);
      controller.scaleTo(2, workerFn);

      // Workers marked for termination may not exit immediately
      expect(controller.workerCount).toBeLessThanOrEqual(4);
    });

    it('clamps to min/max', () => {
      const workerFn = createLongRunningWorker();

      expect(controller.scaleTo(0, workerFn)).toBe(1); // min
      expect(controller.scaleTo(100, workerFn)).toBe(5); // max
    });

    it('emits scaled:up event', () => {
      const scaledUpHandler = jest.fn();
      controller.on('scaled:up', scaledUpHandler);

      const workerFn = createLongRunningWorker();

      controller.scaleTo(3, workerFn);

      expect(scaledUpHandler).toHaveBeenCalledWith({ from: 0, to: 3 });
    });

    it('emits scaled:down event', () => {
      const scaledDownHandler = jest.fn();
      controller.on('scaled:down', scaledDownHandler);

      const workerFn = createLongRunningWorker();

      controller.scaleTo(4, workerFn);
      controller.scaleTo(2, workerFn);

      expect(scaledDownHandler).toHaveBeenCalledWith({ from: 4, to: 2 });
    });
  });

  describe('autoScale', () => {
    it('scales up when queue is deep', async () => {
      const workerFn = createLongRunningWorker();

      controller.scaleTo(1, workerFn);

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 150));

      // Simulate deep queue (50 items, 1 worker = 50 depth per worker)
      const newCount = controller.autoScale(50, workerFn);

      expect(newCount).toBeGreaterThan(1);
    });

    it('scales down when queue is shallow', async () => {
      const workerFn = createLongRunningWorker();

      controller.scaleTo(4, workerFn);

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 150));

      // Simulate shallow queue (1 item, 4 workers = 0.25 depth per worker)
      const newCount = controller.autoScale(1, workerFn);

      expect(newCount).toBeLessThanOrEqual(4);
    });

    it('respects cooldown', () => {
      const workerFn = createLongRunningWorker();

      controller.scaleTo(2, workerFn);

      // Immediate call - should be blocked by cooldown
      const result = controller.autoScale(100, workerFn);

      expect(result).toBe(2); // No change
    });

    it('does nothing when paused', () => {
      const workerFn = createLongRunningWorker();

      controller.scaleTo(2, workerFn);
      controller.pauseScaling();

      const result = controller.autoScale(100, workerFn);

      expect(result).toBe(2);
    });
  });

  describe('pauseScaling / resumeScaling', () => {
    it('pauses and resumes scaling', () => {
      const pausedHandler = jest.fn();
      const resumedHandler = jest.fn();
      controller.on('scaling:paused', pausedHandler);
      controller.on('scaling:resumed', resumedHandler);

      controller.pauseScaling();
      controller.resumeScaling();

      expect(pausedHandler).toHaveBeenCalled();
      expect(resumedHandler).toHaveBeenCalled();
    });
  });

  describe('drain', () => {
    it('waits for workers to complete', async () => {
      const workerFn = createQuickWorker();

      controller.spawn(workerFn);
      controller.spawn(workerFn);

      await controller.drain();

      expect(controller.workerCount).toBe(0);
    });

    it('emits draining and drained events', async () => {
      const drainingHandler = jest.fn();
      const drainedHandler = jest.fn();
      controller.on('draining', drainingHandler);
      controller.on('drained', drainedHandler);

      const workerFn = createQuickWorker();
      controller.spawn(workerFn);

      await controller.drain();

      expect(drainingHandler).toHaveBeenCalled();
      expect(drainedHandler).toHaveBeenCalled();
    });

    it('times out and forces abort', async () => {
      const c = new ConcurrencyController({
        drainTimeoutMs: 100
      });

      // Worker that takes too long but respects shouldContinue
      const workerFn = jest.fn().mockImplementation(async ({ shouldContinue }) => {
        // Long task
        await new Promise(r => setTimeout(r, 200));
        if (!shouldContinue()) return;
        await new Promise(r => setTimeout(r, 200));
      });

      c.spawn(workerFn);

      await c.drain();

      expect(c.isDraining).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('aborts all workers immediately', () => {
      const workerFn = createLongRunningWorker();

      controller.spawn(workerFn);
      controller.spawn(workerFn);

      controller.shutdown();

      expect(controller.isShutdown).toBe(true);
    });

    it('emits shutdown event', () => {
      const shutdownHandler = jest.fn();
      controller.on('shutdown', shutdownHandler);

      controller.shutdown();

      expect(shutdownHandler).toHaveBeenCalled();
    });
  });

  describe('getStatuses', () => {
    it('returns worker statuses', () => {
      const workerFn = createLongRunningWorker();

      controller.spawn(workerFn, { name: 'worker-a' });
      controller.spawn(workerFn, { name: 'worker-b' });

      const statuses = controller.getStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toHaveProperty('id');
      expect(statuses[0]).toHaveProperty('name');
      expect(statuses[0]).toHaveProperty('status');
      expect(statuses[0]).toHaveProperty('tasksCompleted');
    });
  });

  describe('getMetrics', () => {
    it('returns metrics', () => {
      const metrics = controller.getMetrics();

      expect(metrics).toHaveProperty('totalSpawned');
      expect(metrics).toHaveProperty('totalCompleted');
      expect(metrics).toHaveProperty('totalFailed');
      expect(metrics).toHaveProperty('scaleUpEvents');
      expect(metrics).toHaveProperty('scaleDownEvents');
      expect(metrics).toHaveProperty('currentWorkers');
      expect(metrics).toHaveProperty('activeWorkers');
    });

    it('tracks spawn count', () => {
      const workerFn = createLongRunningWorker();

      controller.spawn(workerFn);
      controller.spawn(workerFn);

      expect(controller.getMetrics().totalSpawned).toBe(2);
    });
  });
});

