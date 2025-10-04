'use strict';

const { NavigationDiscoveryRunner } = require('../planner/navigation/NavigationDiscoveryRunner');

describe('NavigationDiscoveryRunner', () => {
  const samplePages = {
    'https://example.com/': `<!doctype html>
      <html>
        <body>
          <header>
            <nav>
              <a href="/world">World</a>
              <a href="/politics">Politics</a>
              <a href="/opinion">Opinion</a>
            </nav>
          </header>
        </body>
      </html>`,
    'https://example.com/front': `<!doctype html>
      <html>
        <body>
          <nav>
            <a href="/business">Business</a>
            <a href="/world">World</a>
            <a href="/live">Live</a>
          </nav>
        </body>
      </html>`
  };

  const buildRunner = () => {
    const fetchPage = jest.fn(async ({ url }) => ({
      source: 'network',
      html: samplePages[url] || samplePages['https://example.com/']
    }));
    const getCachedArticle = jest.fn(async (url) => ({ html: samplePages[url] }));

    const runner = new NavigationDiscoveryRunner({
      fetchPage,
      getCachedArticle,
      baseUrl: 'https://example.com/',
      normalizeUrl: (value) => value.replace(/\/$/, '').toLowerCase(),
      maxPages: 2,
      maxLinksPerPage: 10,
      logger: { warn: jest.fn() }
    });

    return { runner, fetchPage, getCachedArticle };
  };

  it('summarises navigation entry points from provided seeds', async () => {
    const { runner, fetchPage } = buildRunner();

    const result = await runner.run({
      startUrl: 'https://example.com/',
      seeds: ['https://example.com/front']
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.summary.totalLinks).toBeGreaterThanOrEqual(3);
    expect(result.summary.primary + result.summary.secondary + result.summary.categories)
      .toBeGreaterThan(0);
    const topLinkUrls = result.summary.topLinks.map((entry) => entry.url);
    expect(topLinkUrls.some((url) => url && url.includes('/world'))).toBe(true);
    expect(result.merged.links[0].occurrences).toBeGreaterThan(0);
  });
});
