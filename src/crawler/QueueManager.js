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
  this.urlEligibilityService = options.urlEligibilityService;
    this.safeHostFromUrl = options.safeHostFromUrl;
    this.emitQueueEvent = options.emitQueueEvent;
    this.emitEnhancedQueueEvent = options.emitEnhancedQueueEvent;
    this.computeEnhancedPriority = options.computeEnhancedPriority;
  this.computePriority = options.computePriority;
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
    this._heatmapState = this._createEmptyHeatmapState();
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
    const meta = type && typeof type === 'object' ? type : null;

    if (!this.urlEligibilityService || typeof this.urlEligibilityService.evaluate !== 'function') {
      throw new Error('QueueManager requires a urlEligibilityService with an evaluate method');
    }

    const evaluation = this.urlEligibilityService.evaluate({
      url,
      depth,
      type,
      queueSize: currentSize,
      isDuplicate: (queueKey) => this.queuedUrls.has(queueKey)
    });

    if (!evaluation || evaluation.status !== 'allow') {
      if (evaluation?.handled) {
        return false;
      }
      const normalizedDrop = evaluation?.normalized || url;
      const hostDrop = evaluation?.host || this.safeHostFromUrl(normalizedDrop);
      this.emitQueueEvent({
        action: 'drop',
        url: normalizedDrop,
        depth,
        host: hostDrop,
        reason: evaluation?.reason || 'policy-blocked',
        queueSize: currentSize
      });
      return false;
    }

    const { normalized, host, decision, kind, allowRevisit, queueKey } = evaluation;
    const heatmapInfo = this._classifyHeatmap({
      depth,
      kind,
      meta: evaluation?.meta || meta,
      decision
    });
    let reason = evaluation.reason;
    if (!reason && meta?.reason) {
      reason = meta.reason;
    }

    if (depth > this.maxDepth) {
      this.emitQueueEvent({
        action: 'drop',
        url: normalized,
        depth,
        host,
        reason: 'max-depth',
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
      priorityBias,
      _heatmapInfo: heatmapInfo
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

    if (heatmapInfo) {
      queueEventData.queueOrigin = heatmapInfo.origin;
      queueEventData.queueRole = heatmapInfo.role;
      queueEventData.queueDepthBucket = heatmapInfo.depthBucket;
    }

    this.emitEnhancedQueueEvent(queueEventData);
    if (heatmapInfo) {
      this._applyHeatmapDelta(heatmapInfo, 1);
    }
    return true;
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
        if (candidate._heatmapInfo) {
          this._applyHeatmapDelta(candidate._heatmapInfo, -1);
        }
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
        if (candidate._heatmapInfo) {
          this._applyHeatmapDelta(candidate._heatmapInfo, -1);
        }
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
    if (item && item._heatmapInfo) {
      this._applyHeatmapDelta(item._heatmapInfo, 1);
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
    this._heatmapState = this._createEmptyHeatmapState();
  }

  getHeatmapSnapshot() {
    if (!this._heatmapState) {
      return null;
    }
    const cells = {};
    const entries = Object.entries(this._heatmapState.cells || {});
    for (const [origin, roles] of entries) {
      cells[origin] = { ...roles };
    }
    return {
      total: this._heatmapState.total,
      cells,
      depthBuckets: { ...this._heatmapState.depthBuckets },
      lastUpdatedAt: this._heatmapState.lastUpdatedAt
    };
  }

  _createEmptyHeatmapState() {
    return {
      total: 0,
      cells: {
        planner: { article: 0, hub: 0, other: 0 },
        opportunistic: { article: 0, hub: 0, other: 0 }
      },
      depthBuckets: {
        '0': 0,
        '1': 0,
        '2': 0,
        '3+': 0,
        unknown: 0
      },
      lastUpdatedAt: Date.now()
    };
  }

  _classifyHeatmap({ depth, kind, meta, decision }) {
    try {
      const role = this._mapHeatmapRole(kind, meta);
      const origin = this._mapHeatmapOrigin(kind, meta, decision);
      const depthBucket = this._mapHeatmapDepth(depth);
      return { origin, role, depthBucket };
    } catch (_) {
      return null;
    }
  }

  _mapHeatmapRole(kind, meta) {
    const normalizedKind = typeof kind === 'string' ? kind.toLowerCase() : '';
    if (normalizedKind === 'article' || normalizedKind === 'refresh') {
      return 'article';
    }
    if (normalizedKind === 'hub-seed' || normalizedKind === 'nav' || normalizedKind === 'history') {
      return 'hub';
    }
    if (meta?.hubKind || meta?.kind === 'country' || meta?.kind === 'section') {
      return 'hub';
    }
    return 'other';
  }

  _mapHeatmapOrigin(kind, meta, decision) {
    const hints = [];
    if (meta) {
      if (meta.source) hints.push(meta.source);
      if (meta.reason) hints.push(meta.reason);
      if (meta.origin) hints.push(meta.origin);
      if (meta.strategy) hints.push(meta.strategy);
    }
    if (decision?.classification) {
      hints.push(decision.classification);
    }
    if (decision?.reason) {
      hints.push(decision.reason);
    }
    const kindHint = typeof kind === 'string' ? kind : '';
    if (kindHint) hints.push(kindHint);
    const joined = hints.join(' ').toLowerCase();
    const plannerSignals = ['planner', 'seed', 'pattern', 'country', 'section', 'history', 'adaptive'];
    const isPlanner = plannerSignals.some((signal) => joined.includes(signal));
    return isPlanner ? 'planner' : 'opportunistic';
  }

  _mapHeatmapDepth(depth) {
    if (typeof depth !== 'number' || !Number.isFinite(depth)) {
      return 'unknown';
    }
    if (depth <= 0) return '0';
    if (depth === 1) return '1';
    if (depth === 2) return '2';
    return '3+';
  }

  _applyHeatmapDelta(info, delta) {
    if (!info || !delta) {
      return;
    }
    const state = this._heatmapState;
    if (!state) return;
    const origin = info.origin || 'opportunistic';
    const role = info.role || 'other';
    const depthBucket = info.depthBucket || 'unknown';
    const originBucket = state.cells[origin] || (state.cells[origin] = { article: 0, hub: 0, other: 0 });
    originBucket[role] = Math.max(0, (originBucket[role] || 0) + delta);
    state.total = Math.max(0, (state.total || 0) + delta);
    if (!Object.prototype.hasOwnProperty.call(state.depthBuckets, depthBucket)) {
      state.depthBuckets[depthBucket] = 0;
    }
    state.depthBuckets[depthBucket] = Math.max(0, (state.depthBuckets[depthBucket] || 0) + delta);
    state.lastUpdatedAt = Date.now();
  }
}

module.exports = QueueManager;
module.exports.MinHeap = MinHeap;
