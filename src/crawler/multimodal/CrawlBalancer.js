'use strict';

/**
 * CrawlBalancer
 *
 * Balances historical backfill vs. newest article acquisition across batches.
 * Uses adaptive strategies to optimize coverage while respecting user preferences.
 *
 * Strategies:
 * - Fixed: Constant ratio (e.g., 30% historical, 70% newest)
 * - Adaptive: Adjusts based on queue depth and discovery rate
 * - Priority: Favors one mode until a threshold, then switches
 * - Time-based: Different ratios for different times of day
 */
class CrawlBalancer {
  /**
   * @param {Object} options
   * @param {string} [options.strategy='adaptive'] - Balancing strategy
   * @param {number} [options.baseHistoricalRatio=0.3] - Base historical ratio (0-1)
   * @param {Object} [options.adaptive] - Adaptive strategy config
   * @param {Object} [options.timeBased] - Time-based strategy config
   * @param {Object} [options.queries] - Multi-modal crawl query helpers
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({
    strategy = 'adaptive',
    baseHistoricalRatio = 0.3,
    adaptive = {},
    timeBased = {},
    queries = null,
    logger = console
  } = {}) {
    this.strategy = strategy;
    this.baseHistoricalRatio = baseHistoricalRatio;
    this.queries = queries;
    this.logger = logger;

    // Adaptive strategy config
    this.adaptive = {
      minHistorical: 0.1,
      maxHistorical: 0.6,
      queueDepthThreshold: 5000, // High queue = more newest
      discoveryRateThreshold: 0.8, // High discovery = more newest
      adjustmentFactor: 0.1,
      ...adaptive
    };

    // Time-based strategy config
    this.timeBased = {
      peakHours: [7, 8, 9, 17, 18, 19], // Morning and evening peaks
      peakHistoricalRatio: 0.1, // Favor newest during peaks
      offPeakHistoricalRatio: 0.5, // More historical during off-peak
      ...timeBased
    };

    // Tracking for adaptive adjustments
    this.batchHistory = [];
    this.currentRatio = baseHistoricalRatio;
    this.lastAdjustmentBatch = 0;
  }

  /**
   * Get the balance for a given batch
   * @param {number} batchNumber
   * @param {Object} [context] - Additional context for decision
   * @returns {Object} { historical: number, newest: number }
   */
  getBalance(batchNumber, context = {}) {
    let historicalRatio;

    switch (this.strategy) {
      case 'fixed':
        historicalRatio = this.baseHistoricalRatio;
        break;

      case 'adaptive':
        historicalRatio = this._getAdaptiveBalance(batchNumber, context);
        break;

      case 'priority':
        historicalRatio = this._getPriorityBalance(batchNumber, context);
        break;

      case 'time-based':
        historicalRatio = this._getTimeBasedBalance();
        break;

      default:
        historicalRatio = this.baseHistoricalRatio;
    }

    // Clamp to valid range
    historicalRatio = Math.max(0, Math.min(1, historicalRatio));
    this.currentRatio = historicalRatio;

    return {
      historical: historicalRatio,
      newest: 1 - historicalRatio
    };
  }

  /**
   * Record batch outcome for adaptive learning
   * @param {number} batchNumber
   * @param {Object} metrics
   */
  recordBatchOutcome(batchNumber, metrics) {
    this.batchHistory.push({
      batch: batchNumber,
      timestamp: Date.now(),
      ratio: this.currentRatio,
      ...metrics
    });

    // Keep only recent history
    if (this.batchHistory.length > 100) {
      this.batchHistory = this.batchHistory.slice(-100);
    }
  }

  /**
   * Get current statistics
   * @returns {Object}
   */
  getStatistics() {
    const recentBatches = this.batchHistory.slice(-10);
    const avgHistoricalRatio = recentBatches.length
      ? recentBatches.reduce((sum, b) => sum + b.ratio, 0) / recentBatches.length
      : this.baseHistoricalRatio;

    return {
      strategy: this.strategy,
      currentRatio: this.currentRatio,
      baseHistoricalRatio: this.baseHistoricalRatio,
      avgRecentRatio: avgHistoricalRatio.toFixed(3),
      batchesTracked: this.batchHistory.length,
      adaptiveConfig: this.adaptive
    };
  }

  /**
   * Reset to base configuration
   */
  reset() {
    this.currentRatio = this.baseHistoricalRatio;
    this.batchHistory = [];
    this.lastAdjustmentBatch = 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Strategy implementations
  // ─────────────────────────────────────────────────────────────

  _getAdaptiveBalance(batchNumber, context) {
    let ratio = this.currentRatio;

    // Get queue depth if available
    const queueDepth = context.queueDepth ?? this._getQueueDepth();
    const discoveryRate = context.discoveryRate ?? this._getRecentDiscoveryRate();

    // Adjust based on queue depth
    if (queueDepth > this.adaptive.queueDepthThreshold) {
      // High queue = favor newest articles
      ratio -= this.adaptive.adjustmentFactor;
    } else if (queueDepth < this.adaptive.queueDepthThreshold * 0.3) {
      // Low queue = can do more historical
      ratio += this.adaptive.adjustmentFactor;
    }

    // Adjust based on discovery rate
    if (discoveryRate > this.adaptive.discoveryRateThreshold) {
      // High discovery = favor newest
      ratio -= this.adaptive.adjustmentFactor / 2;
    } else if (discoveryRate < this.adaptive.discoveryRateThreshold * 0.5) {
      // Low discovery = more historical to find patterns
      ratio += this.adaptive.adjustmentFactor / 2;
    }

    // Clamp to configured bounds
    ratio = Math.max(this.adaptive.minHistorical, ratio);
    ratio = Math.min(this.adaptive.maxHistorical, ratio);

    this.lastAdjustmentBatch = batchNumber;

    return ratio;
  }

  _getPriorityBalance(batchNumber, context) {
    const { priorityMode = 'newest', switchThreshold = 10000 } = context;
    const totalProcessed = context.totalProcessed ?? 0;

    if (totalProcessed < switchThreshold) {
      // Before threshold: use priority mode
      return priorityMode === 'historical' ? 0.8 : 0.1;
    } else {
      // After threshold: balanced
      return this.baseHistoricalRatio;
    }
  }

  _getTimeBasedBalance() {
    const hour = new Date().getHours();
    const isPeak = this.timeBased.peakHours.includes(hour);

    return isPeak
      ? this.timeBased.peakHistoricalRatio
      : this.timeBased.offPeakHistoricalRatio;
  }

  // ─────────────────────────────────────────────────────────────
  // Helper methods
  // ─────────────────────────────────────────────────────────────

  _getQueueDepth() {
    if (!this.queries || typeof this.queries.getQueueDepth !== 'function') {
      return 1000;
    }

    const count = this.queries.getQueueDepth();
    return Number.isFinite(count) ? count : 1000;
  }

  _getRecentDiscoveryRate() {
    // Calculate rate from recent batch history
    const recentBatches = this.batchHistory.slice(-5);
    if (recentBatches.length < 2) return 0.5;

    const totalDiscovered = recentBatches.reduce((sum, b) => sum + (b.newArticles || 0), 0);
    const totalProcessed = recentBatches.reduce((sum, b) => sum + (b.pagesProcessed || 1), 0);

    return totalDiscovered / totalProcessed;
  }
}

module.exports = { CrawlBalancer };
