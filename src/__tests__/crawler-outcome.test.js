const NewsCrawler = require('../crawl');

class FatalCrawler extends NewsCrawler {
  constructor(startUrl, options = {}) {
    super(startUrl, { enableDb: false, useSitemap: false, sitemapOnly: false, ...options });
  }

  async init() {
    // Simulate an initialization fatal failure (e.g., SQLite unavailable)
    this.fatalIssues.push({ kind: 'db-open-failed', message: 'mocked failure' });
  }

  async loadRobotsTxt() {
    // Skip network fetches in tests
  }

  async processPage() {
    // No-op to avoid real crawling work
    return { status: 'ok' };
  }

  emitProgress() {
    // Suppress noisy progress logging during tests
  }
}

class NoProgressCrawler extends NewsCrawler {
  constructor(startUrl, options = {}) {
    super(startUrl, { enableDb: false, useSitemap: false, sitemapOnly: false, ...options });
  }

  async init() {
    // No fatal issues; just skip heavy initialization
  }

  async loadRobotsTxt() {
    // Skip network fetches in tests
  }

  async processPage(url) {
    // Simulate repeated network failures without any successful downloads
    this.stats.errors += 1;
    this._recordError({ kind: 'network', code: 'ECONNRESET', url });
    return { status: 'failed', retriable: false };
  }

  emitProgress() {
    // Suppress noisy progress logging during tests
  }
}

describe('NewsCrawler outcome handling', () => {
  test('sequential crawl rejects when a fatal initialization issue is recorded', async () => {
    const crawler = new FatalCrawler('https://example.com');
    await expect(crawler.crawl()).rejects.toMatchObject({ code: 'CRAWL_FATAL' });
  });

  test('concurrent crawl rejects when a fatal initialization issue is recorded', async () => {
    const crawler = new FatalCrawler('https://example.com', { concurrency: 2 });
    await expect(crawler.crawl()).rejects.toMatchObject({ code: 'CRAWL_FATAL' });
  });

  test('sequential crawl rejects when no pages download and errors accumulate', async () => {
    const crawler = new NoProgressCrawler('https://example.com');
    await expect(crawler.crawl()).rejects.toMatchObject({ code: 'CRAWL_NO_PROGRESS' });
  });
});
