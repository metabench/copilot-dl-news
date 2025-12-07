'use strict';

/**
 * CrawlTelemetryBridge - Server-side adapter connecting crawlers to SSE broadcast.
 * 
 * This bridge provides a stable API for crawlers to emit telemetry events
 * that flow to connected clients via SSE. It:
 * 
 * - Normalizes events to the standard schema
 * - Batches high-frequency events to prevent flooding
 * - Maintains event history for late-joining clients
 * - Provides a consistent interface regardless of broadcast implementation
 * 
 * Usage:
 *   const bridge = new CrawlTelemetryBridge({ broadcast: sseBroadcast });
 *   
 *   // Connect a crawler
 *   bridge.connectCrawler(orchestrator); // EventEmitter
 *   
 *   // Or emit events manually
 *   bridge.emitProgress({ visited: 100, queued: 50 });
 *   bridge.emitPhaseChange('crawling');
 * 
 * @module src/crawler/telemetry/CrawlTelemetryBridge
 */

const {
  CRAWL_PHASES,
  CRAWL_EVENT_TYPES,
  createTelemetryEvent,
  createProgressEvent,
  createPhaseChangeEvent,
  createGoalSatisfiedEvent,
  createBudgetEvent,
  createWorkerScaledEvent,
  createUrlVisitedEvent,
  createUrlErrorEvent,
  isValidTelemetryEvent
} = require('./CrawlTelemetrySchema');

/**
 * Default options for the telemetry bridge
 */
const DEFAULT_OPTIONS = {
  // Maximum events to keep in history
  historyLimit: 200,
  
  // Progress event batching interval (ms)
  progressBatchInterval: 500,
  
  // URL event batching interval (ms)
  urlEventBatchInterval: 200,
  
  // Maximum URL events to batch before flush
  urlEventBatchSize: 50,
  
  // Whether to include URL-level events in broadcast (can be noisy)
  broadcastUrlEvents: false,
  
  // Default job ID if not specified
  defaultJobId: null,
  
  // Default crawl type
  defaultCrawlType: 'standard'
};

class CrawlTelemetryBridge {
  /**
   * @param {Object} options
   * @param {Function} options.broadcast - Function to broadcast events: (eventType, data) => void
   * @param {number} [options.historyLimit=200] - Maximum events to keep in history
   * @param {number} [options.progressBatchInterval=500] - Progress batch interval in ms
   * @param {number} [options.urlEventBatchInterval=200] - URL event batch interval in ms
   * @param {number} [options.urlEventBatchSize=50] - Max URL events per batch
   * @param {boolean} [options.broadcastUrlEvents=false] - Include URL-level events
   * @param {string} [options.defaultJobId] - Default job ID
   * @param {string} [options.defaultCrawlType='standard'] - Default crawl type
   */
  constructor(options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    if (typeof opts.broadcast !== 'function') {
      throw new Error('CrawlTelemetryBridge requires a broadcast function');
    }
    
    this._broadcast = opts.broadcast;
    this._historyLimit = opts.historyLimit;
    this._progressBatchInterval = opts.progressBatchInterval;
    this._urlEventBatchInterval = opts.urlEventBatchInterval;
    this._urlEventBatchSize = opts.urlEventBatchSize;
    this._broadcastUrlEvents = opts.broadcastUrlEvents;
    this._defaultJobId = opts.defaultJobId;
    this._defaultCrawlType = opts.defaultCrawlType;
    
    // Event history for late-joining clients
    this._history = [];
    
    // Current state (latest values)
    this._currentState = {
      phase: CRAWL_PHASES.IDLE,
      jobId: null,
      crawlType: null,
      progress: null,
      budget: null,
      workers: null,
      startedAt: null,
      lastUpdatedAt: null
    };
    
    // Batching state
    this._pendingProgress = null;
    this._progressTimer = null;
    this._pendingUrlEvents = [];
    this._urlEventTimer = null;
    
    // Connected crawlers (for cleanup)
    this._connectedCrawlers = new Map();
  }

  /**
   * Get the current crawl state.
   * Useful for late-joining clients to get initial state.
   * @returns {Object} Current state snapshot
   */
  getState() {
    return { ...this._currentState };
  }

  /**
   * Get recent event history.
   * @param {number} [limit] - Maximum events to return
   * @returns {Array} Recent events
   */
  getHistory(limit) {
    const count = limit ?? this._history.length;
    return this._history.slice(-count);
  }

  /**
   * Connect an EventEmitter-based crawler (like CrawlOrchestrator).
   * Automatically maps crawler events to telemetry schema.
   * 
   * @param {EventEmitter} crawler - Crawler instance
   * @param {Object} [options] - Connection options
   * @param {string} [options.jobId] - Job ID to use
   * @param {string} [options.crawlType] - Crawl type
   * @returns {Function} Disconnect function
   */
  connectCrawler(crawler, options = {}) {
    if (!crawler || typeof crawler.on !== 'function') {
      throw new Error('Crawler must be an EventEmitter');
    }
    
    const jobId = options.jobId || this._defaultJobId;
    const crawlType = options.crawlType || this._defaultCrawlType;
    const eventOpts = { jobId, crawlType };
    
    const handlers = new Map();
    
    // Map crawler events to telemetry events
    const eventMappings = [
      ['started', (data) => this.emitStarted(data, eventOpts)],
      ['stopped', (data) => this.emitStopped(data, eventOpts)],
      ['paused', () => this.emitPaused(eventOpts)],
      ['resumed', () => this.emitResumed(eventOpts)],
      ['phase:changed', (data) => this.emitPhaseChange(data?.phase, eventOpts)],
      ['goal:satisfied', (data) => this.emitGoalSatisfied(data, eventOpts)],
      ['budget:exhausted', (data) => this.emitBudgetExhausted(data, eventOpts)],
      ['url:visited', (data) => this.emitUrlVisited(data, eventOpts)],
      ['url:error', (data) => this.emitUrlError(data, eventOpts)],
      ['checkpoint:saved', (data) => this.emitCheckpointSaved(data, eventOpts)],
      ['checkpoint:restored', (data) => this.emitCheckpointRestored(data, eventOpts)],
      ['stalled', (data) => this.emitStalled(data, eventOpts)],
      // Progress events from CrawlOrchestrator's internal emitter
      ['progress', (data) => this.emitProgress(data, eventOpts)]
    ];
    
    for (const [event, handler] of eventMappings) {
      handlers.set(event, handler);
      crawler.on(event, handler);
    }
    
    // Store for cleanup
    const crawlerId = Symbol('crawler');
    this._connectedCrawlers.set(crawlerId, { crawler, handlers });
    
    // Return disconnect function
    return () => {
      const connection = this._connectedCrawlers.get(crawlerId);
      if (connection) {
        for (const [event, handler] of connection.handlers) {
          connection.crawler.off(event, handler);
        }
        this._connectedCrawlers.delete(crawlerId);
      }
    };
  }

  /**
   * Emit a crawl started event.
   */
  emitStarted(data = {}, options = {}) {
    const jobId = options.jobId || data.jobId || this._defaultJobId;
    const crawlType = options.crawlType || data.crawlType || this._defaultCrawlType;
    
    this._currentState.jobId = jobId;
    this._currentState.crawlType = crawlType;
    this._currentState.phase = CRAWL_PHASES.INITIALIZING;
    this._currentState.startedAt = Date.now();
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.STARTED, {
      jobId,
      crawlType,
      startUrl: data.startUrl || null,
      config: data.config || null
    }, {
      jobId,
      crawlType,
      message: `Crawl started: ${crawlType}`
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a crawl stopped event.
   */
  emitStopped(data = {}, options = {}) {
    this._currentState.phase = CRAWL_PHASES.STOPPED;
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.STOPPED, {
      reason: data.reason || 'unknown',
      stats: data.stats || null,
      duration: this._currentState.startedAt 
        ? Date.now() - this._currentState.startedAt 
        : null
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: `Crawl stopped: ${data.reason || 'unknown'}`
    });
    
    this._flushBatches();
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a crawl paused event.
   */
  emitPaused(options = {}) {
    const previousPhase = this._currentState.phase;
    this._currentState.phase = CRAWL_PHASES.PAUSED;
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.PAUSED, {
      previousPhase
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: 'Crawl paused'
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a crawl resumed event.
   */
  emitResumed(options = {}) {
    // Restore to previous phase if we were paused
    if (this._currentState.phase === CRAWL_PHASES.PAUSED) {
      this._currentState.phase = CRAWL_PHASES.CRAWLING;
    }
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.RESUMED, {
      phase: this._currentState.phase
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: 'Crawl resumed'
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a phase change event.
   */
  emitPhaseChange(phase, options = {}) {
    const previousPhase = this._currentState.phase;
    this._currentState.phase = phase || CRAWL_PHASES.CRAWLING;
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createPhaseChangeEvent(phase, previousPhase, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a progress event (batched).
   */
  emitProgress(stats, options = {}) {
    this._currentState.progress = { ...stats };
    this._currentState.lastUpdatedAt = Date.now();
    
    // Batch progress events
    this._pendingProgress = {
      stats,
      options: {
        jobId: options.jobId || this._currentState.jobId,
        crawlType: options.crawlType || this._currentState.crawlType
      }
    };
    
    if (!this._progressTimer) {
      this._progressTimer = setTimeout(() => {
        this._flushProgress();
      }, this._progressBatchInterval);
    }
  }

  /**
   * Emit a goal satisfied event.
   */
  emitGoalSatisfied(goal, options = {}) {
    const event = createGoalSatisfiedEvent(goal, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a budget exhausted event.
   */
  emitBudgetExhausted(data = {}, options = {}) {
    const event = createBudgetEvent({
      ...data,
      exhausted: true
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a URL visited event (batched, optional broadcast).
   */
  emitUrlVisited(urlInfo, options = {}) {
    if (!this._broadcastUrlEvents) return;
    
    const event = createUrlVisitedEvent(urlInfo, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    this._batchUrlEvent(event);
  }

  /**
   * Emit a URL error event.
   */
  emitUrlError(errorInfo, options = {}) {
    const event = createUrlErrorEvent(errorInfo, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    // Errors are always broadcast immediately
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a checkpoint saved event.
   */
  emitCheckpointSaved(data = {}, options = {}) {
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.CHECKPOINT_SAVED, {
      checkpointId: data.checkpointId || null,
      size: data.size || null
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: 'Checkpoint saved'
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a checkpoint restored event.
   */
  emitCheckpointRestored(data = {}, options = {}) {
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.CHECKPOINT_RESTORED, {
      checkpointId: data.checkpointId || null,
      restoredAt: data.restoredAt || Date.now()
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: 'Checkpoint restored'
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a stalled event.
   */
  emitStalled(data = {}, options = {}) {
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.STALLED, {
      reason: data.reason || 'unknown',
      duration: data.duration || null
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      severity: 'warn',
      message: `Crawl stalled: ${data.reason || 'unknown'}`
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a worker scaling event.
   */
  emitWorkerScaled(scaling, options = {}) {
    this._currentState.workers = { count: scaling.to };
    this._currentState.lastUpdatedAt = Date.now();
    
    const event = createWorkerScaledEvent(scaling, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType
    });
    
    this._recordAndBroadcast(event);
  }

  /**
   * Flush all pending batched events.
   */
  _flushBatches() {
    this._flushProgress();
    this._flushUrlEvents();
  }

  /**
   * Flush pending progress event.
   */
  _flushProgress() {
    if (this._progressTimer) {
      clearTimeout(this._progressTimer);
      this._progressTimer = null;
    }
    
    if (this._pendingProgress) {
      const { stats, options } = this._pendingProgress;
      const event = createProgressEvent(stats, options);
      this._recordAndBroadcast(event);
      this._pendingProgress = null;
    }
  }

  /**
   * Batch a URL event.
   */
  _batchUrlEvent(event) {
    this._pendingUrlEvents.push(event);
    
    if (this._pendingUrlEvents.length >= this._urlEventBatchSize) {
      this._flushUrlEvents();
      return;
    }
    
    if (!this._urlEventTimer) {
      this._urlEventTimer = setTimeout(() => {
        this._flushUrlEvents();
      }, this._urlEventBatchInterval);
    }
  }

  /**
   * Flush pending URL events.
   */
  _flushUrlEvents() {
    if (this._urlEventTimer) {
      clearTimeout(this._urlEventTimer);
      this._urlEventTimer = null;
    }
    
    if (this._pendingUrlEvents.length > 0) {
      // Send as a batch
      const batch = createTelemetryEvent('crawl:url:batch', {
        count: this._pendingUrlEvents.length,
        events: this._pendingUrlEvents
      }, {
        jobId: this._currentState.jobId,
        crawlType: this._currentState.crawlType
      });
      
      this._recordAndBroadcast(batch);
      this._pendingUrlEvents = [];
    }
  }

  /**
   * Record event to history and broadcast.
   */
  _recordAndBroadcast(event) {
    if (!isValidTelemetryEvent(event)) return;
    
    // Add to history
    this._history.push(event);
    if (this._history.length > this._historyLimit) {
      this._history.shift();
    }
    
    // Broadcast via SSE
    try {
      this._broadcast(event);
    } catch (error) {
      // Swallow broadcast errors to not disrupt crawl
      console.error('[CrawlTelemetryBridge] Broadcast error:', error.message);
    }
  }

  /**
   * Disconnect all crawlers and clean up.
   */
  destroy() {
    // Disconnect all crawlers
    for (const [id, connection] of this._connectedCrawlers) {
      for (const [event, handler] of connection.handlers) {
        connection.crawler.off(event, handler);
      }
    }
    this._connectedCrawlers.clear();
    
    // Clear timers
    if (this._progressTimer) {
      clearTimeout(this._progressTimer);
      this._progressTimer = null;
    }
    if (this._urlEventTimer) {
      clearTimeout(this._urlEventTimer);
      this._urlEventTimer = null;
    }
    
    // Reset state
    this._history = [];
    this._pendingProgress = null;
    this._pendingUrlEvents = [];
    this._currentState = {
      phase: CRAWL_PHASES.IDLE,
      jobId: null,
      crawlType: null,
      progress: null,
      budget: null,
      workers: null,
      startedAt: null,
      lastUpdatedAt: null
    };
  }
}

module.exports = { CrawlTelemetryBridge };
