const { URL } = require('url');

class WorkerRunner {
  constructor({
    queue,
    processPage,
    computePriority,
    retryLimit = 3,
    backoffBaseMs = 500,
    backoffMaxMs = 5 * 60 * 1000,
    getStats,
    getMaxDownloads = () => undefined,
    telemetry = null,
    sleep,
    nowMs,
    jitter,
    isPaused,
    isAbortRequested,
    emitProgress,
    safeHostFromUrl,
    getQueueSize,
    onBusyChange,
    onExitReason,
    pausePollIntervalMs = 200
  } = {}) {
    if (!queue || typeof queue.pullNext !== 'function') {
      throw new Error('WorkerRunner requires a queue with pullNext()');
    }
    if (typeof processPage !== 'function') {
      throw new Error('WorkerRunner requires a processPage function');
    }
    if (typeof computePriority !== 'function') {
      throw new Error('WorkerRunner requires a computePriority function');
    }
    if (typeof getStats !== 'function') {
      throw new Error('WorkerRunner requires a getStats function');
    }
    if (typeof sleep !== 'function' || typeof nowMs !== 'function' || typeof jitter !== 'function') {
      throw new Error('WorkerRunner requires sleep, nowMs, and jitter helpers');
    }
    if (typeof isPaused !== 'function' || typeof isAbortRequested !== 'function' || typeof emitProgress !== 'function') {
      throw new Error('WorkerRunner requires isPaused, isAbortRequested, and emitProgress helpers');
    }
    if (typeof safeHostFromUrl !== 'function') {
      throw new Error('WorkerRunner requires a safeHostFromUrl helper');
    }
    if (typeof getQueueSize !== 'function') {
      throw new Error('WorkerRunner requires a getQueueSize helper');
    }

    this.queue = queue;
    this.processPage = processPage;
    this.computePriority = computePriority;
    this.retryLimit = retryLimit;
    this.backoffBaseMs = backoffBaseMs;
    this.backoffMaxMs = backoffMaxMs;
    this.getStats = getStats;
    this.getMaxDownloads = getMaxDownloads;
    this.telemetry = telemetry;
    this.sleep = sleep;
    this.nowMs = nowMs;
    this.jitter = jitter;
    this.isPaused = isPaused;
    this.isAbortRequested = isAbortRequested;
    this.emitProgress = emitProgress;
    this.safeHostFromUrl = safeHostFromUrl;
    this.getQueueSize = getQueueSize;
    this.onBusyChange = typeof onBusyChange === 'function' ? onBusyChange : () => {};
    this.pausePollIntervalMs = pausePollIntervalMs;
    this.onExitReason = typeof onExitReason === 'function' ? onExitReason : null;
  }

  _emitExitReason(reason, workerId, details = {}) {
    if (!reason || !this.onExitReason) {
      return;
    }
    try {
      this.onExitReason(reason, {
        workerId,
        ...details
      });
    } catch (_) {}
  }

  async run(workerId) {
    const signalExit = (reason, details) => {
      if (reason) {
        this._emitExitReason(reason, workerId, details);
      }
    };
    while (true) {
      if (this.isAbortRequested()) {
        signalExit('abort-requested', { phase: 'pre-loop' });
        return;
      }

      while (this.isPaused() && !this.isAbortRequested()) {
        await this.sleep(this.pausePollIntervalMs);
        this.emitProgress();
      }
      if (this.isAbortRequested()) {
        signalExit('abort-requested', { phase: 'paused-loop' });
        return;
      }

      const maxDownloads = this.getMaxDownloads();
      const stats = this.getStats();
      if (maxDownloads !== undefined && stats && typeof stats.pagesDownloaded === 'number' && stats.pagesDownloaded >= maxDownloads) {
        signalExit('max-downloads-reached', {
          downloads: stats.pagesDownloaded,
          limit: maxDownloads
        });
        return;
      }

      const pick = await this.queue.pullNext();
      if (this.isAbortRequested()) {
        signalExit('abort-requested', { phase: 'post-pull' });
        return;
      }

      const now = this.nowMs();
      if (!pick || !pick.item) {
        const queueSize = this.getQueueSize();
        const wakeTarget = pick && pick.wakeAt ? Math.max(0, pick.wakeAt - now) : 0;
        const maxWait = wakeTarget > 0 ? Math.min(wakeTarget, 1000) : 1000;
        let waited = 0;
        const waitStep = 100;
        while (waited < maxWait && !this.isAbortRequested()) {
          await this.sleep(Math.min(waitStep, maxWait - waited));
          waited += waitStep;
          if (this.getQueueSize() > 0 || this.isPaused()) {
            break;
          }
        }
        if (this.isAbortRequested()) {
          signalExit('abort-requested', { phase: 'wait-check' });
          return;
        }
        if (this.getQueueSize() === 0 && !this.isPaused()) {
          const latestStats = this.getStats ? this.getStats() : stats;
          signalExit('queue-exhausted', {
            downloads: latestStats && typeof latestStats.pagesDownloaded === 'number' ? latestStats.pagesDownloaded : null,
            visited: latestStats && typeof latestStats.pagesVisited === 'number' ? latestStats.pagesVisited : null
          });
          return;
        }
        continue;
      }

      const item = pick.item;
      const extraCtx = pick.context || {};

      try {
        const host = this.safeHostFromUrl(item.url);
        const sizeNow = this.getQueueSize();
        this.telemetry?.queueEvent({
          action: 'dequeued',
          url: item.url,
          depth: item.depth,
          host,
          queueSize: sizeNow
        });
      } catch (_) {}

      this.onBusyChange(1);

      const processContext = {
        type: item.type,
        allowRevisit: item.allowRevisit
      };

      if (extraCtx) {
        if (extraCtx.processCacheResult) {
          processContext.processCacheResult = true;
        }
        if (extraCtx.forceCache) {
          processContext.forceCache = true;
        }
        if (extraCtx.cachedPage) {
          processContext.cachedPage = extraCtx.cachedPage;
        }
        if (extraCtx.rateLimitedHost) {
          processContext.rateLimitedHost = extraCtx.rateLimitedHost;
        }
        if (typeof extraCtx.fetchPolicy === 'string' && extraCtx.fetchPolicy) {
          processContext.fetchPolicy = extraCtx.fetchPolicy;
        }
        if (typeof extraCtx.maxCacheAgeMs === 'number' && Number.isFinite(extraCtx.maxCacheAgeMs) && extraCtx.maxCacheAgeMs >= 0) {
          processContext.maxCacheAgeMs = extraCtx.maxCacheAgeMs;
        }
        if (typeof extraCtx.fallbackToCache === 'boolean') {
          processContext.fallbackToCache = extraCtx.fallbackToCache;
        }
        if (extraCtx.cachedFallback) {
          processContext.cachedFallback = extraCtx.cachedFallback;
        }
        if (extraCtx.cachedFallbackMeta) {
          processContext.cachedFallbackMeta = extraCtx.cachedFallbackMeta;
        }
        if (extraCtx.cachedHost) {
          processContext.cachedHost = extraCtx.cachedHost;
        }
      }

      const result = await this.processPage(item.url, item.depth, processContext);
      if (this.isAbortRequested()) {
        this.onBusyChange(-1);
        return;
      }

      this.onBusyChange(-1);

      if (result && result.status === 'failed') {
        const currentRetries = typeof item.retries === 'number' ? item.retries : 0;
        const retriable = !!result.retriable && currentRetries < this.retryLimit;
        if (retriable) {
          item.retries = currentRetries + 1;
          const baseDelay = result.retryAfterMs != null ? result.retryAfterMs : Math.min(this.backoffBaseMs * Math.pow(2, item.retries - 1), this.backoffMaxMs);
          item.nextEligibleAt = this.nowMs() + this.jitter(baseDelay);
          item.priority = this.computePriority({
            type: item.type,
            depth: item.depth,
            discoveredAt: item.discoveredAt,
            bias: item.priorityBias || 0
          });
          this.queue.reschedule(item);
          try {
            const host = (() => {
              try {
                return new URL(item.url).hostname;
              } catch (_) {
                return null;
              }
            })();
            const sizeNow = this.getQueueSize();
            this.telemetry?.queueEvent({
              action: 'retry',
              url: item.url,
              depth: item.depth,
              host,
              reason: 'retriable-error',
              queueSize: sizeNow
            });
          } catch (_) {}
        }
      }
    }
  }

}

module.exports = {
  WorkerRunner
};
