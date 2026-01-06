# Chapter 3: Priority Queue System

## Overview

The Priority Queue System manages URL ordering for crawling using a min-heap data structure with configurable scoring. Lower priority values are processed first.

## Key Files

- [src/crawler/QueueManager.js](../../../src/crawler/QueueManager.js) (812 lines)
- [src/crawler/PriorityScorer.js](../../../src/crawler/PriorityScorer.js) (610 lines)
- [src/crawler/PriorityCalculator.js](../../../src/crawler/PriorityCalculator.js) (48 lines)
- [src/config/ConfigManager.js](../../../src/config/ConfigManager.js) (572 lines)

## MinHeap Implementation

**Lines 19-58 in QueueManager.js**

```javascript
class MinHeap {
  constructor(compare) {
    this.data = [];
    this.compare = compare;
  }

  size() { return this.data.length; }

  push(item) {
    this.data.push(item);
    this._siftUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return undefined;
    const min = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return min;
  }

  _siftUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) >= 0) break;
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  _siftDown(index) {
    const length = this.data.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}
```

**Comparison Function:**
```javascript
(a, b) => a.priority - b.priority
```

Lower priority values are extracted first (min-heap property).

## QueueManager

### Constructor (Lines 61-107)

```javascript
new QueueManager({
  usePriorityQueue: true,           // Use min-heap vs FIFO
  maxQueue: 10000,                  // Maximum queue size
  maxDepth: 10,                     // Maximum crawl depth
  shouldBypassDepth: (info) => {},  // Override depth limit
  urlEligibilityService,            // URL validation
  safeHostFromUrl: (url) => {},     // Host extraction
  cache,                            // ArticleCache
  getHostResumeTime: (host) => {},  // Rate limit query
  isHostRateLimited: (host) => {},  // 429 query
  emitQueueEvent: (evt) => {},      // Telemetry
  emitEnhancedQueueEvent: (evt) => {},
  computeEnhancedPriority: (args) => {},
  jobIdProvider: () => {},
  onRateLimitDeferred: () => {},
  isTotalPrioritisationEnabled: () => false
})
```

### Queue Types

Two separate queues for different purposes:

| Queue | Types | Purpose |
|-------|-------|---------|
| `discovery` | hub, nav, default | Navigation and structure discovery |
| `acquisition` | article, refresh, history | Content acquisition |

```javascript
_determineQueueType(item) {
  const type = item.type || item.kind;
  if (['article', 'refresh', 'history'].includes(type)) {
    return 'acquisition';
  }
  return 'discovery';
}
```

### Enqueue Operation (Lines 116-317)

```javascript
enqueue({ url, depth, type, meta = {}, priority = null }) {
  // 1. Validate URL
  if (!url || typeof url !== 'string') return { enqueued: false };

  // 2. Check queue size limit
  if (this.size() >= this.maxQueue) {
    this._emitQueueEvent({ action: 'dropped', reason: 'queue-full' });
    return { enqueued: false, reason: 'queue-full' };
  }

  // 3. Check depth limit
  if (depth > this.maxDepth && !this.shouldBypassDepth({ url, depth, type })) {
    return { enqueued: false, reason: 'max-depth' };
  }

  // 4. Check URL eligibility
  const eligibility = this.urlEligibilityService.check(url);
  if (!eligibility.eligible) {
    return { enqueued: false, reason: eligibility.reason };
  }

  // 5. Check deduplication
  if (this.queuedUrls.has(url)) {
    return { enqueued: false, reason: 'duplicate' };
  }

  // 6. Compute priority
  const priorityResult = this.computeEnhancedPriority({
    type, depth, discoveredAt: Date.now(), url, meta,
    jobId: this.jobIdProvider()
  });

  // 7. Create queue item
  const item = {
    url,
    depth,
    type,
    meta,
    priority: priorityResult.priority,
    prioritySource: priorityResult.prioritySource,
    enqueuedAt: Date.now()
  };

  // 8. Add to appropriate queue
  const queueType = this._determineQueueType(item);
  this._pushItem(item, queueType);
  this.queuedUrls.add(url);

  // 9. Emit event
  this._emitQueueEvent({ action: 'enqueued', url, priority: item.priority });

  return { enqueued: true, priority: item.priority };
}
```

### Pull Operation (Lines 319-568)

The pull operation scans up to 64 items to find an eligible URL:

```javascript
async pullNext() {
  const now = Date.now();
  const MAX_SCAN = 64;

  // Alternate between queues with burst limit
  const queueOrder = this._chooseQueueOrder();

  for (const queueType of queueOrder) {
    let scanned = 0;
    const deferred = [];

    while (scanned < MAX_SCAN) {
      const item = this._peekFromQueue(queueType);
      if (!item) break;

      scanned++;

      // Check rate limiting
      const resumeTime = this.getHostResumeTime(this.safeHostFromUrl(item.url));
      if (resumeTime > now) {
        // Defer item
        item.deferredUntil = resumeTime;
        deferred.push(this._popFromQueue(queueType));
        continue;
      }

      // Check 429 status
      if (this.isHostRateLimited(this.safeHostFromUrl(item.url))) {
        // Try to serve from cache
        if (this.cache) {
          const cached = await this.cache.get(item.url);
          if (cached) {
            item.forceCache = true;
            this.onRateLimitDeferred();
          }
        }
      }

      // Found eligible item
      this._popFromQueue(queueType);
      this.queuedUrls.delete(item.url);
      return { item, wakeAt: null };
    }

    // Re-add deferred items
    for (const item of deferred) {
      this._pushItem(item, queueType);
    }
  }

  // Calculate next wake time
  const earliestResume = this._findEarliestResumeTime();
  return { item: null, wakeAt: earliestResume };
}
```

## Priority Scoring

### Base Priority Calculator

**File:** [src/crawler/PriorityCalculator.js](../../../src/crawler/PriorityCalculator.js)

```javascript
const TYPE_WEIGHTS = {
  'article': 0,       // Highest priority (lowest value)
  'hub-seed': 4,
  'history': 6,
  'nav': 10,
  'refresh': 25,
  'default': 12
};

function _computeBasePriority({ type, depth, bias = 0, discoveredAt }) {
  const typeWeight = TYPE_WEIGHTS[type] ?? TYPE_WEIGHTS.default;
  const tieBreaker = discoveredAt * 1e-9;  // Deterministic ordering

  return typeWeight + depth + bias + tieBreaker;
}
```

**Formula:**
```
basePriority = typeWeight + depth + bias + (discoveredAt * 1e-9)
```

### Enhanced Priority Scorer

**File:** [src/crawler/PriorityScorer.js](../../../src/crawler/PriorityScorer.js)

```javascript
computeEnhancedPriority({
  type, depth, discoveredAt, bias = 0,
  url, meta = null, jobId = null,
  basePriorityOverride = null
}) {
  let priority = basePriorityOverride ?? this._computeBasePriority({ type, depth, bias, discoveredAt });
  let prioritySource = 'base';
  let bonusApplied = 0;

  // 1. Apply base multiplier
  if (this.priorityWeights.base !== 1) {
    priority *= this.priorityWeights.base;
  }

  // 2. Discovery method bonus
  const discoveryBonus = this._getDiscoveryMethodBonus(meta?.discoveryMethod);
  if (discoveryBonus > 0) {
    priority -= discoveryBonus;
    bonusApplied += discoveryBonus;
    prioritySource = 'discovery-bonus';
  }

  // 3. Gap-driven prioritization
  const gapScore = this._getGapPredictionScore(url, jobId);
  if (gapScore > 0) {
    const gapBonus = gapScore * this.priorityWeights['gap-score'];
    priority -= gapBonus;
    bonusApplied += gapBonus;
    prioritySource = 'gap-prediction';
  }

  // 4. Problem clustering boost
  const clusterBoost = this._getClusterBoost(url, jobId);
  if (clusterBoost > 0) {
    priority -= clusterBoost;
    bonusApplied += clusterBoost;
    prioritySource = 'cluster-boost';
  }

  // 5. Knowledge reuse bonus
  if (meta?.knowledgeReuse) {
    const reuseBonus = meta.knowledgeReuse * this.priorityWeights['knowledge-reuse'];
    priority -= reuseBonus;
    bonusApplied += reuseBonus;
  }

  // 6. Cost-aware priority (optional)
  if (this.features.costAwarePriority && meta?.estimatedCostMs) {
    if (meta.estimatedCostMs < 100) {
      priority -= priority * 0.1;  // Boost fast actions
    } else if (meta.estimatedCostMs > 500) {
      priority += priority * 0.1;  // Penalize slow actions
    }
  }

  return {
    priority,
    prioritySource,
    bonusApplied,
    basePriority: basePriorityOverride ?? this._computeBasePriority({ type, depth, bias, discoveredAt }),
    computeTimeMs: Date.now() - startTime,
    metadata: { ... }
  };
}
```

### Discovery Method Bonuses

```javascript
const DISCOVERY_METHOD_MAP = {
  'intelligent-seed': 'adaptive-seed',
  'adaptive-seed': 'adaptive-seed',
  'hub-seed': 'adaptive-seed',
  'sitemap': 'sitemap',
  'validated-hub': 'hub-validated',
  'link-discovery': 'link'
};

// Default bonus values
const DEFAULT_BONUSES = {
  'adaptive-seed': 20,
  'gap-prediction': 15,
  'sitemap': 10,
  'hub-validated': 8,
  'link': 0
};
```

### Gap Prediction Score

```javascript
_getGapPredictionScore(url, jobId) {
  const prediction = this.gapPredictions.get(url);
  if (!prediction) return 0;

  // confidence_score * 10 + expected_coverage_lift * 5
  return prediction.confidence_score * 10 + prediction.expected_coverage_lift * 5;
}
```

### Cluster Boost Calculation

```javascript
_calculatePriorityBoost(cluster) {
  // Logarithmic scaling to prevent dominance
  // boost = min(log2(occurrenceCount) * boostFactorPerCluster, 20)
  const boost = Math.min(
    Math.log2(cluster.occurrenceCount) * this.boostFactorPerCluster,
    20
  );
  return boost;
}
```

## ConfigManager Integration

**File:** [src/config/ConfigManager.js](../../../src/config/ConfigManager.js)

### Default Configuration

```javascript
{
  queue: {
    bonuses: {
      'adaptive-seed': { value: 20 },
      'gap-prediction': { value: 15 },
      'sitemap': { value: 10 },
      'hub-validated': { value: 8 },
      'link': { value: 0 }
    },
    weights: {
      'article': { value: 0 },
      'hub-seed': { value: 4 },
      'history': { value: 6 },
      'nav': { value: 10 },
      'refresh': { value: 25 }
    },
    clustering: {
      problemThreshold: 5,
      timeWindowMinutes: 30,
      maxClusterSize: 100,
      boostFactorPerCluster: 2.5
    }
  },
  features: {
    gapDrivenPrioritization: true,
    plannerKnowledgeReuse: true,
    problemClustering: true,
    costAwarePriority: false
  }
}
```

### Dynamic Configuration Updates

```javascript
// Runtime update
configManager.updateConfig({
  queue: {
    bonuses: {
      'sitemap': { value: 15 }  // Increase sitemap priority
    }
  }
});

// Watch for changes
configManager.addWatcher((newConfig) => {
  priorityScorer.refreshConfig();
});
```

## Total Prioritisation (Lines 648-713)

For focused crawls (e.g., country-specific):

```javascript
_classifyTotalPrioritisationTarget({ kind, meta, url }) {
  // Analyze tokens from kind, meta, URL path
  const tokens = extractTokens(kind, meta, url);

  if (isCountryToken(tokens)) return 'country';
  if (isCountryRelatedToken(tokens)) return 'country-related';
  return 'other';
}

// Priority adjustments
const FLOORS = {
  'country': -5000,       // Highest priority
  'country-related': -3000,
  'other': 5000000        // Effectively dropped
};
```

## Queue Heatmap (Lines 570-626)

Track queue composition for monitoring:

```javascript
getHeatmapSnapshot() {
  return {
    total: this.cumulativeCount,
    cells: this._computeHeatmapCells(),
    depthBuckets: this._computeDepthBuckets(),
    lastUpdatedAt: Date.now()
  };
}

// Example output
{
  total: 1500,
  cells: {
    'opportunistic': { article: 50, hub: 30, other: 20 },
    'sitemap': { article: 200, hub: 100, other: 50 },
    'intelligent-seed': { article: 300, hub: 150, other: 100 }
  },
  depthBuckets: {
    0: 100,
    1: 300,
    2: 500,
    '3+': 400,
    unknown: 200
  }
}
```

## Batch Operations (Lines 498-550)

For efficiency when processing multiple items:

```javascript
computeBatchPriorities(items, jobId = null) {
  const startTime = Date.now();

  // Pre-load gap predictions and clusters
  this._preloadGapPredictions(items.map(i => i.url));
  this._preloadClusters(jobId);

  // Process all items
  const results = items.map(item => this.computeEnhancedPriority({
    ...item,
    jobId
  }));

  return {
    results,
    batchStats: {
      itemCount: items.length,
      totalTimeMs: Date.now() - startTime,
      avgTimePerItem: (Date.now() - startTime) / items.length,
      featuresUsed: this._getActiveFeatures()
    }
  };
}
```

## Key Method Signatures

| Method | Lines | Signature |
|--------|-------|-----------|
| QueueManager.enqueue | 116-317 | `enqueue({ url, depth, type, meta, priority })` |
| QueueManager.pullNext | 319-347 | `async pullNext()` |
| QueueManager.size | 109 | `size()` |
| QueueManager.getHeatmapSnapshot | 570-578 | `getHeatmapSnapshot()` |
| PriorityScorer.computeEnhancedPriority | 157-330 | `computeEnhancedPriority({ type, depth, ... })` |
| PriorityScorer.computeBatchPriorities | 498-550 | `computeBatchPriorities(items, jobId)` |
| PriorityCalculator.compute | 40 | `compute({ type, depth, bias, discoveredAt })` |

## Final Priority Formula

```
finalPriority = basePriority
              - discoveryMethodBonus
              - (gapScore * gapWeight)
              - clusterBoost
              - knowledgeReuseBonus
              ± costAdjustment
```

Where:
- Lower values = higher priority
- Bonuses are subtracted (decrease priority value = increase urgency)
- Penalties are added (increase priority value = decrease urgency)

## Next Chapter

Continue to [Chapter 4: Intelligent Planning](./04-intelligent-planning.md) to learn about the hierarchical planning system.
