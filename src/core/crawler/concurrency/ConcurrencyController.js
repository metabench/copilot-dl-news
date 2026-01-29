'use strict';

const EventEmitter = require('events');

/**
 * ConcurrencyController - Dynamic worker pool management with backpressure.
 *
 * Features:
 * - Spawn workers up to max limit
 * - Dynamic scaling based on queue depth and rate limits
 * - Backpressure detection and worker reduction
 * - Graceful shutdown with drain
 *
 * @extends EventEmitter
 */
class ConcurrencyController extends EventEmitter {
  /**
   * @param {Object} options
   * @param {number} options.minWorkers - Minimum workers to maintain (default: 1)
   * @param {number} options.maxWorkers - Maximum workers allowed (default: 10)
   * @param {number} options.targetQueueDepth - Queue depth to aim for per worker (default: 5)
   * @param {number} options.scaleUpThreshold - Queue depth ratio to trigger scale up (default: 2.0)
   * @param {number} options.scaleDownThreshold - Queue depth ratio to trigger scale down (default: 0.5)
   * @param {number} options.cooldownMs - Cooldown between scaling decisions (default: 5000)
   * @param {number} options.drainTimeoutMs - Max time to wait for workers to drain (default: 30000)
   */
  constructor(options = {}) {
    super();

    this.minWorkers = options.minWorkers ?? 1;
    this.maxWorkers = options.maxWorkers ?? 10;
    this.targetQueueDepth = options.targetQueueDepth ?? 5;
    this.scaleUpThreshold = options.scaleUpThreshold ?? 2.0;
    this.scaleDownThreshold = options.scaleDownThreshold ?? 0.5;
    this.cooldownMs = options.cooldownMs ?? 5000;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 30000;

    // Worker state
    this._workers = new Map(); // workerId -> WorkerState
    this._nextWorkerId = 0;
    this._activeCount = 0;

    // Scaling state
    this._lastScaleTime = 0;
    this._scalingPaused = false;
    this._targetWorkerCount = this.minWorkers;

    // Shutdown state
    this._draining = false;
    this._shutdown = false;

    // Metrics
    this._metrics = {
      totalSpawned: 0,
      totalCompleted: 0,
      totalFailed: 0,
      scaleUpEvents: 0,
      scaleDownEvents: 0
    };
  }

  /**
   * Get current worker count.
   */
  get workerCount() {
    return this._workers.size;
  }

  /**
   * Get active worker count.
   */
  get activeCount() {
    return this._activeCount;
  }

  /**
   * Get idle worker count.
   */
  get idleCount() {
    return this._workers.size - this._activeCount;
  }

  /**
   * Check if controller is draining.
   */
  get isDraining() {
    return this._draining;
  }

  /**
   * Check if controller is shut down.
   */
  get isShutdown() {
    return this._shutdown;
  }

  /**
   * Spawn a new worker.
   * @param {Function} workerFn - Async function (workerContext) => Promise
   * @param {Object} options - Worker options
   * @returns {number} Worker ID
   */
  spawn(workerFn, options = {}) {
    if (this._shutdown) {
      throw new Error('ConcurrencyController is shut down');
    }

    if (this._draining) {
      throw new Error('ConcurrencyController is draining, cannot spawn new workers');
    }

    if (this._workers.size >= this.maxWorkers) {
      throw new Error(`Max workers (${this.maxWorkers}) reached`);
    }

    const workerId = this._nextWorkerId++;
    const abortController = new AbortController();

    const workerState = {
      id: workerId,
      name: options.name || `worker-${workerId}`,
      status: 'idle',
      abortController,
      startedAt: Date.now(),
      lastActiveAt: null,
      tasksCompleted: 0,
      currentTask: null,
      promise: null
    };

    this._workers.set(workerId, workerState);
    this._metrics.totalSpawned++;

    // Create the worker loop
    workerState.promise = this._runWorkerLoop(workerState, workerFn);

    this.emit('worker:spawned', { workerId, name: workerState.name });

    return workerId;
  }

  /**
   * Run the worker loop.
   * @private
   */
  async _runWorkerLoop(workerState, workerFn) {
    const { id, abortController } = workerState;
    const signal = abortController.signal;

    try {
      while (!signal.aborted && !this._shutdown) {
        // If draining and idle, exit
        if (this._draining && workerState.status === 'idle') {
          break;
        }

        // If marked for stopping (from scale-down), exit gracefully
        if (workerState.status === 'stopping') {
          break;
        }

        workerState.status = 'running';
        workerState.lastActiveAt = Date.now();
        this._activeCount++;

        this.emit('worker:active', { workerId: id });

        try {
          // Call the worker function
          const result = await workerFn({
            workerId: id,
            signal,
            shouldContinue: () => !signal.aborted && !this._shutdown && !this._draining,
            markTask: (task) => { workerState.currentTask = task; }
          });

          workerState.tasksCompleted++;
          this._metrics.totalCompleted++;

          // Brief yield to allow drain/shutdown signals to be processed
          // This prevents tight loop when workers complete quickly
          await this._sleep(0);

        } catch (error) {
          if (error.name === 'AbortError') {
            break;
          }
          this._metrics.totalFailed++;
          this.emit('worker:error', { workerId: id, error });

          // Brief pause on error to prevent tight loop
          await this._sleep(1000);
        } finally {
          this._activeCount--;
          workerState.status = 'idle';
          workerState.currentTask = null;
        }
      }

      workerState.status = 'stopped';
      this.emit('worker:stopped', { workerId: id, tasksCompleted: workerState.tasksCompleted });

    } catch (error) {
      workerState.status = 'failed';
      this.emit('worker:failed', { workerId: id, error });
    } finally {
      this._workers.delete(id);

      if (this._workers.size === 0) {
        this.emit('allStopped');
      }
    }
  }

  /**
   * Terminate a specific worker.
   * @param {number} workerId
   * @param {boolean} force - Abort immediately without waiting
   */
  terminate(workerId, force = false) {
    const worker = this._workers.get(workerId);
    if (!worker) return false;

    if (force) {
      worker.abortController.abort();
    } else {
      // Graceful: let current task complete, then stop
      worker.status = 'stopping';
    }

    return true;
  }

  /**
   * Scale to a specific number of workers.
   * @param {number} target - Target worker count
   * @param {Function} workerFn - Worker function for new workers
   */
  scaleTo(target, workerFn) {
    const clamped = Math.min(Math.max(target, this.minWorkers), this.maxWorkers);
    const current = this._workers.size;

    if (clamped > current) {
      // Scale up
      const toSpawn = clamped - current;
      for (let i = 0; i < toSpawn; i++) {
        this.spawn(workerFn);
      }
      this._metrics.scaleUpEvents++;
      this.emit('scaled:up', { from: current, to: clamped });

    } else if (clamped < current) {
      // Scale down - terminate idle workers first
      const toTerminate = current - clamped;
      const idleWorkers = [...this._workers.values()]
        .filter(w => w.status === 'idle')
        .slice(0, toTerminate);

      for (const worker of idleWorkers) {
        this.terminate(worker.id);
      }

      // If still need to terminate more, mark active workers as stopping
      const remaining = toTerminate - idleWorkers.length;
      if (remaining > 0) {
        const activeWorkers = [...this._workers.values()]
          .filter(w => w.status === 'running')
          .slice(0, remaining);

        for (const worker of activeWorkers) {
          worker.status = 'stopping';
        }
      }

      this._metrics.scaleDownEvents++;
      this.emit('scaled:down', { from: current, to: clamped });
    }

    this._targetWorkerCount = clamped;
    this._lastScaleTime = Date.now();

    return clamped;
  }

  /**
   * Auto-scale based on queue depth.
   * @param {number} queueDepth - Current queue depth
   * @param {Function} workerFn - Worker function for new workers
   */
  autoScale(queueDepth, workerFn) {
    if (this._scalingPaused || this._draining || this._shutdown) {
      return this._workers.size;
    }

    // Cooldown check
    if (Date.now() - this._lastScaleTime < this.cooldownMs) {
      return this._workers.size;
    }

    const currentWorkers = this._workers.size || 1;
    const depthPerWorker = queueDepth / currentWorkers;
    const targetDepth = this.targetQueueDepth;

    let newTarget = currentWorkers;

    if (depthPerWorker > targetDepth * this.scaleUpThreshold) {
      // Too much work, scale up
      newTarget = Math.ceil(queueDepth / targetDepth);
    } else if (depthPerWorker < targetDepth * this.scaleDownThreshold) {
      // Too little work, scale down
      newTarget = Math.max(1, Math.floor(queueDepth / targetDepth));
    }

    if (newTarget !== currentWorkers) {
      return this.scaleTo(newTarget, workerFn);
    }

    return currentWorkers;
  }

  /**
   * Pause auto-scaling.
   */
  pauseScaling() {
    this._scalingPaused = true;
    this.emit('scaling:paused');
  }

  /**
   * Resume auto-scaling.
   */
  resumeScaling() {
    this._scalingPaused = false;
    this.emit('scaling:resumed');
  }

  /**
   * Gracefully drain all workers.
   * Waits for current tasks to complete.
   */
  async drain() {
    if (this._draining) return;

    this._draining = true;
    this.emit('draining');

    // Wait for all workers to finish with timeout
    const startTime = Date.now();

    while (this._workers.size > 0) {
      if (Date.now() - startTime > this.drainTimeoutMs) {
        // Force abort remaining workers
        for (const worker of this._workers.values()) {
          worker.abortController.abort();
        }
        break;
      }

      await this._sleep(100);
    }

    this.emit('drained');
  }

  /**
   * Force shutdown all workers immediately.
   */
  shutdown() {
    this._shutdown = true;
    this._draining = true;

    for (const worker of this._workers.values()) {
      worker.abortController.abort();
    }

    this.emit('shutdown');
  }

  /**
   * Get worker statuses.
   */
  getStatuses() {
    return [...this._workers.values()].map(w => ({
      id: w.id,
      name: w.name,
      status: w.status,
      tasksCompleted: w.tasksCompleted,
      currentTask: w.currentTask,
      uptime: Date.now() - w.startedAt
    }));
  }

  /**
   * Get metrics.
   */
  getMetrics() {
    return {
      ...this._metrics,
      currentWorkers: this._workers.size,
      activeWorkers: this._activeCount,
      idleWorkers: this.idleCount,
      targetWorkers: this._targetWorkerCount
    };
  }

  /**
   * Sleep helper.
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ConcurrencyController;
