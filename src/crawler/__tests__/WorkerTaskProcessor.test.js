const { processTaskResult } = require('../WorkerTaskProcessor');

describe('WorkerTaskProcessor', () => {
  test('reschedules retriable failed item', async () => {
    const now = Date.now();
    const queue = { rescheduleCalledWith: null, reschedule(item) { this.rescheduleCalledWith = item; }, size() { return 1; } };
    const item = { url: 'https://retry.test/path-1', depth: 0, type: 'url', discoveredAt: now };
    const result = { status: 'failed', retriable: true };
    const computePriority = () => 42;
    const telemetry = { queueEvent: jest.fn() };
    await processTaskResult({ result, item, queue, retryLimit: 3, backoffBaseMs: 100, backoffMaxMs: 10000, computePriority, nowMs: () => now, jitter: (ms) => ms, telemetry });
    expect(item.retries).toBe(1);
    expect(item.nextEligibleAt).toBeGreaterThan(now);
    expect(item.priority).toBe(42);
    expect(queue.rescheduleCalledWith).toBe(item);
    expect(telemetry.queueEvent).toHaveBeenCalled();
  });

  test('does not reschedule when retries exceed limit', async () => {
    const now = Date.now();
    const queue = { rescheduleCalledWith: null, reschedule(item) { this.rescheduleCalledWith = item; }, size() { return 1; } };
    const item = { url: 'https://retry.test/path-1', depth: 0, type: 'url', discoveredAt: now, retries: 3 };
    const result = { status: 'failed', retriable: true };
    const computePriority = () => 99;
    const telemetry = { queueEvent: jest.fn() };
    await processTaskResult({ result, item, queue, retryLimit: 3, backoffBaseMs: 100, backoffMaxMs: 10000, computePriority, nowMs: () => now, jitter: (ms) => ms, telemetry });
    expect(item.retries).toBe(3);
    expect(queue.rescheduleCalledWith).toBeNull();
    expect(telemetry.queueEvent).not.toHaveBeenCalled();
  });
});
