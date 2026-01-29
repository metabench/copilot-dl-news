const { PageExecutionService } = require('../PageExecutionService');

describe('PageExecutionService structure-only mode', () => {
  test('skips content acquisition for article pages', async () => {
    const fetchPipeline = {
      fetch: jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html><body>Article</body></html>',
        meta: { url: 'https://example.com/article' }
      })
    };
    const navService = {
      discover: jest.fn().mockReturnValue({
        looksLikeArticle: true,
        classification: 'article',
        navigationLinks: [],
        articleLinks: [],
        allLinks: [],
        linkSummary: {},
        $: null
      })
    };
    const contentService = { acquire: jest.fn() };
    const enqueueRequest = jest.fn();
    const state = {
      addVisited: jest.fn(),
      incrementPagesVisited: jest.fn(),
      incrementPagesDownloaded: jest.fn(),
      incrementBytesDownloaded: jest.fn(),
      incrementArticlesFound: jest.fn(),
      incrementArticlesSaved: jest.fn(),
      incrementErrors: jest.fn(),
      incrementStructureNavPages: jest.fn(),
      recordStructureArticleLinks: jest.fn(),
      hasSeededHub: () => false,
      hasVisitedHub: () => false,
      markSeededHubVisited: jest.fn(),
      getSeededHubMeta: () => null
    };

    const service = new PageExecutionService({
      maxDepth: 5,
      getStats: () => ({ pagesDownloaded: 0 }),
      state,
      fetchPipeline,
      navigationDiscoveryService: navService,
      contentAcquisitionService: contentService,
      articleProcessor: null,
      milestoneTracker: null,
      adaptiveSeedPlanner: null,
      enqueueRequest,
      telemetry: null,
      recordError: jest.fn(),
      normalizeUrl: (url) => url,
      looksLikeArticle: () => true,
      noteDepthVisit: jest.fn(),
      emitProgress: jest.fn(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      computeContentSignals: jest.fn(),
      computeUrlSignals: jest.fn(),
      combineSignals: jest.fn(),
      structureOnly: true
    });

    const result = await service.processPage({ url: 'https://example.com/article', depth: 1, context: {} });

    expect(result.status).toBe('success');
    expect(contentService.acquire).not.toHaveBeenCalled();
    expect(enqueueRequest).not.toHaveBeenCalled();
    expect(state.incrementStructureNavPages).not.toHaveBeenCalled();
    expect(state.recordStructureArticleLinks).not.toHaveBeenCalled();
  });

  test('records structure stats for navigation pages', async () => {
    const fetchPipeline = {
      fetch: jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html><body><a href="/world/foo">Foo</a></body></html>',
        meta: { url: 'https://example.com/world' }
      })
    };
    const navService = {
      discover: jest.fn().mockReturnValue({
        looksLikeArticle: false,
        classification: 'nav',
        navigationLinks: [{ url: 'https://example.com/world' }],
        articleLinks: [{ url: 'https://example.com/world/foo' }],
        allLinks: [{ url: 'https://example.com/world/foo', type: 'article' }],
        linkSummary: {},
        $: null
      })
    };
    const contentService = { acquire: jest.fn() };
    const enqueueRequest = jest.fn();
    const state = {
      addVisited: jest.fn(),
      incrementPagesVisited: jest.fn(),
      incrementPagesDownloaded: jest.fn(),
      incrementBytesDownloaded: jest.fn(),
      incrementArticlesFound: jest.fn(),
      incrementArticlesSaved: jest.fn(),
      incrementErrors: jest.fn(),
      incrementStructureNavPages: jest.fn(),
      recordStructureArticleLinks: jest.fn(),
      hasSeededHub: () => false,
      hasVisitedHub: () => false,
      markSeededHubVisited: jest.fn(),
      getSeededHubMeta: () => null
    };

    const service = new PageExecutionService({
      maxDepth: 5,
      getStats: () => ({ pagesDownloaded: 0 }),
      state,
      fetchPipeline,
      navigationDiscoveryService: navService,
      contentAcquisitionService: contentService,
      articleProcessor: null,
      milestoneTracker: null,
      adaptiveSeedPlanner: null,
      enqueueRequest,
      telemetry: null,
      recordError: jest.fn(),
      normalizeUrl: (url) => url,
      looksLikeArticle: () => false,
      noteDepthVisit: jest.fn(),
      emitProgress: jest.fn(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      computeContentSignals: jest.fn(),
      computeUrlSignals: jest.fn(),
      combineSignals: jest.fn(),
      structureOnly: true
    });

    const result = await service.processPage({ url: 'https://example.com/world', depth: 1, context: {} });

    expect(result.status).toBe('success');
    expect(contentService.acquire).not.toHaveBeenCalled();
    expect(state.incrementStructureNavPages).toHaveBeenCalledWith();
    expect(state.recordStructureArticleLinks).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ url: 'https://example.com/world/foo' })
    ]));
  });
});
