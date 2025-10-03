'use strict';

jest.mock('../../data/placeHubs', () => ({
  recordPlaceHubSeed: jest.fn(() => true)
}));

const { recordPlaceHubSeed } = require('../../data/placeHubs');
const { HubSeeder } = require('../HubSeeder');

describe('HubSeeder', () => {
  beforeEach(() => {
    recordPlaceHubSeed.mockClear();
  });

  test('annotates seeded hubs with metadata and priority', async () => {
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
      maxSeeds: 5
    });

    expect(enqueueRequest).toHaveBeenCalledTimes(2);
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
        priorityBias: -5
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

    expect(recordPlaceHubSeed).toHaveBeenCalledTimes(2);

    const payloads = recordPlaceHubSeed.mock.calls.map(([, payload]) => payload);
    const sectionSeed = payloads.find((payload) => payload.evidence?.kind === 'section');
    const countrySeed = payloads.find((payload) => payload.evidence?.kind === 'country');

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
  });
});
