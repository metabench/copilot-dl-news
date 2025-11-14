'use strict';

const {
  normalizeOutputVerbosity,
  DEFAULT_OUTPUT_VERBOSITY
} = require('../utils/outputVerbosity');

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
      getProblemResolutionService,
      getJobId,
      plannerScope,
      isPlannerEnabled,
      isPaused,
      getGoalSummary,
      getQueueHeatmap,
      getCoverageSummary,
      logger,
      outputVerbosity = DEFAULT_OUTPUT_VERBOSITY
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
    this.getProblemResolutionService = typeof getProblemResolutionService === 'function' ? getProblemResolutionService : () => null;
    this.getJobId = typeof getJobId === 'function' ? getJobId : () => null;
    this.plannerScope = typeof plannerScope === 'function' ? plannerScope : () => this.domain;
    this.isPlannerEnabled = typeof isPlannerEnabled === 'function' ? isPlannerEnabled : () => false;
    this.getGoalSummary = typeof getGoalSummary === 'function' ? getGoalSummary : () => [];
    this.getQueueHeatmap = typeof getQueueHeatmap === 'function' ? getQueueHeatmap : () => null;
    this.getCoverageSummary = typeof getCoverageSummary === 'function' ? getCoverageSummary : () => null;
    this.logger = logger || console;
    this.isPausedFn = typeof isPaused === 'function' ? isPaused : () => false;
    this.outputVerbosity = normalizeOutputVerbosity(outputVerbosity);

    this._lastProgressEmitAt = 0;
    this.problemCounters = new Map();
    this.problemSamples = new Map();
    this.emittedMilestones = new Set();
    this.timelineEntries = [];
    this.timelineMaxEntries = typeof options.timelineMaxEntries === 'number' && options.timelineMaxEntries > 0 ? options.timelineMaxEntries : 24;
    this._plannerStageStart = new Map();
    this._timelineSequence = 0;
    this._startTimestamp = Date.now();
  }

  emitProgress({ force = false, patch = null, stage = null, statusText = null, startup = null } = {}) {
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
    const isRateLimited = !!domainState.isLimited;
    let rateLimitedReason = null;
    if (isRateLimited) {
      if (domainState.lastHttpStatus) {
        rateLimitedReason = String(domainState.lastHttpStatus);
      } else if (domainState.last429At) {
        rateLimitedReason = '429';
      }
    }
    const prettyReason = rateLimitedReason
      ? (/^\d+$/.test(rateLimitedReason) ? `HTTP ${rateLimitedReason}` : rateLimitedReason)
      : null;
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
      domainRateLimited: isRateLimited,
      slowMode: isRateLimited,
      slowModeReason: prettyReason,
      domainIntervalMs: domainState.rpm > 0 ? Math.floor(60000 / domainState.rpm) : null,
      perHostLimits,
      cacheRateLimitedServed: stats.cacheRateLimitedServed || 0,
      cacheRateLimitedDeferred: stats.cacheRateLimitedDeferred || 0
    };

    if (isRateLimited && !payload.statusText) {
      const reasonSuffix = prettyReason ? ` (${prettyReason})` : '';
      payload.statusText = `Slow mode${reasonSuffix}`;
    }

    const mergedStartup = startup || (patch && typeof patch === 'object' ? patch.startup : null);
    if (mergedStartup) {
      payload.startup = mergedStartup;
    }

    const effectiveStage = stage || (patch && patch.stage) || null;
    if (effectiveStage) {
      payload.stage = effectiveStage;
    }

    const effectiveStatusText = statusText || (patch && patch.statusText) || null;
    if (effectiveStatusText) {
      payload.statusText = effectiveStatusText;
    }

    const goals = this._safeGoals();
    if (goals) {
      payload.goalStates = goals.states;
      payload.goalSummary = goals.summary;
    }

    const timeline = this._getTimelineSnapshot();
    if (timeline) {
      payload.timeline = timeline;
    }

    const heatmap = this._safeHeatmap();
    if (heatmap) {
      payload.queueHeatmap = heatmap;
    }

    const coverage = this._safeCoverage();
    if (coverage) {
      payload.coverage = coverage;
    }

    if (patch && typeof patch === 'object') {
      const sanitized = { ...patch };
      delete sanitized.startup;
      delete sanitized.statusText;
      delete sanitized.stage;
      if (Object.keys(sanitized).length > 0) {
        Object.assign(payload, sanitized);
      }
    }

    // Emit full JSON for server/child process parsing
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

    if (features.problemResolution && problem && problem.kind === 'missing-hub') {
      const resolver = this.getProblemResolutionService();
      if (resolver && typeof resolver.resolveMissingHub === 'function') {
        const scopeHost = problem.scope || problem.domain || null;
        if (scopeHost) {
          try {
            const details = problem.details || {};
            resolver.resolveMissingHub({
              jobId: this.getJobId(),
              host: scopeHost,
              sourceUrl: details.sourceUrl || details.url || problem.target || null,
              urlPlaceAnalysis: details.urlPlaceAnalysis || null,
              hubCandidate: details.hubCandidate || null
            });
          } catch (error) {
            this._log('warn', 'Problem resolution failed:', error && error.message ? error.message : error);
          }
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
      this._recordPlannerTimeline(payload);
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
    if (level === 'log') {
      const first = args[0];
      if (this.outputVerbosity === 'extra-terse' && this._shouldSuppressLogLine(first)) {
        return;
      }
      if (this.outputVerbosity === 'terse' && this._isQueueLogLine(first)) {
        return;
      }
    }
    const fn = this.logger[level];
    if (typeof fn === 'function') {
      fn.apply(this.logger, args);
    }
  }

  _isQueueLogLine(firstArg) {
    if (typeof firstArg !== 'string') {
      return false;
    }
    const trimmed = firstArg.trim();
    if (!trimmed) {
      return false;
    }
    return /^QUEUE\b/i.test(trimmed);
  }

  _shouldSuppressLogLine(firstArg) {
    if (typeof firstArg !== 'string') {
      return false;
    }
    const trimmed = firstArg.trim();
    if (!trimmed) {
      return false;
    }
    return /^(PROGRESS|QUEUE|PROBLEM|MILESTONE|PLANNER_STAGE|TELEMETRY)\b/i.test(trimmed);
  }

  _recordPlannerTimeline(event) {
    if (!event || !event.stage) {
      return;
    }
    const now = Date.now();
    const sequenceKey = event.sequence != null ? String(event.sequence) : event.stage;
    if (event.status === 'started') {
      this._plannerStageStart.set(sequenceKey, {
        startedAt: now,
        tsIso: event.ts || new Date(now).toISOString(),
        details: this._trimDetails(event.details)
      });
      this._appendTimelineEntry({
        stage: event.stage,
        status: 'started',
        sequence: event.sequence,
        startedAt: event.ts || new Date(now).toISOString(),
        emittedAt: new Date(now).toISOString(),
        details: this._trimDetails(event.details)
      });
      return;
    }

    const startMeta = this._plannerStageStart.get(sequenceKey);
    if (startMeta) {
      this._plannerStageStart.delete(sequenceKey);
    }

    const durationMs = typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
      ? Math.max(0, event.durationMs)
      : (startMeta ? Math.max(0, now - startMeta.startedAt) : undefined);

    this._appendTimelineEntry({
      stage: event.stage,
      status: event.status || 'completed',
      sequence: event.sequence,
      durationMs: durationMs,
      startedAt: startMeta ? startMeta.tsIso : undefined,
      emittedAt: event.ts || new Date(now).toISOString(),
      details: this._trimDetails(event.details)
    });
  }

  _appendTimelineEntry(entry) {
    if (!entry || !entry.stage) {
      return;
    }
    const sanitized = {
      id: `planner-${++this._timelineSequence}`,
      stage: entry.stage,
      status: entry.status || 'started',
      sequence: entry.sequence != null ? entry.sequence : undefined,
      durationMs: entry.durationMs != null ? entry.durationMs : undefined,
      startedAt: entry.startedAt || undefined,
      emittedAt: entry.emittedAt || new Date().toISOString(),
      details: entry.details || undefined,
      sinceStartSec: Math.round((Date.now() - this._startTimestamp) / 1000)
    };
    if (!sanitized.details) delete sanitized.details;
    if (!sanitized.startedAt) delete sanitized.startedAt;
    if (!sanitized.sequence) delete sanitized.sequence;
    if (sanitized.durationMs == null) delete sanitized.durationMs;
    this.timelineEntries.push(sanitized);
    if (this.timelineEntries.length > this.timelineMaxEntries) {
      this.timelineEntries.splice(0, this.timelineEntries.length - this.timelineMaxEntries);
    }
  }

  _getTimelineSnapshot() {
    if (!Array.isArray(this.timelineEntries) || this.timelineEntries.length === 0) {
      return null;
    }
    return this.timelineEntries.map((entry) => ({ ...entry }));
  }

  _trimDetails(details) {
    if (!details) return undefined;
    try {
      if (Array.isArray(details)) {
        return details.slice(0, 6);
      }
      if (typeof details === 'object') {
        const out = {};
        const keys = Object.keys(details).slice(0, 8);
        for (const key of keys) {
          const value = details[key];
          if (Array.isArray(value)) {
            out[key] = value.slice(0, 6);
          } else if (value && typeof value === 'object') {
            out[key] = this._trimDetails(value);
          } else {
            out[key] = value;
          }
        }
        return out;
      }
      return details;
    } catch (_) {
      return undefined;
    }
  }

  _safeGoals() {
    let goals = null;
    try {
      goals = this.getGoalSummary();
    } catch (_) {
      goals = null;
    }
    if (!Array.isArray(goals) || goals.length === 0) {
      return null;
    }
    let completed = 0;
    const states = goals.map((goal) => {
      const nextSteps = Array.isArray(goal.nextSteps) ? goal.nextSteps.slice(0, 4) : undefined;
      const plan = goal.plan && typeof goal.plan === 'object'
        ? {
            actionCount: Array.isArray(goal.plan.actions) ? goal.plan.actions.length : undefined,
            description: goal.plan.description || undefined
          }
        : undefined;
      if (goal.completed) completed += 1;
      return {
        id: goal.id,
        milestoneId: goal.milestoneId,
        description: goal.description,
        progress: goal.progress,
        completed: !!goal.completed,
        details: goal.details ? this._trimDetails(goal.details) : undefined,
        nextSteps,
        plan,
        lastUpdatedAt: goal.lastUpdatedAt || null
      };
    });
    return {
      states,
      summary: {
        total: states.length,
        completed,
        pending: Math.max(0, states.length - completed)
      }
    };
  }

  _safeHeatmap() {
    try {
      const heatmap = this.getQueueHeatmap();
      if (!heatmap || typeof heatmap !== 'object') {
        return null;
      }
      return heatmap;
    } catch (_) {
      return null;
    }
  }

  _safeCoverage() {
    try {
      const coverage = this.getCoverageSummary();
      if (!coverage || typeof coverage !== 'object') {
        return null;
      }
      return coverage;
    } catch (_) {
      return null;
    }
  }
}

module.exports = { CrawlerEvents };
