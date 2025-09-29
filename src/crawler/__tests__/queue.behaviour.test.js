const NewsCrawler = require('../../crawl');

const START_URL = 'https://example.com';

function createCrawler(options = {}) {
  const crawler = new NewsCrawler(START_URL, {
    concurrency: 2,
    enableDb: false,
    preferCache: false,
    useSitemap: false,
    maxQueue: 100,
    ...options
  });

  jest.spyOn(crawler, 'emitQueueEvent').mockImplementation(() => {});
  jest.spyOn(crawler, 'emitProblem').mockImplementation(() => {});
  jest.spyOn(crawler.cache, 'get').mockResolvedValue(null);

  return crawler;
}

describe('NewsCrawler queue behaviour (pre-extraction)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drops off-domain URLs during enqueue', () => {
    const crawler = createCrawler();

    const accepted = crawler.enqueueRequest({
      url: 'https://other-domain.com/news',
      depth: 0,
      type: 'nav'
    });

    expect(accepted).toBe(false);
    expect(crawler.emitQueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'drop',
        reason: 'off-domain'
      })
    );
  expect(crawler.queue.size()).toBe(0);
  });

  it('deduplicates identical URLs when allowRevisit is false', () => {
    const crawler = createCrawler();
    const url = `${START_URL}/politics/election-day`;

    const first = crawler.enqueueRequest({
      url,
      depth: 1,
      type: 'nav'
    });
    const second = crawler.enqueueRequest({
      url,
      depth: 2,
      type: 'nav'
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(crawler.emitQueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'drop',
        reason: 'duplicate'
      })
    );
  expect(crawler.queue.size()).toBe(1);
  });

  it('treats known articles as refresh tasks', () => {
    const crawler = createCrawler();
    const articleUrl = `${START_URL}/world/2025/09/28/major-event`;

    crawler.dbAdapter = {
      isEnabled: () => true,
      getArticleRowByUrl: jest.fn().mockReturnValue({ id: 1 }),
      getArticleByUrlOrCanonical: jest.fn().mockReturnValue(null)
    };

    const accepted = crawler.enqueueRequest({
      url: articleUrl,
      depth: 1,
      type: 'article'
    });

    expect(accepted).toBe(true);
  const queued = crawler.queue.peek();
    expect(queued.type).toBe('refresh');
    expect(queued.queueKey.startsWith('refresh:')).toBe(true);
  });

  it('serves cached pages when host is rate-limited', async () => {
    const crawler = createCrawler();
    const cachedUrl = `${START_URL}/world/cache-hit`;

    crawler.enqueueRequest({
      url: cachedUrl,
      depth: 0,
      type: 'nav'
    });

    const host = crawler._safeHostFromUrl(cachedUrl);

    jest.spyOn(crawler, '_getHostResumeTime').mockReturnValue(null);
    jest.spyOn(crawler, '_isHostRateLimited').mockReturnValue(true);

    crawler.cache.get.mockResolvedValue({
      url: cachedUrl,
      html: '<html></html>'
    });

    const pick = await crawler._pullNextWorkItem();

    expect(pick.item.url).toBe(cachedUrl);
    expect(pick.context).toEqual(
      expect.objectContaining({
        forceCache: true,
        rateLimitedHost: host
      })
    );
  });
});
