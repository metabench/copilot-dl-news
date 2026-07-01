'use strict';

const {
  totalsOf,
  classifyStatuses,
  deriveSignals,
  queryRawSignals,
  readSampleDbSignals,
  NativeDbUnavailableError,
  isNativeLoadError,
} = require('../../../tools/crawl/lib/sample-db-signals');

function snap(totals = {}, latestFetchedAt = null) {
  return {
    totals: { urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0, ...totals },
    latestFetchedAt,
  };
}

describe('sample-db-signals deriveSignals (pure)', () => {
  test('derives success rate and taxonomy classification without a baseline', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 56, successResponses: 54, failedResponses: 2 }),
      taxonomy: { '200': 54, '500': 2 },
      distinctHostsFetched: 1,
      dedup: { total: 56, distinct: 56 },
      freshness: { etag: 36, lastModified: 0, notModified: 0 },
      bytesDownloaded: 12345,
      requestedHosts: ['www.theguardian.com'],
    });
    expect(signals.downloads).toBe(54);
    expect(signals.responses).toBe(56);
    expect(signals.successRate).toBeCloseTo(0.9643, 3);
    expect(signals.serverErrorCount).toBe(2);
    expect(signals.rateLimitedCount).toBe(0);
    expect(signals.dedup.duplicateResponses).toBe(0);
    expect(signals.bytesDownloaded).toBe(12345);
  });

  test('uses baseline delta on an accumulating DB', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 100, successResponses: 96, failedResponses: 4 }),
      baseline: snap({ responses: 40, successResponses: 39, failedResponses: 1 }),
      taxonomy: { '200': 57, '404': 3 },
    });
    expect(signals.downloads).toBe(57); // 96 - 39
    expect(signals.responses).toBe(60); // 100 - 40
    expect(signals.failedResponses).toBe(3); // 4 - 1
  });

  test('counts 429s and duplicate responses', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 30, successResponses: 20 }),
      taxonomy: { '200': 20, '429': 10 },
      dedup: { total: 30, distinct: 25 },
    });
    expect(signals.rateLimitedCount).toBe(10);
    expect(signals.dedup.duplicateResponses).toBe(5);
  });
});

describe('sample-db-signals classifyStatuses', () => {
  test('buckets status codes into families', () => {
    const c = classifyStatuses({ '200': 5, '301': 1, '404': 2, '429': 3, '503': 1, '500': 1 });
    expect(c).toEqual({ rateLimited: 3, serverErrors: 2, clientErrors: 5, success: 5 });
  });
});

describe('sample-db-signals totalsOf', () => {
  test('tolerates flattened and null snapshots', () => {
    expect(totalsOf(null)).toMatchObject({ responses: 0 });
    expect(totalsOf({ totals: { responses: 7 } })).toMatchObject({ responses: 7 });
    expect(totalsOf({ responses: 9 })).toMatchObject({ responses: 9 });
  });
});

describe('sample-db-signals queryRawSignals (fake db)', () => {
  // Minimal better-sqlite3-shaped fake: prepare(sql).all()/get() driven by matchers.
  function fakeDb(rowsBySql) {
    return {
      prepare(sql) {
        const key = Object.keys(rowsBySql).find((frag) => sql.includes(frag));
        const data = key ? rowsBySql[key] : null;
        return {
          all: () => (Array.isArray(data) ? data : (data ? [data] : [])),
          get: () => (Array.isArray(data) ? data[0] : data),
        };
      },
    };
  }

  test('prefers http_responses and reads taxonomy/hosts/freshness', () => {
    const db = fakeDb({
      'SELECT COUNT(*) AS n FROM http_responses': { n: 56 },
      'SELECT COUNT(*) AS n FROM fetches': { n: 0 },
      'http_status AS s': [{ s: 200, n: 54 }, { s: 500, n: 2 }],
      'COUNT(DISTINCT u.host)': { n: 1 },
      'COUNT(DISTINCT host) AS n FROM urls': { n: 3 },
      'COUNT(DISTINCT url_id)': { total: 56, distinct_urls: 56 },
      'SUM(CASE WHEN etag': { etag: 36, lastmod: 0, c304: 0 },
      'SUM(bytes_downloaded)': { bytes: 999 },
    });
    const raw = queryRawSignals(db, { snapshotFn: () => snap({ responses: 56, successResponses: 54 }) });
    expect(raw.sourceTable).toBe('http_responses');
    expect(raw.taxonomy).toEqual({ '200': 54, '500': 2 });
    expect(raw.distinctHostsFetched).toBe(1);
    expect(raw.freshness.etag).toBe(36);
    expect(raw.bytesDownloaded).toBe(999);
  });

  test('falls back to fetches when http_responses is empty', () => {
    const db = fakeDb({
      'SELECT COUNT(*) AS n FROM http_responses': { n: 0 },
      'SELECT COUNT(*) AS n FROM fetches': { n: 12 },
      'http_status AS s': [{ s: 200, n: 12 }],
      'COUNT(DISTINCT host) AS n FROM fetches': { n: 2 },
      'COUNT(DISTINCT host) AS n FROM urls': { n: 2 },
      'COUNT(DISTINCT url)': { total: 12, distinct_urls: 12 },
      'SUM(bytes_downloaded)': { bytes: 42 },
    });
    const raw = queryRawSignals(db, { snapshotFn: () => snap({ responses: 12, successResponses: 12 }) });
    expect(raw.sourceTable).toBe('fetches');
    expect(raw.distinctHostsFetched).toBe(2);
    expect(raw.freshness.etag).toBe(0); // fetches has no validators
  });
});

describe('sample-db-signals native-load handling', () => {
  test('isNativeLoadError recognises the ABI mismatch signatures', () => {
    expect(isNativeLoadError(new Error('ERR_DLOPEN_FAILED: not a valid Win32 application'))).toBe(true);
    expect(isNativeLoadError(new Error('The module was compiled against a different Node.js version'))).toBe(true);
    expect(isNativeLoadError(new Error('no such table: fetches'))).toBe(false);
  });

  test('readSampleDbSignals wraps a native load failure in a self-explaining error', () => {
    const openDb = () => { throw new Error('ERR_DLOPEN_FAILED: better_sqlite3.node is not a valid Win32 application'); };
    expect(() => readSampleDbSignals('data/samples/x.db', { deps: { openDb } }))
      .toThrow(NativeDbUnavailableError);
    try {
      readSampleDbSignals('data/samples/x.db', { deps: { openDb } });
    } catch (err) {
      expect(err.message).toMatch(/npm rebuild better-sqlite3/);
    }
  });
});
