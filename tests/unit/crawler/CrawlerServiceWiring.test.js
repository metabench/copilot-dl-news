'use strict';

// Avoid loading ESM-only dependencies during lightweight wiring tests
jest.mock('jsdom', () => ({ JSDOM: class { constructor() {} }, VirtualConsole: function() {} }));
const NewsCrawler = require('../../../src/crawler/NewsCrawler');

describe('CrawlerServiceWiring', () => {
  it('wires basic services onto a new crawler instance', async () => {
    const crawler = new NewsCrawler('https://example.com', { enableDb: false, concurrency: 1 });

    expect(crawler.hubFreshnessController).toBeDefined();
    expect(crawler.articleSignals).toBeDefined();
    expect(crawler.pageExecutionService).toBeDefined();
    expect(crawler.articleProcessor).toBeDefined();
    expect(typeof crawler.urlPolicy === 'object').toBeTruthy();
    expect(typeof crawler.deepUrlAnalyzer === 'object').toBeTruthy();
    expect(crawler._finalizer).toBeUndefined();
  });
});
