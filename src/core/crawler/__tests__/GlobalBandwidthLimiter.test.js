'use strict';

const { GlobalBandwidthLimiter, getGlobalBandwidthLimiter, computeDemandSlices } = require('../GlobalBandwidthLimiter');

describe('computeDemandSlices', () => {
  const MB = 1048576;

  test('empty and unlimited inputs', () => {
    expect(computeDemandSlices(4 * MB, []).size).toBe(0);
    const un = computeDemandSlices(0, [{ id: 'a', bytesPerSec: 5 }]);
    expect(un.get('a')).toBe(0); // 0 = unlimited
  });

  test('slices always sum to the cap (work-conserving), never exceed it', () => {
    const cases = [
      [{ id: 'a', bytesPerSec: 0 }, { id: 'b', bytesPerSec: 0 }],                       // all idle
      [{ id: 'a', bytesPerSec: 10 * MB }, { id: 'b', bytesPerSec: 10 * MB }],           // over-demand
      [{ id: 'a', bytesPerSec: 0.1 * MB }, { id: 'b', bytesPerSec: 3 * MB }, { id: 'c', bytesPerSec: 0 }]
    ];
    for (const workers of cases) {
      const slices = computeDemandSlices(4 * MB, workers);
      const sum = Array.from(slices.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(4 * MB, 0);
    }
  });

  test('starved worker yields budget to the supplied one', () => {
    // b consumes heavily, a is stuck in discovery: b must get most of the cap,
    // but a keeps a floor so it can ramp when its supply arrives.
    const slices = computeDemandSlices(4 * MB, [
      { id: 'a', bytesPerSec: 0 },
      { id: 'b', bytesPerSec: 3.5 * MB }
    ]);
    expect(slices.get('b')).toBeGreaterThan(2.5 * MB);
    expect(slices.get('a')).toBeGreaterThan(0);
    expect(slices.get('b')).toBeGreaterThan(slices.get('a'));
  });

  test('headroom: an active worker gets more than its current rate', () => {
    const slices = computeDemandSlices(4 * MB, [
      { id: 'a', bytesPerSec: 1 * MB },
      { id: 'b', bytesPerSec: 0.5 * MB }
    ]);
    expect(slices.get('a')).toBeGreaterThan(1 * MB);   // can ramp next cycle
    expect(slices.get('b')).toBeGreaterThan(0.5 * MB);
  });

  test('oversubscribed: no slice is ever scaled below the per-worker floor', () => {
    // The floor formula the implementation uses (kept in sync here so the test
    // tracks cap/N variations rather than a hard-coded number).
    const floorOf = (cap, n) => Math.min(cap / n, Math.max(8 * 1024, cap * 0.02));
    const cases = [
      // Regression case: one floor-level worker (host in discovery, reporting
      // ~0 B/s) among several heavy demanders. Bare proportional scaling used to
      // collapse its slice to ~8 KB/s — well under the ~37 KB/s floor — draining
      // it into 100s+ of token-bucket debt per large page and keeping it starved.
      { cap: 1.8 * MB, workers: [
        { id: 'idle', bytesPerSec: 0 },
        { id: 'h1', bytesPerSec: 1 * MB }, { id: 'h2', bytesPerSec: 1 * MB },
        { id: 'h3', bytesPerSec: 1 * MB }, { id: 'h4', bytesPerSec: 1 * MB },
        { id: 'h5', bytesPerSec: 1 * MB }
      ] },
      // Two idle workers alongside two heavy ones.
      { cap: 4 * MB, workers: [
        { id: 'a', bytesPerSec: 0 }, { id: 'b', bytesPerSec: 0 },
        { id: 'c', bytesPerSec: 10 * MB }, { id: 'd', bytesPerSec: 10 * MB }
      ] },
      // A single dominant worker starving three floor-level ones.
      { cap: 2 * MB, workers: [
        { id: 'big', bytesPerSec: 20 * MB },
        { id: 'x', bytesPerSec: 0 }, { id: 'y', bytesPerSec: 0 }, { id: 'z', bytesPerSec: 0 }
      ] }
    ];
    for (const { cap, workers } of cases) {
      const slices = computeDemandSlices(cap, workers);
      const floor = floorOf(cap, workers.length);
      // Sanity: these cases must actually exercise the oversubscribed branch.
      const HEADROOM = 1.6;
      const totalDemand = workers.reduce(
        (a, w) => a + Math.max(floor, (w.bytesPerSec || 0) * HEADROOM), 0);
      expect(totalDemand).toBeGreaterThan(cap);
      // The fix: every slice stays at or above the floor...
      for (const slice of slices.values()) {
        expect(slice).toBeGreaterThanOrEqual(floor - 1e-6);
      }
      // ...while still being work-conserving (Σ slices == cap).
      const sum = Array.from(slices.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(cap, 0);
    }
  });
});

describe('GlobalBandwidthLimiter', () => {
  test('singleton: same instance across lookups (Symbol.for registry)', () => {
    const a = getGlobalBandwidthLimiter();
    const b = getGlobalBandwidthLimiter();
    expect(a).toBe(b);
  });

  test('unlimited (rate<=0): acquire resolves immediately, record is a cheap counter', async () => {
    const l = new GlobalBandwidthLimiter();
    const t0 = Date.now();
    await l.acquire();
    l.record(50 * 1048576);
    await l.acquire();
    expect(Date.now() - t0).toBeLessThan(50);
    expect(l.getSnapshot().unlimited).toBe(true);
    expect(l.getSnapshot().totalBytes).toBe(50 * 1048576);
  });

  test('debt model: recording a burst makes the next acquire wait ~debt/rate', async () => {
    const l = new GlobalBandwidthLimiter();
    l.setRateBytesPerSec(1 * 1048576); // 1 MB/s
    await l.acquire();                  // bucket starts empty (no debt) — immediate
    l.record(0.5 * 1048576);            // 0.5 MB of debt beyond the empty bucket
    const t0 = Date.now();
    await l.acquire();
    const waited = Date.now() - t0;
    // Expect ~500ms (±250ms slack for CI timers)
    expect(waited).toBeGreaterThanOrEqual(250);
    expect(waited).toBeLessThan(1200);
  });

  test('average rate converges to the cap under sustained recording', async () => {
    const l = new GlobalBandwidthLimiter();
    const RATE = 2 * 1048576; // 2 MB/s
    l.setRateBytesPerSec(RATE);
    const DOC = 256 * 1024;   // 256KB docs
    const t0 = Date.now();
    let bytes = 0;
    // 12 docs = 3MB at 2MB/s should take >= ~1s (allowing the 1s burst capacity)
    for (let i = 0; i < 12; i++) {
      await l.acquire();
      l.record(DOC);
      bytes += DOC;
    }
    const elapsedS = (Date.now() - t0) / 1000;
    const avg = bytes / elapsedS;
    // Average must not exceed cap + burst allowance (1s of rate spread over the run)
    const maxAllowed = RATE * (1 + 1 / Math.max(1, elapsedS));
    expect(avg).toBeLessThanOrEqual(maxAllowed * 1.15); // 15% timer slack
  }, 15000);

  test('rate change applies immediately (lowering the cap re-clamps surplus)', async () => {
    const l = new GlobalBandwidthLimiter();
    l.setRateBytesPerSec(100 * 1048576);
    l.record(1048576); // tiny debt vs huge rate
    l.setRateBytesPerSec(1048576); // drop to 1 MB/s
    expect(l.getRateBytesPerSec()).toBe(1048576);
    const snap = l.getSnapshot();
    expect(snap.rateMBps).toBeCloseTo(1, 5);
  });

  test('FIFO: concurrent acquirers resolve in order', async () => {
    const l = new GlobalBandwidthLimiter();
    l.setRateBytesPerSec(1048576);
    l.record(300 * 1024); // ~0.3s debt
    const order = [];
    await Promise.all([
      l.acquire().then(() => order.push(1)),
      l.acquire().then(() => order.push(2)),
      l.acquire().then(() => order.push(3))
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
