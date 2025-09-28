const NewsCrawler = require('../crawl');

describe('NewsCrawler processPage cache/refetch behavior', () => {
  test('uses network when cache is stale under maxAgeMs', async () => {
  const startUrl = 'https://www.theguardian.com/world';
  const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, maxAgeMs: 1000, preferCache: true });
    // Fake cache returns very old page
    crawler.cache.get = async () => ({ html: '<html>old</html>', crawledAt: new Date(Date.now() - 3600*1000).toISOString(), source: 'db' });
    // Capture whether fetchPage was called
    let fetched = false;
    crawler.fetchPage = async (url) => {
      fetched = true;
      const html = `<!doctype html>
        <html><body>
          <nav><a href="/world">World</a><a href="/politics">Politics</a></nav>
          <article>
            <h1>Example Article</h1>
            <a href="/world/2025/sep/16/example-article">Read more</a>
          </article>
        </body></html>`;
      return { url, html, fetchMeta: { httpStatus: 200, fetchedAtIso: new Date().toISOString(), requestStartedIso: new Date().toISOString() } };
    };
    // Avoid real robots
    crawler.loadRobotsTxt = async () => { crawler.robotsRules = null; crawler.robotsTxtLoaded = true; };
    await crawler.init();
    const res = await crawler.processPage(startUrl, 0);
    expect(res.status === 'success' || res.status === 'cache').toBeTruthy();
    expect(fetched).toBe(true);
  });

  test('respects maxDownloads limit (no extra network calls)', async () => {
  const startUrl = 'https://www.theguardian.com/uk-news';
  const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, maxDownloads: 1, preferCache: false });
    crawler.loadRobotsTxt = async () => { crawler.robotsRules = null; crawler.robotsTxtLoaded = true; };
    await crawler.init();
    // Simulate that we've already downloaded the allowed number of pages
    crawler.stats.pagesDownloaded = 1;
    let called = false;
    crawler.fetchPage = async () => { called = true; return null; };
    const res = await crawler.processPage(startUrl, 0);
    // With pagesDownloaded >= maxDownloads, processPage should skip before network fetch
    expect(res).toEqual({ status: 'skipped' });
  expect(called).toBe(false);
  });

  test('uses cached page when host is rate limited even if cache is stale', async () => {
    const startUrl = 'https://www.theguardian.com/world/2025/sep/27/example-story';
    const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, preferCache: false, maxAgeMs: 0 });
    crawler.loadRobotsTxt = async () => { crawler.robotsRules = null; crawler.robotsTxtLoaded = true; };
    await crawler.init();
    const host = new URL(startUrl).hostname;
    crawler.cache.get = async () => ({ html: '<html><body><h1>Cached</h1></body></html>', crawledAt: new Date(Date.now() - 3600 * 1000).toISOString(), source: 'db' });
    const fetchSpy = jest.fn();
    crawler.fetchPage = async () => { fetchSpy(); throw new Error('should not fetch during rate limit'); };
    crawler.note429(host, 120000);
    crawler.requestQueue.push({ url: startUrl, depth: 0, type: 'article' });
    const pick = await crawler._pullNextWorkItem();
    expect(pick && pick.item).toBeTruthy();
    expect(pick.context && pick.context.forceCache).toBe(true);
    const res = await crawler.processPage(pick.item.url, pick.item.depth, {
      type: pick.item.type,
      allowRevisit: pick.item.allowRevisit,
      forceCache: pick.context.forceCache,
      cachedPage: pick.context.cachedPage,
      rateLimitedHost: pick.context.rateLimitedHost
    });
    expect(res.status).toBe('cache');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(crawler.stats.cacheRateLimitedServed).toBeGreaterThan(0);
  });

  test('defers queue items without cache when host is rate limited', async () => {
    const startUrl = 'https://www.theguardian.com/world/2025/sep/27/example-story-2';
    const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, preferCache: false });
    crawler.loadRobotsTxt = async () => { crawler.robotsRules = null; crawler.robotsTxtLoaded = true; };
    await crawler.init();
    const host = new URL(startUrl).hostname;
    crawler.cache.get = async () => null;
    crawler.note429(host, 60000);
    crawler.requestQueue.push({ url: startUrl, depth: 0, type: 'nav' });
    const pick = await crawler._pullNextWorkItem();
    expect(!pick || !pick.item).toBe(true);
    expect(pick && pick.wakeAt).toBeTruthy();
    expect(crawler.stats.cacheRateLimitedDeferred).toBeGreaterThan(0);
    expect(crawler.requestQueue.length).toBe(1);
    expect(crawler.requestQueue[0].deferredUntil).toBeDefined();
  });
});
