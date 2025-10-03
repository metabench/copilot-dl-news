const QueueManager = require('../QueueManager');

describe('QueueManager basic', () => {
  test('enqueue and pull simple discovery then acquisition', async () => {
    const urlEligibilityService = {
      evaluate: ({ url }) => ({ status: 'allow', normalized: url, kind: (url.includes('article') ? 'article' : 'hub'), queueKey: url })
    };

    const qm = new QueueManager({ urlEligibilityService, usePriorityQueue: false });

    qm.enqueue({ url: 'http://example.com/hub', depth: 0, type: 'hub' });
    qm.enqueue({ url: 'http://example.com/article/1', depth: 1, type: 'article' });

    const first = await qm.pullNext();
    expect(first).not.toBeNull();
    expect(first.item.url).toMatch(/hub/);

    const second = await qm.pullNext();
    expect(second).not.toBeNull();
    expect(second.item.url).toMatch(/article/);

    const third = await qm.pullNext();
    expect(third).toBeNull();
  });

  test('priority queue pops higher priority item first', async () => {
    const urlEligibilityService = {
      evaluate: ({ url }) => ({ status: 'allow', normalized: url, kind: 'article', queueKey: url })
    };

    const computeEnhancedPriority = jest.fn(({ url }) => {
      if (url.includes('fast')) return { priority: -10, prioritySource: 'heuristic', bonusApplied: 5 };
      return { priority: 25, prioritySource: 'base' };
    });

    const emitEnhancedQueueEvent = jest.fn();

    const qm = new QueueManager({
      urlEligibilityService,
      computeEnhancedPriority,
      emitEnhancedQueueEvent,
      usePriorityQueue: true
    });

    qm.enqueue({ url: 'http://example.com/article/slow', depth: 1, type: 'article' });
    qm.enqueue({ url: 'http://example.com/article/fast', depth: 1, type: 'article' });

    const first = await qm.pullNext();
    expect(first).not.toBeNull();
    expect(first.item.url).toContain('fast');

    const second = await qm.pullNext();
    expect(second).not.toBeNull();
    expect(second.item.url).toContain('slow');

    expect(computeEnhancedPriority).toHaveBeenCalledTimes(2);
    expect(emitEnhancedQueueEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'enqueued',
      url: 'http://example.com/article/fast',
      priorityScore: -10,
      prioritySource: 'heuristic'
    }));
  });

  test('enqueue emits jobId and priority metadata', () => {
    const urlEligibilityService = {
      evaluate: ({ url }) => ({ status: 'allow', normalized: url, kind: 'hub', queueKey: url })
    };

    const emitEnhancedQueueEvent = jest.fn();
    const computeEnhancedPriority = jest.fn(() => ({
      priority: -5,
      prioritySource: 'ml-model',
      bonusApplied: 3,
      clusterId: 'cluster-42',
      gapPredictionScore: 0.87
    }));

    const qm = new QueueManager({
      urlEligibilityService,
      emitEnhancedQueueEvent,
      computeEnhancedPriority,
      jobIdProvider: () => 'job-123'
    });

    const accepted = qm.enqueue({ url: 'http://example.com/hub', depth: 0, type: 'hub' });
    expect(accepted).toBe(true);

    expect(emitEnhancedQueueEvent).toHaveBeenCalledTimes(1);
    expect(emitEnhancedQueueEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'enqueued',
      url: 'http://example.com/hub',
      jobId: 'job-123',
      priorityScore: -5,
      prioritySource: 'ml-model',
      bonusApplied: 3,
      clusterId: 'cluster-42',
      gapPredictionScore: 0.87
    }));
  });

  test('pullNext uses cache when host is rate-limited', async () => {
    const cacheGet = jest.fn().mockResolvedValue({ body: 'cached' });
    const getHostResumeTime = jest.fn().mockReturnValue(Date.now() + 1000);
    const isHostRateLimited = jest.fn().mockReturnValue(true);

    const urlEligibilityService = {
      evaluate: ({ url }) => ({ status: 'allow', normalized: url, kind: 'article', queueKey: url })
    };

    const qm = new QueueManager({
      urlEligibilityService,
      cache: { get: cacheGet },
      getHostResumeTime,
      isHostRateLimited,
      safeHostFromUrl: (url) => new URL(url).host,
      usePriorityQueue: true
    });

    qm.enqueue({ url: 'http://news.example.com/article/1', depth: 1, type: 'article' });

    const result = await qm.pullNext();
    expect(result).not.toBeNull();
    expect(result.item.url).toContain('/article/1');
    expect(result.context).toEqual(expect.objectContaining({
      forceCache: true,
      cachedPage: { body: 'cached' },
      rateLimitedHost: 'news.example.com'
    }));
    expect(cacheGet).toHaveBeenCalledWith('http://news.example.com/article/1');
    expect(isHostRateLimited).toHaveBeenCalled();
  });

  test('rate-limited host without cache is deferred and returns wakeAt', async () => {
    const future = Date.now() + 2000;
    const cacheGet = jest.fn().mockResolvedValue(null);
    const getHostResumeTime = jest.fn().mockReturnValue(future);
    const isHostRateLimited = jest.fn().mockReturnValue(true);

    const urlEligibilityService = {
      evaluate: ({ url }) => ({ status: 'allow', normalized: url, kind: 'article', queueKey: url })
    };

    const qm = new QueueManager({
      urlEligibilityService,
      cache: { get: cacheGet },
      getHostResumeTime,
      isHostRateLimited,
      safeHostFromUrl: (url) => new URL(url).host,
      usePriorityQueue: true
    });

    qm.enqueue({ url: 'http://news.example.com/article/2', depth: 1, type: 'article' });

    const result = await qm.pullNext();
    expect(result).toEqual({ wakeAt: future });
    expect(cacheGet).toHaveBeenCalledWith('http://news.example.com/article/2');
    expect(qm.size()).toBe(1);
  });

  test('heatmap tracks origin/role/depth buckets and decrements on pull', async () => {
    const urlEligibilityService = {
      evaluate: ({ url, depth }) => ({
        status: 'allow',
        normalized: url,
        kind: url.includes('article') ? 'article' : 'hub',
        queueKey: url,
        meta: {
          origin: url.includes('planner') ? 'planner' : 'opportunistic',
          role: url.includes('article') ? 'article' : 'hub'
        }
      })
    };

    const qm = new QueueManager({
      urlEligibilityService,
      usePriorityQueue: false
    });

    qm.enqueue({ url: 'http://planner.example.com/hub', depth: 0, type: 'hub' });
    qm.enqueue({ url: 'http://planner.example.com/article/99', depth: 2, type: 'article' });

    const snapshot = qm.getHeatmapSnapshot();
    expect(snapshot.total).toBe(2);
    expect(snapshot.cells.planner.hub).toBe(1);
    expect(snapshot.cells.planner.article).toBe(1);
    expect(snapshot.depthBuckets['0']).toBe(1);
    expect(snapshot.depthBuckets['2']).toBe(1);

    const first = await qm.pullNext();
    expect(first.item.url).toContain('/hub');

    const snapshotAfterPull = qm.getHeatmapSnapshot();
    expect(snapshotAfterPull.total).toBe(1);
    expect(snapshotAfterPull.cells.planner.hub).toBe(0);
    expect(snapshotAfterPull.cells.planner.article).toBe(1);

    const clone = qm.getHeatmapSnapshot();
    clone.cells.planner.article = 99;
    const snapshotUnchanged = qm.getHeatmapSnapshot();
    expect(snapshotUnchanged.cells.planner.article).toBe(1);
  });
});
