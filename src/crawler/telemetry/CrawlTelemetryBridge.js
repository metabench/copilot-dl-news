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

const { observable } = require('fnl');

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
   * @param {Function} options.broadcast - Function to broadcast events: (event) => void
   * @param {number} [options.historyLimit=200] - Maximum events to keep in history
   * @param {number} [options.maxHistorySize] - Deprecated alias for historyLimit
   * @param {number} [options.progressBatchInterval=500] - Progress batch interval in ms
   * @param {number} [options.urlEventBatchInterval=200] - URL event batch interval in ms
   * @param {number} [options.urlEventBatchSize=50] - Max URL events per batch
   * @param {boolean} [options.broadcastUrlEvents=false] - Include URL-level events
   * @param {string} [options.defaultJobId] - Default job ID
   * @param {string} [options.defaultCrawlType='standard'] - Default crawl type
   */
  constructor(options = {}) {
    const normalizedOptions = { ...options };
    if (normalizedOptions.historyLimit == null && normalizedOptions.maxHistorySize != null) {
      normalizedOptions.historyLimit = normalizedOptions.maxHistorySize;
    }

    const opts = { ...DEFAULT_OPTIONS, ...normalizedOptions };
    
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

    // In-process observable stream of telemetry events.
    // This allows the crawler to expose telemetry as an observable while
    // keeping transport (SSE/stdout/etc) separate.
    this._eventStream = observable(() => {});
    
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

  _toFiniteNumber(value) {
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? numeric : null;
  }

  _toNonNegativeInt(value, fallback = 0) {
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numeric)) return fallback;
    const intVal = Math.trunc(numeric);
    return intVal >= 0 ? intVal : fallback;
  }

  _normalizeProgressStats(progress) {
    if (!progress || typeof progress !== 'object') {
      return { visited: 0, queued: 0, errors: 0 };
    }

    // Already schema-shaped.
    const hasSchemaFields = 'visited' in progress || 'queued' in progress || 'errors' in progress;
    if (hasSchemaFields) {
      return {
        ...progress,
        visited: this._toNonNegativeInt(progress.visited, 0),
        queued: this._toNonNegativeInt(progress.queued, 0),
        errors: this._toNonNegativeInt(progress.errors, 0)
      };
    }

    // Base Crawler payload: { stats: { pagesVisited, pagesDownloaded, articlesFound, errors, ... }, ...metadata }
    const stats = progress.stats && typeof progress.stats === 'object' ? progress.stats : null;
    if (stats) {
      return {
        visited: this._toNonNegativeInt(stats.pagesVisited ?? stats.visited, 0),
        queued: this._toNonNegativeInt(progress.queued ?? stats.queued ?? stats.pagesQueued, 0),
        errors: this._toNonNegativeInt(stats.errors, 0),
        downloaded: this._toNonNegativeInt(stats.pagesDownloaded ?? stats.downloaded, undefined),
        articles: this._toNonNegativeInt(stats.articlesFound ?? stats.articles, 0),
        skipped: this._toNonNegativeInt(stats.skipped ?? stats.pagesSkipped, 0),
        bytesPerSec: this._toFiniteNumber(stats.bytesPerSec),
        requestsPerSec: this._toFiniteNumber(stats.requestsPerSec),
        currentUrl: progress.currentUrl ?? null,
        currentAction: progress.currentAction ?? null,
        phase: progress.phase ?? null,
        throttled: progress.throttled ?? null,
        throttleReason: progress.throttleReason ?? null,
        throttleDomain: progress.throttleDomain ?? null
      };
    }

    // Orchestrator payload: { completion, eta, phase, rate, healthScore, ... }
    const hasOrchestratorFields = 'completion' in progress || 'eta' in progress || 'rate' in progress || 'healthScore' in progress;
    if (hasOrchestratorFields) {
      return {
        visited: 0,
        queued: 0,
        errors: 0,
        percentComplete: this._toFiniteNumber(progress.completion ?? progress.percentComplete),
        estimatedRemaining: this._toFiniteNumber(progress.eta ?? progress.estimatedRemaining),
        phase: progress.phase ?? null,
        requestsPerSec: this._toFiniteNumber(progress.rate ?? progress.requestsPerSec),
        currentAction: progress.currentAction ?? null,
        currentUrl: progress.currentUrl ?? null
      };
    }

    // Unknown shape: don't drop everything, but ensure schema-required counters exist.
    return { ...progress, visited: 0, queued: 0, errors: 0 };
  }

  /**
   * Get the in-process observable stream of telemetry events.
   *
   * The returned value is an `fnl` observable (Evented-style) that emits:
   * - `next` events with a telemetry event payload
   * - `complete` when the bridge is destroyed
   *
   * Prefer `subscribe()` unless you need low-level access.
   * @returns {any}
   */
  getObservable() {
    return this._eventStream;
  }

  /**
   * Subscribe to telemetry events emitted by this bridge.
   *
   * @param {(event: object) => void} onNext
   * @param {object} [options]
   * @param {boolean} [options.replayHistory=true] - Immediately replay bridge history to the subscriber.
   * @returns {() => void} Unsubscribe function
   */
  subscribe(onNext, options = {}) {
    if (typeof onNext !== 'function') {
      throw new Error('subscribe(onNext) requires a function');
    }

    const replayHistory = options.replayHistory !== false;

    const safeHandler = (event) => {
      try {
        onNext(event);
      } catch (e) {
        // Telemetry must never crash the crawler.
        try {
          console.error('[CrawlTelemetryBridge] Subscriber error:', e && e.message ? e.message : e);
        } catch (_) {
          // ignore
        }
      }
    };

    if (replayHistory) {
      const history = this.getHistory();
      for (const event of history) {
        safeHandler(event);
      }
    }

    this._eventStream.on('next', safeHandler);
    return () => {
      try {
        this._eventStream.off('next', safeHandler);
      } catch (_) {
        // ignore
      }
    };
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
   * Backwards-compatible alias for older integrations.
   * @returns {Object} Current state snapshot
   */
  getCurrentState() {
    return this.getState();
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
    const handleFinished = (data) => {
      const status = data?.status;
      if (status === 'completed') {
        this.emitCompleted(data, eventOpts);
        return;
      }
      if (status === 'failed') {
        this.emitFailed(data, eventOpts);
        return;
      }
      this.emitStopped({
        reason: data?.reason || status || 'aborted',
        stats: data?.stats || null,
        duration: data?.duration || null
      }, eventOpts);
    };
    
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
      // CrawlContext and other implementations emit a consolidated finished event.
      ['finished', handleFinished],
      // CrawlOrchestrator emits checkpoints as a raw object.
      ['checkpoint', (data) => this.emitCheckpointSaved({ checkpointId: data?.timestamp || data?.checkpointId || null }, eventOpts)],
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
    const normalized = this._normalizeProgressStats(stats);

    this._currentState.progress = { ...normalized };
    this._currentState.lastUpdatedAt = Date.now();
    
    // Batch progress events
    this._pendingProgress = {
      stats: normalized,
      options: {
        jobId: options.jobId || this._currentState.jobId,
        crawlType: options.crawlType || this._currentState.crawlType
      }
    };
    if (!this._progressTimer) {
      this._progressTimer = setTimeout(() => {
        this._flushProgress();
      }, this._progressBatchInterval);

      try {
        this._progressTimer.unref?.();
      } catch (_) {
        // ignore
      }
    }
  }

  /**
   * Emit a crawl completed event.
   */
  emitCompleted(data = {}, options = {}) {
    this._currentState.phase = CRAWL_PHASES.COMPLETED;
    this._currentState.lastUpdatedAt = Date.now();

    const duration = data.duration ?? (this._currentState.startedAt ? Date.now() - this._currentState.startedAt : null);
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.COMPLETED, {
      reason: data.reason || null,
      stats: data.stats || null,
      duration
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      message: 'Crawl completed'
    });

    this._flushBatches();
    this._recordAndBroadcast(event);
  }

  /**
   * Emit a crawl failed event.
   */
  emitFailed(data = {}, options = {}) {
    this._currentState.phase = CRAWL_PHASES.FAILED;
    this._currentState.lastUpdatedAt = Date.now();

    const duration = data.duration ?? (this._currentState.startedAt ? Date.now() - this._currentState.startedAt : null);
    const event = createTelemetryEvent(CRAWL_EVENT_TYPES.FAILED, {
      reason: data.reason || null,
      error: data.error || null,
      stats: data.stats || null,
      duration
    }, {
      jobId: options.jobId || this._currentState.jobId,
      crawlType: options.crawlType || this._currentState.crawlType,
      severity: 'error',
      message: `Crawl failed: ${data.reason || 'unknown'}`
    });

    this._flushBatches();
    this._recordAndBroadcast(event);
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

      try {
        this._urlEventTimer.unref?.();
      } catch (_) {
        // ignore
      }
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

    // Notify in-process subscribers.
    try {
      this._eventStream.raise('next', event);
    } catch (error) {
      try {
        console.error('[CrawlTelemetryBridge] Observable error:', error && error.message ? error.message : error);
      } catch (_) {
        // ignore
      }
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
    // Complete observable stream first so subscribers can detach.
    try {
      this._eventStream.complete();
    } catch (_) {
      // ignore
    }

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
