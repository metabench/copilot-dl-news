const { createStartupSequenceRunner, buildStartupSequence } = require('../../../src/crawler/StartupSequenceManager');

describe('StartupSequenceManager', () => {
  test('builds gazetteer sequence with two steps', () => {
    const crawler = { startUrl: 'http://example.com' };
    const seq = buildStartupSequence(crawler, 'gazetteer');
    expect(seq.steps.length).toBe(2);
    expect(seq.steps[1].operation).toBe('runGazetteerMode');
  });

  test('builds sequential sequence with sequential-loop', () => {
    const crawler = { startUrl: 'http://example.com' };
    const seq = buildStartupSequence(crawler, 'sequential');
    const ids = seq.steps.map(s => s.id);
    expect(ids).toContain('sequential-loop');
  });

  test('builds concurrent sequence with concurrent-workers', () => {
    const crawler = { startUrl: 'http://example.com' };
    const seq = buildStartupSequence(crawler, 'concurrent');
    const ids = seq.steps.map(s => s.id);
    expect(ids).toContain('concurrent-workers');
  });

  test('createStartupSequenceRunner returns runner with run function and triggers init', async () => {
    const called = { init: false };
    const crawler = {
      startUrl: 'http://example.com',
      init: async () => { called.init = true; },
      _runPlannerStage: async () => {},
      _runSitemapStage: async () => {},
      _seedInitialRequest: () => {},
      _markStartupComplete: () => {},
      _runSequentialLoop: async () => {},
      _runConcurrentWorkers: async () => {},
      _runGazetteerMode: async () => {},
      telemetry: { milestoneOnce: jest.fn() }
    };
    const runner = createStartupSequenceRunner(crawler);
    expect(typeof runner.run).toBe('function');
    const seq = buildStartupSequence(crawler, 'sequential');
    await runner.run({ sequenceConfig: seq, startUrl: crawler.startUrl, context: { mode: 'sequential' } });
    expect(called.init).toBe(true);
  });
});
