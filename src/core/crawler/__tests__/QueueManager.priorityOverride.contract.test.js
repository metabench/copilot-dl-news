'use strict';

const QueueManager = require('../QueueManager');

describe('Process contract: QueueManager priority override', () => {
  function createQueueManager(overrides = {}) {
    const urlEligibilityService = {
      evaluate: ({ url, type }) => {
        const kind = typeof type === 'string'
          ? type
          : (type && typeof type.kind === 'string' ? type.kind : 'hub');

        return {
          status: 'allow',
          handled: true,
          normalized: url,
          host: 'example.com',
          queueKey: url,
          kind,
          meta: null,
          decision: null,
          allowRevisit: false
        };
      }
    };

    return new QueueManager({
      usePriorityQueue: true,
      ...overrides,
      urlEligibilityService,
      safeHostFromUrl: () => 'example.com',
      cache: { get: async () => null },
      isHostRateLimited: () => false,
      getHostResumeTime: () => null,
      computeEnhancedPriority: () => ({ priority: 0, prioritySource: 'base' }),
      jobIdProvider: () => 'job-1',
      isTotalPrioritisationEnabled: () => false,
      emitQueueEvent: () => {},
      emitEnhancedQueueEvent: () => {}
    });
  }

  test('serves explicit priority overrides first (higher requestedPriority => earlier dequeue)', async () => {
    const queue = createQueueManager();

    queue.enqueue({
      url: 'https://example.com/normal-seed',
      depth: 0,
      type: { kind: 'hub-seed' }
    });

    queue.enqueue({
      url: 'https://example.com/missing-country-hub',
      depth: 0,
      priority: 250,
      type: { kind: 'place-hub-verification' }
    });

    const first = await queue.pullNext();
    expect(first?.item?.url).toBe('https://example.com/missing-country-hub');

    const second = await queue.pullNext();
    expect(second?.item?.url).toBe('https://example.com/normal-seed');
  });

  // Cycle 11: single-worker crawls run with usePriorityQueue=false
  // (NewsCrawler: usePriorityQueue = concurrency > 1). FIFO mode ignored
  // priority scores entirely, so the seed guarantee (priority 1e9 ->
  // explicit-override) starved behind the sitemap flood and the seed was
  // never dequeued. The override contract must hold in BOTH queue modes.
  test('FIFO mode: explicit priority override jumps the queue (seed guarantee)', async () => {
    const queue = createQueueManager({ usePriorityQueue: false });

    for (let i = 0; i < 100; i += 1) {
      queue.enqueue({
        url: `https://example.com/sitemap-article-${i}`,
        depth: 1,
        type: { kind: 'hub-seed' }
      });
    }

    queue.enqueue({
      url: 'https://example.com/the-seed',
      depth: 0,
      priority: 1e9,
      type: { kind: 'nav', allowRevisit: true, seedStartUrl: true }
    });

    const first = await queue.pullNext();
    expect(first?.item?.url).toBe('https://example.com/the-seed');
  });

  test('FIFO mode: non-override items keep insertion order', async () => {
    const queue = createQueueManager({ usePriorityQueue: false });

    queue.enqueue({ url: 'https://example.com/a', depth: 1, type: { kind: 'hub-seed' } });
    queue.enqueue({ url: 'https://example.com/b', depth: 1, type: { kind: 'hub-seed' } });

    const first = await queue.pullNext();
    const second = await queue.pullNext();
    expect(first?.item?.url).toBe('https://example.com/a');
    expect(second?.item?.url).toBe('https://example.com/b');
  });
});
