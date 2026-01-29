jest.mock('jsdom', () => {
  class MockVirtualConsole {
    constructor() {
      this.listeners = new Map();
    }

    on(event, handler) {
      if (typeof handler === 'function') {
        this.listeners.set(event, handler);
      }
    }
  }

  class MockJSDOM {
    constructor(html = '', options = {}) {
      this.html = html;
      this.options = options;
      this.window = {
        document: {
          querySelector: () => null,
          querySelectorAll: () => [],
          createElement: () => ({})
        }
      };
    }
  }

  return {
    JSDOM: MockJSDOM,
    VirtualConsole: MockVirtualConsole
  };
});

const NewsCrawler = require('../../../crawl');

const START_URL = 'https://example.com';

function createCrawler(options = {}) {
  const crawler = new NewsCrawler(START_URL, {
    concurrency: 2,
    jobId: 'test-job',
    enableDb: false,
    preferCache: false,
    useSitemap: false,
    maxQueue: 100,
    ...options
  });

  jest.spyOn(crawler.telemetry, 'queueEvent').mockImplementation(() => {});
  jest.spyOn(crawler.telemetry, 'problem').mockImplementation(() => {});
  jest.spyOn(crawler.telemetry, 'milestone');
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
    expect(crawler.telemetry.queueEvent).toHaveBeenCalledWith(
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
    expect(crawler.telemetry.queueEvent).toHaveBeenCalledWith(
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

  it('applies hub freshness policy to startup hub requests', () => {
    const crawler = createCrawler();
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      refreshOnStartup: true,
      maxCacheAgeMs: 600000,
      firstPageMaxAgeMs: 120000,
      fallbackToCacheOnFailure: false
    };

    crawler.enqueueRequest({
      url: START_URL,
      depth: 0,
      type: 'nav'
    });

    const queued = crawler.queue.peek();
    expect(queued.meta).toEqual(expect.objectContaining({
      fetchPolicy: 'network-first',
      maxCacheAgeMs: 120000,
      fallbackToCache: false
    }));
  });

  it('respects refreshOnStartup=false while still applying cache thresholds', () => {
    const crawler = createCrawler();
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      refreshOnStartup: false,
      maxCacheAgeMs: 900000,
      firstPageMaxAgeMs: 450000,
      fallbackToCacheOnFailure: true
    };

    crawler.enqueueRequest({
      url: `${START_URL}/home`,
      depth: 0,
      type: 'nav'
    });

    const queued = crawler.queue.peek();
    expect(queued.meta?.fetchPolicy).toBeUndefined();
    expect(queued.meta?.maxCacheAgeMs).toBe(450000);
  });

  it('applies max cache age to non-root hub navigation', () => {
    const crawler = createCrawler();
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      refreshOnStartup: true,
      maxCacheAgeMs: 300000,
      firstPageMaxAgeMs: 120000,
      fallbackToCacheOnFailure: true
    };

    const hubUrl = `${START_URL}/world`;
    crawler.enqueueRequest({
      url: hubUrl,
      depth: 2,
      type: 'nav'
    });

    const queued = crawler.queue.peek();
    expect(queued.meta?.maxCacheAgeMs).toBe(300000);
    expect(queued.meta?.fetchPolicy).toBeUndefined();
  });

  it('does not persist hub freshness decision traces by default', () => {
    const crawler = createCrawler({ jobId: 'job-no-trace' });
    const adapter = { insertMilestone: jest.fn() };
    crawler.events.getEnhancedDbAdapter = () => adapter;
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      refreshOnStartup: true,
      maxCacheAgeMs: 600000,
      firstPageMaxAgeMs: 120000,
      fallbackToCacheOnFailure: false
    };

    crawler.enqueueRequest({
      url: START_URL,
      depth: 0,
      type: 'nav'
    });

    expect(adapter.insertMilestone).not.toHaveBeenCalled();
  });

  it('persists hub freshness decision traces when enabled', () => {
    const crawler = createCrawler({ jobId: 'job-trace' });
    const adapter = { insertMilestone: jest.fn() };
    crawler.events.getEnhancedDbAdapter = () => adapter;
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      refreshOnStartup: true,
      maxCacheAgeMs: 600000,
      firstPageMaxAgeMs: 120000,
      fallbackToCacheOnFailure: false,
      persistDecisionTraces: true
    };

    crawler.enqueueRequest({
      url: START_URL,
      depth: 0,
      type: 'nav'
    });

    expect(adapter.insertMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-trace',
        kind: 'hub-freshness-decision',
        target: START_URL
      })
    );
  });

  it('does not persist URL policy skip decision traces by default', () => {
    const crawler = createCrawler({ jobId: 'job-skip-no-trace' });
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      persistDecisionTraces: false
    };

    crawler._handlePolicySkip({
      allow: false,
      reason: 'query-skip',
      analysis: {
        raw: `${START_URL}/?utm_source=test`,
        normalized: `${START_URL}/`
      }
    }, { depth: 1, queueSize: 5 });

    expect(crawler.telemetry.milestone).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'skip-reason-decision' })
    );
  });

  it('persists URL policy skip decision traces when enabled', () => {
    const crawler = createCrawler({ jobId: 'job-skip-trace' });
    crawler._cleanupHubFreshnessConfig();
    crawler.hubFreshnessConfig = {
      persistDecisionTraces: true
    };

    crawler._handlePolicySkip({
      allow: false,
      reason: 'query-skip',
      analysis: {
        raw: `${START_URL}/?utm_source=test`,
        normalized: `${START_URL}/`
      },
      guessedUrl: `${START_URL}/`
    }, { depth: 2, queueSize: 7 });

    expect(crawler.telemetry.milestone).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'skip-reason-decision',
        persist: true,
        target: `${START_URL}/`
      })
    );
  });
});
