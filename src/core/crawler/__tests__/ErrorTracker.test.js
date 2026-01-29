const { ErrorTracker } = require('../ErrorTracker');
const { CrawlerState } = require('../CrawlerState');

describe('ErrorTracker', () => {
  it('records errors into crawler state', () => {
    const state = new CrawlerState();
    const tracker = new ErrorTracker({ state });

    tracker.record({
      kind: 'network',
      code: 'ECONNRESET',
      message: 'Connection reset',
      url: 'http://example.com'
    });

    expect(state.getLastError()).toMatchObject({
      kind: 'network',
      code: 'ECONNRESET',
      url: 'http://example.com'
    });
    expect(state.getErrorSamples()).toHaveLength(1);
  });

  it('emits telemetry when provided while recording errors', () => {
    const state = new CrawlerState();
    const telemetry = { telemetry: jest.fn() };
    const tracker = new ErrorTracker({ state, telemetry });

    tracker.record({
      kind: 'network',
      code: 'ETIMEDOUT',
      message: 'Timed out',
      url: 'https://example.org/article',
      attempt: 2,
      maxAttempts: 3,
      classification: 'timeout'
    });

    expect(telemetry.telemetry).toHaveBeenCalledWith(expect.objectContaining({
      event: 'crawler.error.sample-recorded',
      code: 'ETIMEDOUT',
      url: 'https://example.org/article',
      attempt: 2,
      maxAttempts: 3,
      classification: 'timeout',
      host: 'example.org'
    }));
  });

  it('emits telemetry and aborts after repeated connection resets', () => {
    const state = new CrawlerState();
    const telemetry = { problem: jest.fn() };
    const requestAbort = jest.fn();
    const tracker = new ErrorTracker({
      state,
      telemetry,
      domain: 'example.com',
      connectionResetWindowMs: 60_000,
      connectionResetThreshold: 2,
      requestAbort
    });

    tracker.handleConnectionReset('http://example.com/a', new Error('reset'));
    tracker.handleConnectionReset('http://example.com/b', new Error('reset again'));
    tracker.handleConnectionReset('http://example.com/c', new Error('ignored'));

    expect(telemetry.problem).toHaveBeenCalledTimes(1);
    expect(requestAbort).toHaveBeenCalledTimes(1);
    expect(state.hasEmittedConnectionResetProblem()).toBe(true);
  });

  it('summarises fatal and no-progress outcomes', () => {
    const state = new CrawlerState();
    const tracker = new ErrorTracker({ state });

    state.addFatalIssue({ message: 'db failed' });
    let err = tracker.determineOutcomeError({ pagesDownloaded: 0, errors: 0 });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CRAWL_FATAL');

    state.replaceFatalIssues([]);
    tracker.record({ kind: 'network', url: 'http://example.com' });
    err = tracker.determineOutcomeError({ pagesDownloaded: 0, errors: 3 });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CRAWL_NO_PROGRESS');
    expect(err.details.sampleError).toMatchObject({ kind: 'network' });
  });
});
