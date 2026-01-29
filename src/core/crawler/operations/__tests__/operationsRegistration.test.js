'use strict';

const { CrawlOperations } = require('../../CrawlOperations');

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

describe('CrawlOperations registration', () => {
  it('exposes guessPlaceHubs operation shortcut', () => {
    const facade = new CrawlOperations({ logger: noopLogger });
    const operations = facade.listOperations();

    expect(Array.isArray(operations)).toBe(true);
    expect(operations).toContain('guessPlaceHubs');
    expect(typeof facade.guessPlaceHubs).toBe('function');
  });

  it('includes basicArticleCrawl operation for basic runs', () => {
    const facade = new CrawlOperations({ logger: noopLogger });
    const operations = facade.listOperations();

    expect(operations).toContain('basicArticleCrawl');
    expect(typeof facade.basicArticleCrawl).toBe('function');

    const preset = facade.getOperationPreset('basicArticleCrawl');
    expect(preset).toBeDefined();
    expect(preset.options).toMatchObject({
      crawlType: 'basic',
      useSequenceRunner: false,
      preferCache: true,
      enableDb: true
    });
  });
});
