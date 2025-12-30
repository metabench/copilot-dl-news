'use strict';

const QueueManager = require('../QueueManager');

describe('Process contract: QueueManager priority override', () => {
  function createQueueManager() {
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
});
