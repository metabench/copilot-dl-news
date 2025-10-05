const NewsCrawler = require('../crawl');

describe('NewsCrawler gazetteer mode', () => {
  test('runs gazetteer controller pipeline and emits summary', async () => {
    const crawler = new NewsCrawler('https://example.com', {
      crawlType: 'gazetteer',
      enableDb: false,
      useSitemap: true,
      sitemapOnly: true,
      preferCache: true
    });

    expect(crawler.isGazetteerMode).toBe(true);
    expect(crawler.useSitemap).toBe(false);
    expect(crawler.sitemapOnly).toBe(false);
    expect(crawler.usePriorityQueue).toBe(false);

    await crawler.crawlConcurrent();

    expect(crawler.gazetteerModeController).toBeDefined();
    expect(crawler.gazetteerModeController.status).toBe('completed');
    const summary = crawler.gazetteerModeController.summary;
    expect(summary).toBeTruthy();
    expect(summary).toEqual(
      expect.objectContaining({
        totals: expect.objectContaining({
          ingestorsAttempted: expect.any(Number),
          ingestorsCompleted: expect.any(Number),
          recordsProcessed: expect.any(Number),
          recordsUpserted: expect.any(Number),
          errors: expect.any(Number)
        })
      })
    );
    expect(summary.ingestors).toEqual(expect.any(Array));
  });
});
