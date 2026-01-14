'use strict';

const mockListBoundaryCandidates = jest.fn();
const mockSaveBoundaryData = jest.fn();

jest.mock('../../../src/data/db/sqlite/v1/queries/gazetteer.osm', () => ({
  createOsmBoundaryStatements: jest.fn(() => ({})),
  listBoundaryCandidates: mockListBoundaryCandidates,
  saveBoundaryData: mockSaveBoundaryData
}));

const OsmBoundaryIngestor = require('../../../src/core/crawler/gazetteer/ingestors/OsmBoundaryIngestor');

const createDbStub = () => ({
  prepare: jest.fn(() => ({ run: jest.fn() }))
});

describe('OsmBoundaryIngestor batching and concurrency', () => {
  beforeEach(() => {
    mockListBoundaryCandidates.mockReset();
    mockSaveBoundaryData.mockReset();
    jest.restoreAllMocks();
  });

  test('createBatches groups candidates by country/type and respects maxBatchSize', () => {
    const ingestor = new OsmBoundaryIngestor({
      db: createDbStub(),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
      maxBatchSize: 2
    });

    const candidates = [
      { id: 1, countryCode: 'US', resolved: { osmType: 'relation', osmId: '1' } },
      { id: 2, countryCode: 'US', resolved: { osmType: 'relation', osmId: '2' } },
      { id: 3, countryCode: 'US', resolved: { osmType: 'relation', osmId: '3' } },
      { id: 4, countryCode: 'US', resolved: { osmType: 'way', osmId: '4' } },
      { id: 5, countryCode: 'CA', resolved: { osmType: 'relation', osmId: '5' } },
      { id: 6, countryCode: 'CA', resolved: { osmType: 'relation', osmId: '6' } }
    ];

    const batches = ingestor._createBatches(candidates);

    expect(batches).toHaveLength(4);
    expect(batches[0].map((c) => c.id)).toEqual([1, 2]);
    expect(batches[1].map((c) => c.id)).toEqual([3]);
    expect(batches[2].map((c) => c.id)).toEqual([4]);
    expect(batches[3].map((c) => c.id)).toEqual([5, 6]);
  });

  test('createBatches falls back to kind-aware grouping when country code missing', () => {
    const ingestor = new OsmBoundaryIngestor({
      db: createDbStub(),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
      maxBatchSize: 3
    });

    const candidates = [
      { id: 1, kind: 'country', countryCode: null, resolved: { osmType: 'relation', osmId: '1' } },
      { id: 2, kind: 'region', countryCode: null, resolved: { osmType: 'relation', osmId: '2' } },
      { id: 3, kind: 'region', countryCode: 'US', resolved: { osmType: 'relation', osmId: '3' } }
    ];

    const batches = ingestor._createBatches(candidates);

    expect(batches).toHaveLength(3);
    expect(batches[0][0].id).toBe(1);
    expect(batches[1][0].id).toBe(2);
    expect(batches[2][0].id).toBe(3);
  });

  test('execute limits concurrent batch processing to configured maximum', async () => {
    const candidates = Array.from({ length: 4 }).map((_, idx) => ({
      id: idx + 1,
      canonicalName: `Candidate ${idx + 1}`,
      countryCode: idx % 2 === 0 ? 'US' : 'CA',
      kind: 'region',
      osmId: `${1000 + idx}`,
      osmType: 'relation',
      osmRelationAttr: null,
      lastCrawledAt: null
    }));

    mockListBoundaryCandidates.mockReturnValue(candidates);

    const ingestor = new OsmBoundaryIngestor({
      db: createDbStub(),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
      maxBatchSize: 1,
      maxConcurrentFetches: 2,
      freshnessIntervalMs: null
    });

    let inFlight = 0;
    let peakConcurrency = 0;
    const batchesSeen = [];

    ingestor._processBatch = jest.fn(async (batch) => {
      batchesSeen.push(batch.map((c) => c.id));
      inFlight += 1;
      peakConcurrency = Math.max(peakConcurrency, inFlight);
      await new Promise((resolve) => {
        setImmediate(() => {
          inFlight -= 1;
          resolve();
        });
      });
    });

    ingestor._persistCandidateResults = jest.fn();
    ingestor._emitProgress = jest.fn();

    const summary = await ingestor.execute({ emitProgress: jest.fn() });

    expect(ingestor._processBatch).toHaveBeenCalledTimes(4);
    expect(new Set(batchesSeen.flat())).toEqual(new Set([1, 2, 3, 4]));
    expect(peakConcurrency).toBeLessThanOrEqual(2);
    expect(inFlight).toBe(0);
    expect(summary.recordsProcessed).toBe(0);
    expect(summary.batchesAttempted).toBe(0);
    expect(summary.batchesSucceeded).toBe(0);
  });

  test('processBatch fallback emits telemetry and increments summary counters', async () => {
    const emitProgress = jest.fn();
    const ingestor = new OsmBoundaryIngestor({
      db: createDbStub(),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });

    const summary = {
      recordsProcessed: 0,
      recordsUpserted: 0,
      recordsSkipped: 0,
      errors: 0,
      batchesAttempted: 0,
      batchesSucceeded: 0,
      batchesRetried: 0,
      singleFallbacks: 0,
      durationMs: 0
    };

    const batch = [
      {
        id: 1,
        kind: 'region',
        countryCode: 'US',
        resolved: { osmType: 'relation', osmId: '1' },
        canonicalName: 'Example'
      }
    ];

    jest.spyOn(ingestor, '_fetchBatch').mockRejectedValue(new Error('overpass down'));
    const singleSpy = jest.spyOn(ingestor, '_processSingleCandidate').mockResolvedValue();

    await ingestor._processBatch(batch, {
      signal: null,
      summary,
      emitProgress,
      batchIndex: 0,
      totalBatches: 1,
      totalCandidates: 1
    });

    expect(summary.batchesAttempted).toBe(1);
    expect(summary.batchesRetried).toBe(1);
    expect(summary.singleFallbacks).toBe(1);
    expect(summary.batchesSucceeded).toBe(0);
    expect(singleSpy).toHaveBeenCalledWith(batch[0], expect.objectContaining({ fallbackFromBatch: true }));

    const telemetryCalls = emitProgress.mock.calls.filter(([payload]) => payload?.type);
    expect(telemetryCalls.length).toBeGreaterThanOrEqual(1);
    expect(telemetryCalls[0][0]).toMatchObject({ type: 'warning', message: expect.stringContaining('batch fetch failed') });
  });

  test('_processSingleCandidate emits telemetry on failure', async () => {
    const emitProgress = jest.fn();
    const ingestor = new OsmBoundaryIngestor({
      db: createDbStub(),
      logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    });

    jest.spyOn(ingestor, '_fetchBoundary').mockRejectedValue(new Error('timeout'));

    const summary = {
      recordsProcessed: 0,
      recordsUpserted: 0,
      recordsSkipped: 0,
      errors: 0,
      batchesAttempted: 0,
      batchesSucceeded: 0,
      batchesRetried: 0,
      singleFallbacks: 0,
      durationMs: 0
    };

    const candidate = {
      id: 1,
      kind: 'region',
      countryCode: 'US',
      canonicalName: 'Example',
      resolved: { osmType: 'relation', osmId: '1' }
    };

    await ingestor._processSingleCandidate(candidate, {
      signal: null,
      summary,
      emitProgress,
      totalCandidates: 1
    });

    expect(summary.errors).toBe(1);
    const telemetryCalls = emitProgress.mock.calls.filter(([payload]) => payload?.type);
    expect(telemetryCalls.length).toBeGreaterThanOrEqual(1);
    expect(telemetryCalls[0][0]).toMatchObject({ type: 'error', context: expect.objectContaining({ candidateId: 1 }) });
  });
});

