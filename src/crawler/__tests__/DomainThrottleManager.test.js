const mockSleep = jest.fn(() => Promise.resolve());
let mockNowValue = 0;

jest.mock('../utils', () => ({
  sleep: (...args) => mockSleep(...args),
  nowMs: () => mockNowValue
}));

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
        windowCount: 0
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
  });
});
