'use strict';

const { evaluateStorageBudget, normalizeStorageBudgetOptions, MB } = require('../../../tools/crawl/lib/storage-budget');
const { evaluateBackpressure } = require('../../../tools/crawl/lib/backpressure');
const { createPerfReporter } = require('../../../tools/crawl/lib/perf-reporter');

describe('evaluateStorageBudget', () => {
  test('returns normal/no-budget when budget is unset', () => {
    const r = evaluateStorageBudget({ remoteContentBytes: 999 * MB, currentLimit: 5 });
    expect(r.action).toBe('normal');
    expect(r.reason).toBe('no-budget');
    expect(r.targetLimit).toBe(5);
  });

  test('returns normal when under budget', () => {
    const r = evaluateStorageBudget({ remoteContentBytes: 100 * MB, budgetMb: 500, currentLimit: 10, maxLimit: 25 });
    expect(r.action).toBe('normal');
    expect(r.targetLimit).toBe(10);
    expect(r.headroomMb).toBeCloseTo(400, 0);
  });

  test('shrinks limit when over budget', () => {
    const r = evaluateStorageBudget({ remoteContentBytes: 600 * MB, budgetMb: 500, currentLimit: 20, minLimit: 1, maxLimit: 25 });
    expect(r.action).toBe('shrink');
    expect(r.targetLimit).toBe(10); // floor(20/2)
    expect(r.headroomMb).toBeLessThan(0);
  });

  test('issues pause-crawl when over budget + reserve', () => {
    const r = evaluateStorageBudget({ remoteContentBytes: 1500 * MB, budgetMb: 500, reserveMb: 500, currentLimit: 20, minLimit: 1, maxLimit: 25 });
    expect(r.action).toBe('pause-crawl');
    expect(r.targetLimit).toBe(1);
  });

  test('clamps shrink target to minLimit', () => {
    const r = evaluateStorageBudget({ remoteContentBytes: 600 * MB, budgetMb: 500, currentLimit: 2, minLimit: 3, maxLimit: 10 });
    expect(r.action).toBe('shrink');
    expect(r.targetLimit).toBe(3);
  });

  test('normalizeStorageBudgetOptions parses cli aliases', () => {
    expect(normalizeStorageBudgetOptions({ 'remote-storage-budget-mb': '256' })).toEqual({
      enabled: true, budgetMb: 256, reserveMb: null,
    });
    expect(normalizeStorageBudgetOptions({ remoteStorageBudgetMb: 128, remoteStorageReserveMb: 64 })).toEqual({
      enabled: true, budgetMb: 128, reserveMb: 64,
    });
    expect(normalizeStorageBudgetOptions({})).toEqual({ enabled: false, budgetMb: null, reserveMb: null });
  });
});

describe('evaluateBackpressure', () => {
  test('keeps normal concurrency when action=normal', () => {
    const r = evaluateBackpressure({ action: 'normal', currentConcurrency: 10, normalConcurrency: 10 });
    expect(r.desiredConcurrency).toBe(10);
    expect(r.pause).toBe(false);
    expect(r.changed).toBe(false);
  });

  test('reduces concurrency on shrink', () => {
    const r = evaluateBackpressure({ action: 'shrink', currentConcurrency: 10, normalConcurrency: 10, reducedConcurrency: 2 });
    expect(r.desiredConcurrency).toBe(2);
    expect(r.pause).toBe(false);
    expect(r.changed).toBe(true);
  });

  test('pauses on pause-crawl', () => {
    const r = evaluateBackpressure({ action: 'pause-crawl', currentConcurrency: 10 });
    expect(r.desiredConcurrency).toBe(0);
    expect(r.pause).toBe(true);
    expect(r.changed).toBe(true);
  });

  test('restores normal concurrency when going back to normal from shrink', () => {
    const r = evaluateBackpressure({ action: 'normal', currentConcurrency: 2, normalConcurrency: 10 });
    expect(r.desiredConcurrency).toBe(10);
    expect(r.changed).toBe(true);
  });
});

describe('perf-reporter', () => {
  test('records and produces percentile summary', () => {
    const r = createPerfReporter({ capacity: 10 });
    for (let i = 1; i <= 10; i++) {
      r.record({ fetchMs: i * 100, ingestMs: i * 50, verifyMs: 20, pruneMs: 30, totalMs: i * 200, rows: 5, bytes: 1024 });
    }
    const s = r.summary();
    expect(s.samples).toBe(10);
    expect(s.fetchMs.p50).toBeGreaterThanOrEqual(400);
    expect(s.fetchMs.p95).toBeGreaterThanOrEqual(900);
    expect(s.fetchMs.max).toBe(1000);
    expect(s.rowsPerSec).toBeGreaterThan(0);
    expect(s.bytesPerSec).toBeGreaterThan(0);
  });

  test('respects capacity (ring buffer)', () => {
    const r = createPerfReporter({ capacity: 3 });
    r.record({ totalMs: 100 });
    r.record({ totalMs: 200 });
    r.record({ totalMs: 300 });
    r.record({ totalMs: 400 });
    const s = r.summary();
    expect(s.samples).toBe(3);
    expect(s.totalMs.max).toBe(400);
  });

  test('summary on empty reporter returns samples=0', () => {
    const r = createPerfReporter();
    expect(r.summary()).toEqual({ samples: 0 });
  });

  test('reset empties buffer', () => {
    const r = createPerfReporter();
    r.record({ totalMs: 100 });
    r.reset();
    expect(r.summary().samples).toBe(0);
  });

  test('exposes remote backlog from latest sample', () => {
    const r = createPerfReporter();
    r.record({ totalMs: 100, remoteBacklog: 42 });
    r.record({ totalMs: 200, remoteBacklog: 17 });
    expect(r.summary().remoteBacklog).toBe(17);
  });

  test('ignores negative values in record (clamped to 0)', () => {
    const r = createPerfReporter();
    r.record({ totalMs: -50, fetchMs: -1, rows: -3 });
    const s = r.summary();
    expect(s.fetchMs.max).toBe(0);
    expect(s.rowsPerSec).toBe(0);
  });
});
