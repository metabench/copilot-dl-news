'use strict';

const { CrawlOperation } = require('news-crawler-itself/crawl-operations');

// P4: CrawlOperation.run() gained a hook that calls the already-tested
// NewsCrawler.prototype.seedUrls() when options.seedUrls is present, right
// after createCrawler() and before crawler.crawl(). This is a focused unit
// test on that hook alone — a mock crawler stands in for NewsCrawler so the
// test doesn't need real network/DB machinery.
function makeMockCrawler(overrides = {}) {
  return {
    seedUrls: jest.fn(),
    crawl: jest.fn().mockResolvedValue(undefined),
    stats: {},
    ...overrides
  };
}

describe('CrawlOperation seedUrls hook', () => {
  test('calls crawler.seedUrls() with the override array before crawl()', async () => {
    const crawler = makeMockCrawler();
    const createCrawler = jest.fn(() => crawler);
    const op = new CrawlOperation({ name: 'test-op' });
    const callOrder = [];
    crawler.seedUrls.mockImplementation(() => { callOrder.push('seedUrls'); });
    crawler.crawl.mockImplementation(async () => { callOrder.push('crawl'); });

    await op.run({
      startUrl: 'https://example.com/first',
      overrides: { seedUrls: ['https://example.com/second', 'https://example.com/third'] },
      createCrawler
    });

    expect(crawler.seedUrls).toHaveBeenCalledTimes(1);
    expect(crawler.seedUrls).toHaveBeenCalledWith(
      ['https://example.com/second', 'https://example.com/third'],
      expect.objectContaining({ source: 'frontier-run' })
    );
    expect(callOrder).toEqual(['seedUrls', 'crawl']); // seeded BEFORE crawl() runs
  });

  test('does nothing when seedUrls override is absent', async () => {
    const crawler = makeMockCrawler();
    const createCrawler = jest.fn(() => crawler);
    const op = new CrawlOperation({ name: 'test-op' });

    await op.run({ startUrl: 'https://example.com/only', createCrawler });

    expect(crawler.seedUrls).not.toHaveBeenCalled();
  });

  test('does nothing when seedUrls override is an empty array', async () => {
    const crawler = makeMockCrawler();
    const createCrawler = jest.fn(() => crawler);
    const op = new CrawlOperation({ name: 'test-op' });

    await op.run({ startUrl: 'https://example.com/only', overrides: { seedUrls: [] }, createCrawler });

    expect(crawler.seedUrls).not.toHaveBeenCalled();
  });

  test('does not throw when the crawler has no seedUrls method (defensive)', async () => {
    const crawler = makeMockCrawler({ seedUrls: undefined });
    const createCrawler = jest.fn(() => crawler);
    const op = new CrawlOperation({ name: 'test-op' });

    await expect(op.run({
      startUrl: 'https://example.com/first',
      overrides: { seedUrls: ['https://example.com/second'] },
      createCrawler
    })).resolves.toMatchObject({ status: 'ok' });
  });

  test('jobId flows through to the seedUrls meta when provided', async () => {
    const crawler = makeMockCrawler();
    const createCrawler = jest.fn(() => crawler);
    const op = new CrawlOperation({ name: 'test-op' });

    await op.run({
      startUrl: 'https://example.com/first',
      overrides: { seedUrls: ['https://example.com/second'], jobId: 'job-123' },
      createCrawler
    });

    expect(crawler.seedUrls).toHaveBeenCalledWith(
      ['https://example.com/second'],
      expect.objectContaining({ source: 'frontier-run', jobId: 'job-123' })
    );
  });
});
