/**
 * Writer DB isolation regression tests.
 *
 * These assert the crawl engine's effective write target (dbPath) is honoured
 * from caller-supplied overrides, so a sample/temp crawl never leaks into the
 * production database. No network or filesystem writes are performed — this is a
 * pure configuration-resolution assertion.
 *
 * Context: a prior live crawl with an unforwarded writer path leaked rows into
 * production data/news.db. The fix forwards an explicit writer dbPath override
 * end-to-end (run.js --crawl-db -> --override dbPath -> crawl request body ->
 * crawlService.runOperation overrides -> CrawlOperation.buildOptions ->
 * NewsCrawler.dbPath / createCrawlerConfig). This guards the resolution seam.
 */

const path = require('path');
const {
  createCrawlerConfig
} = require('../../../../src/core/crawler/config/CrawlerConfigNormalizer');

describe('writer DB isolation — createCrawlerConfig dbPath resolution', () => {
  test('default (no dbPath override) resolves to <dataDir>/news.db', () => {
    const config = createCrawlerConfig('https://example.com/', {});
    const expected = path.join(process.cwd(), 'data', 'news.db');
    expect(config.dbPath).toBe(expected);
  });

  test('explicit dbPath override redirects the writer away from production', () => {
    const sampleDb = path.resolve('/tmp/sample-isolation.db');
    const config = createCrawlerConfig('https://example.com/', { dbPath: sampleDb });
    expect(config.dbPath).toBe(sampleDb);
    // It must NOT fall back to the production default.
    expect(config.dbPath).not.toBe(path.join(process.cwd(), 'data', 'news.db'));
  });

  test('explicit dbPath wins even when dataDir is also provided', () => {
    const sampleDb = path.resolve('/tmp/explicit-wins.db');
    const config = createCrawlerConfig('https://example.com/', {
      dataDir: path.resolve('/tmp/other-data-dir'),
      dbPath: sampleDb
    });
    expect(config.dbPath).toBe(sampleDb);
  });
});
