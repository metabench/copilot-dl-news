'use strict';

class CrawlerEvents {
  constructor(options = {}) {
    const {
      domain,
      getStats,
      getQueueSize,
      getCurrentDownloads,
      getDomainLimits,
      getRobotsInfo,
      getSitemapInfo,
      getFeatures,
      getEnhancedDbAdapter,
      getProblemClusteringService,
      getJobId,
  plannerScope,
  isPlannerEnabled,
  isPaused,
      logger
    } = options;

    if (!domain) throw new Error('CrawlerEvents requires domain');
    if (typeof getStats !== 'function') throw new Error('CrawlerEvents requires getStats function');
    if (typeof getQueueSize !== 'function') throw new Error('CrawlerEvents requires getQueueSize function');
    if (typeof getCurrentDownloads !== 'function') throw new Error('CrawlerEvents requires getCurrentDownloads function');
    if (typeof getDomainLimits !== 'function') throw new Error('CrawlerEvents requires getDomainLimits function');
    this.domain = domain;
    this.getStats = getStats;
    this.getQueueSize = getQueueSize;
    this.getCurrentDownloads = getCurrentDownloads;
    this.getDomainLimits = getDomainLimits;
    this.getRobotsInfo = typeof getRobotsInfo === 'function' ? getRobotsInfo : () => ({ robotsLoaded: false });
    this.getSitemapInfo = typeof getSitemapInfo === 'function' ? getSitemapInfo : () => ({ urls: [], discovered: 0 });
    this.getFeatures = typeof getFeatures === 'function' ? getFeatures : () => ({ problemClustering: false });
    this.getEnhancedDbAdapter = typeof getEnhancedDbAdapter === 'function' ? getEnhancedDbAdapter : () => null;
    this.getProblemClusteringService = typeof getProblemClusteringService === 'function' ? getProblemClusteringService : () => null;
    this.getJobId = typeof getJobId === 'function' ? getJobId : () => null;
    this.plannerScope = typeof plannerScope === 'function' ? plannerScope : () => this.domain;
    this.isPlannerEnabled = typeof isPlannerEnabled === 'function' ? isPlannerEnabled : () => false;
  this.logger = logger || console;
  this.isPausedFn = typeof isPaused === 'function' ? isPaused : () => false;

    this._lastProgressEmitAt = 0;
    this.problemCounters = new Map();
    this.problemSamples = new Map();
    this.emittedMilestones = new Set();
  }

  emitProgress({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - this._lastProgressEmitAt < 300) return;
    this._lastProgressEmitAt = now;

    const stats = this.getStats() || {};
    const queueSize = this.getQueueSize() || 0;
    const currentDownloadsMap = this.getCurrentDownloads() || new Map();
    const inflight = [];
    try {
      const entries = Array.from(currentDownloadsMap.entries());
      entries.sort((a, b) => (b[1]?.startedAt || 0) - (a[1]?.startedAt || 0));
      for (let i = 0; i < Math.min(5, entries.length); i++) {
        const [url, info] = entries[i];
        inflight.push({ url, ageMs: now - (info?.startedAt || now) });
      }
    } catch (_) {}

    const domainLimits = this.getDomainLimits() || new Map();
    const domainState = domainLimits.get(this.domain) || {};
    const now2 = Date.now();
    const perHostLimits = {};
    for (const [host, s] of domainLimits.entries()) {
      try {
        const backoff = (s.backoffUntil > now2) ? (s.backoffUntil - now2) : null;
        const interval = s.rpm > 0 ? Math.floor(60000 / s.rpm) : null;
        perHostLimits[host] = {
          rateLimited: !!s.isLimited,
          limit: s.rpm || null,
          intervalMs: interval,
          backoffMs: backoff
        };
      } catch (_) {}
    }

    const robotsInfo = this.getRobotsInfo();
    const sitemapInfo = this.getSitemapInfo();

    const payload = {
      visited: stats.pagesVisited || 0,
      downloaded: stats.pagesDownloaded || 0,
      found: stats.articlesFound || 0,
      saved: stats.articlesSaved || 0,
      errors: stats.errors || 0,
      bytes: stats.bytesDownloaded || 0,
      queueSize,
      currentDownloadsCount: typeof currentDownloadsMap.size === 'number' ? currentDownloadsMap.size : Array.isArray(currentDownloadsMap) ? currentDownloadsMap.length : 0,
      currentDownloads: inflight,
  paused: !!this.isPausedFn(),
      robotsLoaded: !!robotsInfo.robotsLoaded,
      sitemapCount: Array.isArray(sitemapInfo.urls) ? sitemapInfo.urls.length : 0,
      sitemapEnqueued: sitemapInfo.discovered || 0,
      domain: this.domain,
      domainRpm: domainState.rpmLastMinute || null,
      domainLimit: domainState.rpm || null,
      domainBackoffMs: domainState.backoffUntil && domainState.backoffUntil > now2 ? domainState.backoffUntil - now2 : null,
      domainRateLimited: !!domainState.isLimited,
      domainIntervalMs: domainState.rpm > 0 ? Math.floor(60000 / domainState.rpm) : null,
      perHostLimits,
      cacheRateLimitedServed: stats.cacheRateLimitedServed || 0,
      cacheRateLimitedDeferred: stats.cacheRateLimitedDeferred || 0
    };

    this._log('log', `PROGRESS ${JSON.stringify(payload)}`);
  }

  emitQueueEvent(evt) {
    try {
      this._log('log', 'QUEUE ' + JSON.stringify(evt));
    } catch (_) {}
  }

  emitEnhancedQueueEvent(eventData) {
    this.emitQueueEvent(eventData);
    const adapter = this.getEnhancedDbAdapter();
    const jobId = this.getJobId();
    if (!adapter || !jobId) {
      return;
    }
    try {
      adapter.insertQueueEvent({
        ...eventData,
        jobId,
        priorityScore: eventData.priorityScore,
        prioritySource: eventData.prioritySource,
        bonusApplied: eventData.bonusApplied,
        clusterId: eventData.clusterId,
        gapPredictionScore: eventData.gapPredictionScore
      });
    } catch (error) {
      this._log('warn', 'Failed to log enhanced queue event:', error && error.message ? error.message : error);
    }
  }

  emitProblem(problem) {
    try {
      const kind = problem && problem.kind ? String(problem.kind) : 'unknown';
      const entry = this.problemCounters.get(kind) || { count: 0 };
      entry.count += 1;
      this.problemCounters.set(kind, entry);
      if (!this.problemSamples.has(kind) && problem && typeof problem === 'object') {
        const sample = {};
        if (problem.scope) sample.scope = problem.scope;
        if (problem.target) sample.target = problem.target;
        if (problem.message) sample.message = problem.message;
        if (Object.keys(sample).length) {
          this.problemSamples.set(kind, sample);
        }
      }
    } catch (_) {}

    try {
      this._log('log', 'PROBLEM ' + JSON.stringify(problem));
    } catch (_) {}

    const features = this.getFeatures() || {};
    if (features.problemClustering) {
      const clusteringService = this.getProblemClusteringService();
      if (clusteringService && typeof clusteringService.processProblem === 'function') {
        try {
          const result = clusteringService.processProblem({
            ...(problem || {}),
            jobId: this.getJobId(),
            timestamp: new Date().toISOString()
          });
          if (result?.shouldBoostRelated) {
            this._log('log', `Problem cluster ${result.clusterId} reached occurrence ${result.occurrenceCount}, priority boost: ${result.priorityBoost}`);
          }
        } catch (error) {
          this._log('warn', 'Problem clustering failed:', error && error.message ? error.message : error);
        }
      }
    }
  }

  emitEnhancedProblem(problem) {
    this.emitProblem(problem);
  }

  emitMilestone(milestone) {
    try {
      this._log('log', 'MILESTONE ' + JSON.stringify(milestone));
    } catch (_) {}
  }

  emitMilestoneOnce(key, milestone) {
    if (!key) return;
    if (this.emittedMilestones.has(key)) return;
    this.emittedMilestones.add(key);
    this.emitMilestone(Object.assign({ scope: this.domain }, milestone));
  }

  emitPlannerStage(event) {
    if (!this.isPlannerEnabled()) return;
    try {
      const payload = Object.assign({ scope: this.plannerScope() }, event || {});
      const replacer = (_, value) => (value === undefined ? undefined : value);
      this._log('log', 'PLANNER_STAGE ' + JSON.stringify(payload, replacer));
    } catch (_) {}
  }

  getProblemSummary() {
    const counters = [];
    for (const [kind, entry] of this.problemCounters.entries()) {
      counters.push({ kind, count: entry.count });
    }
    const samples = {};
    for (const [kind, sample] of this.problemSamples.entries()) {
      samples[kind] = sample;
    }
    return { counters, samples };
  }

  resetMilestones() {
    this.emittedMilestones.clear();
  }

  _log(level, ...args) {
    if (!this.logger) return;
    const fn = this.logger[level];
    if (typeof fn === 'function') {
      fn.apply(this.logger, args);
    }
  }
}

module.exports = { CrawlerEvents };
