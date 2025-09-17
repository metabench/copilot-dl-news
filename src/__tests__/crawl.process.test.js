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
});
