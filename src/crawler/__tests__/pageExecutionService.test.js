const { PageExecutionService } = require('../PageExecutionService');

const createStateMock = () => ({
  addVisited: jest.fn(),
  incrementPagesVisited: jest.fn(),
  incrementPagesDownloaded: jest.fn(),
  incrementBytesDownloaded: jest.fn(),
  incrementArticlesFound: jest.fn(),
  incrementArticlesSaved: jest.fn(),
  incrementErrors: jest.fn(),
  hasSeededHub: jest.fn(() => false),
  markSeededHubVisited: jest.fn(),
  hasVisitedHub: jest.fn(() => false),
  getSeededHubMeta: jest.fn(() => ({}))
});

describe('PageExecutionService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseDeps = () => {
    const state = createStateMock();
    return {
      maxDepth: 2,
      maxDownloads: undefined,
      getStats: () => ({
        pagesDownloaded: 0
      }),
      state,
      fetchPipeline: {
        fetch: jest.fn()
      },
      articleProcessor: {
        process: jest.fn()
      },
      milestoneTracker: {
        checkAnalysisMilestones: jest.fn()
      },
      adaptiveSeedPlanner: {
        seedFromArticle: jest.fn()
      },
      enqueueRequest: jest.fn(),
      telemetry: {
        problem: jest.fn()
      },
      recordError: jest.fn(),
      normalizeUrl: (url) => url,
      looksLikeArticle: () => false,
      noteDepthVisit: jest.fn(),
      emitProgress: jest.fn(),
      getDbAdapter: () => ({ isEnabled: () => false }),
      computeContentSignals: () => ({ content: 1 }),
      computeUrlSignals: () => ({ url: 1 }),
      combineSignals: (urlSig, contentSig) => ({ urlSig, contentSig })
    };
  };

  test('returns undefined when depth exceeds maxDepth', async () => {
    const deps = baseDeps();
    deps.maxDepth = 1;
    const service = new PageExecutionService(deps);

    const result = await service.processPage({
      url: 'https://example.com',
      depth: 3,
      context: {}
    });

    expect(result).toBeUndefined();
    expect(deps.fetchPipeline.fetch).not.toHaveBeenCalled();
  });

  test('processes network pages and enqueues discovered links', async () => {
    const deps = baseDeps();
    deps.fetchPipeline.fetch.mockResolvedValue({
      source: 'network',
      meta: {
        url: 'https://example.com/article',
        fetchMeta: {
          bytesDownloaded: 512
        }
      },
      html: '<html></html>'
    });

    deps.articleProcessor.process.mockResolvedValue({
      statsDelta: {
        articlesFound: 1
      },
      navigationLinks: [{ url: 'https://example.com/nav', type: 'nav' }],
      articleLinks: [],
      allLinks: [
        { url: 'https://example.com/nav', type: 'nav' },
        { url: 'https://example.com/nav', type: 'nav' } // duplicate to ensure dedupe
      ],
      isArticle: true,
      metadata: { id: '123' }
    });

    const service = new PageExecutionService(deps);

    const result = await service.processPage({
      url: 'https://example.com/article',
      depth: 1,
      context: {}
    });

    expect(result).toEqual({ status: 'success' });
    expect(deps.fetchPipeline.fetch).toHaveBeenCalledTimes(1);
    expect(deps.articleProcessor.process).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/article',
      persistArticle: false
    }));
    expect(deps.state.incrementPagesVisited).toHaveBeenCalled();
    expect(deps.state.incrementPagesDownloaded).toHaveBeenCalled();
    expect(deps.state.incrementBytesDownloaded).toHaveBeenCalledWith(512);
    expect(deps.state.incrementArticlesFound).toHaveBeenCalledWith(1);
    expect(deps.enqueueRequest).toHaveBeenCalledTimes(1);
    expect(deps.enqueueRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/nav',
      depth: 2
    }));
    expect(deps.milestoneTracker.checkAnalysisMilestones).toHaveBeenCalledWith({
      depth: 1,
      isArticle: true
    });
    expect(deps.adaptiveSeedPlanner.seedFromArticle).toHaveBeenCalledWith({
      url: 'https://example.com/article',
      metadata: { id: '123' },
      depth: 1
    });
  });

  test('marks seeded country hubs as visited and emits milestone', async () => {
    const deps = baseDeps();
    deps.telemetry = {
      problem: jest.fn(),
      milestoneOnce: jest.fn()
    };
    deps.state.hasSeededHub.mockReturnValue(true);
    deps.state.hasVisitedHub.mockReturnValue(false);
    deps.state.getSeededHubMeta.mockReturnValue({
      kind: 'country',
      reason: 'country-candidate',
      source: 'country-planner'
    });
    deps.fetchPipeline.fetch.mockResolvedValue({
      source: 'network',
      meta: {
        url: 'https://example.com/world/france'
      },
      html: '<html></html>'
    });
    deps.articleProcessor.process.mockResolvedValue({
      statsDelta: null,
      navigationLinks: [],
      articleLinks: [],
      allLinks: [],
      isArticle: false
    });

    const service = new PageExecutionService(deps);

    await service.processPage({
      url: 'https://example.com/world/france',
      depth: 1,
      context: {}
    });

    expect(deps.state.markSeededHubVisited).toHaveBeenCalledWith('https://example.com/world/france', expect.objectContaining({
      depth: 1,
      fetchSource: 'network'
    }));
    expect(deps.telemetry.milestoneOnce).toHaveBeenCalledWith(
      'country-hub-found:https://example.com/world/france',
      expect.objectContaining({
        kind: 'country-hub-found',
        details: expect.objectContaining({
          hubKind: 'country'
        })
      })
    );
  });

  test('handles cached pages and records fetch metadata', async () => {
    const insertFetch = jest.fn();
    const deps = baseDeps();
    deps.looksLikeArticle = () => true;
    deps.fetchPipeline.fetch.mockResolvedValue({
      source: 'cache',
      meta: {
        url: 'https://example.com/cached'
      },
      html: '<html><body>cached</body></html>'
    });
    deps.getDbAdapter = () => ({
      isEnabled: () => true,
      insertFetch
    });

    const service = new PageExecutionService(deps);

    const result = await service.processPage({
      url: 'https://example.com/cached',
      depth: 0,
      context: {}
    });

    expect(result).toEqual({ status: 'cache' });
    expect(deps.state.addVisited).toHaveBeenCalledWith('https://example.com/cached');
    expect(deps.state.incrementPagesVisited).toHaveBeenCalled();
    expect(deps.state.incrementArticlesFound).toHaveBeenCalled();
    expect(insertFetch).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/cached',
      classification: 'article'
    }));
    expect(deps.milestoneTracker.checkAnalysisMilestones).toHaveBeenCalledWith({
      depth: 0,
      isArticle: true
    });
    expect(deps.enqueueRequest).not.toHaveBeenCalled();
  });
});
