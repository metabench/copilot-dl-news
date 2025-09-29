'use strict';

function nowMs() {
  return Date.now();
}

class MinHeap {
  constructor(compare) {
    this.data = [];
    this.compare = compare;
  }

  size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(item) {
    this.data.push(item);
    this._siftUp(this.data.length - 1);
  }

  pop() {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (n > 1) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  _siftUp(index) {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  _siftDown(index) {
    const n = this.data.length;
    let i = index;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.compare(this.data[left], this.data[smallest]) < 0) smallest = left;
      if (right < n && this.compare(this.data[right], this.data[smallest]) < 0) smallest = right;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

class QueueManager {
  constructor(options) {
    this.usePriorityQueue = options.usePriorityQueue !== false;
    this.maxQueue = options.maxQueue;
    this.maxDepth = options.maxDepth;
    this.stats = options.stats;
    this.visited = options.visited;
    this.knownArticlesCache = options.knownArticlesCache;
    this.getUrlDecision = options.getUrlDecision;
    this.handlePolicySkip = options.handlePolicySkip;
    this.isOnDomain = options.isOnDomain;
    this.isAllowed = options.isAllowed;
    this.looksLikeArticle = options.looksLikeArticle;
    this.safeHostFromUrl = options.safeHostFromUrl;
    this.emitQueueEvent = options.emitQueueEvent;
    this.emitEnhancedQueueEvent = options.emitEnhancedQueueEvent;
    this.computeEnhancedPriority = options.computeEnhancedPriority;
    this.computePriority = options.computePriority;
    this.getDbAdapter = options.getDbAdapter;
    this.cache = options.cache;
    this.getHostResumeTime = options.getHostResumeTime;
    this.isHostRateLimited = options.isHostRateLimited;
    this.jobIdProvider = options.jobIdProvider || (() => null);

    if (this.usePriorityQueue) {
      this.queueHeap = new MinHeap((a, b) => a.priority - b.priority);
      this.requestQueue = null;
    } else {
      this.queueHeap = null;
      this.requestQueue = [];
    }

    this.queuedUrls = new Set();
  }

  size() {
    return this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length;
  }

  peek() {
    if (this.usePriorityQueue) {
      return this.queueHeap.peek();
    }
    return this.requestQueue[0];
  }

  enqueue({ url, depth, type }) {
    const currentSize = this.size();
    const decision = this.getUrlDecision(url, {
      phase: 'enqueue',
      depth
    });
    const analysis = decision?.analysis || {};
    const normalized = analysis && !analysis.invalid ? analysis.normalized : null;
    let host = null;
    try {
      if (normalized) host = new URL(normalized).hostname;
    } catch (_) {}

    if (!decision.allow) {
      if (decision.reason === 'query-superfluous') {
        this.handlePolicySkip(decision, {
          depth,
          queueSize: currentSize
        });
      } else {
        this.emitQueueEvent({
          action: 'drop',
          url: normalized || url,
          depth,
          host,
          reason: decision.reason || 'policy-blocked',
          queueSize: currentSize
        });
      }
      return false;
    }

    if (depth > this.maxDepth) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized || url,
        depth,
        host,
        reason: 'max-depth',
        queueSize: currentSize
      });
      return false;
    }

    if (!normalized) {
      this.emitQueueEvent({
        action: 'drop',
        url,
        depth,
        host: null,
        reason: 'bad-url',
        queueSize: currentSize
      });
      return false;
    }

    if (!this.isOnDomain(normalized)) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'off-domain',
        queueSize: currentSize
      });
      return false;
    }

    if (!this.isAllowed(normalized)) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'robots-disallow',
        queueSize: currentSize
      });
      return false;
    }

    const meta = type && typeof type === 'object' ? type : null;
    let kind = meta ? (meta.kind || meta.type || meta.intent) : type;
    const inferredType = this.looksLikeArticle(normalized) ? 'article' : 'nav';
    if (!kind) {
      kind = inferredType;
    }
    let reason = meta?.reason;
    let allowRevisit = !!meta?.allowRevisit;

    if (!allowRevisit && this.visited.has(normalized)) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'visited',
        queueSize: currentSize
      });
      return false;
    }

    if (kind === 'article' && this._checkKnownArticle(normalized)) {
      kind = 'refresh';
      if (!reason) reason = 'known-article';
    }

    const isRefreshLike = allowRevisit || kind === 'refresh';
    const queueKey = isRefreshLike ? `${kind}:${normalized}` : normalized;

    if (this.queuedUrls.has(queueKey)) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'duplicate',
        queueSize: currentSize
      });
      return false;
    }

    if (this.size() >= this.maxQueue) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'overflow',
        queueSize: currentSize
      });
      return false;
    }

    const discoveredAt = nowMs();
    const priorityBias = typeof meta?.priorityBias === 'number' ? meta.priorityBias : 0;
    const item = {
      url: normalized,
      depth,
      type: kind,
      retries: 0,
      nextEligibleAt: 0,
      discoveredAt,
      decision,
      allowRevisit,
      queueKey,
      priorityBias
    };

    const priorityResult = this.computeEnhancedPriority({
      type: item.type,
      depth: item.depth,
      discoveredAt,
      bias: priorityBias,
      url: normalized,
      meta
    });

    item.priority = priorityResult.priority;
    if (priorityResult.prioritySource !== 'base') {
      item.priorityMetadata = {
        source: priorityResult.prioritySource,
        bonusApplied: priorityResult.bonusApplied,
        clusterId: priorityResult.clusterId,
        gapPredictionScore: priorityResult.gapPredictionScore
      };
    }

    if (this.usePriorityQueue) {
      this.queueHeap.push(item);
    } else {
      this.requestQueue.push(item);
    }
    this.queuedUrls.add(queueKey);

    const queueEventData = {
      action: 'enqueued',
      url: normalized,
      depth,
      host,
      queueSize: this.size(),
      reason,
      jobId: this.jobIdProvider()
    };

    if (priorityResult.prioritySource !== 'base') {
      queueEventData.priorityScore = priorityResult.priority;
      queueEventData.prioritySource = priorityResult.prioritySource;
      queueEventData.bonusApplied = priorityResult.bonusApplied;
      queueEventData.clusterId = priorityResult.clusterId;
      queueEventData.gapPredictionScore = priorityResult.gapPredictionScore;
    }

    this.emitEnhancedQueueEvent(queueEventData);
    return true;
  }

  _checkKnownArticle(normalized) {
    if (!normalized) return false;
    if (this.knownArticlesCache.has(normalized)) {
      return !!this.knownArticlesCache.get(normalized);
    }

    let isKnown = false;
    const adapter = typeof this.getDbAdapter === 'function' ? this.getDbAdapter() : null;
    if (adapter && adapter.isEnabled && adapter.isEnabled()) {
      try {
        const row = (adapter.getArticleRowByUrl?.(normalized)) || (adapter.getArticleByUrlOrCanonical?.(normalized));
        isKnown = !!row;
      } catch (_) {
        isKnown = false;
      }
    }

    this.knownArticlesCache.set(normalized, isKnown);
    return isKnown;
  }

  _releaseQueueKey(item) {
    const key = item.queueKey || item.url;
    if (key) {
      this.queuedUrls.delete(key);
    }
  }

  async pullNext() {
    const now = nowMs();
    let minWake = Infinity;

    if (this.usePriorityQueue) {
      const deferred = [];
      let candidate = null;
      let context = null;
      const maxScans = Math.min(64, this.queueHeap.size() + 1);
      for (let i = 0; i < maxScans; i++) {
        const item = this.queueHeap.pop();
        if (!item) break;
        const host = this.safeHostFromUrl(item.url);
        const resumeAt = this.getHostResumeTime(host);
        let earliest = item.nextEligibleAt || 0;
        if (resumeAt) earliest = Math.max(earliest, resumeAt);
        if (earliest > now) {
          item.nextEligibleAt = earliest;
          minWake = Math.min(minWake, earliest);
          deferred.push(item);
          continue;
        }

        if (this.isHostRateLimited(host)) {
          const cached = await this.cache.get(item.url);
          if (cached) {
            context = {
              forceCache: true,
              cachedPage: cached,
              rateLimitedHost: host
            };
            candidate = item;
            break;
          }
          const nextResume = this.getHostResumeTime(host);
          if (nextResume && nextResume > now) {
            item.nextEligibleAt = nextResume;
            minWake = Math.min(minWake, nextResume);
            this.stats.cacheRateLimitedDeferred = (this.stats.cacheRateLimitedDeferred || 0) + 1;
            deferred.push(item);
            continue;
          }
        }

        candidate = item;
        break;
      }
      for (const d of deferred) {
        this.queueHeap.push(d);
      }
      if (candidate) {
        this._releaseQueueKey(candidate);
        return {
          item: candidate,
          context,
          wakeAt: minWake < Infinity ? minWake : null
        };
      }
    } else {
      const deferred = [];
      let candidate = null;
      let context = null;
      const limit = Math.min(64, this.requestQueue.length);
      for (let i = 0; i < limit; i++) {
        const item = this.requestQueue.shift();
        if (!item) break;
        const host = this.safeHostFromUrl(item.url);
        const resumeAt = this.getHostResumeTime(host);
        let earliest = item.deferredUntil || 0;
        if (resumeAt) earliest = Math.max(earliest, resumeAt);
        if (earliest > now) {
          item.deferredUntil = earliest;
          minWake = Math.min(minWake, earliest);
          const cached = await this.cache.get(item.url);
          if (cached) {
            delete item.deferredUntil;
            context = {
              forceCache: true,
              cachedPage: cached,
              rateLimitedHost: host
            };
            candidate = item;
            break;
          }
          this.stats.cacheRateLimitedDeferred = (this.stats.cacheRateLimitedDeferred || 0) + 1;
          deferred.push(item);
          continue;
        }

        delete item.deferredUntil;
        candidate = item;
        break;
      }
      for (const d of deferred) {
        this.requestQueue.push(d);
      }
      if (candidate) {
        this._releaseQueueKey(candidate);
        return {
          item: candidate,
          context,
          wakeAt: minWake < Infinity ? minWake : null
        };
      }
    }

    if (minWake < Infinity) {
      return {
        wakeAt: minWake
      };
    }
    return null;
  }

  reschedule(item) {
    const key = item.queueKey || item.url;
    if (key) {
      this.queuedUrls.add(key);
    }
    if (this.usePriorityQueue) {
      this.queueHeap.push(item);
    } else {
      this.requestQueue.push(item);
    }
  }

  clear() {
    if (this.usePriorityQueue && this.queueHeap && Array.isArray(this.queueHeap.data)) {
      this.queueHeap.data.length = 0;
    }
    if (!this.usePriorityQueue && Array.isArray(this.requestQueue)) {
      this.requestQueue.length = 0;
    }
    if (this.queuedUrls && typeof this.queuedUrls.clear === 'function') {
      this.queuedUrls.clear();
    }
  }
}

module.exports = QueueManager;
module.exports.MinHeap = MinHeap;
