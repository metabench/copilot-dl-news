'use strict';

const { EventEmitter } = require('events');

/**
 * CrawlerMetricsService — Aggregates crawler metrics for monitoring
 * 
 * Collects and aggregates:
 * - Worker count and health
 * - Queue depth by status
 * - Throughput (pages/sec, errors/sec)
 * - Domain-level statistics
 * 
 * Emits 'metrics' event on each collection interval for SSE subscribers.
 * 
 * @module src/crawler/metrics/CrawlerMetricsService
 */
class CrawlerMetricsService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} [options.registry] - WorkerRegistry instance
   * @param {Object} [options.queue] - IUrlQueue instance
   * @param {Object} [options.lockManager] - DomainLockManager instance
   * @param {number} [options.intervalMs=1000] - Collection interval in ms
   * @param {number} [options.historySize=60] - Max snapshots to keep
   * @param {Object} [options.logger=console]
   */
  constructor({ 
    registry = null, 
    queue = null, 
    lockManager = null,
    intervalMs = 1000, 
    historySize = 60,
    logger = console 
  } = {}) {
    super();
    this.registry = registry;
    this.queue = queue;
    this.lockManager = lockManager;
    this.intervalMs = intervalMs;
    this.historySize = historySize;
    this.logger = logger;
    
    this._metrics = this._createEmptyMetrics();
    this._history = [];
    
    // Counters for throughput calculation
    this._pageCount = 0;
    this._savedDocCount = 0;
    this._errorCount = 0;
    this._bytesDownloaded = 0;
    this._bytesSaved = 0;
    this._lastSnapshot = Date.now();
    
    // Domain-level stats: domain -> { pages, errors, bytes, lastFetch }
    this._domainStats = new Map();
    
    // Error tracking
    this._recentErrors = [];
    this._maxRecentErrors = 50;
    
    this._interval = null;
    this._started = false;
  }

  /**
   * Start collecting metrics
   * @returns {Promise<void>}
   */
  async start() {
    if (this._started) return;
    
    this._interval = setInterval(() => this._collect().catch(err => {
      this.logger.error(`[CrawlerMetricsService] Collection error: ${err.message}`);
    }), this.intervalMs);
    this._interval.unref();
    
    await this._collect();
    this._started = true;
    this.logger.info(`[CrawlerMetricsService] Started (interval=${this.intervalMs}ms)`);
  }

  /**
   * Stop collecting metrics
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._started = false;
    this.logger.info('[CrawlerMetricsService] Stopped');
  }

  /**
   * Get current metrics snapshot
   * @returns {Object}
   */
  getMetrics() {
    return { ...this._metrics };
  }

  /**
   * Get metrics history
   * @param {number} [limit=60]
   * @returns {Object[]}
   */
  getHistory(limit = 60) {
    return this._history.slice(-limit);
  }

  /**
   * Get recent errors
   * @param {number} [limit=20]
   * @returns {Object[]}
   */
  getRecentErrors(limit = 20) {
    return this._recentErrors.slice(-limit);
  }

  /**
   * Get domain-level statistics
   * @param {number} [limit=20]
   * @returns {Object[]}
   */
  getDomainStats(limit = 20) {
    const entries = Array.from(this._domainStats.entries())
      .map(([domain, stats]) => ({ domain, ...stats }))
      .sort((a, b) => b.pages - a.pages);
    
    return entries.slice(0, limit);
  }

  /**
   * Collect metrics from all sources
   * @private
   */
  async _collect() {
    const now = Date.now();
    const elapsed = (now - this._lastSnapshot) / 1000;
    
    // Calculate throughput
    const pagesPerSecond = elapsed > 0 ? this._pageCount / elapsed : 0;
    const savedDocsPerSecond = elapsed > 0 ? this._savedDocCount / elapsed : 0;
    const errorsPerSecond = elapsed > 0 ? this._errorCount / elapsed : 0;
    const bytesPerSecond = elapsed > 0 ? this._bytesDownloaded / elapsed : 0;
    const savedBytesPerSecond = elapsed > 0 ? this._bytesSaved / elapsed : 0;
    
    // Reset counters
    this._pageCount = 0;
    this._savedDocCount = 0;
    this._errorCount = 0;
    this._bytesDownloaded = 0;
    this._bytesSaved = 0;
    this._lastSnapshot = now;
    
    // Get queue stats
    let queueStats = { pending: 0, inProgress: 0, completed: 0, failed: 0, total: 0 };
    if (this.queue) {
      try {
        queueStats = await this.queue.getStats();
      } catch (err) {
        this.logger.warn(`[CrawlerMetricsService] Failed to get queue stats: ${err.message}`);
      }
    }
    
    // Get worker stats
    let workerStats = { active: 0, stale: 0, total: 0 };
    let workers = [];
    if (this.registry) {
      try {
        const registryStats = await this.registry.getStats();
        workerStats = {
          active: registryStats.active,
          stale: registryStats.stale,
          total: registryStats.total
        };
        workers = await this.registry.getWorkers();
      } catch (err) {
        this.logger.warn(`[CrawlerMetricsService] Failed to get worker stats: ${err.message}`);
      }
    }
    
    // Get lock stats
    let lockStats = { active: 0, expired: 0 };
    if (this.lockManager) {
      try {
        lockStats = await this.lockManager.getStats();
      } catch (err) {
        this.logger.warn(`[CrawlerMetricsService] Failed to get lock stats: ${err.message}`);
      }
    }
    
    // Build metrics snapshot
    this._metrics = {
      timestamp: now,
      uptime: process.uptime(),
      workers: workerStats,
      workerDetails: workers.map(w => ({
        id: w.id,
        hostname: w.hostname,
        pid: w.pid,
        status: w.status,
        load: w.load || 0,
        lastHeartbeat: w.lastHeartbeat,
        urlsProcessed: w.urlsProcessed || 0
      })),
      queue: queueStats,
      locks: lockStats,
      throughput: {
        pagesPerSecond: Math.round(pagesPerSecond * 100) / 100,
        docsDownloadedPerSecond: Math.round(pagesPerSecond * 100) / 100,
        docsDownloadedPerSec: Math.round(pagesPerSecond * 100) / 100,
        downloadedDocsPerSecond: Math.round(pagesPerSecond * 100) / 100,
        savedDocsPerSecond: Math.round(savedDocsPerSecond * 100) / 100,
        docsSavedPerSecond: Math.round(savedDocsPerSecond * 100) / 100,
        docsSavedPerSec: Math.round(savedDocsPerSecond * 100) / 100,
        errorsPerSecond: Math.round(errorsPerSecond * 100) / 100,
        bytesPerSecond: Math.round(bytesPerSecond),
        networkBytesPerSecond: Math.round(bytesPerSecond),
        networkMbPerSecond: Math.round((bytesPerSecond / 1024 / 1024) * 100) / 100,
        networkMbPerSec: Math.round((bytesPerSecond / 1024 / 1024) * 100) / 100,
        savedBytesPerSecond: Math.round(savedBytesPerSecond),
        savedMbPerSecond: Math.round((savedBytesPerSecond / 1024 / 1024) * 100) / 100,
        savedMbPerSec: Math.round((savedBytesPerSecond / 1024 / 1024) * 100) / 100,
        mbPerSecond: Math.round((bytesPerSecond / 1024 / 1024) * 100) / 100
      },
      domains: {
        active: this._domainStats.size,
        locked: lockStats.active
      },
      errors: {
        recent: this._recentErrors.length,
        rate: Math.round(errorsPerSecond * 100) / 100
      }
    };
    
    // Add to history
    this._history.push({ ...this._metrics });
    if (this._history.length > this.historySize) {
      this._history.shift();
    }
    
    // Emit for SSE subscribers
    this.emit('metrics', this._metrics);
  }

  /**
   * Create empty metrics object
   * @private
   */
  _createEmptyMetrics() {
    return {
      timestamp: Date.now(),
      uptime: 0,
      workers: { active: 0, stale: 0, total: 0 },
      workerDetails: [],
      queue: { pending: 0, inProgress: 0, completed: 0, failed: 0, total: 0 },
      locks: { active: 0, expired: 0 },
      throughput: {
        pagesPerSecond: 0,
        docsDownloadedPerSecond: 0,
        docsDownloadedPerSec: 0,
        downloadedDocsPerSecond: 0,
        savedDocsPerSecond: 0,
        docsSavedPerSecond: 0,
        docsSavedPerSec: 0,
        errorsPerSecond: 0,
        bytesPerSecond: 0,
        networkBytesPerSecond: 0,
        networkMbPerSecond: 0,
        networkMbPerSec: 0,
        savedBytesPerSecond: 0,
        savedMbPerSecond: 0,
        savedMbPerSec: 0,
        mbPerSecond: 0
      },
      domains: { active: 0, locked: 0 },
      errors: { recent: 0, rate: 0 }
    };
  }

  /**
   * Reset all stats (for testing)
   */
  reset() {
    this._metrics = this._createEmptyMetrics();
    this._history = [];
    this._pageCount = 0;
    this._savedDocCount = 0;
    this._errorCount = 0;
    this._bytesDownloaded = 0;
    this._bytesSaved = 0;
    this._lastSnapshot = Date.now();
    this._domainStats.clear();
    this._recentErrors = [];
  }
}

module.exports = { CrawlerMetricsService };
