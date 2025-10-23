const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Worker } = require('worker_threads');

class DecompressionWorkerPool extends EventEmitter {
  constructor(options = {}) {
    super();
    const cpuCount = Math.max(1, os.cpus()?.length || 1);
    this.poolSize = Math.max(1, Math.min(options.poolSize || Math.min(4, cpuCount), cpuCount));
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks = new Map(); // taskId -> { resolve, reject, worker, metadata }
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const workerPath = path.join(__dirname, 'decompressionWorker.js');

    for (let i = 0; i < this.poolSize; i += 1) {
      const worker = new Worker(workerPath);
      worker.on('message', (msg) => this._handleWorkerMessage(worker, msg));
      worker.on('error', (error) => this._handleWorkerError(worker, error));
      worker.on('exit', (code) => this._handleWorkerExit(worker, code));
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }

    this.initialized = true;
    this.emit('initialized', { poolSize: this.poolSize });
  }

  async decompress(buffer, algorithm = 'none', metadata = null) {
    if (!buffer || buffer.length === 0 || !algorithm || algorithm === 'none') {
      const safeBuffer = buffer ? Buffer.from(buffer) : Buffer.alloc(0);
      return {
        buffer: safeBuffer,
        byteLength: safeBuffer.length,
        algorithm: algorithm || 'none',
        metadata,
        durationMs: 0
      };
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const taskBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const transferable = new Uint8Array(taskBuffer).buffer;

    return new Promise((resolve, reject) => {
      const taskId = `decompress-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const task = {
        taskId,
        algorithm,
        resolve,
        reject,
        metadata,
        start: Date.now(),
        transferable
      };

      const worker = this.availableWorkers.shift();

      if (worker) {
        this._assignTask(worker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  _assignTask(worker, task) {
    this.activeTasks.set(task.taskId, {
      worker,
      resolve: task.resolve,
      reject: task.reject,
      metadata: task.metadata,
      start: task.start,
      algorithm: task.algorithm
    });

    worker.postMessage({
      type: 'decompress',
      taskId: task.taskId,
      algorithm: task.algorithm,
      buffer: task.transferable
    }, [task.transferable]);

    this.emit('task-started', {
      taskId: task.taskId,
      algorithm: task.algorithm
    });
  }

  _handleWorkerMessage(worker, msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'decompressed') {
      const task = this.activeTasks.get(msg.taskId);
      if (!task) {
        this.availableWorkers.push(worker);
        return;
      }

      this.activeTasks.delete(msg.taskId);
      this.availableWorkers.push(worker);

      const buffer = Buffer.from(msg.buffer, msg.byteOffset || 0, msg.byteLength);
      const durationMs = msg.durationMs != null ? msg.durationMs : (Date.now() - (task.start || Date.now()));

      task.resolve({
        buffer,
        byteLength: buffer.length,
        algorithm: task.algorithm,
        metadata: task.metadata,
        durationMs
      });

      this.emit('task-completed', {
        taskId: msg.taskId,
        algorithm: task.algorithm,
        durationMs
      });

      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        this._assignTask(worker, nextTask);
      }
      return;
    }

    if (msg.type === 'error') {
      const task = this.activeTasks.get(msg.taskId);
      this.availableWorkers.push(worker);
      if (task) {
        this.activeTasks.delete(msg.taskId);
        task.reject(new Error(msg.error || 'Decompression worker error'));
        this.emit('task-failed', {
          taskId: msg.taskId,
          algorithm: task.algorithm,
          error: msg.error || 'unknown error'
        });
      }

      if (this.taskQueue.length > 0) {
        const nextTask = this.taskQueue.shift();
        this._assignTask(worker, nextTask);
      }
    }
  }

  _handleWorkerError(worker, error) {
    this.emit('worker-error', error);
    const failedTasks = [];

    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.worker === worker) {
        failedTasks.push({ taskId, task });
      }
    }

    for (const entry of failedTasks) {
      this.activeTasks.delete(entry.taskId);
      entry.task.reject(error);
    }

    const idx = this.availableWorkers.indexOf(worker);
    if (idx >= 0) {
      this.availableWorkers.splice(idx, 1);
    }
  }

  _handleWorkerExit(worker, code) {
    if (code !== 0) {
      this.emit('worker-exit', code);
    }

    const idx = this.workers.indexOf(worker);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
    }

    const availableIdx = this.availableWorkers.indexOf(worker);
    if (availableIdx >= 0) {
      this.availableWorkers.splice(availableIdx, 1);
    }
  }

  async shutdown() {
    const queueError = new Error('Decompression worker pool shutting down');
    while (this.taskQueue.length) {
      const task = this.taskQueue.shift();
      task.reject(queueError);
    }

    const terminations = this.workers.map((worker) => worker.terminate());
    await Promise.allSettled(terminations);

    this.workers = [];
    this.availableWorkers = [];
    this.activeTasks.clear();
    this.initialized = false;
    this.emit('shutdown');
  }
}

module.exports = { DecompressionWorkerPool };
