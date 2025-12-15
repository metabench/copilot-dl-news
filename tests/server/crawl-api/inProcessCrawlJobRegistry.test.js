'use strict';

const { InProcessCrawlJobRegistry } = require('../../../src/server/crawl-api/v1/core/InProcessCrawlJobRegistry');

describe('InProcessCrawlJobRegistry', () => {
  it('throws if createCrawlService is missing', () => {
    const registry = new InProcessCrawlJobRegistry();

    expect(() =>
      registry.startOperation({
        logger: console,
        operationName: 'ensureCountryHubs',
        startUrl: 'https://example.com',
        overrides: {}
      })
    ).toThrow(/createCrawlService/i);
  });

  it('registers a job immediately and exposes it via list/get', () => {
    const runOperation = jest.fn(() => new Promise(() => {}));
    const createCrawlService = jest.fn(() => ({ runOperation }));

    const registry = new InProcessCrawlJobRegistry({
      createCrawlService,
      serviceOptions: {}
    });

    const { jobId, job } = registry.startOperation({
      logger: console,
      operationName: 'ensureCountryHubs',
      startUrl: 'https://example.com'
    });

    expect(jobId).toEqual(expect.any(String));
    expect(job).toEqual(
      expect.objectContaining({
        id: jobId,
        mode: 'in-process',
        operationName: 'ensureCountryHubs',
        startUrl: 'https://example.com',
        status: expect.any(String)
      })
    );

    expect(registry.get(jobId)).toEqual(expect.objectContaining({ id: jobId }));
    expect(registry.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: jobId })]));
  });

  it('pause/resume/stop flip job flags even before crawler hooks exist', () => {
    const createCrawlService = jest.fn(() => ({ runOperation: jest.fn(() => new Promise(() => {})) }));

    const registry = new InProcessCrawlJobRegistry({
      createCrawlService,
      serviceOptions: {}
    });

    const { jobId } = registry.startOperation({
      logger: console,
      operationName: 'ensureCountryHubs',
      startUrl: 'https://example.com'
    });

    expect(registry.pause(jobId)).toBe(true);
    expect(registry.get(jobId)).toEqual(expect.objectContaining({ paused: true }));

    expect(registry.resume(jobId)).toBe(true);
    expect(registry.get(jobId)).toEqual(expect.objectContaining({ paused: false }));

    expect(registry.stop(jobId)).toBe(true);
    expect(registry.get(jobId)).toEqual(expect.objectContaining({ abortRequested: true }));
  });

  it('prevents multiple running jobs by default', () => {
    const createCrawlService = jest.fn(() => ({ runOperation: jest.fn(() => new Promise(() => {})) }));

    const registry = new InProcessCrawlJobRegistry({
      createCrawlService,
      serviceOptions: {},
      allowMultiJobs: false
    });

    registry.startOperation({
      logger: console,
      operationName: 'ensureCountryHubs',
      startUrl: 'https://example.com'
    });

    try {
      registry.startOperation({
        logger: console,
        operationName: 'exploreCountryHubs',
        startUrl: 'https://example.com'
      });
      throw new Error('Expected second startOperation call to throw');
    } catch (error) {
      expect(error).toEqual(expect.objectContaining({ statusCode: 409, code: 'JOB_CONFLICT' }));
    }
  });
});
