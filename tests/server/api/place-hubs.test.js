'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../../src/orchestration/placeHubGuessing', () => ({
  guessPlaceHubsBatch: jest.fn(),
  checkDomainReadiness: jest.fn()
}));

jest.mock('../../../src/orchestration/dependencies', () => ({
  createPlaceHubDependencies: jest.fn()
}));

const {
  guessPlaceHubsBatch,
  checkDomainReadiness
} = require('../../../src/orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../../../src/orchestration/dependencies');
const { createPlaceHubsRouter } = require('../../../src/api/routes/place-hubs');

function createApp(options = {}) {
  const router = createPlaceHubsRouter({
    dbPath: options.dbPath || 'c:/data/news.db',
    verbose: options.verbose
  });
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe('place hubs router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createPlaceHubDependencies.mockReturnValue({ dependencies: true });
  });

  test('throws when dbPath is missing', () => {
    expect(() => createPlaceHubsRouter()).toThrow('Database path is required');
  });

  test('POST /guess validates domains payload', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/guess')
      .send({ domains: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
    expect(guessPlaceHubsBatch).not.toHaveBeenCalled();
  });

  test('POST /guess returns 501 for large batches', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/guess')
      .send({ domains: ['a.com', 'b.com', 'c.com', 'd.com'] });

    expect(response.status).toBe(501);
    expect(response.body.error).toBe('NOT_IMPLEMENTED');
    expect(createPlaceHubDependencies).not.toHaveBeenCalled();
    expect(guessPlaceHubsBatch).not.toHaveBeenCalled();
  });

  test('POST /guess processes valid domains synchronously', async () => {
    const aggregate = {
      startedAt: '2025-11-10T00:00:00.000Z',
      completedAt: '2025-11-10T00:00:01.000Z',
      durationMs: 1000,
      batch: {
        totalDomains: 2,
        processedDomains: 2
      },
      totalPlaces: 5,
      totalUrls: 10,
      fetched: 6,
      cached: 4,
      validationSucceeded: 5,
      validationFailed: 1,
      insertedHubs: 3,
      updatedHubs: 1,
      errors: 0,
      rateLimited: 0,
      skipped: 0,
      skippedRecent4xx: 0,
      skippedDuplicatePlace: 0,
      stored404: 0,
      diffPreview: {
        inserted: [{ domain: 'a.com' }],
        updated: []
      },
      domainSummaries: [
        {
          domain: 'a.com',
          error: null,
          readiness: { status: 'ready' },
          diffPreview: { inserted: [], updated: [] },
          summary: {
            totalPlaces: 3,
            totalUrls: 5,
            fetched: 3,
            cached: 2,
            validationSucceeded: 3,
            validationFailed: 0,
            insertedHubs: 2,
            updatedHubs: 1,
            startedAt: '2025-11-10T00:00:00.000Z',
            completedAt: '2025-11-10T00:00:01.000Z',
            durationMs: 1000,
            validationFailureReasons: {}
          }
        }
      ]
    };

    guessPlaceHubsBatch.mockResolvedValue({ aggregate });

    const app = createApp({ verbose: true });

    const response = await request(app)
      .post('/guess')
      .send({ domains: ['example.com'], options: { kinds: ['country'], limit: 5 } });

    expect(response.status).toBe(200);
    expect(guessPlaceHubsBatch).toHaveBeenCalledTimes(1);
    const [optionsArg] = guessPlaceHubsBatch.mock.calls[0];
    expect(optionsArg.domainBatch).toHaveLength(1);
    expect(optionsArg.domainBatch[0]).toMatchObject({ domain: 'example.com', kinds: ['country'] });
    expect(optionsArg.limit).toBe(5);
    expect(createPlaceHubDependencies).toHaveBeenCalledWith({ dbPath: 'c:/data/news.db', verbose: true });
    expect(response.body.batch.totalDomains).toBe(2);
    expect(response.body.totals.totalPlaces).toBe(5);
    expect(response.body.diffPreview.insertedCount).toBe(1);
    expect(response.body.candidateMetrics.persistedInserts).toBe(3);
  });

  test('GET /readiness/:domain validates domain parameter', async () => {
    const app = createApp();

    const response = await request(app).get('/readiness/%20');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_REQUEST');
    expect(checkDomainReadiness).not.toHaveBeenCalled();
  });

  test('GET /readiness/:domain returns readiness payload', async () => {
    const readiness = {
      status: 'ready',
      reason: null,
      recommendations: ['crawl'],
      hasFetchHistory: true,
      hasHistoricalCoverage: true,
      hasCandidates: true,
      hasVerifiedPatterns: false,
      latestDetermination: '2025-11-10T00:00:00.000Z',
      metrics: {
        fetchCount: 4,
        storedHubCount: 2,
        verifiedHubMappingCount: 1,
        candidateCount: 5,
        elapsedMs: 250
      }
    };

    checkDomainReadiness.mockResolvedValue(readiness);

    const app = createApp({ verbose: false });

    const response = await request(app)
      .get('/readiness/example.com')
      .query({ timeoutSeconds: '15' });

    expect(response.status).toBe(200);
    expect(checkDomainReadiness).toHaveBeenCalledWith('example.com', { timeoutSeconds: 15 }, { dependencies: true });
    expect(createPlaceHubDependencies).toHaveBeenLastCalledWith({ dbPath: 'c:/data/news.db', verbose: false });
    expect(response.body.status).toBe('ready');
    expect(response.body.metrics.fetchCount).toBe(4);
    expect(response.body.hasVerifiedMappings).toBe(true);
  });
});
