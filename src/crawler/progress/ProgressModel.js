'use strict';

const EventEmitter = require('events');

/**
 * ProgressModel - Unified view of crawl progress.
 *
 * Combines data from CrawlContext, CrawlPlan, and ResourceBudget to provide:
 * - Overall completion percentage
 * - Goal-by-goal progress
 * - ETA estimation with adaptive smoothing
 * - Rate metrics (pages/sec, bytes/sec)
 * - Phase detection (ramping, steady, cooling)
 *
 * Design principles:
 * - Read-only view (doesn't modify underlying data)
 * - Computed properties for efficiency
 * - Adaptive ETA that improves over time
 * - Observable progress events
 *
 * @example
 * const progress = new ProgressModel(context, plan);
 * console.log(progress.completion);  // 45.2
 * console.log(progress.eta);         // 32000 (ms remaining)
 * console.log(progress.phase);       // 'steady'
 *
 * @extends EventEmitter
 */
class ProgressModel extends EventEmitter {
  /**
   * Phase constants.
   */
  static PHASES = Object.freeze({
    INITIALIZING: 'initializing',
    RAMPING: 'ramping',
    STEADY: 'steady',
    COOLING: 'cooling',
    STALLED: 'stalled',
    COMPLETED: 'completed'
  });

  /**
   * @param {Object} context - CrawlContext instance
   * @param {Object} plan - CrawlPlan instance
   * @param {Object} options - Additional options
   */
  constructor(context, plan, options = {}) {
    super();

    this.context = context;
    this.plan = plan;

    // ETA smoothing configuration
    this._etaAlpha = options.etaAlpha ?? 0.3; // Exponential smoothing factor
    this._etaHistory = [];
    this._maxEtaHistory = options.maxEtaHistory ?? 10;

    // Rate tracking for smoothing
    this._rateHistory = [];
    this._maxRateHistory = options.maxRateHistory ?? 20;

    // Snapshot for rate calculations
    this._lastSnapshot = null;
    this._snapshotInterval = options.snapshotInterval ?? 1000;

    // Phase detection thresholds
    this._stallThresholdMs = options.stallThresholdMs ?? 30000;
    this._rampThreshold = options.rampThreshold ?? 0.1; // 10% of target
    this._coolThreshold = options.coolThreshold ?? 0.9; // 90% of target
  }

  // ============================================================
  // COMPLETION
  // ============================================================

  /**
   * Get overall completion percentage (0-100).
   */
  get completion() {
    // If plan has constraints, use those
    const constraints = this.plan?.constraints || {};
    const stats = this.context?.stats || {};

    // Priority: maxPages > plan goals > queue-based estimate
    if (constraints.maxPages) {
      return Math.min(100, ((stats.visited || 0) / constraints.maxPages) * 100);
    }

    // Check plan goal satisfaction
    if (this.plan && typeof this.plan.getSatisfactionPercent === 'function') {
      return this.plan.getSatisfactionPercent(this.context);
    }

    // Fallback: queue-based estimate
    const visited = stats.visited || 0;
    const queued = stats.queued || this.context?.queuedCount || 0;
    const total = visited + queued;

    if (total === 0) return 0;
    return (visited / total) * 100;
  }

  /**
   * Check if crawl is complete.
   */
  get isComplete() {
    return this.completion >= 100 || this.context?.isFinished;
  }

  /**
   * Get remaining work count (pages or items).
   */
  get remaining() {
    const constraints = this.plan?.constraints || {};
    const stats = this.context?.stats || {};

    if (constraints.maxPages) {
      return Math.max(0, constraints.maxPages - (stats.visited || 0));
    }

    return this.context?.queuedCount || stats.queued || 0;
  }

  // ============================================================
  // ETA (Estimated Time of Arrival)
  // ============================================================

  /**
   * Get estimated time remaining in milliseconds.
   * Uses exponential smoothing for stability.
   */
  get eta() {
    const elapsed = this.context?.elapsedMs || 0;
    const completion = this.completion;

    if (completion === 0 || elapsed === 0) return null;
    if (completion >= 100) return 0;

    // Simple projection
    const rawEta = (elapsed / completion) * (100 - completion);

    // Apply exponential smoothing
    return this._smoothEta(rawEta);
  }

  /**
   * Get ETA as human-readable string.
   */
  get etaFormatted() {
    const ms = this.eta;
    if (ms === null) return 'calculating...';
    if (ms === 0) return 'complete';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Apply exponential smoothing to ETA.
   * @private
   */
  _smoothEta(rawEta) {
    this._etaHistory.push(rawEta);
    if (this._etaHistory.length > this._maxEtaHistory) {
      this._etaHistory.shift();
    }

    if (this._etaHistory.length === 1) {
      return Math.round(rawEta);
    }

    // Exponential moving average
    let smoothed = this._etaHistory[0];
    for (let i = 1; i < this._etaHistory.length; i++) {
      smoothed = this._etaAlpha * this._etaHistory[i] + (1 - this._etaAlpha) * smoothed;
    }

    return Math.round(smoothed);
  }

  /**
   * Get estimated completion time as Date.
   */
  get estimatedCompletionTime() {
    const eta = this.eta;
    if (eta === null) return null;
    return new Date(Date.now() + eta);
  }

  // ============================================================
  // RATES
  // ============================================================

  /**
   * Get current rate metrics.
   */
  get rate() {
    const elapsed = (this.context?.elapsedMs || 0) / 1000; // seconds
    const stats = this.context?.stats || {};

    if (elapsed === 0) {
      return {
        pagesPerSecond: 0,
        bytesPerSecond: 0,
        articlesPerSecond: 0,
        errorsPerSecond: 0
      };
    }

    return {
      pagesPerSecond: (stats.visited || 0) / elapsed,
      bytesPerSecond: (stats.bytesDownloaded || 0) / elapsed,
      articlesPerSecond: (stats.articles || 0) / elapsed,
      errorsPerSecond: (stats.errors || 0) / elapsed
    };
  }

  /**
   * Get instantaneous rate (over recent window).
   */
  get instantRate() {
    const now = Date.now();
    const stats = this.context?.stats || {};

    // Take a snapshot for rate calculation
    if (!this._lastSnapshot || (now - this._lastSnapshot.time) >= this._snapshotInterval) {
      const newSnapshot = {
        time: now,
        visited: stats.visited || 0,
        bytes: stats.bytesDownloaded || 0,
        articles: stats.articles || 0
      };

      if (this._lastSnapshot) {
        const deltaMs = now - this._lastSnapshot.time;
        const deltaSeconds = deltaMs / 1000;

        if (deltaSeconds > 0) {
          const instantRate = {
            pagesPerSecond: (newSnapshot.visited - this._lastSnapshot.visited) / deltaSeconds,
            bytesPerSecond: (newSnapshot.bytes - this._lastSnapshot.bytes) / deltaSeconds,
            articlesPerSecond: (newSnapshot.articles - this._lastSnapshot.articles) / deltaSeconds
          };

          this._rateHistory.push(instantRate);
          if (this._rateHistory.length > this._maxRateHistory) {
            this._rateHistory.shift();
          }
        }
      }

      this._lastSnapshot = newSnapshot;
    }

    // Return smoothed instant rate
    if (this._rateHistory.length === 0) {
      return this.rate; // Fall back to average rate
    }

    // Average of recent rates
    const sum = this._rateHistory.reduce((acc, r) => ({
      pagesPerSecond: acc.pagesPerSecond + r.pagesPerSecond,
      bytesPerSecond: acc.bytesPerSecond + r.bytesPerSecond,
      articlesPerSecond: acc.articlesPerSecond + r.articlesPerSecond
    }), { pagesPerSecond: 0, bytesPerSecond: 0, articlesPerSecond: 0 });

    const count = this._rateHistory.length;
    return {
      pagesPerSecond: sum.pagesPerSecond / count,
      bytesPerSecond: sum.bytesPerSecond / count,
      articlesPerSecond: sum.articlesPerSecond / count
    };
  }

  /**
   * Format bytes per second as human readable.
   */
  get throughputFormatted() {
    const bps = this.rate.bytesPerSecond;

    if (bps >= 1024 * 1024) {
      return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (bps >= 1024) {
      return `${(bps / 1024).toFixed(2)} KB/s`;
    } else {
      return `${Math.round(bps)} B/s`;
    }
  }

  // ============================================================
  // GOAL PROGRESS
  // ============================================================

  /**
   * Get progress for all goals.
   */
  get goalProgress() {
    if (!this.plan || !this.plan.goals) {
      return [];
    }

    return this.plan.goals.map(goal => ({
      id: goal.id,
      type: goal.type,
      target: goal.target,
      current: this._getGoalCurrent(goal),
      percentage: this.plan.getGoalProgress(goal, this.context),
      satisfied: this.plan.isGoalSatisfied(goal, this.context),
      status: goal.status
    }));
  }

  /**
   * Get current value for a goal.
   * @private
   */
  _getGoalCurrent(goal) {
    const stats = this.context?.stats || {};

    switch (goal.type) {
      case 'discover-articles':
        return stats.articles || 0;
      case 'map-structure':
        return stats.visited || 0;
      case 'geographic-coverage':
        return this.context?.getLocationCount?.() || 0;
      case 'refresh-content':
        return stats.refreshed || 0;
      default:
        return 0;
    }
  }

  /**
   * Get the most lagging goal (lowest completion).
   */
  get bottleneckGoal() {
    const progress = this.goalProgress;
    if (progress.length === 0) return null;

    return progress.reduce((min, g) =>
      g.percentage < min.percentage ? g : min
    );
  }

  // ============================================================
  // PHASE DETECTION
  // ============================================================

  /**
   * Get current phase of the crawl.
   */
  get phase() {
    const completion = this.completion;
    const stats = this.context?.stats || {};
    const elapsed = this.context?.elapsedMs || 0;
    const idleMs = this.context?.idleMs || 0;

    // Check for completion
    if (completion >= 100 || this.context?.isFinished) {
      return ProgressModel.PHASES.COMPLETED;
    }

    // Check for stall
    if (idleMs > this._stallThresholdMs) {
      return ProgressModel.PHASES.STALLED;
    }

    // Check phase based on completion
    if (elapsed < 5000 || (stats.visited || 0) < 5) {
      return ProgressModel.PHASES.INITIALIZING;
    }

    if (completion < this._rampThreshold * 100) {
      return ProgressModel.PHASES.RAMPING;
    }

    if (completion > this._coolThreshold * 100) {
      return ProgressModel.PHASES.COOLING;
    }

    return ProgressModel.PHASES.STEADY;
  }

  /**
   * Get phase description.
   */
  get phaseDescription() {
    switch (this.phase) {
      case ProgressModel.PHASES.INITIALIZING:
        return 'Starting up, discovering initial pages';
      case ProgressModel.PHASES.RAMPING:
        return 'Building queue, increasing throughput';
      case ProgressModel.PHASES.STEADY:
        return 'Processing at steady rate';
      case ProgressModel.PHASES.COOLING:
        return 'Nearing completion, queue draining';
      case ProgressModel.PHASES.STALLED:
        return 'No activity, possibly stuck';
      case ProgressModel.PHASES.COMPLETED:
        return 'Crawl complete';
      default:
        return 'Unknown phase';
    }
  }

  // ============================================================
  // HEALTH INDICATORS
  // ============================================================

  /**
   * Get error rate as percentage.
   */
  get errorRate() {
    const stats = this.context?.stats || {};
    const total = (stats.visited || 0) + (stats.errors || 0);
    if (total === 0) return 0;
    return ((stats.errors || 0) / total) * 100;
  }

  /**
   * Get cache hit rate as percentage.
   */
  get cacheHitRate() {
    const stats = this.context?.stats || {};
    const total = (stats.cacheHits || 0) + (stats.cacheMisses || 0);
    if (total === 0) return 0;
    return ((stats.cacheHits || 0) / total) * 100;
  }

  /**
   * Get article discovery rate (articles per page visited).
   */
  get articleDiscoveryRate() {
    const stats = this.context?.stats || {};
    if ((stats.visited || 0) === 0) return 0;
    return ((stats.articles || 0) / stats.visited) * 100;
  }

  /**
   * Get health score (0-100, higher is better).
   */
  get healthScore() {
    let score = 100;

    // Deduct for high error rate
    const errorRate = this.errorRate;
    if (errorRate > 50) score -= 40;
    else if (errorRate > 20) score -= 20;
    else if (errorRate > 10) score -= 10;

    // Deduct for stall
    if (this.phase === ProgressModel.PHASES.STALLED) {
      score -= 30;
    }

    // Deduct for low throughput (if we've been running a while)
    const elapsed = this.context?.elapsedMs || 0;
    if (elapsed > 60000 && this.rate.pagesPerSecond < 0.1) {
      score -= 20;
    }

    return Math.max(0, score);
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  /**
   * Get summary snapshot.
   */
  toJSON() {
    return {
      completion: Math.round(this.completion * 100) / 100,
      remaining: this.remaining,
      eta: this.eta,
      etaFormatted: this.etaFormatted,
      estimatedCompletionTime: this.estimatedCompletionTime?.toISOString() || null,

      rate: {
        pagesPerSecond: Math.round(this.rate.pagesPerSecond * 100) / 100,
        bytesPerSecond: Math.round(this.rate.bytesPerSecond),
        throughputFormatted: this.throughputFormatted
      },

      phase: this.phase,
      phaseDescription: this.phaseDescription,

      goals: this.goalProgress,
      bottleneck: this.bottleneckGoal,

      health: {
        score: this.healthScore,
        errorRate: Math.round(this.errorRate * 100) / 100,
        cacheHitRate: Math.round(this.cacheHitRate * 100) / 100,
        articleDiscoveryRate: Math.round(this.articleDiscoveryRate * 100) / 100
      },

      stats: this.context?.stats || {}
    };
  }

  /**
   * Get compact one-line summary.
   */
  get summary() {
    const stats = this.context?.stats || {};
    return `${Math.round(this.completion)}% complete | ` +
           `${stats.visited || 0} pages | ` +
           `${stats.articles || 0} articles | ` +
           `ETA: ${this.etaFormatted} | ` +
           `${this.rate.pagesPerSecond.toFixed(1)} p/s`;
  }

  /**
   * Create a ProgressModel from context and plan.
   */
  static create(context, plan, options = {}) {
    return new ProgressModel(context, plan, options);
  }
}

module.exports = ProgressModel;
