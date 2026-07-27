const mockSleep = jest.fn(() => Promise.resolve());
let mockNowValue = 0;

jest.mock('../utils', () => {
  const actual = jest.requireActual('../utils');
  return {
    ...actual,
    sleep: (...args) => mockSleep(...args),
    nowMs: () => mockNowValue
  };
});

const { DomainThrottleManager } = require('../DomainThrottleManager');
const { CrawlerState } = require('../CrawlerState');

describe('DomainThrottleManager', () => {
  let upsertDomain;
  let manager;
  let randomSpy;
  const createManager = (overrides = {}) => new DomainThrottleManager({
    state: new CrawlerState(),
    pacerJitterMinMs: 10,
    pacerJitterMaxMs: 20,
    getDbAdapter: () => ({
      isEnabled: () => true,
      upsertDomain
    }),
    ...overrides
  });

  beforeEach(() => {
    mockSleep.mockClear();
    mockNowValue = 10_000;
    upsertDomain = jest.fn();
    manager = createManager({ limiterFactory: () => null });
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy?.mockRestore();
  });

  describe('fallback throttling', () => {
    it('updates state and persists when a 429 is noted', () => {
      manager.note429('example.com', 30_000);

      const state = manager.getDomainState('example.com');
      expect(state.isLimited).toBe(true);
      expect(state.err429Streak).toBe(1);
      expect(state.backoffUntil).toBeGreaterThan(mockNowValue);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(upsertDomain.mock.calls[0][1]);
      expect(payload.isLimited).toBe(true);
      expect(payload.err429Streak).toBe(1);
      expect(payload.lastHttpStatus).toBe(429);
    });

    it('increments success streaks and persists on success', () => {
      const state = manager.getDomainState('example.com');
      state.isLimited = true;
      state.successStreak = 150;
      state.last429At = mockNowValue - (6 * 60 * 1000);

      manager.noteSuccess('example.com');

      expect(state.err429Streak).toBe(0);
      expect(state.successStreak).toBe(0); // reset after probe
      expect(state.rpm).toBeGreaterThanOrEqual(1);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
    });

    it('waits for backoff during token acquisition and persists state', async () => {
      const state = manager.getDomainState('example.com');
      state.backoffUntil = mockNowValue + 500;

      await manager.acquireToken('example.com');

      expect(mockSleep).toHaveBeenCalledWith(500);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
      expect(state.lastRequestAt).toBe(mockNowValue);
    });

    it('applies robots crawl-delay as a per-host floor without rate-limit state', async () => {
      manager.setRobotsCrawlDelay('example.com', 2, { source: 'robots:cache-hit' });
      upsertDomain.mockClear();

      await manager.acquireToken('example.com');
      mockNowValue += 500;
      await manager.acquireToken('example.com');

      const state = manager.getDomainState('example.com');
      expect(mockSleep).toHaveBeenCalledWith(1500);
      expect(state.politenessFloorMs).toBe(2000);
      expect(state.politenessSource).toBe('robots:cache-hit');
      expect(state.crawlDelaySeconds).toBe(2);
      expect(state.nextRequestAt).toBe(mockNowValue + 2000);
    });

    it('does not let success recovery raise rpm beyond the robots floor', () => {
      const state = manager.getDomainState('example.com');
      manager.setRobotsCrawlDelay('example.com', 3, { source: 'robots:network' });
      state.isLimited = true;
      state.rpm = 10;
      state.successStreak = 150;
      state.last429At = mockNowValue - (6 * 60 * 1000);

      manager.noteSuccess('example.com');

      expect(state.rpm).toBeLessThanOrEqual(20);
      expect(state.politenessFloorMs).toBe(3000);
    });

    it('counts + logs LOUDLY when the real limiter is unavailable (distributed-crawl D2a fail-open fix)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(manager.degradedLimiterAcquireFailures).toBe(0);

      await manager.acquireToken('example.com');
      expect(manager.degradedLimiterAcquireFailures).toBe(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/degraded pacing for example\.com/);

      await manager.acquireToken('example.com');
      expect(manager.degradedLimiterAcquireFailures).toBe(2);
      expect(warnSpy).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
    });

    it('a THROWING limiter.acquire also counts + logs (not just a null limiter)', async () => {
      const throwingManager = createManager({
        limiterFactory: () => ({ acquire: () => { throw new Error('boom'); } })
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await throwingManager.acquireToken('example.com');

      expect(throwingManager.degradedLimiterAcquireFailures).toBe(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });

  describe('with limiterFactory', () => {
    let limiter;
    let limiterState;

    beforeEach(() => {
      limiterState = {
        host: 'example.com',
        isLimited: false,
        rpm: 60,
        nextRequestAt: 0,
        backoffUntil: 0,
        lastRequestAt: 0,
        lastSuccessAt: 0,
        last429At: 0,
        successStreak: 0,
        err429Streak: 0,
        rpmLastMinute: 0,
        windowStartedAt: 0,
        windowCount: 0,
        lastHttpStatus: null
      };
      limiter = {
        acquire: jest.fn(async () => {
          limiterState.lastRequestAt = mockNowValue + 123;
        }),
        note429: jest.fn(() => {
          limiterState.isLimited = true;
          limiterState.err429Streak += 1;
          limiterState.last429At = mockNowValue;
          limiterState.backoffUntil = mockNowValue + 2000;
          limiterState.lastHttpStatus = 429;
        }),
        noteSuccess: jest.fn(() => {
          limiterState.successStreak += 1;
          limiterState.err429Streak = 0;
        }),
        getSnapshot: jest.fn(() => ({ ...limiterState }))
      };
      manager = createManager({ limiterFactory: () => limiter });
    });

    it('delegates acquire to limiter and syncs state', async () => {
      await manager.acquireToken('example.com');

      expect(limiter.acquire).toHaveBeenCalledWith('example.com');
      const state = manager.getDomainState('example.com');
      expect(state.lastRequestAt).toBe(mockNowValue + 123);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
    });

    it('delegates note429 to limiter and persists snapshot', () => {
      manager.note429('example.com', 45_000);

      expect(limiter.note429).toHaveBeenCalledWith('example.com', 45_000);
      const state = manager.getDomainState('example.com');
      expect(state.isLimited).toBe(true);
      expect(state.backoffUntil).toBe(mockNowValue + 2000);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
    });

    it('delegates noteSuccess to limiter and persists snapshot', () => {
      manager.noteSuccess('example.com');

      expect(limiter.noteSuccess).toHaveBeenCalledWith('example.com');
      const state = manager.getDomainState('example.com');
      expect(state.successStreak).toBe(1);
      expect(state.err429Streak).toBe(0);
      expect(upsertDomain).toHaveBeenCalledTimes(1);
    });

    it('passes robots crawl-delay floor into the limiter', async () => {
      limiter.setPolitenessFloor = jest.fn(() => ({ ...limiterState }));

      manager.setRobotsCrawlDelay('example.com', 4, { source: 'robots:network' });
      await manager.acquireToken('example.com');

      expect(limiter.setPolitenessFloor).toHaveBeenCalledWith('example.com', 4000, {
        source: 'robots:network',
        crawlDelaySeconds: 4
      });
      expect(limiter.acquire).toHaveBeenCalledWith('example.com');
      const state = manager.getDomainState('example.com');
      expect(state.politenessFloorMs).toBe(4000);
    });
  });
});

// 2026-07-26 (owner decision #2, cycle 14): stored domain_rate_limits rows are honoured
// as a pacing floor. Before this, NOTHING read that table — the presets expressing
// intended politeness (telegraph.co.uk 25 rpm, independent.co.uk 30, aljazeera.com 40)
// were silently ignored and the crawler fetched FASTER than they specify.
describe('DomainThrottleManager stored rate-limit floor', () => {
  const { DomainThrottleManager: DTM } = require('../DomainThrottleManager');

  const build = (provider) => new DTM({
    state: new CrawlerState(),
    getDbAdapter: () => ({ isEnabled: () => false }),
    limiterFactory: () => null,
    storedRateLimitProvider: provider
  });

  describe('host-key normalisation', () => {
    // The table holds rows under BOTH forms; an exact-string lookup missed half of them.
    it('resolves www. and bare forms to the same key', () => {
      expect(DTM.normalizeHostKey('www.telegraph.co.uk')).toBe('telegraph.co.uk');
      expect(DTM.normalizeHostKey('telegraph.co.uk')).toBe('telegraph.co.uk');
      expect(DTM.normalizeHostKey('WWW.Telegraph.CO.UK')).toBe('telegraph.co.uk');
    });

    it('strips only ONE leading www. and leaves other subdomains intact', () => {
      expect(DTM.normalizeHostKey('edition.cnn.com')).toBe('edition.cnn.com');
      expect(DTM.normalizeHostKey('www.www.example.com')).toBe('www.example.com');
    });

    it('looks a stored row up by normalised key when crawling the www. host', async () => {
      const seen = [];
      const m = build((key) => { seen.push(key); return { rpm: 25, source: 'preset' }; });
      await m.acquireToken('www.telegraph.co.uk');
      expect(seen).toEqual(['telegraph.co.uk']);
      expect(m.getDomainState('www.telegraph.co.uk').politenessFloorMs).toBe(2400); // 60000/25
    });
  });

  describe('row -> floor conversion', () => {
    it('prefers an explicit crawl delay over an rpm', () => {
      expect(DTM.storedRowToFloorMs({ crawl_delay_seconds: 10, rpm: 300 })).toBe(10000);
    });
    it('falls back through rpm / safe_rpm / learned_rpm', () => {
      expect(DTM.storedRowToFloorMs({ safe_rpm: 30 })).toBe(2000);
      expect(DTM.storedRowToFloorMs({ learned_rpm: 60 })).toBe(1000);
    });
    it('treats a missing/zero/absent row as no floor', () => {
      expect(DTM.storedRowToFloorMs(null)).toBe(0);
      expect(DTM.storedRowToFloorMs({})).toBe(0);
      expect(DTM.storedRowToFloorMs({ rpm: 0 })).toBe(0);
    });
  });

  describe('floor precedence — the two floors COMBINE by max (more polite wins)', () => {
    it('uses the robots delay when robots is stricter', async () => {
      const m = build(() => ({ rpm: 60 }));          // stored => 1000ms
      m.setRobotsCrawlDelay('example.com', 5);        // robots => 5000ms
      await m.acquireToken('example.com');
      expect(m.getDomainState('example.com').politenessFloorMs).toBe(5000);
    });

    it('uses the STORED limit when it is stricter than robots — we never go faster', async () => {
      const m = build(() => ({ rpm: 25 }));          // stored => 2400ms
      m.setRobotsCrawlDelay('example.com', 1);        // robots => 1000ms
      await m.acquireToken('example.com');
      expect(m.getDomainState('example.com').politenessFloorMs).toBe(2400);
    });

    it('applies the stored limit when robots specifies none', async () => {
      const m = build(() => ({ rpm: 40 }));
      await m.acquireToken('aljazeera.com');
      expect(m.getDomainState('aljazeera.com').politenessFloorMs).toBe(1500);
    });

    it('still honours robots when there is no stored row', async () => {
      const m = build(() => null);
      m.setRobotsCrawlDelay('example.com', 3);
      await m.acquireToken('example.com');
      expect(m.getDomainState('example.com').politenessFloorMs).toBe(3000);
    });
  });

  describe('no-row and no-provider leave behaviour unchanged', () => {
    it('imposes no floor when the host has no stored row', async () => {
      const m = build(() => null);
      await m.acquireToken('abc.net.au');   // measured: genuinely has no row
      expect(m.getDomainState('abc.net.au').politenessFloorMs || 0).toBe(0);
    });

    it('imposes no floor when no provider is injected at all', async () => {
      const m = build(null);
      await m.acquireToken('abc.net.au');
      expect(m.getDomainState('abc.net.au').politenessFloorMs || 0).toBe(0);
    });

    it('does not let a throwing provider break pacing', async () => {
      const m = build(() => { throw new Error('db down'); });
      await expect(m.acquireToken('example.com')).resolves.toBeUndefined();
      expect(m.getDomainState('example.com').politenessFloorMs || 0).toBe(0);
    });

    it('consults the provider once per host, not once per request', async () => {
      const provider = jest.fn(() => ({ rpm: 30 }));
      const m = build(provider);
      await m.acquireToken('www.example.com');
      await m.acquireToken('example.com');
      await m.acquireToken('www.example.com');
      expect(provider).toHaveBeenCalledTimes(1);
    });
  });
});

// Closes the last link: a floor that is merely RECORDED changes nothing. This asserts it
// actually causes a WAIT. `sleep` and `nowMs` are mocked at the top of this file, and
// limiter.js pulls both from the same './utils' module, so the real DomainLimiter's
// pacing sleep is observable here — no crawl and no live-DB write needed.
describe('stored floor actually paces (causes a real wait)', () => {
  const { DomainThrottleManager: DTM } = require('../DomainThrottleManager');

  it('does NOT wait for a host with no stored row and no 429 history', async () => {
    const m = new DTM({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      storedRateLimitProvider: () => null
    });
    mockSleep.mockClear();
    await m.acquireToken('abc.net.au');
    await m.acquireToken('abc.net.au');
    // limiter.js:50-53 early-returns with zero delay — this is why `rpm: 30` was inert.
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('waits ~the stored floor between consecutive fetches once a row exists', async () => {
    const m = new DTM({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      storedRateLimitProvider: () => ({ safe_rpm: 25, source: 'preset' })  // => 2400ms
    });
    await m.acquireToken('telegraph.co.uk');   // first: nothing to wait for
    mockSleep.mockClear();
    await m.acquireToken('telegraph.co.uk');   // second: must be held back by the floor
    expect(mockSleep).toHaveBeenCalledTimes(1);
    const waited = mockSleep.mock.calls[0][0];
    // 2400ms floor + 10-20ms jitter (pacerJitter bounds are not set here, so allow a band)
    expect(waited).toBeGreaterThanOrEqual(2400);
    expect(waited).toBeLessThan(2600);
  });

  it('waits the ROBOTS delay when it is stricter than the stored row', async () => {
    const m = new DTM({
      state: new CrawlerState(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      storedRateLimitProvider: () => ({ safe_rpm: 60 })   // 1000ms
    });
    m.setRobotsCrawlDelay('example.com', 4);              // 4000ms — stricter, must win
    await m.acquireToken('example.com');
    mockSleep.mockClear();
    await m.acquireToken('example.com');
    expect(mockSleep.mock.calls[0][0]).toBeGreaterThanOrEqual(4000);
  });
});

// Guard for the 2026-07-26 owner-approved default change (concurrency 1 -> 3).
// Recorded here so a future refactor cannot silently revert it: the value is backed by
// 2.88x on the offline fixture AND zero 429/403/503 across 3,419 live responses at
// exactly this setting. Reverting to 1 gives back a measured ~3x of crawl throughput.
describe('NewsCrawler concurrency default (owner-approved 2026-07-26)', () => {
  it('defaults to 3, not 1', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'NewsCrawler.js'), 'utf8');
    const m = /concurrency:\s*\{\s*type:\s*'number',\s*default:\s*(\d+)/.exec(src);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBe(3);
  });
});
