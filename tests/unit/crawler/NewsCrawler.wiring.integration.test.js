// Integration-level wiring test (mock jsdom to avoid ESM issues)
jest.mock('jsdom', () => ({ JSDOM: class { constructor() {} }, VirtualConsole: function() {} }));
const NewsCrawler = require('../../../src/core/crawler/NewsCrawler');

describe('NewsCrawler wiring integration', () => {
  let crawler;

  afterEach(() => {
    // Clean up adapter and any timers
    if (crawler?._newAbstractionsAdapter) {
      crawler._newAbstractionsAdapter.dispose();
    }
    if (crawler?.dispose) {
      crawler.dispose();
    }
    crawler = null;
  });

  test('NewsCrawler wires fetchPipeline and pageExecution services correctly', async () => {
    crawler = new NewsCrawler('https://example.com', { enableDb: false, concurrency: 1, maxDepth: 0, preferCache: false });
    expect(crawler.fetchPipeline).toBeDefined();
    expect(crawler.pageExecutionService).toBeDefined();
    // FetchPipeline should have a networkRetryPolicy and host retry manager
    expect(crawler.fetchPipeline.networkRetryPolicy).toBeDefined();
    expect(crawler.fetchPipeline._hostRetryManager).toBeDefined();
    // Basic services wired
    expect(crawler.articleProcessor).toBeDefined();
    // New abstractions adapter should be installed
    expect(crawler._newAbstractionsAdapter).toBeDefined();
    expect(crawler._shadowContext).toBeDefined();
  });
});

