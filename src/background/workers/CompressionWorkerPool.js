/**
 * Compression Worker Pool
 * 
 * Manages a pool of worker threads for parallel compression tasks.
 * Uses Brotli compression with configurable quality levels.
 */

const { Worker } = require('worker_threads');
const { EventEmitter } = require('events');
const path = require('path');
const { tof } = require('lang-tools');

class CompressionWorkerPool extends EventEmitter {
  /**
   * @param {Object} options - Pool options
   * @param {number} [options.poolSize=1] - Number of worker threads
   * @param {number} [options.brotliQuality=10] - Brotli compression quality (0-11)
   * @param {number} [options.lgwin=24] - Brotli window size (10-24, 24 = 256MB)
   */
  constructor(options = {}) {
    super();
    
    this.poolSize = options.poolSize || 1;
    this.brotliQuality = options.brotliQuality || 10;
    this.lgwin = options.lgwin || 24; // 256MB window
    
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks = new Map(); // taskId -> { worker, resolve, reject }
    
    this.initialized = false;
  }
  
  /**
   * Initialize worker pool
   */
  async initialize() {
    if (this.initialized) return;
    
    const workerPath = path.join(__dirname, 'compressionWorker.js');
    
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          brotliQuality: this.brotliQuality,
          lgwin: this.lgwin
        }
      });
      
      worker.on('message', (msg) => this._handleWorkerMessage(worker, msg));
      worker.on('error', (error) => this._handleWorkerError(worker, error));
      worker.on('exit', (code) => this._handleWorkerExit(worker, code));
      
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
    
    this.initialized = true;
    this.emit('initialized', { poolSize: this.poolSize });
  }
  
  /**
   * Compress HTML content
   * 
   * @param {string} html - HTML content to compress
   * @param {number} articleId - Article ID for tracking
   * @returns {Promise<Buffer>} Compressed content
   */
  async compress(html, articleId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return new Promise((resolve, reject) => {
      const taskId = `compress-${articleId}-${Date.now()}`;
      const task = { taskId, html, articleId, resolve, reject };
      
      const worker = this.availableWorkers.shift();
      
      if (worker) {
        this._assignTask(worker, task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }
  
  /**
   * Assign task to worker
   * @private
   */
  _assignTask(worker, task) {
    this.activeTasks.set(task.taskId, {
      worker,
      resolve: task.resolve,
      reject: task.reject,
      articleId: task.articleId
    });
    
    worker.postMessage({
      type: 'compress',
      taskId: task.taskId,
      html: task.html,
      articleId: task.articleId
    });
    
    this.emit('task-started', {
      taskId: task.taskId,
      articleId: task.articleId,
      worker: this.workers.indexOf(worker)
    });
  }
  
  /**
   * Handle worker message
   * @private
   */
  _handleWorkerMessage(worker, msg) {
    if (msg.type === 'compressed') {
      const task = this.activeTasks.get(msg.taskId);
      
      if (task) {
        this.activeTasks.delete(msg.taskId);
        this.availableWorkers.push(worker);
        
        task.resolve({
          compressed: msg.compressed,
          originalSize: msg.originalSize,
          compressedSize: msg.compressedSize,
          ratio: msg.ratio
        });
        
        this.emit('task-completed', {
          taskId: msg.taskId,
          articleId: task.articleId,
          originalSize: msg.originalSize,
          compressedSize: msg.compressedSize,
          ratio: msg.ratio
        });
        
        // Process next queued task if any
        if (this.taskQueue.length > 0) {
          const nextTask = this.taskQueue.shift();
          this._assignTask(worker, nextTask);
        }
      }
    } else if (msg.type === 'error') {
      const task = this.activeTasks.get(msg.taskId);
      
      if (task) {
        this.activeTasks.delete(msg.taskId);
        this.availableWorkers.push(worker);
        
        task.reject(new Error(msg.error));
        
        this.emit('task-failed', {
          taskId: msg.taskId,
          articleId: task.articleId,
          error: msg.error
        });
        
        // Process next queued task if any
        if (this.taskQueue.length > 0) {
          const nextTask = this.taskQueue.shift();
          this._assignTask(worker, nextTask);
        }
      }
    }
  }
  
  /**
   * Handle worker error
   * @private
   */
  _handleWorkerError(worker, error) {
    console.error('[CompressionWorkerPool] Worker error:', error);
    
    // Find and reject all tasks assigned to this worker
    for (const [taskId, task] of this.activeTasks) {
      if (task.worker === worker) {
        this.activeTasks.delete(taskId);
        task.reject(error);
        
        this.emit('task-failed', {
          taskId,
          articleId: task.articleId,
          error: error.message
        });
      }
    }
    
    // Remove worker from available list
    const idx = this.availableWorkers.indexOf(worker);
    if (idx !== -1) {
      this.availableWorkers.splice(idx, 1);
    }
  }
  
  /**
   * Handle worker exit
   * @private
   */
  _handleWorkerExit(worker, code) {
    if (code !== 0) {
      console.error(`[CompressionWorkerPool] Worker exited with code ${code}`);
    }
    
    // Remove worker from pool
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }
  }
  
  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      activeWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      brotliQuality: this.brotliQuality,
      lgwin: this.lgwin
    };
  }
  
  /**
   * Shutdown worker pool
   */
  async shutdown() {
    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool shutting down'));
    }
    this.taskQueue = [];
    
    // Terminate all workers
    const terminations = this.workers.map(worker => worker.terminate());
    await Promise.all(terminations);
    
    this.workers = [];
    this.availableWorkers = [];
    this.activeTasks.clear();
    this.initialized = false;
    
    this.emit('shutdown');
  }
}

module.exports = { CompressionWorkerPool };
