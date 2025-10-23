'use strict';

jest.mock('../../data/placeHubs', () => ({
  recordPlaceHubSeed: jest.fn(() => true)
}));

jest.mock('../../../utils/priorityConfig', () => ({
  isTotalPrioritisationEnabled: jest.fn(() => false)
}));

const { recordPlaceHubSeed } = require('../../data/placeHubs');
const { isTotalPrioritisationEnabled } = require('../../../utils/priorityConfig');
const { HubSeeder } = require('../HubSeeder');

describe('HubSeeder', () => {
  beforeEach(() => {
    recordPlaceHubSeed.mockClear();
    isTotalPrioritisationEnabled.mockClear();
    isTotalPrioritisationEnabled.mockReturnValue(false);
  });

  test('annotates seeded hubs with metadata and priority when total prioritisation disabled', async () => {
    const enqueueRequest = jest.fn(() => true);
    const addSeededHub = jest.fn();
    const seeder = new HubSeeder({
      enqueueRequest,
      normalizeUrl: (url) => url.toLowerCase(),
      state: {
        addSeededHub,
        hasSeededHub: () => false,
        hasVisited: () => false
      },
      telemetry: {
        milestone: jest.fn(),
        problem: jest.fn()
      },
      db: {},
      baseUrl: 'https://example.com'
    });

    await seeder.seedPlan({
      host: 'example.com',
      sectionSlugs: ['World'],
      countryCandidates: [
        {
          url: 'https://example.com/world/france',
          reason: 'country-candidate',
          source: 'country-planner'
        }
      ],
      navigationLinks: [
        {
          url: 'https://example.com/opinion/',
          labels: ['Opinion'],
          type: 'primary',
          occurrences: 4
        }
      ],
      maxSeeds: 5
    });

    expect(enqueueRequest).toHaveBeenCalledTimes(3);
    expect(enqueueRequest).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.objectContaining({
        kind: 'hub-seed',
        hubKind: 'section'
      })
    }));
    expect(enqueueRequest).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.objectContaining({
        kind: 'hub-seed',
        hubKind: 'country',
        priorityBias: 20
      })
    }));
    expect(enqueueRequest).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.objectContaining({
        kind: 'hub-seed',
        hubKind: 'navigation',
        source: 'navigation-discovery'
      })
    }));

    expect(addSeededHub).toHaveBeenCalledWith(
      'https://example.com/world/',
      expect.objectContaining({
        kind: 'section',
        source: 'pattern-inference',
        reason: 'pattern-section'
      })
    );
    expect(addSeededHub).toHaveBeenCalledWith(
      'https://example.com/world/france',
      expect.objectContaining({
        kind: 'country',
        source: 'country-planner',
        reason: 'country-candidate'
      })
    );
    expect(addSeededHub).toHaveBeenCalledWith(
      'https://example.com/opinion/',
      expect.objectContaining({
        kind: 'navigation',
        source: 'navigation-discovery',
        reason: 'nav-primary'
      })
    );

    expect(recordPlaceHubSeed).toHaveBeenCalledTimes(3);

    const payloads = recordPlaceHubSeed.mock.calls.map(([, payload]) => payload);
    const sectionSeed = payloads.find((payload) => payload.evidence?.kind === 'section');
    const countrySeed = payloads.find((payload) => payload.evidence?.kind === 'country');
    const navigationSeed = payloads.find((payload) => payload.evidence?.kind === 'navigation');

    expect(sectionSeed).toMatchObject({
      host: 'example.com',
      evidence: {
        reason: 'pattern-section',
        source: 'pattern-inference'
      }
    });
    expect(sectionSeed.url).toBe('https://example.com/World/');

    expect(countrySeed).toMatchObject({
      host: 'example.com',
      url: 'https://example.com/world/france',
      evidence: {
        reason: 'country-candidate',
        source: 'country-planner'
      }
    });

    expect(navigationSeed).toMatchObject({
      host: 'example.com',
      url: 'https://example.com/opinion/',
      evidence: {
        reason: 'nav-primary',
        source: 'navigation-discovery'
      }
    });
  });

  test('only seeds country hubs when total prioritisation is enabled', async () => {
    isTotalPrioritisationEnabled.mockReturnValue(true);

    const enqueueRequest = jest.fn(() => true);
    const addSeededHub = jest.fn();
    const seeder = new HubSeeder({
      enqueueRequest,
      normalizeUrl: (url) => url.toLowerCase(),
      state: {
        addSeededHub,
        hasSeededHub: () => false,
        hasVisited: () => false
      },
      telemetry: {
        milestone: jest.fn(),
        problem: jest.fn()
      },
      db: {},
      baseUrl: 'https://example.com'
    });

    const result = await seeder.seedPlan({
      host: 'example.com',
      sectionSlugs: ['World'],
      countryCandidates: [
        {
          url: 'https://example.com/world/france',
          reason: 'country-candidate',
          source: 'country-planner'
        },
        {
          url: 'https://example.com/world/germany',
          reason: 'country-candidate',
          source: 'country-planner'
        }
      ],
      navigationLinks: [
        {
          url: 'https://example.com/opinion/',
          labels: ['Opinion'],
          type: 'primary',
          occurrences: 4
        }
      ],
      maxSeeds: 1
    });

    expect(enqueueRequest).toHaveBeenCalledTimes(2);
    for (const call of enqueueRequest.mock.calls) {
      expect(call[0].type).toMatchObject({
        kind: 'hub-seed',
        hubKind: 'country'
      });
    }

    expect(addSeededHub).toHaveBeenCalledTimes(2);
    expect(addSeededHub).not.toHaveBeenCalledWith(
      'https://example.com/world/',
      expect.objectContaining({ kind: 'section' })
    );

    expect(recordPlaceHubSeed).toHaveBeenCalledTimes(2);
    const recordedKinds = recordPlaceHubSeed.mock.calls.map(([, payload]) => payload.evidence?.kind);
    expect(new Set(recordedKinds)).toEqual(new Set(['country']));

    expect(result).toMatchObject({
      sectionHubCount: 0,
      navigationCandidateCount: 0,
      requestedCount: 2,
      seededCount: 2
    });
  });
});
