'use strict';

/**
 * CrawlScheduler
 * 
 * Manages crawl scheduling with priority-based ordering.
 * Determines which domains should be crawled next based on:
 * - Urgency (how overdue the domain is)
 * - Success rate (domains that succeed get higher priority)
 * - Update frequency (frequently updated domains get higher priority)
 * - Article yield (domains that produce more articles get higher priority)
 * 
 * @module CrawlScheduler
 */

const ScheduleStore = require('./ScheduleStore');
const UpdatePatternAnalyzer = require('./UpdatePatternAnalyzer');

class CrawlScheduler {
  /**
   * Create a CrawlScheduler
   * @param {Object} opts - Options
   * @param {import('better-sqlite3').Database} opts.db - Database instance
   * @param {Object} [opts.weights] - Priority weight configuration
   * @param {number} [opts.weights.urgency=0.3] - Weight for urgency score
   * @param {number} [opts.weights.successRate=0.25] - Weight for success rate
   * @param {number} [opts.weights.updateFrequency=0.25] - Weight for update frequency
   * @param {number} [opts.weights.articleYield=0.2] - Weight for article yield
   * @param {number} [opts.defaultIntervalHours=24] - Default crawl interval
   * @param {number} [opts.minIntervalHours=1] - Minimum crawl interval
   * @param {number} [opts.maxIntervalHours=168] - Maximum crawl interval (1 week)
   */
  constructor(opts = {}) {
    if (!opts.db) {
      throw new Error('CrawlScheduler requires db option');
    }

    this.store = new ScheduleStore(opts.db);
    this.analyzer = new UpdatePatternAnalyzer({
      defaultIntervalHours: opts.defaultIntervalHours || 24,
      minIntervalHours: opts.minIntervalHours || 1,
      maxIntervalHours: opts.maxIntervalHours || 168
    });

    this.weights = {
      urgency: opts.weights?.urgency ?? 0.3,
      successRate: opts.weights?.successRate ?? 0.25,
      updateFrequency: opts.weights?.updateFrequency ?? 0.25,
      articleYield: opts.weights?.articleYield ?? 0.2
    };

    this.defaultIntervalHours = opts.defaultIntervalHours || 24;
    this.minIntervalHours = opts.minIntervalHours || 1;
    this.maxIntervalHours = opts.maxIntervalHours || 168;
  }

  /**
   * Get the next batch of domains due for crawling
   * @param {number} limit - Maximum number of domains to return
   * @returns {Object[]} List of domains with schedule info
   */
  getNextBatch(limit = 10) {
    // Get domains that are due or never crawled
    const batch = this.store.getBatch(limit);

    // Recalculate priorities before returning
    for (const schedule of batch) {
      const newScore = this._calculatePriority(schedule);
      if (Math.abs(newScore - schedule.priorityScore) > 0.01) {
        this.store.updatePriority(schedule.domain, newScore);
        schedule.priorityScore = newScore;
      }
    }

    // Sort by priority (already sorted by DB, but ensure consistency)
    return batch.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Record the result of a crawl
   * @param {string} domain - Domain that was crawled
   * @param {boolean} success - Whether the crawl succeeded
   * @param {number} [articleCount=0] - Number of articles found
   * @returns {Object} Updated schedule
   */
  recordCrawl(domain, success, articleCount = 0) {
    if (!domain) {
      throw new Error('recordCrawl requires domain');
    }

    // Ensure domain exists in store
    let schedule = this.store.get(domain);
    if (!schedule) {
      schedule = this.store.save({ domain });
    }

    // Record the update for pattern analysis
    if (success && articleCount > 0) {
      this.analyzer.recordUpdate(domain, articleCount);
    }

    // Update crawl result in store
    schedule = this.store.recordCrawlResult(domain, success, articleCount);

    // Calculate next crawl time
    const prediction = this.analyzer.predictNextUpdate(domain);
    const nextCrawlAt = prediction.predictedAt;

    // Get pattern for interval
    const pattern = this.analyzer.getPattern(domain);

    // Calculate new priority
    const updatedSchedule = {
      ...schedule,
      nextCrawlAt,
      avgUpdateIntervalHours: pattern.avgIntervalHours,
      updatePattern: this.analyzer.exportPattern(domain)
    };

    const priorityScore = this._calculatePriority(updatedSchedule);
    updatedSchedule.priorityScore = priorityScore;

    // Save updated schedule
    return this.store.save(updatedSchedule);
  }

  /**
   * Add a new domain to the schedule
   * @param {string} domain - Domain to add
   * @param {Object} [opts] - Options
   * @param {number} [opts.initialPriority=0.5] - Initial priority (0-1)
   * @param {number} [opts.intervalHours] - Initial crawl interval
   * @param {boolean} [opts.immediate=true] - Whether to crawl immediately
   * @returns {Object} Created schedule
   */
  addDomain(domain, opts = {}) {
    if (!domain) {
      throw new Error('addDomain requires domain');
    }

    const existing = this.store.get(domain);
    if (existing) {
      return existing;
    }

    const intervalHours = opts.intervalHours || this.defaultIntervalHours;
    // Default: schedule for immediate crawl (now), unless immediate=false
    const immediate = opts.immediate !== false;
    const nextCrawlAt = immediate 
      ? new Date().toISOString()
      : new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();

    return this.store.save({
      domain,
      nextCrawlAt,
      avgUpdateIntervalHours: intervalHours,
      priorityScore: opts.initialPriority ?? 0.5
    });
  }

  /**
   * Remove a domain from the schedule
   * @param {string} domain - Domain to remove
   * @returns {boolean} True if removed
   */
  removeDomain(domain) {
    this.analyzer.clearPattern(domain);
    return this.store.delete(domain);
  }

  /**
   * Get schedule for a specific domain
   * @param {string} domain - Domain to look up
   * @returns {Object|null} Schedule or null
   */
  getSchedule(domain) {
    return this.store.get(domain);
  }

  /**
   * Get statistics about the schedule
   * @returns {Object} Stats
   */
  getStats() {
    const storeStats = this.store.getStats();

    return {
      totalDomains: storeStats.totalDomains,
      dueDomains: storeStats.dueDomains,
      totalCrawls: storeStats.totalSuccesses + storeStats.totalFailures,
      successfulCrawls: storeStats.totalSuccesses,
      failedCrawls: storeStats.totalFailures,
      successRate: storeStats.totalSuccesses + storeStats.totalFailures > 0
        ? storeStats.totalSuccesses / (storeStats.totalSuccesses + storeStats.totalFailures)
        : 0,
      totalArticles: storeStats.totalArticles,
      avgPriority: storeStats.avgPriority,
      avgIntervalHours: storeStats.avgIntervalHours
    };
  }

  /**
   * Recalculate priorities for all domains
   * @returns {number} Number of domains updated
   */
  recalculateAllPriorities() {
    const schedules = this.store.getAll({ limit: 10000 });
    let updated = 0;

    for (const schedule of schedules) {
      const newScore = this._calculatePriority(schedule);
      if (Math.abs(newScore - schedule.priorityScore) > 0.001) {
        this.store.updatePriority(schedule.domain, newScore);
        updated++;
      }
    }

    return updated;
  }

  /**
   * Calculate priority score for a schedule
   * @private
   * @param {Object} schedule - Schedule to score
   * @returns {number} Priority score (0-1)
   */
  _calculatePriority(schedule) {
    const urgencyScore = this._calculateUrgencyScore(schedule);
    const successRateScore = this._calculateSuccessRateScore(schedule);
    const frequencyScore = this._calculateFrequencyScore(schedule);
    const yieldScore = this._calculateYieldScore(schedule);

    const totalWeight = this.weights.urgency + this.weights.successRate +
                        this.weights.updateFrequency + this.weights.articleYield;

    const weightedScore = (
      urgencyScore * this.weights.urgency +
      successRateScore * this.weights.successRate +
      frequencyScore * this.weights.updateFrequency +
      yieldScore * this.weights.articleYield
    ) / totalWeight;

    // Round to 3 decimal places
    return Math.round(weightedScore * 1000) / 1000;
  }

  /**
   * Calculate urgency score (0-1)
   * Higher when domain is more overdue
   * @private
   */
  _calculateUrgencyScore(schedule) {
    if (!schedule.nextCrawlAt) {
      return 1; // Never crawled = max urgency
    }

    const nextTime = new Date(schedule.nextCrawlAt).getTime();
    const now = Date.now();
    const overdueFactor = (now - nextTime) / (1000 * 60 * 60 * 24); // Days overdue

    if (overdueFactor <= 0) {
      // Not yet due - score based on how close to due time
      const intervalMs = (schedule.avgUpdateIntervalHours || this.defaultIntervalHours) * 60 * 60 * 1000;
      const lastTime = schedule.lastCrawlAt ? new Date(schedule.lastCrawlAt).getTime() : 0;
      const elapsed = now - lastTime;
      return Math.min(0.5, elapsed / intervalMs * 0.5);
    }

    // Overdue - scale from 0.5 to 1 based on how overdue
    return Math.min(1, 0.5 + overdueFactor * 0.1);
  }

  /**
   * Calculate success rate score (0-1)
   * Higher for domains with better success rates
   * @private
   */
  _calculateSuccessRateScore(schedule) {
    const total = (schedule.successCount || 0) + (schedule.failureCount || 0);
    if (total === 0) {
      return 0.5; // Unknown - neutral score
    }

    return (schedule.successCount || 0) / total;
  }

  /**
   * Calculate update frequency score (0-1)
   * Higher for domains that update more frequently
   * @private
   */
  _calculateFrequencyScore(schedule) {
    const interval = schedule.avgUpdateIntervalHours || this.defaultIntervalHours;

    // Normalize: 1 hour = 1.0, 168 hours (1 week) = 0.0
    const normalized = 1 - (interval - this.minIntervalHours) /
                           (this.maxIntervalHours - this.minIntervalHours);
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Calculate article yield score (0-1)
   * Higher for domains that produce more articles
   * @private
   */
  _calculateYieldScore(schedule) {
    const avgPerCrawl = schedule.successCount > 0
      ? (schedule.totalArticles || 0) / schedule.successCount
      : 0;

    // Normalize: assume 100 articles/crawl = perfect score
    const normalized = Math.min(1, avgPerCrawl / 100);
    return normalized;
  }
}

module.exports = CrawlScheduler;
