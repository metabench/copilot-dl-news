'use strict';

const { HubSeeder } = require('../HubSeeder');

describe('HubSeeder', () => {
  const buildDbStub = () => ({
    db: {
      prepare: jest.fn(() => ({
        run: jest.fn()
      }))
    }
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
      db: buildDbStub(),
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
  });
});
