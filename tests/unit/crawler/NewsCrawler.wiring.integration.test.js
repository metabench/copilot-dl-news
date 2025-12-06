// Integration-level wiring test (mock jsdom to avoid ESM issues)
jest.mock('jsdom', () => ({ JSDOM: class { constructor() {} }, VirtualConsole: function() {} }));
const NewsCrawler = require('../../../src/crawler/NewsCrawler');

describe('NewsCrawler wiring integration', () => {
  test('NewsCrawler wires fetchPipeline and pageExecution services correctly', async () => {
    const crawler = new NewsCrawler('https://example.com', { enableDb: false, concurrency: 1, maxDepth: 0, preferCache: false });
    expect(crawler.fetchPipeline).toBeDefined();
    expect(crawler.pageExecutionService).toBeDefined();
    // FetchPipeline should have a networkRetryPolicy and host retry manager
    expect(crawler.fetchPipeline.networkRetryPolicy).toBeDefined();
    expect(crawler.fetchPipeline._hostRetryManager).toBeDefined();
    // Basic services wired
    expect(crawler.articleProcessor).toBeDefined();
  });
});
