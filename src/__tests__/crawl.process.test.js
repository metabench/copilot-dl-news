const NewsCrawler = require('../crawl');

const stubRobotsCoordinator = (crawler) => {
  crawler.robotsCoordinator = {
    loadRobotsTxt: async () => {
      crawler.robotsTxtLoaded = true;
      crawler.robotsRules = null;
      crawler.sitemapUrls = [];
    },
    isAllowed: () => true,
    loadSitemapsAndEnqueue: async () => {},
    robotsRules: null,
    robotsTxtLoaded: true,
    sitemapUrls: [],
    sitemapDiscovered: 0,
    getRobotsInfo: () => ({ robotsLoaded: true }),
    getSitemapInfo: () => ({ urls: [], discovered: 0 })
  };
};

const disableNewAbstractionsAdapter = (crawler) => {
  const adapter = crawler && crawler._newAbstractionsAdapter;
  if (!adapter) return;
  try {
    if (adapter._consistencyInterval) {
      clearInterval(adapter._consistencyInterval);
      adapter._consistencyInterval = null;
    }
  } catch (_) {}
  try {
    if (typeof adapter.uninstall === 'function') {
      adapter.uninstall();
    }
  } catch (_) {}
  try {
    delete crawler._newAbstractionsAdapter;
  } catch (_) {}
};

describe('NewsCrawler processPage cache/refetch behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses network when cache is stale under maxAgeMs', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const startUrl = 'https://www.theguardian.com/world';
    const crawler = new NewsCrawler(startUrl, {
      enableDb: false,
      useSitemap: false,
      concurrency: 1,
      maxDepth: 0,
      maxAgeMs: 1000,
      preferCache: true,
      rateLimitMs: 0,
      loggingNetwork: false,
      loggingFetching: false
    });

    // Avoid real robots/network side effects from init()
    disableNewAbstractionsAdapter(crawler);
    stubRobotsCoordinator(crawler);

    // Fake cache returns very old page
    crawler.cache.get = async () => ({ html: '<html>old</html>', crawledAt: new Date(Date.now() - 3600*1000).toISOString(), source: 'db' });
    // Capture whether network fetch was used
    let networkCalled = false;
    const fillerText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40);
    const sampleHtml = `<!doctype html>
        <html><body>
          <nav><a href="/world">World</a><a href="/politics">Politics</a></nav>
          <article>
            <h1>Example Article</h1>
            <p>${fillerText}</p>
            <a href="/world/2025/sep/16/example-article">Read more</a>
          </article>
        </body></html>`;
    crawler.fetchPipeline.fetchFn = jest.fn(async (url, init) => {
      networkCalled = true;
      void init;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (key) => {
            if (key.toLowerCase() === 'content-type') return 'text/html';
            return null;
          }
        },
        url,
        text: async () => sampleHtml
      };
    });
    try {
      await crawler.init();
      const res = await crawler.processPage(startUrl, 0, { type: 'nav', allowRevisit: true });
      expect(res.status === 'success' || res.status === 'cache').toBeTruthy();
      expect(networkCalled).toBe(true);
    } finally {
      crawler.close();
    }
  });

  test('respects maxDownloads limit (no extra network calls)', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const startUrl = 'https://www.theguardian.com/uk-news';
    const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, maxDownloads: 1, preferCache: false, rateLimitMs: 0, loggingNetwork: false, loggingFetching: false });
    disableNewAbstractionsAdapter(crawler);
    stubRobotsCoordinator(crawler);
    try {
      await crawler.init();
      // Simulate that we've already downloaded the allowed number of pages
      crawler.stats.pagesDownloaded = 1;
      const fetchSpy = jest.spyOn(crawler.fetchPipeline, 'fetch');
      const res = await crawler.processPage(startUrl, 0, { type: 'nav', allowRevisit: true });
      // With pagesDownloaded >= maxDownloads, processPage should skip before network fetch
      expect(res).toEqual({ status: 'skipped' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      crawler.close();
    }
  });

  test('uses cached page when host is rate limited even if cache is stale', async () => {
    const startUrl = 'https://www.theguardian.com/world/2025/sep/27/example-story';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, preferCache: false, maxAgeMs: 0, rateLimitMs: 0, loggingNetwork: false, loggingFetching: false });
    disableNewAbstractionsAdapter(crawler);
    stubRobotsCoordinator(crawler);
    try {
      await crawler.init();
      const host = new URL(startUrl).hostname;
      crawler.cache.get = async () => ({ html: '<html><body><h1>Cached</h1></body></html>', crawledAt: new Date(Date.now() - 3600 * 1000).toISOString(), source: 'db' });
      crawler.fetchPipeline.fetchFn = jest.fn(() => { throw new Error('should not fetch during rate limit'); });
      crawler.note429(host, 120000);
      crawler.enqueueRequest({ url: startUrl, depth: 0, type: 'article' });
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
      expect(crawler.fetchPipeline.fetchFn).not.toHaveBeenCalled();
      expect(crawler.stats.cacheRateLimitedServed).toBeGreaterThan(0);
    } finally {
      crawler.close();
    }
  });

  test('defers queue items without cache when host is rate limited', async () => {
    const startUrl = 'https://www.theguardian.com/world/2025/sep/27/example-story-2';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const crawler = new NewsCrawler(startUrl, { enableDb: false, useSitemap: false, concurrency: 1, maxDepth: 0, preferCache: false, rateLimitMs: 0, loggingNetwork: false, loggingFetching: false });
    disableNewAbstractionsAdapter(crawler);
    stubRobotsCoordinator(crawler);
    try {
      await crawler.init();
      const host = new URL(startUrl).hostname;
      crawler.cache.get = async () => null;
      crawler.note429(host, 60000);
      crawler.enqueueRequest({ url: startUrl, depth: 0, type: 'nav' });
      const pick = await crawler._pullNextWorkItem();
      expect(!pick || !pick.item).toBe(true);
      expect(pick && pick.wakeAt).toBeTruthy();
      expect(crawler.stats.cacheRateLimitedDeferred).toBeGreaterThan(0);
      expect(crawler.queue.size()).toBe(1);
      expect(crawler.queue.peek().deferredUntil).toBeDefined();
    } finally {
      crawler.close();
    }
  });
});
