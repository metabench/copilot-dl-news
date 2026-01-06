/**
 * Analysis Observable - Wraps analysePages in an observable pattern
 *
 * Provides real-time progress streaming with performance metrics:
 * - Bytes processed and bytes/second throughput
 * - Records updated and records/second throughput
 * - ETA calculation based on rolling averages
 * - Stall detection and per-item timing
 */
'use strict';

const path = require('path');
const { performance } = require('perf_hooks');
const { analysePages } = require('../../src/tools/analyse-pages-core');
const { findProjectRoot } = require('../../src/utils/project-root');

// Thresholds for warnings
const STALL_THRESHOLD_MS = 30000; // 30 seconds without progress = stall warning
const SLOW_ITEM_THRESHOLD_MS = 10000; // 10 seconds per item = slow warning

/**
 * Rolling window for throughput calculation
 */
class RollingWindow {
  constructor(windowSizeMs = 5000) {
    this.windowSizeMs = windowSizeMs;
    this.samples = [];
  }

  add(timestamp, value) {
    this.samples.push({ timestamp, value });
    this._prune(timestamp);
  }

  _prune(now) {
    const cutoff = now - this.windowSizeMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  getRate(now) {
    this._prune(now);
    if (this.samples.length < 2) return 0;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const deltaTime = (last.timestamp - first.timestamp) / 1000; // seconds
    const deltaValue = last.value - first.value;

    if (deltaTime <= 0) return 0;
    return deltaValue / deltaTime;
  }

  getTotal() {
    if (this.samples.length === 0) return 0;
    return this.samples[this.samples.length - 1].value;
  }
}

/**
 * Tracks per-item timings for better ETA and bottleneck detection
 */
class ItemTimingTracker {
  constructor(windowSize = 10) {
    this.windowSize = windowSize;
    this.timings = [];
    this.lastItemTime = null;
  }

  recordItem(timestamp) {
    if (this.lastItemTime !== null) {
      const duration = timestamp - this.lastItemTime;
      this.timings.push(duration);
      if (this.timings.length > this.windowSize) {
        this.timings.shift();
      }
    }
    this.lastItemTime = timestamp;
  }

  getAverageMs() {
    if (this.timings.length === 0) return null;
    const sum = this.timings.reduce((a, b) => a + b, 0);
    return sum / this.timings.length;
  }

  getLastItemMs() {
    if (this.timings.length === 0) return null;
    return this.timings[this.timings.length - 1];
  }

  reset() {
    this.timings = [];
    this.lastItemTime = null;
  }
}

/**
 * Create an observable wrapper around analysePages
 * 
 * @param {Object} options
 * @param {string} [options.dbPath] - Path to database
 * @param {number} [options.limit] - Max pages to analyze
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {boolean} [options.dryRun] - Dry run mode
 * @param {number} [options.emitIntervalMs] - Min interval between emissions (default 100ms)
 * @returns {Object} Observable interface { subscribe, start, stop }
 */
function createAnalysisObservable(options = {}) {
  const {
    dbPath = path.join(findProjectRoot(__dirname), 'data', 'news.db'),
    limit = null,
    verbose = false,
    dryRun = false,
    emitIntervalMs = 100,
    analysisVersion = 1,
    analysisOptions = {},
    timeout = 5000,
    logSpeed = false
  } = options;

  const subscribers = new Set();
  let isRunning = false;
  let shouldStop = false;
  let startTime = null;

  // Metrics tracking
  const bytesWindow = new RollingWindow(5000);
  const recordsWindow = new RollingWindow(5000);
  const itemTimingTracker = new ItemTimingTracker(10);
  let totalBytesProcessed = 0;
  let lastEmitTime = 0;
  let lastProgressTime = 0;
  let lastProcessedCount = 0;
  let latestState = null;
  let totalPages = 0;

  function emit(type, value) {
    const message = { type, value, timestampMs: Date.now() };
    for (const sub of subscribers) {
      try {
        if (typeof sub.next === 'function') sub.next(message);
      } catch (e) {
        console.error('[analysis-observable] subscriber error:', e.message);
      }
    }
  }

  function emitComplete(summary) {
    const message = { type: 'complete', value: summary, timestampMs: Date.now() };
    for (const sub of subscribers) {
      try {
        if (typeof sub.complete === 'function') sub.complete(message);
      } catch (e) {
        console.error('[analysis-observable] subscriber error:', e.message);
      }
    }
  }

  function emitError(error) {
    const message = { type: 'error', error: error.message, timestampMs: Date.now() };
    for (const sub of subscribers) {
      try {
        if (typeof sub.error === 'function') sub.error(message);
      } catch (e) {
        console.error('[analysis-observable] subscriber error:', e.message);
      }
    }
  }

  /**
   * Progress callback for analysePages
   */
  function onProgress(progressInfo) {
    const now = performance.now();
    const elapsed = startTime ? now - startTime : 0;

    // Track bytes if available (analyse-pages-core doesn't currently emit this,
    // but we support it for future enhancements)
    if (progressInfo.bytesProcessed || progressInfo.compressedSize) {
      const bytes = progressInfo.bytesProcessed || progressInfo.compressedSize;
      totalBytesProcessed = bytes;
      bytesWindow.add(now, totalBytesProcessed);
    }

    // Track records
    const recordsProcessed = progressInfo.processed || 0;
    recordsWindow.add(now, recordsProcessed);

    // Track per-item timing when progress advances
    if (recordsProcessed > lastProcessedCount) {
      itemTimingTracker.recordItem(now);
      lastProgressTime = now;
      lastProcessedCount = recordsProcessed;
    }

    // Calculate throughput rates
    const bytesPerSecond = bytesWindow.getRate(now);
    const recordsPerSecond = recordsWindow.getRate(now);

    // Get per-item timing info
    const avgItemMs = itemTimingTracker.getAverageMs();
    const lastItemMs = itemTimingTracker.getLastItemMs();

    // Calculate ETA based on per-item timing (more accurate for slow items)
    let etaMs = null;
    if (totalPages > 0 && avgItemMs !== null) {
      const remaining = totalPages - recordsProcessed;
      etaMs = Math.round(remaining * avgItemMs);
    } else if (totalPages > 0 && recordsPerSecond > 0) {
      const remaining = totalPages - recordsProcessed;
      etaMs = Math.round((remaining / recordsPerSecond) * 1000);
    }

    // Detect stall (no progress for STALL_THRESHOLD_MS)
    const timeSinceProgress = lastProgressTime > 0 ? now - lastProgressTime : 0;
    const isStalled = timeSinceProgress > STALL_THRESHOLD_MS;

    // Detect slow items
    const isSlowItem = lastItemMs !== null && lastItemMs > SLOW_ITEM_THRESHOLD_MS;

    // Build warnings array
    const warnings = [];
    if (isStalled) {
      warnings.push({
        type: 'stall',
        message: `No progress for ${Math.round(timeSinceProgress / 1000)}s - process may be stuck on slow item`,
        timeSinceProgressMs: Math.round(timeSinceProgress)
      });
    }
    if (isSlowItem) {
      warnings.push({
        type: 'slow_item',
        message: `Last item took ${Math.round(lastItemMs / 1000)}s - likely JSDOM bottleneck`,
        lastItemMs: Math.round(lastItemMs)
      });
    }

    // Build state
    latestState = {
      phase: 'analyzing',
      processed: recordsProcessed,
      total: totalPages,
      updated: progressInfo.updated || 0,
      skipped: progressInfo.skipped || 0,
      bytesProcessed: totalBytesProcessed,
      bytesPerSecond: Math.round(bytesPerSecond),
      recordsPerSecond: Math.round(recordsPerSecond * 100) / 100,
      elapsedMs: Math.round(elapsed),
      etaMs,
      currentUrl: progressInfo.url || null,
      lastError: progressInfo.error || null,
      placesInserted: progressInfo.placesInserted || 0,
      hubsInserted: progressInfo.hubsInserted || 0,
      // New timing and warning fields
      avgItemMs: avgItemMs !== null ? Math.round(avgItemMs) : null,
      lastItemMs: lastItemMs !== null ? Math.round(lastItemMs) : null,
      timeSinceProgressMs: Math.round(timeSinceProgress),
      warnings: warnings.length > 0 ? warnings : null,
      // Timing breakdown from analyse-pages-core
      timingBreakdown: progressInfo.lastItemTimings || null
    };

    // Throttle emissions
    if (now - lastEmitTime >= emitIntervalMs) {
      emit('next', latestState);
      lastEmitTime = now;
    }
  }

  /**
   * Get count of pages needing analysis
   */
  async function countPagesForAnalysis() {
    // This is a simplified count - in practice we'd query the DB
    // For now, we'll get it from the first progress callback
    return limit || 0;
  }

  /**
   * Start the analysis
   */
  async function start() {
    if (isRunning) {
      throw new Error('Analysis already running');
    }

    isRunning = true;
    shouldStop = false;
    startTime = performance.now();
    totalBytesProcessed = 0;
    lastEmitTime = 0;
    lastProgressTime = 0;
    lastProcessedCount = 0;
    itemTimingTracker.reset();

    // Initial estimate
    totalPages = limit || 0;

    emit('next', {
      phase: 'starting',
      processed: 0,
      total: totalPages,
      updated: 0,
      bytesProcessed: 0,
      bytesPerSecond: 0,
      recordsPerSecond: 0,
      elapsedMs: 0,
      etaMs: null,
      currentUrl: null,
      lastError: null
    });

    try {
      const summary = await analysePages({
        dbPath,
        analysisVersion: (analysisVersion ?? 1),
        limit,
        verbose,
        dryRun,
        analysisOptions,
        timeout,
        logSpeed,
        onProgress: (info) => {
          // Update total from actual count if available
          if (info.total && info.total > 0) {
            totalPages = info.total;
          }
          onProgress(info);
        },
        logger: verbose ? console : { info: () => {}, warn: () => {}, error: () => {} }
      });

      // Final state
      const endTime = performance.now();
      const finalState = {
        phase: 'complete',
        processed: summary?.steps?.pages?.processed || latestState?.processed || 0,
        total: totalPages,
        updated: summary?.steps?.pages?.updated || latestState?.updated || 0,
        bytesProcessed: totalBytesProcessed,
        bytesPerSecond: 0,
        recordsPerSecond: 0,
        elapsedMs: Math.round(endTime - startTime),
        etaMs: 0,
        currentUrl: null,
        lastError: null,
        summary
      };

      emit('next', finalState);
      emitComplete(summary);

      return summary;
    } catch (error) {
      emitError(error);
      throw error;
    } finally {
      isRunning = false;
    }
  }

  /**
   * Request stop (graceful)
   */
  function stop() {
    shouldStop = true;
  }

  /**
   * Subscribe to progress events
   * @param {Object|Function} observer - Observer object or next callback
   * @returns {Function} Unsubscribe function
   */
  function subscribe(observer) {
    const sub = typeof observer === 'function' 
      ? { next: observer } 
      : observer;
    
    subscribers.add(sub);
    
    // Send current state if available
    if (latestState) {
      try {
        if (typeof sub.next === 'function') {
          sub.next({ type: 'next', value: latestState, timestampMs: Date.now() });
        }
      } catch (e) {
        console.error('[analysis-observable] subscriber error:', e.message);
      }
    }
    
    return () => subscribers.delete(sub);
  }

  /**
   * Get current state
   */
  function getState() {
    return latestState;
  }

  return {
    subscribe,
    start,
    stop,
    getState,
    get isRunning() { return isRunning; }
  };
}

module.exports = {
  createAnalysisObservable,
  RollingWindow,
  ItemTimingTracker,
  STALL_THRESHOLD_MS,
  SLOW_ITEM_THRESHOLD_MS
};
