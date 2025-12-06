'use strict';

const {
  buildPageProcessingSteps,
  processPagePipeline,
  createCheckDepthStep,
  createCheckDownloadLimitStep,
  createFetchStep,
  createParseHtmlStep,
  createDetectArticleStep,
  createExtractLinksStep,
  createEnqueueLinksStep,
  createProcessArticleStep,
  createUpdateStateStep,
  createRecordMetricsStep
} = require('../../../src/crawler/pipeline/pageProcessingPipeline');

// Mock dependencies factory
function createMockDeps(overrides = {}) {
  return {
    maxDepth: 3,
    maxDownloads: undefined,
    getStats: jest.fn().mockReturnValue({ pagesDownloaded: 0, visited: 0 }),
    state: {
      addVisited: jest.fn(),
      incrementPagesVisited: jest.fn(),
      incrementArticlesFound: jest.fn()
    },
    fetchPipeline: {
      fetch: jest.fn().mockResolvedValue({
        meta: { url: 'https://example.com/page' },
        source: 'network',
        html: '<html><body><h1>Test</h1><a href="/link1">Link 1</a></body></html>'
      })
    },
    articleProcessor: {
      process: jest.fn().mockResolvedValue({ saved: true })
    },
    navigationDiscoveryService: {
      discover: jest.fn().mockReturnValue([
        { url: 'https://example.com/link1', type: 'nav' }
      ])
    },
    enqueueRequest: jest.fn(),
    telemetry: {
      pageProcessed: jest.fn()
    },
    looksLikeArticle: jest.fn().mockReturnValue(false),
    ...overrides
  };
}

describe('pageProcessingPipeline', () => {
  describe('createCheckDepthStep', () => {
    it('allows processing within depth limit', async () => {
      const deps = createMockDeps({ maxDepth: 3 });
      const step = createCheckDepthStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 2 });
      expect(result.ok).toBe(true);
    });

    it('rejects processing beyond depth limit', async () => {
      const deps = createMockDeps({ maxDepth: 3 });
      const step = createCheckDepthStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 4 });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('depth-exceeded');
    });

    it('uses Infinity when maxDepth not set', async () => {
      const deps = createMockDeps({ maxDepth: undefined });
      const step = createCheckDepthStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 100 });
      expect(result.ok).toBe(true);
    });
  });

  describe('createCheckDownloadLimitStep', () => {
    it('allows processing when under download limit', async () => {
      const deps = createMockDeps({
        maxDownloads: 100,
        getStats: jest.fn().mockReturnValue({ pagesDownloaded: 50 })
      });
      const step = createCheckDownloadLimitStep(deps);
      const result = await step.execute({});
      expect(result.ok).toBe(true);
    });

    it('rejects when download limit reached', async () => {
      const deps = createMockDeps({
        maxDownloads: 100,
        getStats: jest.fn().mockReturnValue({ pagesDownloaded: 100 })
      });
      const step = createCheckDownloadLimitStep(deps);
      const result = await step.execute({});
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('download-limit-reached');
    });

    it('skips check when no download limit set', async () => {
      const deps = createMockDeps({ maxDownloads: undefined });
      const step = createCheckDownloadLimitStep(deps);
      const result = await step.execute({});
      expect(result.ok).toBe(true);
    });
  });

  describe('createFetchStep', () => {
    it('fetches page successfully', async () => {
      const deps = createMockDeps();
      const step = createFetchStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 0 });
      
      expect(result.ok).toBe(true);
      expect(result.value.html).toBeDefined();
      expect(result.value.fetchSource).toBe('network');
      expect(deps.fetchPipeline.fetch).toHaveBeenCalled();
    });

    it('fails when fetch returns null', async () => {
      const deps = createMockDeps({
        fetchPipeline: { fetch: jest.fn().mockResolvedValue(null) }
      });
      const step = createFetchStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 0 });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('fetch-empty');
    });

    it('fails when no fetch pipeline provided', async () => {
      const deps = createMockDeps({ fetchPipeline: null });
      const step = createFetchStep(deps);
      const result = await step.execute({ url: 'https://example.com', depth: 0 });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no-fetch-pipeline');
    });
  });

  describe('createParseHtmlStep', () => {
    it('parses HTML with cheerio', async () => {
      const deps = createMockDeps();
      const step = createParseHtmlStep(deps);
      const result = await step.execute({
        html: '<html><body><h1>Test</h1></body></html>'
      });
      
      expect(result.ok).toBe(true);
      expect(result.value.$).toBeDefined();
      expect(result.value.$('h1').text()).toBe('Test');
    });

    it('handles missing HTML gracefully', async () => {
      const deps = createMockDeps();
      const step = createParseHtmlStep(deps);
      const result = await step.execute({ html: null });
      
      expect(result.ok).toBe(true);
      expect(result.value.$).toBeNull();
    });
  });

  describe('createDetectArticleStep', () => {
    it('detects article using looksLikeArticle function', async () => {
      const deps = createMockDeps({
        looksLikeArticle: jest.fn().mockReturnValue(true)
      });
      const step = createDetectArticleStep(deps);
      const result = await step.execute({ url: 'https://example.com/article' });
      
      expect(result.ok).toBe(true);
      expect(result.value.isArticle).toBe(true);
    });

    it('defaults to false when no detector', async () => {
      const deps = createMockDeps({ looksLikeArticle: null });
      const step = createDetectArticleStep(deps);
      const result = await step.execute({ url: 'https://example.com' });
      
      expect(result.ok).toBe(true);
      expect(result.value.isArticle).toBe(false);
    });
  });

  describe('createExtractLinksStep', () => {
    it('extracts links using navigation service', async () => {
      const mockLinks = [
        { url: 'https://example.com/a', type: 'nav' },
        { url: 'https://example.com/b', type: 'article' }
      ];
      const deps = createMockDeps({
        navigationDiscoveryService: {
          discover: jest.fn().mockReturnValue(mockLinks)
        }
      });
      const cheerio = require('cheerio');
      const $ = cheerio.load('<html></html>');
      
      const step = createExtractLinksStep(deps);
      const result = await step.execute({
        url: 'https://example.com',
        $
      });
      
      expect(result.ok).toBe(true);
      expect(result.value.links).toEqual(mockLinks);
    });

    it('returns empty array when no service available', async () => {
      const deps = createMockDeps({ navigationDiscoveryService: null });
      const step = createExtractLinksStep(deps);
      const result = await step.execute({ url: 'https://example.com' });
      
      expect(result.ok).toBe(true);
      expect(result.value.links).toEqual([]);
    });
  });

  describe('createEnqueueLinksStep', () => {
    it('enqueues discovered links', async () => {
      const deps = createMockDeps();
      const step = createEnqueueLinksStep(deps);
      const result = await step.execute({
        depth: 1,
        links: [
          { url: 'https://example.com/a', type: 'nav' },
          { url: 'https://example.com/b', type: 'article' }
        ]
      });
      
      expect(result.ok).toBe(true);
      expect(result.value.linksEnqueued).toBe(2);
      expect(deps.enqueueRequest).toHaveBeenCalledTimes(2);
    });

    it('increments depth when enqueueing', async () => {
      const deps = createMockDeps();
      const step = createEnqueueLinksStep(deps);
      await step.execute({
        depth: 2,
        links: [{ url: 'https://example.com/a', type: 'nav' }]
      });
      
      expect(deps.enqueueRequest).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 3 })
      );
    });
  });

  describe('createProcessArticleStep', () => {
    it('processes articles when detected', async () => {
      const deps = createMockDeps();
      const step = createProcessArticleStep(deps);
      const result = await step.execute({
        url: 'https://example.com/article',
        html: '<html></html>',
        isArticle: true
      });
      
      expect(result.ok).toBe(true);
      expect(deps.articleProcessor.process).toHaveBeenCalled();
      expect(result.value.articleResult).toEqual({ saved: true });
    });

    it('skips non-articles', async () => {
      const deps = createMockDeps();
      const step = createProcessArticleStep(deps);
      const result = await step.execute({
        url: 'https://example.com/hub',
        isArticle: false
      });
      
      expect(result.ok).toBe(true);
      expect(deps.articleProcessor.process).not.toHaveBeenCalled();
    });
  });

  describe('createUpdateStateStep', () => {
    it('updates crawler state', async () => {
      const deps = createMockDeps();
      const step = createUpdateStateStep(deps);
      const result = await step.execute({
        url: 'https://example.com',
        isArticle: true
      });
      
      expect(result.ok).toBe(true);
      expect(deps.state.addVisited).toHaveBeenCalled();
      expect(deps.state.incrementPagesVisited).toHaveBeenCalled();
      expect(deps.state.incrementArticlesFound).toHaveBeenCalled();
    });

    it('does not increment articles for non-articles', async () => {
      const deps = createMockDeps();
      const step = createUpdateStateStep(deps);
      await step.execute({
        url: 'https://example.com',
        isArticle: false
      });
      
      expect(deps.state.incrementArticlesFound).not.toHaveBeenCalled();
    });
  });

  describe('createRecordMetricsStep', () => {
    it('records telemetry metrics', async () => {
      const deps = createMockDeps();
      const step = createRecordMetricsStep(deps);
      const result = await step.execute({
        url: 'https://example.com',
        depth: 1,
        fetchSource: 'network',
        isArticle: true,
        links: [1, 2, 3],
        linksEnqueued: 2
      });
      
      expect(result.ok).toBe(true);
      expect(deps.telemetry.pageProcessed).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          depth: 1,
          isArticle: true,
          linksFound: 3,
          linksEnqueued: 2
        })
      );
    });
  });

  describe('buildPageProcessingSteps', () => {
    it('returns array of 10 steps', () => {
      const deps = createMockDeps();
      const steps = buildPageProcessingSteps(deps);
      expect(steps).toHaveLength(10);
    });

    it('steps are in correct order', () => {
      const deps = createMockDeps();
      const steps = buildPageProcessingSteps(deps);
      const ids = steps.map(s => s.id);
      
      expect(ids).toEqual([
        'checkDepth',
        'checkDownloadLimit',
        'fetch',
        'parseHtml',
        'detectArticle',
        'extractLinks',
        'enqueueLinks',
        'processArticle',
        'updateState',
        'recordMetrics'
      ]);
    });
  });

  describe('processPagePipeline', () => {
    it('processes page through full pipeline', async () => {
      const deps = createMockDeps();
      const result = await processPagePipeline(
        { url: 'https://example.com', depth: 0 },
        deps
      );
      
      expect(result.status).toBe('ok');
      expect(result.url).toBeDefined();
      expect(deps.fetchPipeline.fetch).toHaveBeenCalled();
      expect(deps.state.addVisited).toHaveBeenCalled();
    });

    it('returns skipped status for depth exceeded', async () => {
      const deps = createMockDeps({ maxDepth: 2 });
      const result = await processPagePipeline(
        { url: 'https://example.com', depth: 5 },
        deps
      );
      
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('depth-exceeded');
    });

    it('returns cache status for cached pages', async () => {
      const deps = createMockDeps({
        fetchPipeline: {
          fetch: jest.fn().mockResolvedValue({
            meta: { url: 'https://example.com' },
            source: 'cache',
            html: '<html></html>'
          })
        }
      });
      
      const result = await processPagePipeline(
        { url: 'https://example.com', depth: 0 },
        deps
      );
      
      expect(result.status).toBe('cache');
    });

    it('returns failed status on fetch error', async () => {
      const deps = createMockDeps({
        fetchPipeline: {
          fetch: jest.fn().mockRejectedValue(new Error('Network error'))
        }
      });
      
      const result = await processPagePipeline(
        { url: 'https://example.com', depth: 0 },
        deps
      );
      
      expect(result.status).toBe('failed');
      expect(result.retriable).toBe(true);
    });

    it('tracks duration', async () => {
      const deps = createMockDeps();
      const result = await processPagePipeline(
        { url: 'https://example.com', depth: 0 },
        deps
      );
      
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
