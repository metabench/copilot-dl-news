'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class CrawlCountryHubHistoryOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'crawlCountryHubHistory',
      summary: 'Refresh historical content for a specific country hub',
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
  CrawlCountryHubHistoryOperation
};
