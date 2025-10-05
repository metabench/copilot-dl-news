const { CrawlerEvents } = require('../CrawlerEvents');

describe('CrawlerEvents problem resolution integration', () => {
  const baseRequiredOptions = () => ({
    domain: 'example.com',
    getStats: () => ({}),
    getQueueSize: () => 0,
    getCurrentDownloads: () => new Map(),
    getDomainLimits: () => new Map(),
    getRobotsInfo: () => ({ robotsLoaded: false }),
    getSitemapInfo: () => ({ urls: [], discovered: 0 })
  });

  test('invokes problem resolution when missing hub problem emitted', () => {
    const resolveMissingHub = jest.fn();
    const events = new CrawlerEvents({
      ...baseRequiredOptions(),
      getFeatures: () => ({ problemResolution: true }),
      getProblemResolutionService: () => ({ resolveMissingHub }),
      getJobId: () => 'job-1',
      logger: { log: jest.fn(), warn: jest.fn() }
    });

    const problem = {
      kind: 'missing-hub',
      scope: 'example.com',
      target: '/world/france',
      message: 'Country hub missing',
      details: {
        sourceUrl: 'https://example.com/europe',
        urlPlaceAnalysis: { bestChain: { places: [{ place: { name: 'France', kind: 'country' } }] } },
        hubCandidate: { navLinksCount: 12, articleLinksCount: 4 }
      }
    };

    events.emitProblem(problem);

    expect(resolveMissingHub).toHaveBeenCalledTimes(1);
    expect(resolveMissingHub).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      host: 'example.com',
      sourceUrl: 'https://example.com/europe',
      urlPlaceAnalysis: problem.details.urlPlaceAnalysis,
      hubCandidate: problem.details.hubCandidate
    }));
  });

  test('does not invoke problem resolution when host scope missing', () => {
    const resolveMissingHub = jest.fn();
    const events = new CrawlerEvents({
      ...baseRequiredOptions(),
      getFeatures: () => ({ problemResolution: true }),
      getProblemResolutionService: () => ({ resolveMissingHub }),
      getJobId: () => 'job-1',
      logger: { log: jest.fn(), warn: jest.fn() }
    });

    events.emitProblem({
      kind: 'missing-hub',
      message: 'No scope provided',
      details: { sourceUrl: 'https://example.com/test' }
    });

    expect(resolveMissingHub).not.toHaveBeenCalled();
  });
});
