/**
 * Crawler Base Class
 * 
 * Provides shared crawl lifecycle mechanics including:
 * - Startup stage tracking and telemetry emission
 * - Queue and worker orchestration primitives
 * - Pause/abort control flow
 * - Rate limiting and throttling infrastructure
 * - Progress telemetry hooks
 * 
 * Subclasses (e.g., NewsCrawler) provide domain-specific orchestration,
 * planner integration, and enhanced feature wiring.
 * 
 * @example
 * // Creating a custom crawler
 * class MyCrawler extends Crawler {
 *   constructor(startUrl, options) {
 *     super(startUrl, options);
 *     // Initialize domain-specific services
 *   }
 * 
 *   async init() {
 *     await this._trackStartupStage('init', 'Initialize', async () => {
 *       // Setup database, queue, etc.
 *       return { status: 'completed' };
 *     });
 *   }
 * 
 *   async crawl() {
 *     await this.init();
 *     // Implement crawl logic
 *     this.emitProgress();
 *   }
 * }
 * 
 * @extends EventedCrawlerBase
 */
const EventedCrawlerBase = require('./EventedCrawlerBase');
const http = require('http');
const https = require('https');
const { CrawlerState } = require('../CrawlerState');
const { StartupProgressTracker } = require('../StartupProgressTracker');

/**
 * Base Crawler class providing shared lifecycle infrastructure.
 * 
 * Events emitted:
 * - 'paused': Crawler paused
 * - 'resumed': Crawler resumed
 * - 'abort-requested': Abort requested
 * - 'startup-stage': Startup stage event { status, id, label, ...details }
 * - 'startup-complete': All startup stages complete
 * - 'startup-progress': Startup progress update { ...payload, statusText }
 * - 'progress': General progress { stats, paused, abortRequested, ...metadata }
 * - 'workers-idle': All workers finished
 * - 'disposed': Cleanup complete
 */
class Crawler extends EventedCrawlerBase {
  /**
   * Create a Crawler instance.
   * 
   * @param {string} startUrl - Initial URL to crawl
   * @param {Object} options - Configuration options
   * @param {number} [options.rateLimitMs=1000] - Minimum milliseconds between requests
   * @param {number} [options.progressEmitIntervalMs=5000] - Progress throttle interval
   * @param {number} [options.maxSockets=50] - Max concurrent HTTP connections
   */
  constructor(startUrl, options = {}) {
    super();
    
    this.startUrl = startUrl;
    this.options = options;
    
    // Core state
    this.state = new CrawlerState();
    this.isProcessing = false;
    this._paused = false;
    this._abortRequested = false;
    
    // Startup tracking
    this.startupTracker = new StartupProgressTracker({
      emit: (payload, statusText) => this._emitStartupProgress(payload, statusText)
    });
    
    // Telemetry
    this._lastProgressEmitAt = 0;
    this._progressEmitIntervalMs = options.progressEmitIntervalMs || 5000;
    
    // Rate limiting
    this.rateLimitMs = options.rateLimitMs || 1000;
    this.lastRequestTime = 0;
    
    // Keep-alive agents for connection reuse
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets || 50
    });
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets || 50
    });
    
    // Worker tracking
    this.busyWorkers = 0;
    this.workerRunner = null;
    
    // Database adapter placeholder (subclass responsibility)
    this.dbAdapter = null;
  }

  /**
   * Lifecycle: Initialization hook
   * Subclasses override to perform setup (database, planners, etc.)
   * 
   * @returns {Promise<void>}
   * @example
   * async init() {
   *   await this._trackStartupStage('db', 'Connect database', async () => {
   *     this.dbAdapter = await openDatabase();
   *     return { status: 'completed' };
   *   });
   * }
   */
  async init() {
    this._trackStartupStage('init', 'pending');
    // Subclass implementation
    this._markStartupStageComplete('init');
  }

  /**
   * Lifecycle: Main crawl entry point
   * Subclasses override to implement crawl logic
   * 
   * @returns {Promise<void>}
   * @throws {Error} Must be implemented by subclass
   * @example
   * async crawl() {
   *   await this.init();
   *   while (!this.isAbortRequested()) {
   *     if (this.isPaused()) {
   *       await sleep(100);
   *       continue;
   *     }
   *     await this.processNextItem();
   *     this.emitProgress();
   *   }
   * }
   */
  async crawl() {
    throw new Error('crawl() must be implemented by subclass');
  }

  /**
   * Pause/abort control
   * 
   * Pauses the crawler. Subclasses should check isPaused() in their main loop.
   * Emits 'paused' event.
   */
  pause() {
    this._paused = true;
    this.emit('paused');
  }

  /**
   * Resumes a paused crawler.
   * Emits 'resumed' event.
   */
  resume() {
    this._paused = false;
    this.emit('resumed');
  }

  /**
   * Check if crawler is paused.
   * @returns {boolean}
   */
  isPaused() {
    return this._paused;
  }

  /**
   * Request graceful abort. Subclasses should check isAbortRequested() and break loops.
   * Emits 'abort-requested' event.
   */
  requestAbort() {
    this._abortRequested = true;
    this.emit('abort-requested');
  }

  /**
   * Check if abort has been requested.
   * @returns {boolean}
   */
  isAbortRequested() {
    return this._abortRequested;
  }

  /**
   * Startup stage tracking (delegates to StartupProgressTracker)
   * 
   * Executes a startup stage function with progress tracking and telemetry emission.
   * 
   * @param {string} id - Stage identifier (e.g., 'init', 'planner', 'sitemaps')
   * @param {string} label - Human-readable stage name
   * @param {Function} fn - Async function to execute. Should return { status, message?, details? }
   * @returns {Promise<*>} Result from fn
   * @throws {Error} Re-throws errors from fn after marking stage as failed
   * 
   * @example
   * await this._trackStartupStage('db-connect', 'Connect to database', async () => {
   *   await this.dbAdapter.connect();
   *   return { status: 'completed', message: 'Connected' };
   * });
   */
  async _trackStartupStage(id, label, fn) {
    if (typeof fn !== 'function') {
      if (this.startupTracker) {
        this.startupTracker.skipStage(id, { label, message: 'No operation' });
      }
      return undefined;
    }
    
    if (this.startupTracker) {
      this.startupTracker.startStage(id, { label });
    }
    
    // Emit telemetry if available
    this._emitStageEvent('started', id, label);
    
    try {
      const result = await fn();
      
      if (this.startupTracker) {
        const status = result && typeof result === 'object' && typeof result.status === 'string'
          ? result.status.toLowerCase()
          : 'completed';
        const meta = {
          label,
          message: result && typeof result === 'object' && result.message ? result.message : undefined,
          details: result && typeof result === 'object' && result.details ? result.details : undefined
        };
        
        if (status === 'skipped') {
          this.startupTracker.skipStage(id, meta);
          this._emitStageEvent('skipped', id, label, meta);
        } else if (status === 'failed') {
          const errMessage = result && typeof result === 'object' && result.error ? result.error : meta.message || 'Stage failed';
          this.startupTracker.failStage(id, errMessage, meta);
          this._emitStageEvent('failed', id, label, { error: errMessage });
        } else {
          this.startupTracker.completeStage(id, meta);
          this._emitStageEvent('completed', id, label);
        }
      }
      
      return result;
    } catch (error) {
      if (this.startupTracker) {
        this.startupTracker.failStage(id, error, { label });
      }
      this._emitStageEvent('failed', id, label, { error: error?.message || String(error) });
      throw error;
    }
  }

  _skipStartupStage(id, label, message = null) {
    if (!this.startupTracker) return;
    this.startupTracker.skipStage(id, { label, message });
    this._emitStageEvent('skipped', id, label, { message });
  }

  _markStartupStageComplete(stageName, metadata = {}) {
    if (this.startupTracker) {
      this.startupTracker.completeStage(stageName, metadata);
    }
  }

  _emitStageEvent(status, id, label, details = {}) {
    // Hook for telemetry - subclasses can override
    this.emit('startup-stage', { status, id, label, ...details });
  }

  _markStartupComplete() {
    this.startupTracker.markComplete();
    this.emit('startup-complete');
  }

  /**
   * Telemetry: Progress emission
   * 
   * @param {Object} payload - Progress data
   * @param {string} statusText - Status text description
   * @private
   */
  _emitStartupProgress(payload, statusText) {
    this.emit('startup-progress', { ...payload, statusText });
  }

  /**
   * Emit progress event with current state stats.
   * Throttled to progressEmitIntervalMs (default: 5 seconds).
   * 
   * @param {Object} [metadata={}] - Additional metadata to include in progress event
   */
  emitProgress(metadata = {}) {
    const now = Date.now();
    if (now - this._lastProgressEmitAt < this._progressEmitIntervalMs) {
      return; // Throttle progress events
    }
    this._lastProgressEmitAt = now;
    
    this.emit('progress', {
      stats: this.state.getStats(),
      paused: this._paused,
      abortRequested: this._abortRequested,
      ...metadata
    });
  }

  /**
   * Rate limiting: Global request spacing
   * 
   * Ensures minimum delay between requests. Call before making HTTP requests.
   * 
   * @returns {Promise<void>}
   * @example
   * await this.acquireRateToken();
   * const response = await fetch(url);
   */
  async acquireRateToken() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitMs) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Worker orchestration: Idle detection
   */
  _incrementBusyWorkers() {
    this.busyWorkers++;
  }

  _decrementBusyWorkers() {
    this.busyWorkers--;
    if (this.busyWorkers === 0) {
      this.emit('workers-idle');
    }
  }

  /**
   * Cleanup hook - destroys HTTP agents and closes database connections.
   * Call when crawler is no longer needed.
   * Emits 'disposed' event.
   * 
   * @returns {Promise<void>}
   */
  async dispose() {
    // Close agents
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    
    // Close database (if managed by base)
    if (this.dbAdapter && typeof this.dbAdapter.close === 'function') {
      await this.dbAdapter.close();
    }
    
    this.emit('disposed');
  }
}

module.exports = Crawler;
