const {
  RobotsCache,
  extractSitemapUrls,
  parseCrawlDelay
} = require('../RobotsCache');

describe('RobotsCache', () => {
  const now = Date.parse('2026-05-31T12:00:00.000Z');
  const makeCache = (overrides = {}) => new RobotsCache({
    baseUrl: 'https://example.com',
    domain: 'example.com',
    fetchImpl: overrides.fetchImpl || jest.fn(),
    dbAdapter: overrides.dbAdapter || null,
    ttlSeconds: overrides.ttlSeconds || 60,
    retryDelayMs: 0,
    now: () => now,
    logger: { log: jest.fn() }
  });

  test('uses typed cache within TTL without fetching', async () => {
    const fetchImpl = jest.fn();
    const dbAdapter = {
      getRobotsCache: jest.fn(async () => ({
        domain: 'example.com',
        robotsTxt: 'User-agent: *\nCrawl-delay: 2',
        fetchedAt: new Date(now - 1000).toISOString(),
        httpStatus: 200,
        crawlDelaySeconds: 2,
        sitemapUrls: ['https://example.com/sitemap.xml']
      }))
    };

    const result = await makeCache({ fetchImpl, dbAdapter }).load();

    expect(result).toMatchObject({
      loaded: true,
      source: 'cache-hit',
      crawlDelaySeconds: 2,
      sitemapUrls: ['https://example.com/sitemap.xml']
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('fetches and writes typed cache on miss', async () => {
    const response = {
      ok: true,
      status: 200,
      headers: { etag: '"abc"', 'last-modified': 'Sun, 31 May 2026 11:00:00 GMT' },
      text: async () => [
        'User-agent: *',
        'Crawl-delay: 7',
        'Sitemap: /news-sitemap.xml'
      ].join('\n')
    };
    const fetchImpl = jest.fn(async () => response);
    const dbAdapter = {
      getRobotsCache: jest.fn(async () => null),
      upsertRobotsCache: jest.fn(async () => {})
    };

    const result = await makeCache({ fetchImpl, dbAdapter }).load();

    expect(result).toMatchObject({
      loaded: true,
      source: 'network',
      crawlDelaySeconds: 7,
      sitemapUrls: ['https://example.com/news-sitemap.xml']
    });
    expect(dbAdapter.upsertRobotsCache).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'example.com',
      robotsTxt: expect.stringContaining('Crawl-delay: 7'),
      crawlDelaySeconds: 7,
      sitemapUrls: ['https://example.com/news-sitemap.xml'],
      etag: '"abc"',
      lastModified: 'Sun, 31 May 2026 11:00:00 GMT'
    }));
  });

  test('revalidates stale cache with conditional headers on 304', async () => {
    const stale = {
      domain: 'example.com',
      robotsTxt: 'User-agent: *\nDisallow: /old',
      fetchedAt: new Date(now - 120000).toISOString(),
      httpStatus: 200,
      etag: '"old"',
      lastModified: 'Sun, 31 May 2026 10:00:00 GMT'
    };
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 304, text: async () => '' }));
    const dbAdapter = {
      getRobotsCache: jest.fn(async () => stale),
      upsertRobotsCache: jest.fn(async () => {})
    };

    const result = await makeCache({ fetchImpl, dbAdapter, ttlSeconds: 30 }).load();

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/robots.txt', {
      headers: {
        'If-None-Match': '"old"',
        'If-Modified-Since': 'Sun, 31 May 2026 10:00:00 GMT'
      }
    });
    expect(result).toMatchObject({
      loaded: true,
      source: 'revalidated-304',
      robotsTxt: stale.robotsTxt
    });
    expect(dbAdapter.upsertRobotsCache).toHaveBeenCalledWith(expect.objectContaining({
      robotsTxt: stale.robotsTxt,
      fetchedAt: new Date(now).toISOString()
    }));
  });

  test('falls back to legacy article row cache', async () => {
    const fetchImpl = jest.fn();
    const dbAdapter = {
      getArticleByUrl: jest.fn(() => ({
        html: Buffer.from('User-agent: *\nSitemap: /legacy.xml'),
        fetched_at: new Date(now - 1000).toISOString(),
        http_status: 200
      }))
    };

    const result = await makeCache({ fetchImpl, dbAdapter }).load();

    expect(result).toMatchObject({
      loaded: true,
      source: 'cache-hit',
      sitemapUrls: ['https://example.com/legacy.xml']
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('records the robots.txt fetch into http_responses (fetch-visibility)', async () => {
    const response = {
      ok: true,
      status: 200,
      headers: { etag: '"vis"', 'content-type': 'text/plain; charset=utf-8' },
      text: async () => 'User-agent: *\nAllow: /'
    };
    const dbAdapter = {
      getRobotsCache: jest.fn(async () => null),
      upsertRobotsCache: jest.fn(async () => {}),
      insertHttpResponse: jest.fn(async () => 1)
    };

    await makeCache({ fetchImpl: jest.fn(async () => response), dbAdapter }).load();

    expect(dbAdapter.insertHttpResponse).toHaveBeenCalledTimes(1);
    expect(dbAdapter.insertHttpResponse).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/robots.txt',
      http_status: 200,
      content_type: 'text/plain; charset=utf-8',
      etag: '"vis"',
      bytes_downloaded: expect.any(Number)
    }));
  });

  test('fetch-visibility recording failures never break robots loading', async () => {
    const response = {
      ok: true,
      status: 200,
      headers: {},
      text: async () => 'User-agent: *\nAllow: /'
    };
    const dbAdapter = {
      getRobotsCache: jest.fn(async () => null),
      upsertRobotsCache: jest.fn(async () => {}),
      insertHttpResponse: jest.fn(async () => { throw new Error('db closed'); })
    };

    const result = await makeCache({ fetchImpl: jest.fn(async () => response), dbAdapter }).load();
    expect(result.loaded).toBe(true);
    expect(result.source).toBe('network');
  });

  test('parses crawl delay with agent-specific and wildcard fallback', () => {
    const robotsTxt = [
      'User-agent: NewsBot',
      'Crawl-delay: 9',
      'Disallow: /draft',
      '',
      'User-agent: *',
      'Crawl-delay: 3',
      'User-agent: BadBot',
      'Crawl-delay: nope'
    ].join('\n');

    expect(parseCrawlDelay(robotsTxt, 'NewsBot')).toBe(9);
    expect(parseCrawlDelay(robotsTxt, 'OtherBot')).toBe(3);
    expect(parseCrawlDelay('User-agent: *\nCrawl-delay: nope')).toBeNull();
  });

  test('normalizes sitemap declarations', () => {
    expect(extractSitemapUrls('Sitemap: /a.xml\nSitemap: https://example.com/b.xml', 'https://example.com'))
      .toEqual(['https://example.com/a.xml', 'https://example.com/b.xml']);
  });
});
