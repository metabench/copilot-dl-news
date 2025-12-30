'use strict';

/**
 * UpdatePatternAnalyzer
 * 
 * Analyzes domain update patterns to predict optimal crawl times.
 * Tracks when domains typically publish new content and calculates
 * intervals for scheduling.
 * 
 * @module UpdatePatternAnalyzer
 */

class UpdatePatternAnalyzer {
  /**
   * Create an UpdatePatternAnalyzer
   * @param {Object} [opts] - Options
   * @param {number} [opts.maxSamples=50] - Max update samples to keep per domain
   * @param {number} [opts.defaultIntervalHours=24] - Default interval if no data
   * @param {number} [opts.minIntervalHours=1] - Minimum interval to suggest
   * @param {number} [opts.maxIntervalHours=168] - Maximum interval (1 week)
   */
  constructor(opts = {}) {
    this.maxSamples = opts.maxSamples || 50;
    this.defaultIntervalHours = opts.defaultIntervalHours || 24;
    this.minIntervalHours = opts.minIntervalHours || 1;
    this.maxIntervalHours = opts.maxIntervalHours || 168;
    
    // In-memory cache of patterns (would be persisted via ScheduleStore in production)
    this.patterns = new Map();
  }

  /**
   * Record an update observation
   * @param {string} domain - Domain that was updated
   * @param {number} articleCount - Number of articles found
   * @param {Date} [timestamp] - When the update was observed
   */
  recordUpdate(domain, articleCount, timestamp = new Date()) {
    if (!domain) {
      throw new Error('recordUpdate requires domain');
    }

    if (!this.patterns.has(domain)) {
      this.patterns.set(domain, {
        updates: [],
        articleCounts: []
      });
    }

    const pattern = this.patterns.get(domain);
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

    pattern.updates.push(ts.getTime());
    pattern.articleCounts.push(articleCount || 0);

    // Trim to max samples
    if (pattern.updates.length > this.maxSamples) {
      pattern.updates.shift();
      pattern.articleCounts.shift();
    }
  }

  /**
   * Get the update pattern for a domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Pattern analysis
   */
  getPattern(domain) {
    const pattern = this.patterns.get(domain);

    if (!pattern || pattern.updates.length < 2) {
      return {
        domain,
        sampleCount: pattern?.updates.length || 0,
        avgIntervalHours: this.defaultIntervalHours,
        updateTimes: [],
        avgArticleCount: 0,
        confidence: 0
      };
    }

    const intervals = [];
    const hourOfDay = [];
    const dayOfWeek = [];

    for (let i = 1; i < pattern.updates.length; i++) {
      const intervalMs = pattern.updates[i] - pattern.updates[i - 1];
      intervals.push(intervalMs / (1000 * 60 * 60)); // Convert to hours

      const date = new Date(pattern.updates[i]);
      hourOfDay.push(date.getHours());
      dayOfWeek.push(date.getDay());
    }

    const avgIntervalHours = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const avgArticles = pattern.articleCounts.reduce((a, b) => a + b, 0) / pattern.articleCounts.length;

    // Calculate confidence based on sample size and variance
    const variance = this._calculateVariance(intervals);
    const sampleConfidence = Math.min(pattern.updates.length / 10, 1);
    const varianceConfidence = variance > 0 ? Math.max(0, 1 - Math.sqrt(variance) / avgIntervalHours) : 1;
    const confidence = sampleConfidence * varianceConfidence;

    // Find peak hours
    const hourCounts = this._countOccurrences(hourOfDay);
    const peakHours = this._getTopItems(hourCounts, 3);

    // Find peak days
    const dayCounts = this._countOccurrences(dayOfWeek);
    const peakDays = this._getTopItems(dayCounts, 3);

    return {
      domain,
      sampleCount: pattern.updates.length,
      avgIntervalHours: this._clampInterval(avgIntervalHours),
      updateTimes: {
        peakHours,
        peakDays
      },
      avgArticleCount: Math.round(avgArticles),
      confidence: Math.round(confidence * 100) / 100,
      lastUpdate: new Date(pattern.updates[pattern.updates.length - 1]).toISOString()
    };
  }

  /**
   * Predict the next update time
   * @param {string} domain - Domain to predict
   * @returns {Object} Prediction with estimated time and confidence
   */
  predictNextUpdate(domain) {
    const pattern = this.getPattern(domain);

    if (pattern.sampleCount < 2) {
      const nextTime = new Date(Date.now() + this.defaultIntervalHours * 60 * 60 * 1000);
      return {
        domain,
        predictedAt: nextTime.toISOString(),
        intervalHours: this.defaultIntervalHours,
        confidence: 0,
        method: 'default'
      };
    }

    const rawPattern = this.patterns.get(domain);
    const lastUpdate = rawPattern.updates[rawPattern.updates.length - 1];
    const intervalMs = pattern.avgIntervalHours * 60 * 60 * 1000;
    const predictedTime = new Date(lastUpdate + intervalMs);

    // If predicted time is in the past, add intervals until it's in the future
    const now = Date.now();
    let adjustedTime = predictedTime.getTime();
    while (adjustedTime < now) {
      adjustedTime += intervalMs;
    }

    return {
      domain,
      predictedAt: new Date(adjustedTime).toISOString(),
      intervalHours: pattern.avgIntervalHours,
      confidence: pattern.confidence,
      method: pattern.sampleCount >= 10 ? 'statistical' : 'interpolated'
    };
  }

  /**
   * Load pattern data (for persistence)
   * @param {string} domain - Domain
   * @param {Object} data - Pattern data to load
   */
  loadPattern(domain, data) {
    if (!domain || !data) return;

    this.patterns.set(domain, {
      updates: Array.isArray(data.updates) ? [...data.updates] : [],
      articleCounts: Array.isArray(data.articleCounts) ? [...data.articleCounts] : []
    });
  }

  /**
   * Export pattern data (for persistence)
   * @param {string} domain - Domain
   * @returns {Object|null} Pattern data
   */
  exportPattern(domain) {
    const pattern = this.patterns.get(domain);
    if (!pattern) return null;

    return {
      updates: [...pattern.updates],
      articleCounts: [...pattern.articleCounts]
    };
  }

  /**
   * Clear pattern data for a domain
   * @param {string} domain - Domain
   */
  clearPattern(domain) {
    this.patterns.delete(domain);
  }

  /**
   * Calculate variance of an array
   * @private
   */
  _calculateVariance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Count occurrences of each value
   * @private
   */
  _countOccurrences(arr) {
    const counts = new Map();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    return counts;
  }

  /**
   * Get top N items by count
   * @private
   */
  _getTopItems(countMap, n) {
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([item]) => item);
  }

  /**
   * Clamp interval to valid range
   * @private
   */
  _clampInterval(hours) {
    return Math.max(this.minIntervalHours, Math.min(this.maxIntervalHours, hours));
  }
}

module.exports = UpdatePatternAnalyzer;
