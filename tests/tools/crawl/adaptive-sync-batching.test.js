'use strict';

const {
  createAdaptiveBatchController,
  normalizeAdaptiveBatchOptions,
} = require('../../../tools/crawl/lib/adaptive-sync-batching');

describe('adaptive sync batching', () => {
  test('keeps fixed limit behavior when adaptive mode is disabled', () => {
    const controller = createAdaptiveBatchController({ initialLimit: 10, targetMs: undefined });

    expect(controller.isEnabled()).toBe(false);
    expect(controller.getLimit()).toBe(10);
    expect(controller.recordSuccess({ durationMs: 20000, fetchedRows: 10 }).action).toBe('hold');
    expect(controller.recordError({ error: 'timeout' }).action).toBe('hold');
    expect(controller.getLimit()).toBe(10);
  }, 5000);

  test('enables adaptive mode when target-sync-ms is present', () => {
    const options = normalizeAdaptiveBatchOptions({
      limit: '5',
      'target-sync-ms': '5000',
      'min-limit': '1',
      'max-limit': '25',
    });

    expect(options.enabled).toBe(true);
    expect(options.initialLimit).toBe(5);
    expect(options.targetMs).toBe(5000);
    expect(options.maxLimit).toBe(25);
  }, 5000);

  test('shrinks immediately after a slow round', () => {
    const controller = createAdaptiveBatchController({
      enabled: true,
      initialLimit: 10,
      minLimit: 1,
      maxLimit: 25,
      targetMs: 5000,
    });

    const decision = controller.recordSuccess({ durationMs: 6500, fetchedRows: 10 });

    expect(decision.action).toBe('shrink');
    expect(decision.reason).toBe('slow-round');
    expect(controller.getLimit()).toBe(5);
  }, 5000);

  test('shrinks after an error and respects the minimum limit', () => {
    const controller = createAdaptiveBatchController({
      enabled: true,
      initialLimit: 2,
      minLimit: 2,
      maxLimit: 25,
      targetMs: 5000,
    });

    const decision = controller.recordError({ error: 'socket hang up' });

    expect(decision.action).toBe('hold');
    expect(decision.reason).toBe('min-limit');
    expect(controller.getLimit()).toBe(2);
  }, 5000);

  test('grows after repeated fast full batches', () => {
    const controller = createAdaptiveBatchController({
      enabled: true,
      initialLimit: 5,
      minLimit: 1,
      maxLimit: 25,
      targetMs: 5000,
    });

    expect(controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 }).action).toBe('hold');
    expect(controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 }).action).toBe('hold');
    const decision = controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 });

    expect(decision.action).toBe('grow');
    expect(decision.reason).toBe('fast-full-streak');
    expect(controller.getLimit()).toBe(8);
  }, 5000);

  test('does not grow on fast partial batches', () => {
    const controller = createAdaptiveBatchController({
      enabled: true,
      initialLimit: 5,
      minLimit: 1,
      maxLimit: 25,
      targetMs: 5000,
    });

    for (let round = 0; round < 5; round++) {
      const decision = controller.recordSuccess({ durationMs: 500, fetchedRows: 4 });
      expect(decision.reason).toBe('partial-batch');
    }

    expect(controller.getLimit()).toBe(5);
  }, 5000);

  test('respects the maximum limit while growing', () => {
    const controller = createAdaptiveBatchController({
      enabled: true,
      initialLimit: 5,
      minLimit: 1,
      maxLimit: 6,
      targetMs: 5000,
    });

    controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 });
    controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 });
    const firstGrowth = controller.recordSuccess({ durationMs: 1000, fetchedRows: 5 });
    controller.recordSuccess({ durationMs: 1000, fetchedRows: 6 });
    controller.recordSuccess({ durationMs: 1000, fetchedRows: 6 });
    const cappedGrowth = controller.recordSuccess({ durationMs: 1000, fetchedRows: 6 });

    expect(firstGrowth.action).toBe('grow');
    expect(controller.getLimit()).toBe(6);
    expect(cappedGrowth.action).toBe('hold');
    expect(cappedGrowth.reason).toBe('max-limit');
    expect(controller.getLimit()).toBe(6);
  }, 5000);
});