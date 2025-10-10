"use strict";

function nowMs() { return Date.now(); }

class MinHeap {
  constructor(compare) { this.data = []; this.compare = compare; }
  size() { return this.data.length; }
  push(item) { this.data.push(item); this._siftUp(this.data.length - 1); }
  pop() {
    const count = this.data.length;
    if (!count) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (count > 1) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }
  _siftUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) < 0) {
        [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
        index = parent;
      } else {
        break;
      }
    }
  }
  _siftDown(index) {
    const size = this.data.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;
      if (left < size && this.compare(this.data[left], this.data[smallest]) < 0) smallest = left;
      if (right < size && this.compare(this.data[right], this.data[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}

class QueueManager {
  constructor(opts = {}) {
    this.usePriorityQueue = opts.usePriorityQueue !== false;
    this.maxQueue = typeof opts.maxQueue === 'number' ? opts.maxQueue : 10000;
  this.maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 10;
  this.shouldBypassDepth = typeof opts.shouldBypassDepth === 'function' ? opts.shouldBypassDepth : null;

    this.urlEligibilityService = opts.urlEligibilityService;
    this.safeHostFromUrl = opts.safeHostFromUrl || (() => null);
    this.cache = opts.cache || { get: async () => null };
    this.getHostResumeTime = opts.getHostResumeTime || (() => null);
    this.isHostRateLimited = opts.isHostRateLimited || (() => false);
    this.emitQueueEvent = opts.emitQueueEvent || (() => {});
    this.emitEnhancedQueueEvent = opts.emitEnhancedQueueEvent || (() => {});
    this.computeEnhancedPriority = opts.computeEnhancedPriority || (() => ({ priority: 0, prioritySource: 'base' }));
    this.jobIdProvider = opts.jobIdProvider || (() => null);
    this.onRateLimitDeferred = typeof opts.onRateLimitDeferred === 'function' ? opts.onRateLimitDeferred : null;

    this.discoveryQueueType = 'discovery';
    this.acquisitionQueueType = 'acquisition';

    if (this.usePriorityQueue) {
      this.priorityQueues = {
        [this.discoveryQueueType]: new MinHeap((a, b) => a.priority - b.priority),
        [this.acquisitionQueueType]: new MinHeap((a, b) => a.priority - b.priority)
      };
      this.fifoQueues = null;
    } else {
      this.priorityQueues = null;
      this.fifoQueues = {
        [this.discoveryQueueType]: [],
        [this.acquisitionQueueType]: []
      };
    }

    this.queuedUrls = new Set();
    this._heatmapState = this._createEmptyHeatmapState();
    this._lastServedQueueType = null;
    this._streaks = {
      [this.discoveryQueueType]: 0,
      [this.acquisitionQueueType]: 0
    };
    this._burstLimit = typeof opts.burstLimit === 'number' && opts.burstLimit > 0 ? Math.floor(opts.burstLimit) : 5;
  }

  size() {
    if (this.usePriorityQueue) {
      return this.priorityQueues[this.discoveryQueueType].size() + this.priorityQueues[this.acquisitionQueueType].size();
    }
    return this.fifoQueues[this.discoveryQueueType].length + this.fifoQueues[this.acquisitionQueueType].length;
  }

  enqueue({ url, depth, type, meta }) {
    const currentSize = this.size();
    if (!this.urlEligibilityService || typeof this.urlEligibilityService.evaluate !== 'function') {
      throw new Error('QueueManager requires a urlEligibilityService with an evaluate method');
    }

    const evaluation = this.urlEligibilityService.evaluate({
      url,
      depth,
      type,
      queueSize: currentSize,
      isDuplicate: (queueKey) => queueKey && this.queuedUrls.has(queueKey)
    }) || null;

    if (!evaluation || evaluation.status !== 'allow') {
      if (evaluation && evaluation.handled) return false;
      const normalizedDrop = (evaluation && evaluation.normalized) || url;
      const hostDrop = (evaluation && evaluation.host) || this.safeHostFromUrl(normalizedDrop);
      this.emitQueueEvent({
        action: 'drop',
        url: normalizedDrop,
        depth,
        host: hostDrop,
        reason: (evaluation && evaluation.reason) || 'policy-blocked',
        queueSize: currentSize
      });
      return false;
    }

    const normalized = evaluation.normalized || url;
    const host = evaluation.host || this.safeHostFromUrl(normalized);
    const queueKey = evaluation.queueKey;
    const kind = evaluation.kind || type || 'hub';
    const evaluationMeta = evaluation.meta || meta || null;
    const decision = evaluation.decision;
    const allowRevisit = evaluation.allowRevisit;

    const bypassDepthLimit = this.shouldBypassDepth ? this.shouldBypassDepth({
      url: normalized,
      rawUrl: url,
      depth,
      host,
      kind,
      meta: evaluationMeta,
      decision,
      queueKey
    }) : false;

    if (!bypassDepthLimit && depth > this.maxDepth) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'max-depth', queueSize: currentSize });
      return false;
    }
    if (bypassDepthLimit && depth > this.maxDepth) {
      this.emitQueueEvent({
        action: 'depth-bypass',
        url: normalized,
        depth,
        host,
        queueSize: currentSize,
        reason: 'max-depth-bypassed'
      });
    }
    if (currentSize >= this.maxQueue) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'overflow', queueSize: currentSize });
      return false;
    }

    const heatmapInfo = this._classifyHeatmap({ depth, kind, meta: evaluationMeta, decision });
    const priorityBias = evaluationMeta && typeof evaluationMeta.priorityBias === 'number' ? evaluationMeta.priorityBias : 0;
    const discoveredAt = nowMs();
    const priorityResult = this.computeEnhancedPriority({
      type: kind,
      depth,
      discoveredAt,
      bias: priorityBias,
      url: normalized,
      meta: evaluationMeta
    }) || { priority: 0, prioritySource: 'base' };

    const item = {
      url: normalized,
      depth,
      type: kind,
      discoveredAt,
      decision,
      allowRevisit,
      queueKey,
      priorityBias,
      priority: typeof priorityResult.priority === 'number' ? priorityResult.priority : 0,
      priorityMetadata: priorityResult.prioritySource && priorityResult.prioritySource !== 'base'
        ? {
            source: priorityResult.prioritySource,
            bonusApplied: priorityResult.bonusApplied,
            clusterId: priorityResult.clusterId,
            gapPredictionScore: priorityResult.gapPredictionScore
          }
        : undefined,
      _heatmapInfo: heatmapInfo
    };

    const queueType = this._determineQueueType(item);
    item.queueType = queueType;
    this._pushItem(item, queueType);
    if (queueKey) this.queuedUrls.add(queueKey);
    if (heatmapInfo) this._applyHeatmapDelta(heatmapInfo, 1);

    const eventPayload = {
      action: 'enqueued',
      url: normalized,
      depth,
      host,
      queueSize: this.size(),
      jobId: this.jobIdProvider(),
      priorityScore: item.priority,
      prioritySource: priorityResult.prioritySource || 'base'
    };
    if (priorityResult.prioritySource && priorityResult.prioritySource !== 'base') {
      eventPayload.bonusApplied = priorityResult.bonusApplied;
      eventPayload.clusterId = priorityResult.clusterId;
      eventPayload.gapPredictionScore = priorityResult.gapPredictionScore;
    }
    if (heatmapInfo) {
      eventPayload.queueOrigin = heatmapInfo.origin;
      eventPayload.queueRole = heatmapInfo.role;
      eventPayload.queueDepthBucket = heatmapInfo.depthBucket;
    }
    this.emitEnhancedQueueEvent(eventPayload);
    return true;
  }

  async pullNext() {
    const now = nowMs();
    let bestWakeAt = null;
    const queueOrder = this._chooseQueueOrder();

    for (const queueType of queueOrder) {
      const result = await this._pullFromQueueType(queueType, now);
      if (!result) continue;

      const { item, deferred, context, wakeAt } = result;
      if (Array.isArray(deferred) && deferred.length) {
        for (const deferredItem of deferred) {
          this._pushItem(deferredItem, queueType);
        }
      }
      if (wakeAt != null) {
        bestWakeAt = bestWakeAt == null ? wakeAt : Math.min(bestWakeAt, wakeAt);
      }
      if (!item) continue;

      this._releaseQueueKey(item);
      if (item._heatmapInfo) this._applyHeatmapDelta(item._heatmapInfo, -1);
      this._noteQueueServed(queueType);
      return { item, context: context || null, wakeAt: bestWakeAt };
    }

    if (bestWakeAt != null) return { wakeAt: bestWakeAt };
    return null;
  }

  reschedule(item) {
    if (!item) return;
    const queueType = item.queueType || this._determineQueueType(item);
    this._pushItem(item, queueType);
    if (item.queueKey) this.queuedUrls.add(item.queueKey);
    if (item._heatmapInfo) this._applyHeatmapDelta(item._heatmapInfo, 1);
  }

  peek() {
    const queueOrder = this._chooseQueueOrder();
    for (const queueType of queueOrder) {
      const candidate = this._peekFromQueueType(queueType);
      if (candidate) return candidate;
    }
    return null;
  }

  clear() {
    if (this.usePriorityQueue && this.priorityQueues) {
      this.priorityQueues[this.discoveryQueueType].data.length = 0;
      this.priorityQueues[this.acquisitionQueueType].data.length = 0;
    }
    if (!this.usePriorityQueue && this.fifoQueues) {
      this.fifoQueues[this.discoveryQueueType].length = 0;
      this.fifoQueues[this.acquisitionQueueType].length = 0;
    }
    this.queuedUrls.clear();
    this._heatmapState = this._createEmptyHeatmapState();
    this._lastServedQueueType = null;
    this._streaks[this.discoveryQueueType] = 0;
    this._streaks[this.acquisitionQueueType] = 0;
  }

  _determineQueueType(item) {
    const kind = item && (item.type || (item.decision && item.decision.kind));
    if (kind === 'article' || kind === 'refresh' || kind === 'history') return this.acquisitionQueueType;
    return this.discoveryQueueType;
  }

  _pushItem(item, queueType) {
    item.queueType = queueType;
    if (this.usePriorityQueue) this.priorityQueues[queueType].push(item);
    else this.fifoQueues[queueType].push(item);
  }

  _queueLength(queueType) {
    if (this.usePriorityQueue) return this.priorityQueues[queueType].size();
    return this.fifoQueues[queueType].length;
  }

  _peekFromQueueType(queueType) {
    if (this.usePriorityQueue) {
      const queue = this.priorityQueues?.[queueType];
      return queue && queue.data.length ? queue.data[0] : null;
    }
    const queue = this.fifoQueues?.[queueType];
    return queue && queue.length ? queue[0] : null;
  }

  _releaseQueueKey(item) {
    const key = item.queueKey;
    if (key) this.queuedUrls.delete(key);
  }

  _chooseQueueOrder() {
    const hasDiscovery = this._queueLength(this.discoveryQueueType) > 0;
    const hasAcquisition = this._queueLength(this.acquisitionQueueType) > 0;

    if (hasDiscovery && !hasAcquisition) return [this.discoveryQueueType];
    if (!hasDiscovery && hasAcquisition) return [this.acquisitionQueueType];
    if (!hasDiscovery && !hasAcquisition) return [this.discoveryQueueType, this.acquisitionQueueType];

    const last = this._lastServedQueueType;
    if (!last) return [this.discoveryQueueType, this.acquisitionQueueType];

    if (this._streaks[last] >= this._burstLimit) {
      return [this._oppositeQueue(last), last];
    }

    return last === this.discoveryQueueType
      ? [this.acquisitionQueueType, this.discoveryQueueType]
      : [this.discoveryQueueType, this.acquisitionQueueType];
  }

  _oppositeQueue(queueType) {
    return queueType === this.discoveryQueueType ? this.acquisitionQueueType : this.discoveryQueueType;
  }

  _noteQueueServed(queueType) {
    if (queueType !== this.discoveryQueueType && queueType !== this.acquisitionQueueType) return;
    if (this._lastServedQueueType === queueType) {
      this._streaks[queueType] += 1;
    } else {
      this._lastServedQueueType = queueType;
      this._streaks[queueType] = 1;
      this._streaks[this._oppositeQueue(queueType)] = 0;
    }
  }

  async _pullFromQueueType(queueType, now) {
    if (this._queueLength(queueType) === 0) return null;

    if (this.usePriorityQueue) {
      const queue = this.priorityQueues[queueType];
      const deferred = [];
      let candidate = null;
      let context = null;
      let minWake = Infinity;
      const scanLimit = Math.min(64, queue.size() + 1);

      for (let i = 0; i < scanLimit; i += 1) {
        const item = queue.pop();
        if (!item) break;

        const host = this.safeHostFromUrl(item.url);
        const resumeAt = this.getHostResumeTime(host);
        let earliest = item.nextEligibleAt || 0;
        if (resumeAt) earliest = Math.max(earliest, resumeAt);

        if (this.isHostRateLimited(host)) {
          const cached = await this.cache.get(item.url);
          if (cached) {
            context = { forceCache: true, cachedPage: cached, rateLimitedHost: host };
            candidate = item;
            break;
          }
          if (this.onRateLimitDeferred) {
            try { this.onRateLimitDeferred(item, { host }); } catch (_) {}
          }
          const wakeTime = earliest > now ? earliest : now + 1000;
          item.nextEligibleAt = wakeTime;
          minWake = Math.min(minWake, wakeTime);
          deferred.push(item);
          continue;
        }

        if (earliest > now) {
          item.nextEligibleAt = earliest;
          minWake = Math.min(minWake, earliest);
          deferred.push(item);
          continue;
        }

        candidate = item;
        break;
      }

      return {
        item: candidate,
        context,
        deferred,
        wakeAt: minWake < Infinity ? minWake : null
      };
    }

    const queue = this.fifoQueues[queueType];
    const deferred = [];
    let candidate = null;
    let context = null;
    let minWake = Infinity;
    const scanLimit = Math.min(64, queue.length);

    for (let i = 0; i < scanLimit; i += 1) {
      const item = queue.shift();
      if (!item) break;

      const host = this.safeHostFromUrl(item.url);
      const resumeAt = this.getHostResumeTime(host);
      let earliest = item.deferredUntil || 0;
      if (resumeAt) earliest = Math.max(earliest, resumeAt);

      if (this.isHostRateLimited(host)) {
        const cached = await this.cache.get(item.url);
        if (cached) {
          context = { forceCache: true, cachedPage: cached, rateLimitedHost: host };
          candidate = item;
          break;
        }
        if (this.onRateLimitDeferred) {
          try { this.onRateLimitDeferred(item, { host }); } catch (_) {}
        }
        const wakeTime = earliest > now ? earliest : now + 1000;
        item.deferredUntil = wakeTime;
        minWake = Math.min(minWake, wakeTime);
        deferred.push(item);
        continue;
      }

      if (earliest > now) {
        item.deferredUntil = earliest;
        minWake = Math.min(minWake, earliest);
        const cached = await this.cache.get(item.url);
        if (cached) {
          delete item.deferredUntil;
          context = { forceCache: true, cachedPage: cached, rateLimitedHost: host };
          candidate = item;
          break;
        }
        deferred.push(item);
        continue;
      }

      delete item.deferredUntil;
      candidate = item;
      break;
    }

    return {
      item: candidate,
      context,
      deferred,
      wakeAt: minWake < Infinity ? minWake : null
    };
  }

  getHeatmapSnapshot() {
    if (!this._heatmapState) return null;
    return {
      total: this._heatmapState.total,
      cells: JSON.parse(JSON.stringify(this._heatmapState.cells || {})),
      depthBuckets: { ...this._heatmapState.depthBuckets },
      lastUpdatedAt: this._heatmapState.lastUpdatedAt
    };
  }

  _createEmptyHeatmapState() {
    return {
      total: 0,
      cells: {},
      depthBuckets: { '0': 0, '1': 0, '2': 0, '3+': 0, unknown: 0 },
      lastUpdatedAt: nowMs()
    };
  }

  _classifyHeatmap({ depth, kind, meta, decision }) {
    if (kind == null && !meta && !decision) return null;
    const origin = (meta && meta.origin) || (decision && decision.origin) || 'opportunistic';
    const role = (meta && meta.role)
      || (kind === 'article' ? 'article' : (kind === 'hub' || kind === 'index' ? 'hub' : 'other'));
    const depthBucket = (meta && meta.depthBucket) || this._bucketDepth(depth);
    return { origin, role, depthBucket };
  }

  _bucketDepth(depth) {
    if (typeof depth !== 'number' || Number.isNaN(depth)) return 'unknown';
    if (depth <= 0) return '0';
    if (depth === 1) return '1';
    if (depth === 2) return '2';
    if (depth >= 3) return '3+';
    return 'unknown';
  }

  _applyHeatmapDelta(info, delta) {
    if (!info || !delta || !this._heatmapState) return;
    const origin = info.origin || 'opportunistic';
    const role = info.role === 'article' || info.role === 'hub' ? info.role : 'other';
    const depthBucket = info.depthBucket || 'unknown';

    if (!this._heatmapState.cells[origin]) {
      this._heatmapState.cells[origin] = { article: 0, hub: 0, other: 0 };
    }
    const cell = this._heatmapState.cells[origin];
    cell[role] = Math.max(0, (cell[role] || 0) + delta);

    if (!Object.prototype.hasOwnProperty.call(this._heatmapState.depthBuckets, depthBucket)) {
      this._heatmapState.depthBuckets[depthBucket] = 0;
    }
    this._heatmapState.depthBuckets[depthBucket] = Math.max(0, (this._heatmapState.depthBuckets[depthBucket] || 0) + delta);

    this._heatmapState.total = Math.max(0, (this._heatmapState.total || 0) + delta);
    this._heatmapState.lastUpdatedAt = nowMs();
  }
}

module.exports = QueueManager;
module.exports.MinHeap = MinHeap;
