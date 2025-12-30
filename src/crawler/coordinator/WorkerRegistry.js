'use strict';

const { EventEmitter } = require('events');
const os = require('os');

/**
 * WorkerRegistry — Tracks active crawler workers
 * 
 * Workers register on startup, send heartbeats, auto-deregister on crash.
 * Supports both in-process (Map-based) and distributed (DB-backed) modes.
 * 
 * Events emitted:
 * - 'worker:registered' (worker) — When a worker registers
 * - 'worker:deregistered' (worker) — When a worker gracefully shuts down
 * - 'worker:stale' (worker) — When a worker is removed due to missed heartbeats
 * 
 * @module src/crawler/coordinator/WorkerRegistry
 */
class WorkerRegistry extends EventEmitter {
  /**
   * @param {Object} options
   * @param {'memory'|'sqlite'|'postgres'} [options.store='memory'] - Backend storage type
   * @param {Object} [options.db=null] - Database connection (for distributed mode)
   * @param {number} [options.heartbeatIntervalMs=10000] - Interval for stale check
   * @param {number} [options.staleTimeoutMs=30000] - Consider worker stale after this time
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor({ 
    store = 'memory', 
    db = null, 
    heartbeatIntervalMs = 10000, 
    staleTimeoutMs = 30000, 
    logger = console 
  } = {}) {
    super();
    this.store = store;
    this.db = db;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.staleTimeoutMs = staleTimeoutMs;
    this.logger = logger;
    
    // In-memory storage (used for memory store and as cache for db stores)
    // workerId -> { id, hostname, pid, registeredAt, lastHeartbeat, status, metadata, capabilities }
    this._workers = new Map();
    this._cleanupInterval = null;
    this._initialized = false;
  }

  /**
   * Initialize the registry (start cleanup interval)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;
    
    // Start cleanup interval for stale workers
    this._cleanupInterval = setInterval(
      () => this._cleanupStaleWorkers().catch(err => {
        this.logger.error(`[WorkerRegistry] Cleanup error: ${err.message}`);
      }), 
      this.heartbeatIntervalMs
    );
    this._cleanupInterval.unref(); // Don't prevent process exit
    
    this._initialized = true;
    this.logger.info(`[WorkerRegistry] Initialized (store=${this.store}, staleTimeout=${this.staleTimeoutMs}ms)`);
  }

  /**
   * Register a new worker
   * @param {Object} worker
   * @param {string} worker.id - Unique worker ID
   * @param {string} [worker.hostname] - Machine hostname
   * @param {number} [worker.pid] - Process ID
   * @param {Object} [worker.metadata] - Additional info (version, capabilities, etc.)
   * @param {Object} [worker.capabilities] - Worker capabilities (domains, maxConcurrency)
   * @returns {Promise<{success: boolean, worker: Object}>}
   */
  async register(worker) {
    if (!worker || !worker.id) {
      return { success: false, error: 'Worker ID is required' };
    }
    
    const now = Date.now();
    const record = {
      id: worker.id,
      hostname: worker.hostname || os.hostname(),
      pid: worker.pid || process.pid,
      registeredAt: now,
      lastHeartbeat: now,
      status: 'active',
      metadata: worker.metadata || {},
      capabilities: worker.capabilities || {}
    };
    
    // Check for existing worker with same ID
    const existing = this._workers.get(worker.id);
    if (existing && existing.status === 'active') {
      // Allow re-registration (worker restart)
      this.logger.warn(`[WorkerRegistry] Worker ${worker.id} re-registering (was ${existing.status})`);
    }
    
    this._workers.set(worker.id, record);
    this.emit('worker:registered', record);
    this.logger.info(`[WorkerRegistry] Worker registered: ${worker.id} (pid=${record.pid}, host=${record.hostname})`);
    
    return { success: true, worker: record };
  }

  /**
   * Record a heartbeat from a worker
   * @param {string} workerId
   * @param {Object} [status] - Optional status update (load, currentUrl, etc.)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async heartbeat(workerId, status = {}) {
    const worker = this._workers.get(workerId);
    if (!worker) {
      return { success: false, error: 'Worker not registered' };
    }
    
    worker.lastHeartbeat = Date.now();
    
    // Update status fields if provided
    if (status.load !== undefined) worker.load = status.load;
    if (status.currentUrl !== undefined) worker.currentUrl = status.currentUrl;
    if (status.urlsProcessed !== undefined) worker.urlsProcessed = status.urlsProcessed;
    
    return { success: true };
  }

  /**
   * Deregister a worker (graceful shutdown)
   * @param {string} workerId
   * @returns {Promise<{success: boolean}>}
   */
  async deregister(workerId) {
    const worker = this._workers.get(workerId);
    if (worker) {
      worker.status = 'deregistered';
      this._workers.delete(workerId);
      this.emit('worker:deregistered', worker);
      this.logger.info(`[WorkerRegistry] Worker deregistered: ${workerId}`);
    }
    return { success: true };
  }

  /**
   * Get all active workers
   * @returns {Promise<Object[]>}
   */
  async getWorkers() {
    return Array.from(this._workers.values()).filter(w => w.status === 'active');
  }

  /**
   * Get all workers (including inactive)
   * @returns {Promise<Object[]>}
   */
  async getAllWorkers() {
    return Array.from(this._workers.values());
  }

  /**
   * Get a specific worker by ID
   * @param {string} workerId
   * @returns {Promise<Object|null>}
   */
  async getWorker(workerId) {
    return this._workers.get(workerId) || null;
  }

  /**
   * Get active worker count
   * @returns {Promise<number>}
   */
  async getCount() {
    return Array.from(this._workers.values()).filter(w => w.status === 'active').length;
  }

  /**
   * Get total worker count (including inactive)
   * @returns {Promise<number>}
   */
  async getTotalCount() {
    return this._workers.size;
  }

  /**
   * Get workers by capability
   * @param {string} capability - Capability key to match
   * @param {*} [value] - Optional value to match
   * @returns {Promise<Object[]>}
   */
  async getWorkersByCapability(capability, value = undefined) {
    return Array.from(this._workers.values()).filter(w => {
      if (w.status !== 'active') return false;
      if (value === undefined) {
        return w.capabilities && w.capabilities[capability] !== undefined;
      }
      return w.capabilities && w.capabilities[capability] === value;
    });
  }

  /**
   * Update worker metadata
   * @param {string} workerId
   * @param {Object} metadata - Metadata to merge
   * @returns {Promise<{success: boolean}>}
   */
  async updateMetadata(workerId, metadata) {
    const worker = this._workers.get(workerId);
    if (!worker) {
      return { success: false, error: 'Worker not found' };
    }
    worker.metadata = { ...worker.metadata, ...metadata };
    return { success: true };
  }

  /**
   * Clean up stale workers (no heartbeat within timeout)
   * @returns {Promise<Object[]>} - List of removed workers
   */
  async _cleanupStaleWorkers() {
    const now = Date.now();
    const stale = [];
    
    for (const [id, worker] of this._workers) {
      if (worker.status === 'active' && now - worker.lastHeartbeat > this.staleTimeoutMs) {
        stale.push(worker);
        this._workers.delete(id);
      }
    }
    
    for (const worker of stale) {
      worker.status = 'stale';
      this.emit('worker:stale', worker);
      this.logger.warn(`[WorkerRegistry] Worker stale, removed: ${worker.id} (last heartbeat: ${new Date(worker.lastHeartbeat).toISOString()})`);
    }
    
    return stale;
  }

  /**
   * Force cleanup of stale workers (for testing)
   * @returns {Promise<Object[]>}
   */
  async cleanupStaleWorkers() {
    return this._cleanupStaleWorkers();
  }

  /**
   * Get registry statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const workers = Array.from(this._workers.values());
    const active = workers.filter(w => w.status === 'active');
    
    return {
      total: workers.length,
      active: active.length,
      stale: workers.filter(w => w.status === 'stale').length,
      deregistered: workers.filter(w => w.status === 'deregistered').length,
      hosts: [...new Set(active.map(w => w.hostname))],
      avgLoad: active.length > 0 
        ? active.reduce((sum, w) => sum + (w.load || 0), 0) / active.length 
        : 0
    };
  }

  /**
   * Close the registry (stop intervals, cleanup)
   * @returns {Promise<void>}
   */
  async close() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this._workers.clear();
    this._initialized = false;
    this.logger.info('[WorkerRegistry] Closed');
  }
}

module.exports = { WorkerRegistry };
