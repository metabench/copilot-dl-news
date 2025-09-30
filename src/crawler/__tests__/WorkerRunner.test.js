const { WorkerRunner } = require('../WorkerRunner');

describe('WorkerRunner', () => {
  const createRunner = (overrides = {}) => {
    const queueItems = overrides.__queueItems || [];
    let pendingItems = queueItems.filter((pick) => pick && pick.item).length;

    const queue = {
      pullNext: jest.fn(async () => {
        const pick = queueItems.shift();
        if (pick && pick.item) {
          pendingItems = Math.max(0, pendingItems - 1);
        }
        return pick;
      }),
      size: jest.fn(() => pendingItems),
      reschedule: jest.fn()
    };

    const processPage = overrides.processPage || jest.fn(async () => ({ status: 'ok' }));
    const computePriority = overrides.computePriority || jest.fn(() => 10);
    const telemetry = { queueEvent: jest.fn() };
    const now = overrides.nowMs || (() => 1_000);
    const jitter = overrides.jitter || ((value) => value);
    const sleep = overrides.sleep || jest.fn(async () => {});
    const isPaused = overrides.isPaused || (() => false);
    const isAbortRequested = overrides.isAbortRequested || (() => false);
    const emitProgress = overrides.emitProgress || jest.fn();
    const safeHostFromUrl = overrides.safeHostFromUrl || (() => 'example.com');
    const getStats = overrides.getStats || (() => ({ pagesDownloaded: 0 }));
    const getMaxDownloads = overrides.getMaxDownloads || (() => undefined);
    const onBusyChange = overrides.onBusyChange || jest.fn();

    const runner = new WorkerRunner({
      queue,
      processPage,
      computePriority,
      retryLimit: overrides.retryLimit || 3,
      backoffBaseMs: overrides.backoffBaseMs || 500,
      backoffMaxMs: overrides.backoffMaxMs || 30_000,
      getStats,
      getMaxDownloads,
      telemetry,
      sleep,
      nowMs: now,
      jitter,
      isPaused,
      isAbortRequested,
      emitProgress,
      safeHostFromUrl,
      getQueueSize: () => queue.size(),
      onBusyChange
    });

    return { runner, queue, processPage, computePriority, telemetry, onBusyChange };
  };

  test('processes a work item and exits when queue drains', async () => {
    const url = 'https://example.com/article';
    const depth = 1;
    const type = 'article';
    const { runner, queue, processPage, telemetry, onBusyChange } = createRunner({
      __queueItems: [
        {
          item: { url, depth, type, allowRevisit: false, retries: 0 }
        },
        undefined
      ]
    });

    await runner.run(0);

    expect(queue.pullNext).toHaveBeenCalledTimes(2);
    expect(processPage).toHaveBeenCalledWith(url, depth, { type, allowRevisit: false });
    expect(telemetry.queueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dequeued', url, depth })
    );
    expect(onBusyChange).toHaveBeenCalledWith(1);
    expect(onBusyChange).toHaveBeenCalledWith(-1);
  });

  test('reschedules retriable failures with backoff and priority recompute', async () => {
    const url = 'https://example.com/failure';
    const computePriority = jest.fn(() => 42);
    const queueItems = [
      {
        item: {
          url,
          depth: 2,
          type: 'nav',
          allowRevisit: false,
          retries: 0,
          discoveredAt: 123,
          priorityBias: 3
        }
      },
      undefined
    ];

    const reschedule = jest.fn();
    const { runner, queue } = createRunner({
      computePriority,
      __queueItems: queueItems,
      backoffBaseMs: 400,
      jitter: (value) => value,
      nowMs: () => 10_000,
      processPage: jest.fn(async () => ({ status: 'failed', retriable: true })),
      retryLimit: 5,
      sleep: jest.fn(async () => {}),
      safeHostFromUrl: () => 'example.com'
    });

    queue.reschedule = reschedule;

    await runner.run(1);

    expect(reschedule).toHaveBeenCalledTimes(1);
    const scheduledItem = reschedule.mock.calls[0][0];
    expect(scheduledItem.retries).toBe(1);
    expect(scheduledItem.nextEligibleAt).toBe(10_400);
    expect(scheduledItem.priority).toBe(42);
    expect(computePriority).toHaveBeenCalledWith({
      type: 'nav',
      depth: 2,
      discoveredAt: 123,
      bias: 3
    });
  });

  test('stops pulling when max downloads reached', async () => {
    const { runner, queue } = createRunner({
      __queueItems: [],
      getStats: () => ({ pagesDownloaded: 5 }),
      getMaxDownloads: () => 5
    });

    await runner.run(0);

    expect(queue.pullNext).not.toHaveBeenCalled();
  });
});
