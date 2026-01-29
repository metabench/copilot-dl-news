'use strict';

const { CrawlOperations } = require('../CrawlOperations');

describe('CrawlOperations', () => {
  const createStubFactory = (callLog, behaviours = []) => {
    let index = 0;
    return (startUrl, options) => {
      const behaviour = behaviours[index] || {};
      const stub = {
        stats: behaviour.stats || { pagesVisited: index + 1 },
        dispose: jest.fn()
      };
      stub.crawl = jest.fn(async () => {
        if (behaviour.error) {
          throw typeof behaviour.error === 'string' ? new Error(behaviour.error) : behaviour.error;
        }
      });
      callLog.push({ startUrl, options, stub });
      index += 1;
      return stub;
    };
  };

  it('merges defaults and overrides for ensureCountryHubs', async () => {
    const calls = [];
    const factory = createStubFactory(calls, [
      { stats: { pagesVisited: 5, articlesFound: 2 } }
    ]);

    const operations = new CrawlOperations({
      defaults: {
        dataDir: '/tmp/data',
        concurrency: 2,
        enableDb: true
      },
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const result = await operations.ensureCountryHubs('https://example.com', {
      hubMaxPages: 3
    });

    expect(result.status).toBe('ok');
    expect(result.operation).toBe('ensureCountryHubs');
    expect(result.options.structureOnly).toBe(true);
    expect(result.options.countryHubExclusiveMode).toBe(true);
    expect(result.options.hubMaxPages).toBe(3);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.startUrl).toBe('https://example.com');
    expect(call.options.structureOnly).toBe(true);
    expect(call.options.countryHubExclusiveMode).toBe(true);
    expect(call.options.hubMaxPages).toBe(3);
    expect(call.stub.dispose).toHaveBeenCalled();
    expect(call.stub.crawl).toHaveBeenCalledTimes(1);
  });

  it('aborts sequence on first failure by default', async () => {
    const calls = [];
    const behaviours = [
      { stats: { pagesVisited: 1 } },
      { error: 'planner failure', stats: { pagesVisited: 0 } },
      { stats: { pagesVisited: 2 } }
    ];
    const factory = createStubFactory(calls, behaviours);

    const operations = new CrawlOperations({
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const sequence = ['ensureCountryHubs', 'exploreCountryHubs', 'findTopicHubs'];
    const result = await operations.executeSequence(sequence, {
      startUrl: 'https://example.com'
    });

    expect(result.status).toBe('aborted');
    expect(result.startUrl).toBe('https://example.com');
    expect(result.metadata).toEqual({});
    expect(result.context).toEqual({ source: 'CrawlOperations' });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('ok');
    expect(result.steps[1].status).toBe('error');
    expect(result.steps[1].error.message).toContain('planner failure');
    expect(calls).toHaveLength(2);
  });

  it('continues sequence when continueOnError is enabled', async () => {
    const calls = [];
    const behaviours = [
      { stats: { pagesVisited: 1 } },
      { error: 'network error', stats: { pagesVisited: 0 } },
      { stats: { pagesVisited: 3 } }
    ];
    const factory = createStubFactory(calls, behaviours);

    const operations = new CrawlOperations({
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const sequence = ['ensureCountryHubs', 'exploreCountryHubs', 'findTopicHubs'];
    const result = await operations.executeSequence(sequence, {
      startUrl: 'https://example.com',
      continueOnError: true
    });

    expect(result.status).toBe('mixed');
    expect(result.startUrl).toBe('https://example.com');
    expect(result.context.source).toBe('CrawlOperations');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[1].status).toBe('error');
    expect(result.steps[2].status).toBe('ok');
    expect(result.steps[1].sequenceIndex).toBe(1);
    expect(result.steps[1].label).toBe('exploreCountryHubs');
    expect(result.steps[1].startUrl).toBe('https://example.com');
    expect(calls).toHaveLength(3);
  });

  it('runs named sequence presets with merged overrides', async () => {
    const calls = [];
    const behaviours = [
      { stats: { pagesVisited: 2 } },
      { error: new Error('planner failure'), stats: { pagesVisited: 0 } },
      { stats: { pagesVisited: 4 } },
      { stats: { pagesVisited: 5 } }
    ];
    const factory = createStubFactory(calls, behaviours);

    const operations = new CrawlOperations({
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const result = await operations.runSequencePreset('fullCountryHubDiscovery', {
      startUrl: 'https://example.com',
      sharedOverrides: { slowMode: true },
      stepOverrides: {
        findTopicHubs: { plannerVerbosity: 4 }
      }
    });

    expect(result.status).toBe('aborted');
  expect(result.startUrl).toBe('https://example.com');
  expect(result.metadata.preset.name).toBe('fullCountryHubDiscovery');
  expect(result.metadata.source.type).toBe('builtin-preset');
  expect(result.context.preset.name).toBe('fullCountryHubDiscovery');
    expect(result.context.source.type).toBe('builtin-preset');
  expect(result.context.stepOverrides.findTopicHubs.plannerVerbosity).toBe(4);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('ok');
    expect(result.steps[1].status).toBe('error');
    expect(result.steps[1].error.message).toContain('planner failure');

    expect(calls).toHaveLength(2);
    expect(calls[0].options.slowMode).toBe(true);
    expect(calls[0].options.plannerVerbosity).toBe(2);
    expect(calls[1].options.plannerVerbosity).toBe(2);
  });

  it('carries loader metadata through preset execution results', async () => {
    const calls = [];
    const behaviours = [
      { stats: { pagesVisited: 2 } }
    ];
    const factory = createStubFactory(calls, behaviours);

    const operations = new CrawlOperations({
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const configMetadata = {
      source: {
        path: 'config/crawl-sequences/fullCountryHubDiscovery.json',
        relativePath: 'config/crawl-sequences/fullCountryHubDiscovery.json',
        format: 'json',
        bytes: 1024
      },
      sequenceName: 'fullCountryHubDiscovery',
      host: 'example.com',
      declaredHost: 'example.com',
      startUrl: { value: 'https://example.com', source: 'config' },
      resolvedTokens: [{ token: '@cli.startUrl', key: 'startUrl' }]
    };

    const result = await operations.runSequencePreset('fullCountryHubDiscovery', {
      startUrl: 'https://example.com',
      configMetadata
    });

    expect(result.status).toBe('ok');
    expect(result.metadata.config).toEqual(configMetadata);
    expect(result.context.config).toEqual(configMetadata);
    expect(result.metadata.config).not.toBe(configMetadata);
    expect(result.context.config).not.toBe(configMetadata);
  });

  it('passes step overrides through to the sequence runner results', async () => {
    const calls = [];
    const behaviours = [
      { stats: { pagesVisited: 1 } },
      { stats: { pagesVisited: 2 } }
    ];
    const factory = createStubFactory(calls, behaviours);

    const operations = new CrawlOperations({
      crawlerFactory: factory,
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });

    const result = await operations.executeSequence([
      'ensureCountryHubs',
      'exploreCountryHubs'
    ], {
      startUrl: 'https://example.com',
      sharedOverrides: { slowMode: true },
      stepOverrides: {
        exploreCountryHubs: { plannerVerbosity: 4 }
      }
    });

    expect(result.status).toBe('ok');
  expect(result.metadata).toEqual({});
  expect(result.context.source).toBe('CrawlOperations');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].overrides.plannerVerbosity).toBe(4);
    expect(calls[0].options.slowMode).toBe(true);
    expect(calls[1].options.slowMode).toBe(true);
    expect(calls[1].options.plannerVerbosity).toBe(4);
  });
});
