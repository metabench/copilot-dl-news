const { CrawlerEvents } = require('../CrawlerEvents');

const baseRequiredOptions = () => ({
  domain: 'example.com',
  getStats: () => ({}),
  getQueueSize: () => 0,
  getCurrentDownloads: () => new Map(),
  getDomainLimits: () => new Map(),
  getRobotsInfo: () => ({ robotsLoaded: false }),
  getSitemapInfo: () => ({ urls: [], discovered: 0 })
});

const createLogger = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

describe('CrawlerEvents problem resolution integration', () => {

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

describe('CrawlerEvents logging verbosity rules', () => {
  test('suppresses queue logs when output verbosity is terse', () => {
    const logger = createLogger();
    const terseEvents = new CrawlerEvents({
      ...baseRequiredOptions(),
      logger,
      outputVerbosity: 'terse'
    });

    terseEvents.emitQueueEvent({ action: 'enqueue', url: 'https://example.com' });

    expect(logger.log).not.toHaveBeenCalled();
  });

  test('logs queue events when verbosity is verbose but still suppresses for extra-terse', () => {
    const verboseLogger = createLogger();
    const verboseEvents = new CrawlerEvents({
      ...baseRequiredOptions(),
      logger: verboseLogger,
      outputVerbosity: 'verbose'
    });
    verboseEvents.emitQueueEvent({ action: 'enqueue' });
    expect(verboseLogger.log).toHaveBeenCalledTimes(1);

    const extraTerseLogger = createLogger();
    const extraTerseEvents = new CrawlerEvents({
      ...baseRequiredOptions(),
      logger: extraTerseLogger,
      outputVerbosity: 'extra-terse'
    });
    extraTerseEvents.emitQueueEvent({ action: 'enqueue' });
    expect(extraTerseLogger.log).not.toHaveBeenCalled();
  });
});
