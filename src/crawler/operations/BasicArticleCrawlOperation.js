'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class BasicArticleCrawlOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'basicArticleCrawl',
      summary: 'General article crawl without hub discovery features',
      defaultOptions: {
        crawlType: 'basic',
        plannerVerbosity: 0,
        useSequenceRunner: false,
        structureOnly: false,
        countryHubExclusiveMode: false,
        enableDb: true,
        preferCache: true,
        useSitemap: true
      }
    });
  }
}

module.exports = {
  BasicArticleCrawlOperation
};
