'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * BackgroundTask - Abstract base class for long-running tasks with progress tracking
 * 
 * Events emitted:
 *   - 'started' (taskInfo)
 *   - 'progress' (progressInfo)
 *   - 'paused' ()
 *   - 'resumed' ()
 *   - 'completed' (result)
 *   - 'error' (error)
 *   - 'cancelled' ()
 * 
 * Subclasses must implement:
 *   - _execute() - the main work, should check this._cancelled periodically
 *   - getName() - return task display name
 *   - getType() - return task type string (e.g., 'classification-backfill')
 */
class BackgroundTask extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.id = options.id || crypto.randomBytes(8).toString('hex');
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    
    // State
    this._state = 'pending'; // pending | running | paused | completed | error | cancelled
    this._cancelled = false;
    this._paused = false;
    
    // Progress tracking
    this._total = options.total || 0;
    this._current = 0;
    this._message = '';
    this._phase = '';
    
    // Rate calculation
    this._lastProgressTime = null;
    this._lastProgressCount = 0;
    this._rate = 0;
  }
  
  // --- Abstract methods (override in subclass) ---
  
  /**
   * Main execution logic. Must be implemented by subclass.
   * Should periodically check this._cancelled and this._paused
   * @returns {Promise<any>} Result of the task
   */
  async _execute() {
    throw new Error('Subclass must implement _execute()');
  }
  
  /**
   * @returns {string} Human-readable task name
   */
  getName() {
    return 'Background Task';
  }
  
  /**
   * @returns {string} Task type identifier
   */
  getType() {
    return 'generic';
  }
  
  // --- Public API ---
  
  /**
   * Start the task
   */
  async start() {
    if (this._state !== 'pending') {
      throw new Error(`Cannot start task in state: ${this._state}`);
    }
    
    this._state = 'running';
    this.startedAt = new Date();
    this._lastProgressTime = Date.now();
    
    this.emit('started', this.getInfo());
    
    try {
      const result = await this._execute();
      
      if (this._cancelled) {
        this._state = 'cancelled';
        this.emit('cancelled');
        return null;
      }
      
      this._state = 'completed';
      this.completedAt = new Date();
      this.emit('completed', result);
      return result;
      
    } catch (err) {
      this._state = 'error';
      this.completedAt = new Date();
      this.emit('error', err);
      throw err;
    }
  }
  
  /**
   * Request cancellation (task should check this._cancelled)
   */
  cancel() {
    if (this._state === 'running' || this._state === 'paused') {
      this._cancelled = true;
      this._state = 'cancelled';
      this.emit('cancelled');
    }
  }
  
  /**
   * Pause the task (task should check this._paused)
   */
  pause() {
    if (this._state === 'running') {
      this._paused = true;
      this._state = 'paused';
      this.emit('paused');
    }
  }
  
  /**
   * Resume a paused task
   */
  resume() {
    if (this._state === 'paused') {
      this._paused = false;
      this._state = 'running';
      this.emit('resumed');
    }
  }
  
  /**
   * Update progress (call from _execute)
   * @param {number} current - Current count
   * @param {Object} options - { message, phase }
   */
  updateProgress(current, options = {}) {
    this._current = current;
    if (options.message !== undefined) this._message = options.message;
    if (options.phase !== undefined) this._phase = options.phase;
    if (options.total !== undefined) this._total = options.total;
    
    // Calculate rate
    const now = Date.now();
    const elapsed = (now - this._lastProgressTime) / 1000;
    if (elapsed > 0.5) {
      const delta = current - this._lastProgressCount;
      this._rate = delta / elapsed;
      this._lastProgressTime = now;
      this._lastProgressCount = current;
    }
    
    this.emit('progress', this.getProgress());
  }
  
  /**
   * Set total count (can be called during execution if total is discovered late)
   * @param {number} total 
   */
  setTotal(total) {
    this._total = total;
  }
  
  /**
   * Check if cancelled (call from _execute to allow early exit)
   */
  isCancelled() {
    return this._cancelled;
  }
  
  /**
   * Wait while paused (call from _execute)
   */
  async waitIfPaused() {
    while (this._paused && !this._cancelled) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  // --- Info getters ---
  
  getState() {
    return this._state;
  }
  
  getProgress() {
    const percent = this._total > 0 ? (this._current / this._total) * 100 : 0;
    const elapsed = this.startedAt ? (Date.now() - this.startedAt.getTime()) / 1000 : 0;
    
    // Estimate remaining time
    let eta = null;
    if (this._rate > 0 && this._total > this._current) {
      const remaining = this._total - this._current;
      eta = Math.round(remaining / this._rate);
    }
    
    return {
      taskId: this.id,
      current: this._current,
      total: this._total,
      percent: Math.round(percent * 10) / 10,
      rate: Math.round(this._rate * 10) / 10,
      message: this._message,
      phase: this._phase,
      elapsed: Math.round(elapsed),
      eta
    };
  }
  
  getInfo() {
    return {
      id: this.id,
      name: this.getName(),
      type: this.getType(),
      state: this._state,
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt?.toISOString() || null,
      completedAt: this.completedAt?.toISOString() || null,
      progress: this.getProgress()
    };
  }
  
  /**
   * Serialize to JSON for persistence/IPC
   */
  toJSON() {
    return this.getInfo();
  }
}

module.exports = { BackgroundTask };
