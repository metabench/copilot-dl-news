'use strict';

const { AdaptiveSeedPlanner } = require('../planner/AdaptiveSeedPlanner');

describe('AdaptiveSeedPlanner', () => {
  const buildState = () => {
    const seededHubs = new Set();
    const historySeeds = new Set();
    const visited = new Set();
    return {
      seededHubs,
      historySeeds,
      visited,
      hasSeededHub: (normalized) => seededHubs.has(normalized),
      addSeededHub: (normalized) => seededHubs.add(normalized),
      hasHistorySeed: (normalized) => historySeeds.has(normalized),
      addHistorySeed: (normalized) => historySeeds.add(normalized),
      hasVisited: (normalized) => visited.has(normalized)
    };
  };

  const buildPlanner = (overrides = {}) => {
    const state = overrides.state || buildState();
    const telemetry = overrides.telemetry || { milestoneOnce: jest.fn() };
    const enqueueRequest = overrides.enqueueRequest || jest.fn(() => true);
    const normalizeUrl = overrides.normalizeUrl || ((url) => url);
    const planner = new AdaptiveSeedPlanner({
      baseUrl: overrides.baseUrl || 'https://example.com',
      state,
      telemetry,
      normalizeUrl,
      enqueueRequest,
      logger: overrides.logger || {
        warn: jest.fn(),
        debug: jest.fn()
      }
    });
    return {
      planner,
      state,
      telemetry,
      enqueueRequest
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('seeds hub candidates from metadata and path', () => {
    const { planner, state, telemetry, enqueueRequest } = buildPlanner();

    const result = planner.seedFromArticle({
      url: 'https://example.com/politics/latest-story',
      metadata: {
        section: 'Politics'
      },
      depth: 3
    });

    expect(result.seededHubs).toBeGreaterThan(0);
    expect(enqueueRequest).toHaveBeenCalled();
    const payloads = enqueueRequest.mock.calls.map(([payload]) => payload);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: expect.objectContaining({
            kind: 'hub-seed'
          })
        })
      ])
    );
    expect(state.hasSeededHub('https://example.com/politics/')).toBe(true);
    expect(telemetry.milestoneOnce).toHaveBeenCalledWith(
      expect.stringContaining('adaptive-hub:'),
      expect.objectContaining({
        kind: 'adaptive-hub-seeded'
      })
    );
  });

  test('adds history seeds when URL follows archive pattern', () => {
    const { planner, state, enqueueRequest } = buildPlanner();

    const result = planner.seedFromArticle({
      url: 'https://example.com/culture/2024/05/20/deep-dive',
      metadata: {},
      depth: 4
    });

    expect(result.historySeeds).toBe(2); // year + month
    const calls = enqueueRequest.mock.calls.map(([payload]) => payload);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://example.com/culture/2024/05/',
          type: expect.objectContaining({ kind: 'history' }),
          depth: 3
        }),
        expect.objectContaining({
          url: 'https://example.com/culture/2024/',
          type: expect.objectContaining({ kind: 'history' })
        })
      ])
    );
    expect(state.hasHistorySeed('https://example.com/culture/2024/')).toBe(true);
    expect(state.hasHistorySeed('https://example.com/culture/2024/05/')).toBe(true);
  });

  test('skips candidates already seeded or visited', () => {
    const state = buildState();
    state.seededHubs.add('https://example.com/news/');
    state.historySeeds.add('https://example.com/news/2023/');
    state.visited.add('https://example.com/news/2023/05/');

    const enqueueRequest = jest.fn(() => true);
    const { planner } = buildPlanner({ state, enqueueRequest });

    const result = planner.seedFromArticle({
      url: 'https://example.com/news/2023/05/archive-story',
      metadata: { section: 'news' },
      depth: 2
    });

    expect(result.seededHubs).toBe(0);
    expect(result.historySeeds).toBe(0);
    expect(enqueueRequest).not.toHaveBeenCalled();
  });
});
