const { RobotsAndSitemapCoordinator } = require('../RobotsAndSitemapCoordinator');

describe('RobotsAndSitemapCoordinator', () => {
  const createCoordinator = (overrides = {}) => {
    const fetchImpl = overrides.fetchImpl || jest.fn(async () => ({
      ok: true,
      text: async () => 'User-agent: *',
    }));

    const robotsParser = overrides.robotsParser || jest.fn(() => ({
      getSitemaps: jest.fn(() => ['https://example.com/sitemap.xml']),
      isAllowed: jest.fn(() => true)
    }));

    const loadSitemaps = overrides.loadSitemaps || jest.fn(async (_baseUrl, _domain, _urls, { push }) => {
      const sitemapUrls = overrides.__sitemapUrls || [
        'https://example.com/news/story-1',
        'https://example.com/news/story-2?utm=1'
      ];
      sitemapUrls.forEach((url) => push(url));
      return sitemapUrls.length;
    });

    const getUrlDecision = overrides.getUrlDecision || jest.fn((url) => ({
      allow: true,
      analysis: { normalized: url }
    }));

    const handlePolicySkip = overrides.handlePolicySkip || jest.fn();
    const isOnDomain = overrides.isOnDomain || jest.fn(() => true);
    const looksLikeArticle = overrides.looksLikeArticle || jest.fn(() => true);
    const enqueueRequest = overrides.enqueueRequest || jest.fn();
    const emitProgress = overrides.emitProgress || jest.fn();
    const getQueueSize = overrides.getQueueSize || jest.fn(() => 0);

    const coordinator = new RobotsAndSitemapCoordinator({
      baseUrl: 'https://example.com',
      domain: 'example.com',
      fetchImpl,
      robotsParser,
      loadSitemaps,
      useSitemap: overrides.useSitemap !== undefined ? overrides.useSitemap : true,
      sitemapMaxUrls: overrides.sitemapMaxUrls || 5000,
      getUrlDecision,
      handlePolicySkip,
      isOnDomain,
      looksLikeArticle,
      enqueueRequest,
      emitProgress,
      getQueueSize,
      logger: { log: jest.fn() }
    });

    return {
      coordinator,
      fetchImpl,
      robotsParser,
      loadSitemaps,
      getUrlDecision,
      handlePolicySkip,
      isOnDomain,
      looksLikeArticle,
      enqueueRequest,
      emitProgress,
      getQueueSize
    };
  };

  test('loadRobotsTxt records sitemap declarations', async () => {
    const robotsRules = {
      getSitemaps: jest.fn(() => ['sitemap.xml']),
      isAllowed: jest.fn(() => true)
    };
    const robotsParser = jest.fn(() => robotsRules);
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      text: async () => 'Sitemap: https://example.com/alt-sitemap.xml'
    }));

    const { coordinator } = createCoordinator({ robotsParser, fetchImpl });
    await coordinator.loadRobotsTxt();

    expect(coordinator.robotsTxtLoaded).toBe(true);
    expect(coordinator.robotsRules).toBe(robotsRules);
    expect(coordinator.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
  });

  test('loadRobotsTxt falls back to scanning text when parser lacks sitemap helper', async () => {
    const robotsParser = jest.fn(() => ({
      isAllowed: jest.fn(() => true)
    }));
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      text: async () => 'Sitemap: https://example.com/fallback.xml'
    }));

    const { coordinator } = createCoordinator({ robotsParser, fetchImpl });
    await coordinator.loadRobotsTxt();

    expect(coordinator.sitemapUrls).toEqual(['https://example.com/fallback.xml']);
  });

  test('loadSitemapsAndEnqueue enqueues eligible urls and skips policy rejects', async () => {
    const decisions = new Map([
      ['https://example.com/news/story-1', { allow: true, analysis: { normalized: 'https://example.com/news/story-1' } }],
      ['https://example.com/news/story-2?utm=1', { allow: false, reason: 'query-superfluous', analysis: { normalized: 'https://example.com/news/story-2' } }]
    ]);

    const getUrlDecision = jest.fn((url) => decisions.get(url));
    const handlePolicySkip = jest.fn();
    const enqueueRequest = jest.fn();
    const emitProgress = jest.fn();
    const getQueueSize = jest.fn(() => 7);

    const { coordinator } = createCoordinator({
      getUrlDecision,
      handlePolicySkip,
      enqueueRequest,
      emitProgress,
      getQueueSize,
      __sitemapUrls: Array.from(decisions.keys())
    });

    coordinator.robotsTxtLoaded = true;
    coordinator.robotsRules = { isAllowed: () => true };

    await coordinator.loadSitemapsAndEnqueue();

    expect(enqueueRequest).toHaveBeenCalledWith({
      url: 'https://example.com/news/story-1',
      depth: 0,
      type: 'article'
    });
    expect(handlePolicySkip).toHaveBeenCalledWith(decisions.get('https://example.com/news/story-2?utm=1'), {
      depth: 0,
      queueSize: 7
    });
    expect(coordinator.sitemapDiscovered).toBe(1);
    expect(emitProgress).toHaveBeenCalled();
  });

  test('isAllowed falls back to true when robots not loaded', () => {
    const { coordinator } = createCoordinator();
    expect(coordinator.isAllowed('https://example.com/page')).toBe(true);
  });
});
