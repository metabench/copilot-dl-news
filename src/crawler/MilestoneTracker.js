const { CompletionReporter } = require('./planner/CompletionReporter');

class MilestoneTracker {
  constructor({
    telemetry,
    state,
    domain,
    getStats,
    getPlanSummary,
    plannerEnabled = false,
    scheduleWideHistoryCheck = null
  } = {}) {
    if (!telemetry) {
      throw new Error('MilestoneTracker requires telemetry');
    }
    if (!state) {
      throw new Error('MilestoneTracker requires crawler state');
    }
    if (typeof getStats !== 'function') {
      throw new Error('MilestoneTracker requires a getStats function');
    }
    this.telemetry = telemetry;
    this.state = state;
    this.domain = domain || null;
    this.getStats = getStats;
    this.getPlanSummary = typeof getPlanSummary === 'function' ? getPlanSummary : () => ({});
    this.plannerEnabled = !!plannerEnabled;
    this.scheduleWideHistoryCheck = typeof scheduleWideHistoryCheck === 'function' ? scheduleWideHistoryCheck : null;
    this.completionReporter = null;
  }

  checkAnalysisMilestones({ depth, isArticle } = {}) {
    const stats = this.getStats() || {};

    if ((stats.depth2PagesProcessed || 0) >= 10) {
      this.telemetry.milestoneOnce('depth2-coverage-10', {
        kind: 'depth2-coverage',
        message: 'Completed analysis of 10 depth-2 pages from the front page',
        details: {
          depth: 2,
          pages: stats.depth2PagesProcessed
        }
      });
    }

    if ((stats.pagesDownloaded || 0) >= 1000) {
      this.telemetry.milestoneOnce('downloads-1k', {
        kind: 'downloads-1k',
        message: 'Downloaded 1,000 documents',
        details: {
          count: stats.pagesDownloaded
        }
      });
    }

    if ((stats.articlesFound || 0) >= 1000) {
      this.telemetry.milestoneOnce('articles-found-1k', {
        kind: 'articles-identified-1k',
        message: 'Identified 1,000 articles during analysis',
        details: {
          count: stats.articlesFound
        }
      });
    }

    if ((stats.articlesFound || 0) >= 10000) {
      this.telemetry.milestoneOnce('articles-found-10k', {
        kind: 'articles-identified-10k',
        message: 'Identified 10,000 articles during analysis',
        details: {
          count: stats.articlesFound
        }
      });
    }

    if (this.plannerEnabled && isArticle && this.scheduleWideHistoryCheck) {
      try {
        this.scheduleWideHistoryCheck({
          depth,
          articlesFound: stats.articlesFound
        });
      } catch (_) {
        // best-effort only
      }
    }
  }

  emitCompletionMilestone({ outcomeErr } = {}) {
    if (!this.plannerEnabled) return;

    const dependencyPayload = {
      state: this.state,
      telemetry: this.telemetry,
      domain: this.domain,
      getPlanSummary: this.getPlanSummary,
      getStats: this.getStats
    };

    if (!this.completionReporter) {
      this.completionReporter = new CompletionReporter(dependencyPayload);
    } else {
      this.completionReporter.updateDependencies(dependencyPayload);
    }

    this.completionReporter.emit({
      outcomeErr
    });
  }
}

module.exports = {
  MilestoneTracker
};
