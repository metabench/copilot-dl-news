const ExitManager = require('../../../src/crawler/ExitManager');

describe('ExitManager', () => {
  test('recordExit sets exitSummary and calls telemetry', () => {
    const telemetry = { milestoneOnce: jest.fn() };
    const manager = new ExitManager({ telemetry });
    const crawler = { exitSummary: null };

    manager.recordExit(crawler, 'test-reason', { downloads: 5, limit: 10 });
    expect(crawler.exitSummary).toBeTruthy();
    expect(crawler.exitSummary.reason).toBe('test-reason');
    expect(telemetry.milestoneOnce).toHaveBeenCalled();
  });

  test('recordExit does nothing if reason absent or exitSummary exists', () => {
    const telemetry = { milestoneOnce: jest.fn() };
    const manager = new ExitManager({ telemetry });
    const crawler = { exitSummary: null };

    manager.recordExit(crawler, null, {});
    expect(crawler.exitSummary).toBe(null);

    crawler.exitSummary = { reason: 'old' };
    manager.recordExit(crawler, 'new-reason', {});
    expect(crawler.exitSummary.reason).toBe('old');
  });

  test('getExitSummary returns crawler exit summary', () => {
    const manager = new ExitManager({ telemetry: null });
    const crawler = { exitSummary: { reason: 'ok', details: { a: 1 } } };
    expect(manager.getExitSummary(crawler)).toEqual(crawler.exitSummary);
  });

  test('describeExitSummary returns formatted string', () => {
    const manager = new ExitManager({ telemetry: null });
    const summary = { reason: 'max-downloads-reached', details: { downloads: 42, limit: 100, visited: 10, message: 'done' } };
    const str = manager.describeExitSummary(summary);
    expect(str).toContain('max-downloads-reached');
    expect(str).toContain('downloads=42');
    expect(str).toContain('limit=100');
    expect(str).toContain('visited=10');
    expect(str).toContain('done');
  });

  test('determineOutcomeError delegates to errorTracker', () => {
    const manager = new ExitManager({ telemetry: null });
    const errorTracker = { determineOutcomeError: jest.fn(() => ({ message: 'err' })) };
    const res = manager.determineOutcomeError(errorTracker, { pagesDownloaded: 1 });
    expect(errorTracker.determineOutcomeError).toHaveBeenCalled();
    expect(res).toEqual({ message: 'err' });
  });
});

