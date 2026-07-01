const { classifyFreshness } = require('../FreshnessClassifier');

describe('FreshnessClassifier', () => {
  test('classifies conditional 304 as unchanged and avoided download', () => {
    const result = classifyFreshness({
      source: 'not-modified',
      status: 'not-modified',
      fetchMeta: { httpStatus: 304, conditional: true },
      headerMeta: { etag: '"v1"', last_modified: 'Tue, 10 Jun 2026 10:00:00 GMT' },
      conditionalHeaders: { 'If-None-Match': '"v1"' }
    });

    expect(result).toMatchObject({
      status: 'unchanged',
      reason: 'conditional-get-304',
      avoidedDownload: true,
      fullGetRequired: false,
      conditional: true
    });
  });

  test('classifies conditional 200 as updated', () => {
    const result = classifyFreshness({
      source: 'network',
      status: 'success',
      fetchMeta: { httpStatus: 200, conditional: true },
      headerMeta: { etag: '"v1"', last_modified: 'Tue, 10 Jun 2026 10:00:00 GMT' },
      conditionalHeaders: { 'If-Modified-Since': 'Tue, 10 Jun 2026 10:00:00 GMT' }
    });

    expect(result).toMatchObject({
      status: 'updated',
      reason: 'conditional-get-200',
      avoidedDownload: false,
      fullGetRequired: true
    });
  });

  test('classifies sitemap lastmod newer than stored timestamp as updated', () => {
    const result = classifyFreshness({
      source: 'network',
      status: 'success',
      fetchMeta: { httpStatus: 200, conditional: false },
      requestMeta: { source: 'sitemap', lastmod: '2026-06-12T12:00:00Z' },
      headerMeta: { fetched_at: '2026-06-11T12:00:00Z' }
    });

    expect(result).toMatchObject({
      status: 'updated',
      reason: 'newer-than-stored-fetch',
      sitemapRelation: 'newer-than-stored-fetch'
    });
  });

  test('classifies stale cache fallback separately from fresh cache', () => {
    expect(classifyFreshness({
      source: 'cache',
      status: 'cache',
      cacheInfo: { reason: 'stale-for-policy', fallbackReason: 'timeout' }
    })).toMatchObject({ status: 'stale', reason: 'timeout' });

    expect(classifyFreshness({
      source: 'cache',
      status: 'cache',
      cacheInfo: { reason: 'fresh-cache' }
    })).toMatchObject({ status: 'unchanged', reason: 'fresh-cache' });
  });
});
