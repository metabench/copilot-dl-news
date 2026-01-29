'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class EnsureCountryHubsOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'ensureCountryHubs',
      summary: 'Ensure base structure coverage for country hubs',
      defaultOptions: {
        structureOnly: true,
        countryHubExclusiveMode: true,
        crawlType: 'discover-structure',
        plannerVerbosity: 1
      }
    });
  }
}

module.exports = {
  EnsureCountryHubsOperation
};
