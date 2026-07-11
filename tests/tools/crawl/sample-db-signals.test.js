'use strict';

const {
  totalsOf,
  classifyStatuses,
  deriveThroughput,
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

describe('sample-db-signals deriveThroughput (pure, self-clocked)', () => {
  const window100s = {
    windowStartIso: '2026-07-02T10:00:00.000Z',
    windowEndIso: '2026-07-02T10:01:40.000Z', // 100s
  };

  test('computes docs/s and bytes/s from the DB timestamp window', () => {
    const th = deriveThroughput(
      { ...window100s, busyMs: 20000, avgTtfbMs: 300, avgDownloadMs: 100 },
      20,
      6000000
    );
    expect(th.docsPerSec).toBeCloseTo(0.2, 5);
    expect(th.bytesPerSec).toBeCloseTo(60000, 5);
    expect(th.windowSec).toBeCloseTo(100, 5);
    expect(th.basis).toBe('db-timestamps');
  });

  test('classifies politeness-bound when the crawler idles most of the window', () => {
    const th = deriveThroughput({ ...window100s, busyMs: 20000, avgTtfbMs: 900, avgDownloadMs: 100 }, 20, 1000);
    expect(th.busyFraction).toBeCloseTo(0.2, 5);
    expect(th.bindingConstraint).toBe('politeness-bound');
  });

  test('classifies latency-bound when busy and TTFB dominates transfer', () => {
    const th = deriveThroughput({ ...window100s, busyMs: 80000, avgTtfbMs: 800, avgDownloadMs: 100 }, 20, 1000);
    expect(th.bindingConstraint).toBe('latency-bound');
  });

  test('classifies bandwidth-bound when busy and transfer dominates', () => {
    const th = deriveThroughput({ ...window100s, busyMs: 90000, avgTtfbMs: 50, avgDownloadMs: 500 }, 20, 1000);
    expect(th.bindingConstraint).toBe('bandwidth-bound');
  });

  test('returns null without timing, with an empty window, or with zero responses', () => {
    expect(deriveThroughput(null, 20, 1000)).toBeNull();
    expect(deriveThroughput({ windowStartIso: 'x', windowEndIso: 'y' }, 20, 1000)).toBeNull();
    expect(deriveThroughput({ windowStartIso: window100s.windowEndIso, windowEndIso: window100s.windowStartIso }, 20, 1000)).toBeNull();
    expect(deriveThroughput(window100s, 0, 1000)).toBeNull();
  });

  test('deriveSignals surfaces throughput from timing', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 20, successResponses: 20 }),
      taxonomy: { '200': 20 },
      bytesDownloaded: 6000000,
      timing: { ...window100s, busyMs: 20000, avgTtfbMs: 300, avgDownloadMs: 100 },
    });
    expect(signals.throughput).not.toBeNull();
    expect(signals.throughput.docsPerSec).toBeCloseTo(0.2, 5);
    expect(signals.throughput.bindingConstraint).toBe('politeness-bound');
  });

  test('deriveSignals leaves throughput null without timing', () => {
    const signals = deriveSignals({ snapshot: snap({ responses: 20, successResponses: 20 }) });
    expect(signals.throughput).toBeNull();
  });
});

describe('sample-db-signals querySeedFetch', () => {
  const { querySeedFetch } = require('../../../tools/crawl/lib/sample-db-signals');

  const fakeDb = (countsByUrl) => ({
    prepare: () => ({
      get: (url) => ({ n: countsByUrl[url] || 0 }),
    }),
  });

  test('reports fetched and missing requested URLs', () => {
    const db = fakeDb({ 'https://example.com/world': 1, 'https://example.com/uk': 0 });
    const sf = querySeedFetch(db, ['https://example.com/world', 'https://example.com/uk'], null);
    expect(sf).toEqual({ requested: 2, fetched: 1, missing: ['https://example.com/uk'] });
  });

  test('returns null without requested URLs', () => {
    expect(querySeedFetch(fakeDb({}), [], null)).toBeNull();
    expect(querySeedFetch(fakeDb({}), undefined, null)).toBeNull();
  });
});

describe('sample-db-signals classifyStatuses', () => {
  test('buckets status codes into families', () => {
    const c = classifyStatuses({ '200': 5, '301': 1, '404': 2, '429': 3, '503': 1, '500': 1 });
    expect(c).toEqual({ rateLimited: 3, serverErrors: 2, clientErrors: 5, success: 5, notModified: 0, notFound: 2 });
  });

  test('counts 304 not-modified separately', () => {
    const c = classifyStatuses({ '200': 2, '304': 11 });
    expect(c.notModified).toBe(11);
    expect(c.success).toBe(2);
  });
});

describe('sample-db-signals probe-vs-content semantics', () => {
  const { isInfraUrl } = require('../../../tools/crawl/lib/sample-db-signals');

  test('isInfraUrl recognizes robots and sitemap URLs only', () => {
    expect(isInfraUrl('http://127.0.0.1:42891/robots.txt')).toBe(true);
    expect(isInfraUrl('https://example.com/sitemap.xml')).toBe(true);
    expect(isInfraUrl('https://example.com/news-sitemap.xml')).toBe(true);
    expect(isInfraUrl('https://example.com/news/robots-article.html')).toBe(false);
    expect(isInfraUrl('https://example.com/news/story')).toBe(false);
    expect(isInfraUrl(null)).toBe(false);
  });

  test('404 discovery misses are excluded from fetch reliability', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 3, successResponses: 2 }),
      taxonomy: { '200': 1, '404': 1 },
      contentCounts: { responses: 2, downloads: 1 },
    });
    expect(signals.responses).toBe(2); // content-only
    expect(signals.downloads).toBe(1);
    expect(signals.notFoundCount).toBe(1);
    expect(signals.successRate).toBeCloseTo(1.0, 5); // 1 / (2 - 1)
  });

  test('contentCounts take precedence over snapshot totals', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 10, successResponses: 9 }), // includes infra rows
      taxonomy: { '200': 3 },
      contentCounts: { responses: 3, downloads: 3 },
      infra: { responses: 2, robots: 1, sitemapProbes: 1, ok: 1, notFound: 1 },
    });
    expect(signals.responses).toBe(3);
    expect(signals.downloads).toBe(3);
    expect(signals.infra).toMatchObject({ robots: 1, sitemapProbes: 1 });
  });
});

describe('sample-db-signals 304-aware success rate', () => {
  test('a validator-heavy re-crawl does not tank the success rate', () => {
    const signals = deriveSignals({
      snapshot: snap({ responses: 13, successResponses: 2 }),
      taxonomy: { '200': 2, '304': 11 },
    });
    expect(signals.downloads).toBe(2);
    expect(signals.notModifiedCount).toBe(11);
    expect(signals.successRate).toBeCloseTo(1.0, 5); // (2 + 11) / 13
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
      'MIN(COALESCE(request_started_at': {
        ws: '2026-07-02T10:00:00.000Z', we: '2026-07-02T10:01:40.000Z', busy: 20000, ttfb: 300, dl: 100,
      },
    });
    const raw = queryRawSignals(db, { snapshotFn: () => snap({ responses: 56, successResponses: 54 }) });
    expect(raw.sourceTable).toBe('http_responses');
    expect(raw.taxonomy).toEqual({ '200': 54, '500': 2 });
    expect(raw.distinctHostsFetched).toBe(1);
    expect(raw.freshness.etag).toBe(36);
    expect(raw.bytesDownloaded).toBe(999);
    expect(raw.timing).toEqual({
      windowStartIso: '2026-07-02T10:00:00.000Z',
      windowEndIso: '2026-07-02T10:01:40.000Z',
      busyMs: 20000,
      avgTtfbMs: 300,
      avgDownloadMs: 100,
    });
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
