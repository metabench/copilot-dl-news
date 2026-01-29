'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class CrawlCountryHubsHistoryOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'crawlCountryHubsHistory',
      summary: 'Refresh historical content for multiple hubs sequentially',
      defaultOptions: {
        countryHubExclusiveMode: true,
        structureOnly: false,
        crawlType: 'intelligent-history',
        maxAgeHubMs: 0,
        plannerVerbosity: 1
      }
    });
  }
}

module.exports = {
  CrawlCountryHubsHistoryOperation
};
