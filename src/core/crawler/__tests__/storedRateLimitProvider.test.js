'use strict';

/**
 * Guards the SEAM between the crawler's DB adapter and the stored rate-limit lookup.
 *
 * Cycle 14 shipped this logic with 14 passing unit tests and it still did NOTHING live:
 * every one of those tests injected a FAKE provider, so none exercised the real adapter,
 * and `crawler.dbAdapter.db` turned out to be a NewsDatabase rather than a better-sqlite3
 * handle. These tests build a REAL adapter via createCrawlerDb() against a temp DB — the
 * one thing that would have caught it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveSqliteHandle, createStoredRateLimitProvider } = require('../storedRateLimitProvider');
const { DomainThrottleManager } = require('../DomainThrottleManager');
const { createCrawlerDb } = require('../dbClient');

describe('resolveSqliteHandle', () => {
  const fakeHandle = { prepare: () => ({ get: () => null }) };

  it('unwraps adapter -> .db -> .db (the real CrawlerDb -> NewsDatabase -> sqlite chain)', () => {
    expect(resolveSqliteHandle({ db: { db: fakeHandle } })).toBe(fakeHandle);
  });

  it('accepts a handle one level in, or passed directly', () => {
    expect(resolveSqliteHandle({ db: fakeHandle })).toBe(fakeHandle);
    expect(resolveSqliteHandle(fakeHandle)).toBe(fakeHandle);
  });

  it('returns null rather than a non-queryable object — the cycle-14 failure', () => {
    // A NewsDatabase-shaped wrapper with no `prepare` must NOT be treated as a handle.
    expect(resolveSqliteHandle({ db: { getFetchCount: () => 0 } })).toBeNull();
    expect(resolveSqliteHandle(null)).toBeNull();
    expect(resolveSqliteHandle({})).toBeNull();
  });
});

describe('createStoredRateLimitProvider against a REAL createCrawlerDb adapter', () => {
  let dir; let dbPath; let adapter; let handle;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srlp-'));
    dbPath = path.join(dir, 'test.db');
    adapter = createCrawlerDb({ dbPath, fastStart: true, domain: 'example.com' });
    await adapter.init();
    handle = resolveSqliteHandle(adapter);
    if (handle) {
      handle.prepare(`CREATE TABLE IF NOT EXISTS domain_rate_limits (
        domain TEXT PRIMARY KEY, learned_rpm INTEGER, safe_rpm INTEGER,
        crawl_delay_seconds REAL, source TEXT)`).run();
      const ins = handle.prepare(
        'INSERT OR REPLACE INTO domain_rate_limits (domain, learned_rpm, safe_rpm, crawl_delay_seconds, source) VALUES (?,?,?,?,?)'
      );
      ins.run('telegraph.co.uk', 25, 25, null, 'preset');   // bare form, as really stored
      ins.run('www.irishtimes.com', 300, null, null, 'learned'); // www form, as really stored
      ins.run('slowpoke.example', null, null, 10, 'robots');
    }
  });

  afterAll(() => {
    try { adapter && adapter.close && adapter.close(); } catch (_) { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  // THE regression guard: if the adapter shape changes again, this fails loudly.
  it('resolves a queryable handle from the real adapter', () => {
    expect(handle).not.toBeNull();
    expect(typeof handle.prepare).toBe('function');
  });

  it('finds a row stored in BARE form when the crawler normalises a www. host', () => {
    const provider = createStoredRateLimitProvider(() => adapter);
    const key = DomainThrottleManager.normalizeHostKey('www.telegraph.co.uk');
    const row = provider(key);
    expect(row).toBeTruthy();
    expect(DomainThrottleManager.storedRowToFloorMs(row)).toBe(2400); // 60000/25
  });

  it('finds a row stored in WWW form for the same normalised key', () => {
    const provider = createStoredRateLimitProvider(() => adapter);
    const row = provider(DomainThrottleManager.normalizeHostKey('www.irishtimes.com'));
    expect(row).toBeTruthy();
    expect(DomainThrottleManager.storedRowToFloorMs(row)).toBe(200); // 60000/300
  });

  it('prefers an explicit crawl delay over rpm', () => {
    const provider = createStoredRateLimitProvider(() => adapter);
    expect(DomainThrottleManager.storedRowToFloorMs(provider('slowpoke.example'))).toBe(10000);
  });

  it('returns null for a host with no row (must not invent a floor)', () => {
    const provider = createStoredRateLimitProvider(() => adapter);
    expect(provider(DomainThrottleManager.normalizeHostKey('www.abc.net.au'))).toBeNull();
  });

  it('returns null (never throws) when the adapter cannot query — safe failure mode', () => {
    expect(createStoredRateLimitProvider(() => null)('telegraph.co.uk')).toBeNull();
    expect(createStoredRateLimitProvider(() => ({ db: {} }))('telegraph.co.uk')).toBeNull();
    expect(createStoredRateLimitProvider(() => { throw new Error('boom'); })('telegraph.co.uk')).toBeNull();
  });

  // End-to-end through the throttle manager: a real adapter must produce a real floor.
  it('applies the stored floor end-to-end via DomainThrottleManager', async () => {
    const { CrawlerState } = require('../CrawlerState');
    const manager = new DomainThrottleManager({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      limiterFactory: () => null,
      storedRateLimitProvider: createStoredRateLimitProvider(() => adapter)
    });
    await manager.acquireToken('www.telegraph.co.uk');
    expect(manager.getDomainState('www.telegraph.co.uk').politenessFloorMs).toBe(2400);
  });

  // The test above passes `limiterFactory: () => null`, which exercises the DEGRADED
  // cached-state path. Production builds a real DomainLimiter, and that is the path that
  // actually paces fetches — `limiter.acquire()` returns immediately unless
  // politenessFloorMs > 0 (limiter.js:50-53). Assert the floor reaches the REAL limiter,
  // otherwise the whole feature is inert exactly as it was in cycle 14.
  it('pushes the stored floor into the REAL DomainLimiter (the path that paces production)', async () => {
    const { CrawlerState } = require('../CrawlerState');
    const manager = new DomainThrottleManager({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      storedRateLimitProvider: createStoredRateLimitProvider(() => adapter)
    });
    await manager.acquireToken('www.telegraph.co.uk');
    const limiter = manager._ensureLimiter();
    expect(limiter).toBeTruthy();
    const snap = limiter.getSnapshot('www.telegraph.co.uk');
    expect(snap.politenessFloorMs).toBe(2400);
    // limiter.js:50-53 early-returns with NO delay while the floor is 0; a non-zero floor
    // is precisely what re-enables pacing for a host that has never returned a 429.
    expect(snap.politenessFloorMs).toBeGreaterThan(0);
  });

  it('leaves a no-row host unpaced in the REAL limiter (no invented floor)', async () => {
    const { CrawlerState } = require('../CrawlerState');
    const manager = new DomainThrottleManager({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      storedRateLimitProvider: createStoredRateLimitProvider(() => adapter)
    });
    await manager.acquireToken('www.abc.net.au');
    expect(manager._ensureLimiter().getSnapshot('www.abc.net.au').politenessFloorMs || 0).toBe(0);
  });
});
