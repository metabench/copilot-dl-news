const { PageExecutionService } = require('../PageExecutionService');
const { CrawlerState } = require('../CrawlerState');

describe('PageExecutionService hub-only mode', () => {
  test('records hub links without enqueuing article pages', async () => {
    const hubUrl = 'https://example.com/world/france';
    const articleUrl = 'https://example.com/news/paris-story';
    const paginationUrl = 'https://example.com/world/france?page=2';

    const fetchPipeline = {
      fetch: jest.fn().mockResolvedValue({
        source: 'network',
        html: '<html></html>',
        meta: { url: hubUrl }
      })
    };

    const navigationDiscoveryService = {
      discover: jest.fn().mockReturnValue({
        looksLikeArticle: false,
        navigationLinks: [{ url: paginationUrl, type: 'pagination' }],
        articleLinks: [{ url: articleUrl, type: 'article' }],
        allLinks: [
          { url: articleUrl, type: 'article' },
          { url: paginationUrl, type: 'pagination' }
        ],
        linkSummary: {},
        $: null
      })
    };

    const contentAcquisitionService = { acquire: jest.fn() };
    const enqueueRequest = jest.fn();

    const state = new CrawlerState();
    state.addSeededHub(hubUrl, { kind: 'country', countryName: 'France' });

    const profile = {
      state: { totalCountries: 250 },
      updateProgress: jest.fn()
    };

    const service = new PageExecutionService({
      maxDepth: 2,
      getStats: () => ({ pagesDownloaded: 0 }),
      state,
      fetchPipeline,
      navigationDiscoveryService,
      contentAcquisitionService,
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
      structureOnly: true,
      hubOnlyMode: true,
      getCountryHubBehavioralProfile: () => profile
    });

    jest.spyOn(service, '_isTotalPrioritisationEnabled').mockReturnValue(false);

    await service.processPage({ url: hubUrl, depth: 0, context: {} });

    expect(enqueueRequest).toHaveBeenCalledTimes(1);
    expect(enqueueRequest.mock.calls[0][0].url).toBe(paginationUrl);
    expect(state.getCountryHubProgress()).toEqual({ discovered: 1, validated: 1, articleUrls: 1 });
    expect(profile.updateProgress).toHaveBeenCalled();
  });
});
