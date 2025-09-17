const { ArticleCache, shouldUseCache } = require('../cache');

// file path helper removed

describe('ArticleCache.get', () => {
  test('returns from DB when available', async () => {
    const fakeDb = {
      getArticleByUrlOrCanonical: (u) => ({ html: '<html>ok</html>', crawled_at: '2025-09-10T00:00:00.000Z' })
    };
  const cache = new ArticleCache({ db: fakeDb, normalizeUrl: (u) => u });
    const res = await cache.get('https://example.com/a');
    expect(res).toEqual({ html: '<html>ok</html>', crawledAt: '2025-09-10T00:00:00.000Z', source: 'db' });
  });

  // file fallback removed

  test('DB preferred over file when both exist', async () => {
  const fakeDb = { getArticleByUrlOrCanonical: () => ({ html: '<html>db</html>', crawled_at: '2025-09-08T00:00:00.000Z' }) };
  const cache = new ArticleCache({ db: fakeDb, dataDir: 'C:/tmp', normalizeUrl: (u) => u });
  const res = await cache.get('https://example.com/a');
    expect(res.source).toBe('db');
    expect(res.html).toBe('<html>db</html>');
  });

  test('canonical URL match is used when provided by DB helper', async () => {
    const fakeDb = {
      getArticleByUrlOrCanonical: (u) => (u.includes('c=1') ? null : { html: 'ok', crawled_at: '2025-09-10T00:00:00.000Z' }),
    };
  const cache = new ArticleCache({ db: fakeDb, dataDir: 'C:/tmp', normalizeUrl: (u) => u.replace(/\?c=1$/, '') });
    const res = await cache.get('https://example.com/a?c=1');
    expect(res && res.source).toBe('db');
  });
});

describe('shouldUseCache', () => {
  const fixedNow = new Date('2025-09-16T00:00:00.000Z').getTime();
  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });
  afterAll(() => {
    Date.now.mockRestore?.();
  });

  test('preferCache forces use', () => {
    const r = shouldUseCache({ preferCache: true, crawledAt: '2025-09-15T23:59:00.000Z' });
    expect(r.use).toBe(true);
    expect(typeof r.ageSeconds).toBe('number');
  });

  test('maxAge allows fresh cache', () => {
    const r = shouldUseCache({ maxAgeMs: 60 * 60 * 1000, crawledAt: '2025-09-15T23:30:00.000Z' });
    expect(r.use).toBe(true);
  });

  test('maxAge rejects stale cache', () => {
    const r = shouldUseCache({ maxAgeMs: 60 * 1000, crawledAt: '2025-09-15T22:00:00.000Z' });
    expect(r.use).toBe(false);
  });

  test('no preferCache and no maxAge means no cache', () => {
    const r = shouldUseCache({ crawledAt: '2025-09-15T22:00:00.000Z' });
    expect(r.use).toBe(false);
  });
});
