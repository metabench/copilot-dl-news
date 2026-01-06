'use strict';

/**
 * PatternDeltaTracker
 *
 * Tracks pattern changes between batches to determine when re-analysis is warranted.
 * Records layout signatures, XPath patterns, and other learned patterns, then computes
 * deltas to identify significant learning moments.
 *
 * Key responsibilities:
 * - Track layout signature evolution per domain
 * - Detect when new significant patterns emerge
 * - Identify pages that should be re-analyzed
 * - Maintain a pattern history for trend analysis
 */
class PatternDeltaTracker {
  /**
   * @param {Object} options
   * @param {Object} [options.queries] - Multi-modal crawl query helpers
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({ queries = null, logger = console } = {}) {
    this.queries = queries;
    this.logger = logger;

    // In-memory tracking (persisted snapshots via DB when available)
    this.batchSnapshots = new Map(); // batchNumber -> snapshot
    this.signatureFirstSeen = new Map(); // signature hash -> batch number
    this.signatureSeenCounts = new Map(); // signature hash -> total count
    this.xpathPatterns = new Map(); // domain:selector -> { firstSeen, seenCount }
  }

  /**
   * Record patterns observed in a batch
   * @param {number} batchNumber
   * @param {Array<Object>} patterns - Array of pattern objects
   * @returns {Object} Delta analysis
   */
  recordPatterns(batchNumber, patterns) {
    const snapshot = {
      batchNumber,
      timestamp: new Date().toISOString(),
      signatures: [],
      xpathPatterns: [],
      newSignatures: [],
      newXpathPatterns: []
    };

    // Process each pattern
    for (const pattern of patterns) {
      if (pattern.type === 'layout-signature' || pattern.hash) {
        this._processSignature(snapshot, pattern);
      } else if (pattern.type === 'xpath' || pattern.selector) {
        this._processXpath(snapshot, pattern);
      }
    }

    this.batchSnapshots.set(batchNumber, snapshot);

    // Compute delta from previous batch
    const delta = this._computeDelta(batchNumber);

    return {
      snapshot,
      delta,
      significantLearning: this._isSignificantLearning(delta)
    };
  }

  /**
   * Get pages that should be re-analyzed based on new patterns
   * @param {Array<Object>} newPatterns - Newly learned patterns
   * @param {Object} [options]
   * @param {number} [options.limit=500] - Max pages to return
   * @param {string} [options.domain] - Filter by domain
   * @returns {Array<string>} URLs to re-analyze
   */
  getPagesForReanalysis(newPatterns, { limit = 500, domain = null } = {}) {
    if (!this.queries || newPatterns.length === 0) {
      return [];
    }

    const signatureHashes = newPatterns
      .filter(p => p.hash)
      .map(p => p.hash);

    if (!signatureHashes.length || typeof this.queries.getReanalysisUrlsForSignatures !== 'function') {
      return [];
    }

    try {
      const urls = this.queries.getReanalysisUrlsForSignatures(signatureHashes, {
        limit,
        domain
      });
      return Array.isArray(urls) ? urls : [];
    } catch (error) {
      this.logger.warn('[PatternDeltaTracker] Error finding pages for reanalysis:', error.message);
      return [];
    }
  }

  /**
   * Get learning trends over recent batches
   * @param {number} [recentBatches=10] - Number of recent batches to analyze
   * @returns {Object} Trend analysis
   */
  getLearningTrends(recentBatches = 10) {
    const batches = Array.from(this.batchSnapshots.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, recentBatches)
      .map(([num, snap]) => snap);

    if (batches.length === 0) {
      return { trend: 'insufficient-data', batches: 0 };
    }

    const newSignaturesPerBatch = batches.map(b => b.newSignatures.length);
    const avgNewSignatures = newSignaturesPerBatch.reduce((a, b) => a + b, 0) / batches.length;

    // Trend detection: are we learning less over time?
    const recent = newSignaturesPerBatch.slice(0, Math.ceil(batches.length / 2));
    const older = newSignaturesPerBatch.slice(Math.ceil(batches.length / 2));

    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : 0;

    let trend = 'stable';
    if (recentAvg > olderAvg * 1.5) {
      trend = 'accelerating';
    } else if (recentAvg < olderAvg * 0.5) {
      trend = 'decelerating';
    }

    return {
      trend,
      batchesAnalyzed: batches.length,
      avgNewSignaturesPerBatch: avgNewSignatures.toFixed(2),
      recentAvg: recentAvg.toFixed(2),
      olderAvg: olderAvg.toFixed(2),
      totalUniqueSignatures: this.signatureFirstSeen.size,
      totalUniqueXpaths: this.xpathPatterns.size
    };
  }

  /**
   * Get summary statistics
   * @returns {Object}
   */
  getStatistics() {
    return {
      totalBatches: this.batchSnapshots.size,
      totalUniqueSignatures: this.signatureFirstSeen.size,
      totalUniqueXpathPatterns: this.xpathPatterns.size,
      trends: this.getLearningTrends()
    };
  }

  /**
   * Clear all tracked patterns (for testing or reset)
   */
  clear() {
    this.batchSnapshots.clear();
    this.signatureFirstSeen.clear();
    this.signatureSeenCounts.clear();
    this.xpathPatterns.clear();
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  _processSignature(snapshot, pattern) {
    const hash = pattern.hash;
    const count = pattern.seenCount || 1;

    snapshot.signatures.push(hash);

    if (!this.signatureFirstSeen.has(hash)) {
      this.signatureFirstSeen.set(hash, snapshot.batchNumber);
      snapshot.newSignatures.push({
        hash,
        seenCount: count,
        exampleUrls: pattern.exampleUrls || []
      });
    }

    const prevCount = this.signatureSeenCounts.get(hash) || 0;
    this.signatureSeenCounts.set(hash, prevCount + count);
  }

  _processXpath(snapshot, pattern) {
    const key = pattern.domain
      ? `${pattern.domain}:${pattern.selector}`
      : pattern.selector;

    snapshot.xpathPatterns.push(key);

    if (!this.xpathPatterns.has(key)) {
      this.xpathPatterns.set(key, {
        firstSeen: snapshot.batchNumber,
        seenCount: 1,
        domain: pattern.domain,
        selector: pattern.selector
      });
      snapshot.newXpathPatterns.push({
        key,
        domain: pattern.domain,
        selector: pattern.selector
      });
    } else {
      const entry = this.xpathPatterns.get(key);
      entry.seenCount++;
    }
  }

  _computeDelta(currentBatch) {
    const current = this.batchSnapshots.get(currentBatch);
    const previous = this.batchSnapshots.get(currentBatch - 1);

    if (!previous) {
      return {
        newSignatures: current.newSignatures.length,
        newXpathPatterns: current.newXpathPatterns.length,
        signatureGrowthRate: null,
        xpathGrowthRate: null
      };
    }

    const prevTotalSigs = previous.signatures.length;
    const currTotalSigs = current.signatures.length;

    return {
      newSignatures: current.newSignatures.length,
      newXpathPatterns: current.newXpathPatterns.length,
      signatureGrowthRate: prevTotalSigs > 0
        ? ((currTotalSigs - prevTotalSigs) / prevTotalSigs * 100).toFixed(1) + '%'
        : 'N/A',
      xpathGrowthRate: null // TODO: Compute when xpath tracking is fuller
    };
  }

  _isSignificantLearning(delta) {
    // Significant if we learned 3+ new signatures or patterns
    return (delta.newSignatures >= 3) || (delta.newXpathPatterns >= 2);
  }
}

module.exports = { PatternDeltaTracker };
