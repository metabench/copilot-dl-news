'use strict';

/**
 * GlobalBandwidthLimiter — a process-wide download-rate cap (bytes/sec) shared
 * by every crawl job in this process.
 *
 * Why process-wide: crawl jobs run in-process (operations/facadeUtils.js builds
 * NewsCrawler instances inside the server process), so N concurrent jobs share
 * this one bucket and the cap holds for the AGGREGATE download rate — the thing
 * an owner actually wants bounded (e.g. "stay under my 5G link's budget") —
 * rather than per-job slices that over- or under-shoot as jobs come and go.
 * The singleton lives in the Symbol.for global registry so duplicate module
 * loads (jest, odd require paths) still converge on one bucket.
 *
 * Model: post-paid token bucket. acquire() is awaited before each network
 * fetch and only waits while the bucket is in debt; record(bytes) subtracts
 * the bytes actually downloaded (uncompressed — the same units as
 * http_responses.bytes_downloaded and every MB figure in the UI, so the cap,
 * the DB and the dashboards all agree; on-wire compressed usage will sit
 * BELOW the cap, which is the safe direction for a metered link). Post-paid
 * beats pre-paid here because the size isn't known until the body is read;
 * with ~300KB docs the overshoot per doc is small and the average converges
 * to the configured rate.
 *
 * Fairness: acquire() waiters are chained FIFO so twenty concurrent jobs
 * drain the debt one at a time instead of racing the same refill.
 *
 * rate <= 0 disables the limiter entirely (acquire/record become no-ops).
 */

const GLOBAL_KEY = Symbol.for('copilot.crawler.globalBandwidthLimiter');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GlobalBandwidthLimiter {
  constructor() {
    this._rateBytesPerSec = 0;          // 0 = unlimited (off)
    this._tokens = 0;                    // bytes available; negative = debt
    this._capacity = 0;                  // burst allowance (1s of rate)
    this._lastRefillAt = Date.now();
    this._queue = Promise.resolve();     // FIFO waiter chain
    // Observability
    this._totalBytes = 0;
    this._totalWaitMs = 0;
    this._startedAt = Date.now();
    this._rateListeners = [];
  }

  setRateBytesPerSec(rate) {
    const r = Number(rate);
    this._refill();
    this._rateBytesPerSec = Number.isFinite(r) && r > 0 ? r : 0;
    this._capacity = this._rateBytesPerSec;      // 1 second of burst
    // Re-clamp tokens into the new envelope so a rate drop takes effect
    // immediately instead of spending a large stale surplus.
    if (this._tokens > this._capacity) this._tokens = this._capacity;
    for (const fn of this._rateListeners) {
      try { fn(this._rateBytesPerSec); } catch (_) { /* listener errors are theirs */ }
    }
  }

  /**
   * Subscribe to rate changes (used by the worker-mode job registry to
   * rebalance per-worker slices when the cap is changed at runtime).
   */
  onRateChange(fn) {
    if (typeof fn === 'function') this._rateListeners.push(fn);
    return () => {
      const i = this._rateListeners.indexOf(fn);
      if (i >= 0) this._rateListeners.splice(i, 1);
    };
  }

  getRateBytesPerSec() {
    return this._rateBytesPerSec;
  }

  _refill() {
    const now = Date.now();
    const dtSec = Math.max(0, (now - this._lastRefillAt) / 1000);
    this._lastRefillAt = now;
    if (this._rateBytesPerSec > 0 && dtSec > 0) {
      this._tokens = Math.min(this._capacity, this._tokens + dtSec * this._rateBytesPerSec);
    }
  }

  /**
   * Await before a network fetch. Resolves immediately when unlimited or when
   * the bucket is not in debt; otherwise waits exactly long enough for the
   * refill to clear the debt. FIFO across all concurrent jobs.
   */
  acquire() {
    if (this._rateBytesPerSec <= 0) return Promise.resolve();
    const turn = this._queue.then(async () => {
      this._refill();
      if (this._tokens < 0 && this._rateBytesPerSec > 0) {
        const waitMs = Math.ceil((-this._tokens / this._rateBytesPerSec) * 1000);
        this._totalWaitMs += waitMs;
        await sleep(waitMs);
        this._refill();
      }
    });
    // Keep the chain alive even if a waiter's caller drops the promise.
    this._queue = turn.catch(() => {});
    return turn;
  }

  /** Record bytes actually downloaded (call once per response body). */
  record(bytes) {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b <= 0) return;
    this._totalBytes += b;
    if (this._rateBytesPerSec <= 0) return;
    this._refill();
    this._tokens -= b;
  }

  getSnapshot() {
    this._refill();
    const upSec = Math.max(1, (Date.now() - this._startedAt) / 1000);
    return {
      rateBytesPerSec: this._rateBytesPerSec,
      rateMBps: this._rateBytesPerSec / 1048576,
      unlimited: this._rateBytesPerSec <= 0,
      debtBytes: this._tokens < 0 ? -this._tokens : 0,
      totalBytes: this._totalBytes,
      totalWaitMs: this._totalWaitMs,
      lifetimeAvgBytesPerSec: this._totalBytes / upSec
    };
  }

  /** Test hook: reset counters/state without replacing the singleton. */
  _reset() {
    this._rateBytesPerSec = 0;
    this._tokens = 0;
    this._capacity = 0;
    this._lastRefillAt = Date.now();
    this._queue = Promise.resolve();
    this._totalBytes = 0;
    this._totalWaitMs = 0;
    this._startedAt = Date.now();
  }
}

function getGlobalBandwidthLimiter() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new GlobalBandwidthLimiter();
  }
  return globalThis[GLOBAL_KEY];
}

/**
 * Work-conserving division of a global byte-rate cap into per-worker slices.
 *
 * Equal slices (cap/N) guarantee the cap but strand budget: a worker stuck in
 * discovery (robots/sitemaps, slow host) leaves its slice unused while a
 * supplied worker sits throttled. Demand-aware slices hold the AGGREGATE close
 * to the cap with certainty in both directions:
 *   - each worker's demand = its observed recent rate × 1.6 headroom (so a
 *     worker whose host speeds up can ramp without waiting a full rebalance
 *     cycle), floored so brand-new/quiet workers can always start moving;
 *   - if total demand fits the cap, the surplus is spread equally on top
 *     (Σ slices == cap, nothing stranded);
 *   - if demand exceeds the cap, every worker first keeps its floor and only
 *     the remainder splits in proportion to demand-above-floor (Σ == cap), so
 *     a low-demand worker is never scaled below the floor it was promised.
 * Fluctuating network conditions are absorbed by the next cycle: rates are
 * observed, not assumed, so slices follow reality rather than a plan.
 *
 * @param {number} capBytesPerSec  global cap (<=0 = unlimited -> everyone 0)
 * @param {Array<{id: string, bytesPerSec: number}>} workers observed rates
 * @returns {Map<string, number>} id -> slice (bytes/sec; 0 means unlimited)
 */
function computeDemandSlices(capBytesPerSec, workers) {
  const out = new Map();
  const list = Array.isArray(workers) ? workers.filter((w) => w && w.id != null) : [];
  if (!list.length) return out;
  const cap = Number(capBytesPerSec);
  if (!Number.isFinite(cap) || cap <= 0) {
    for (const w of list) out.set(w.id, 0);
    return out;
  }
  const HEADROOM = 1.6;
  const floor = Math.min(cap / list.length, Math.max(8 * 1024, cap * 0.02));
  const demands = list.map((w) => Math.max(floor, (Number(w.bytesPerSec) || 0) * HEADROOM));
  const total = demands.reduce((a, b) => a + b, 0);
  if (total <= cap) {
    const surplus = (cap - total) / list.length;
    list.forEach((w, i) => out.set(w.id, demands[i] + surplus));
  } else {
    // Oversubscribed. Bare proportional scaling (cap·demand/total) ignores the
    // floor: a floor-level demander among a few heavy workers collapses to a
    // few KB/s — far under `floor` — and a worker that can't clear a ~1.3MB page
    // inside its slice reports ~0 rate, stays at floor demand, and stays starved
    // (a self-reinforcing loop). So guarantee the floor first, then split only
    // the remainder in proportion to each worker's demand-above-floor. This is
    // always feasible because floor <= cap/N ⟹ floor·N <= cap, and Σ slices
    // still equals cap.
    const remainder = cap - floor * list.length;   // >= 0
    const excess = demands.map((d) => d - floor);   // >= 0
    const excessTotal = excess.reduce((a, b) => a + b, 0);
    if (excessTotal > 0) {
      list.forEach((w, i) => out.set(w.id, floor + remainder * (excess[i] / excessTotal)));
    } else {
      // Unreachable in practice (oversubscription requires some demand above
      // floor), but keep Σ == cap and every slice >= floor if it ever happens.
      list.forEach((w) => out.set(w.id, cap / list.length));
    }
  }
  return out;
}

module.exports = { GlobalBandwidthLimiter, getGlobalBandwidthLimiter, computeDemandSlices };
