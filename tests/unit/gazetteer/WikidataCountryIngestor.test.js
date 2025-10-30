'use strict';

const mockGetFreshness = jest.fn();

jest.mock('../../../src/db/sqlite/v1/queries/gazetteer.ingest', () => ({
  createIngestionStatements: jest.fn(() => ({
    getPlaceFreshnessByWikidata: { get: mockGetFreshness }
  })),
  upsertPlace: jest.fn(),
  insertPlaceName: jest.fn(),
  insertExternalId: jest.fn(),
  setCanonicalName: jest.fn()
}));

const { WikidataCountryIngestor } = require('../../../src/crawler/gazetteer/ingestors/WikidataCountryIngestor');

const createDbStub = () => ({
  prepare: jest.fn(() => ({ run: jest.fn() }))
});

describe('WikidataCountryIngestor configuration helpers', () => {
  beforeEach(() => {
    mockGetFreshness.mockReset();
    jest.restoreAllMocks();
  });

  test('filters bindings using last_crawled_at freshness window', () => {
    const baseTime = 10_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(baseTime);

    const ingestor = new WikidataCountryIngestor({
      db: createDbStub(),
      useCache: false,
      freshnessIntervalMs: 60_000
    });

    const bindings = [
      { country: { value: 'http://www.wikidata.org/entity/Q1' } },
      { country: { value: 'http://www.wikidata.org/entity/Q2' } },
      { country: { value: 'http://www.wikidata.org/entity/Q3' } }
    ];

    mockGetFreshness.mockImplementation((qid) => {
      if (qid === 'Q1') {
        return { lastCrawledAt: baseTime - 30_000 };
      }
      if (qid === 'Q2') {
        return { lastCrawledAt: baseTime - 120_000 };
      }
      return undefined;
    });

    const { retainedBindings, skipped } = ingestor._filterBindingsByFreshness(bindings);

    expect(retainedBindings).toHaveLength(2);
    expect(retainedBindings.map((binding) => binding.country.value)).toEqual([
      'http://www.wikidata.org/entity/Q2',
      'http://www.wikidata.org/entity/Q3'
    ]);
    expect(skipped).toEqual([
      { qid: 'Q1', lastCrawledAt: baseTime - 30_000 }
    ]);
    expect(mockGetFreshness).toHaveBeenCalledTimes(3);
  });

  test('fetchEntities honors entitiesBatchSize when assembling batches', async () => {
    const ingestor = new WikidataCountryIngestor({
      db: createDbStub(),
      useCache: false,
      entitiesBatchSize: 2,
      entityBatchDelayMs: 0,
      sleepMs: 0
    });

    const fetchBatchSpy = jest
      .spyOn(ingestor, '_fetchEntityBatch')
      .mockImplementation(async (batch) => ({
        entities: batch.reduce((acc, qid) => {
          acc[qid] = { id: qid };
          return acc;
        }, {})
      }));

    const emitProgress = jest.fn();
    const qids = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

    const result = await ingestor._fetchEntities(qids, emitProgress);

    expect(fetchBatchSpy).toHaveBeenCalledTimes(3);
    expect(fetchBatchSpy.mock.calls[0][0]).toEqual(['Q1', 'Q2']);
    expect(fetchBatchSpy.mock.calls[1][0]).toEqual(['Q3', 'Q4']);
    expect(fetchBatchSpy.mock.calls[2][0]).toEqual(['Q5']);
    expect(Object.keys(result.entities)).toHaveLength(5);
  });
});
