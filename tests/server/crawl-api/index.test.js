'use strict';

const { createCrawlApiServer, AVAILABLE_IMPLEMENTATIONS } = require('../../../src/server/crawl-api');

describe('createCrawlApiServer', () => {
  test('returns the express implementation by default when requested explicitly', async () => {
    const server = createCrawlApiServer({ framework: 'express', logger: createSilentLogger() });
    expect(server).toBeDefined();
    expect(server.framework).toBe('express');
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');

    // Ensure the start/stop lifecycle works without leaving open handles.
    const details = await server.start();
    expect(details).toHaveProperty('port');
    await server.stop();
  });

  test('returns the jsgui3 stub implementation when requested', async () => {
    const server = createCrawlApiServer({ framework: 'jsgui3', logger: createSilentLogger() });
    expect(server).toBeDefined();
    expect(server.framework).toBe('jsgui3');
    await server.start();
    await server.stop();
  });

  test('throws for unknown implementations', () => {
    expect(() => createCrawlApiServer({ framework: 'koa', version: 'v1' })).toThrow(/Unsupported crawl API server implementation/);
  });

  test('lists available implementations', () => {
    const combos = AVAILABLE_IMPLEMENTATIONS.map((entry) => `${entry.version}/${entry.framework}`);
    expect(combos).toEqual(expect.arrayContaining(['v1/jsgui3', 'v1/express']));
  });
});

function createSilentLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}
