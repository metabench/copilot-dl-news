'use strict';

/**
 * EffectivenessTracker – records planner attribution metrics across runs.
 */
class EffectivenessTracker {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.previewScores = [];
    this.executionMetrics = [];
  }

  observePreviewScore(planScore, blueprint, context) {
    this.previewScores.push({
      timestamp: Date.now(),
      domain: context?.options?.domain || blueprint?.domain || null,
      planScore
    });
  }

  recordExecutionMetrics({
    domain,
    sessionId,
    contributions,
    kpis
  }) {
    this.executionMetrics.push({
      timestamp: Date.now(),
      domain,
      sessionId,
      contributions,
      kpis
    });
  }

  getRecentPreviewStats(limit = 50) {
    return this.previewScores.slice(-limit);
  }

  getExecutionKpis(limit = 50) {
    return this.executionMetrics.slice(-limit);
  }
}

module.exports = {
  EffectivenessTracker
};
