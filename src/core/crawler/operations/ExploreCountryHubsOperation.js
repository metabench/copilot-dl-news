'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class ExploreCountryHubsOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'exploreCountryHubs',
      summary: 'Explore country hubs beyond structural metadata',
      defaultOptions: {
        countryHubExclusiveMode: true,
        structureOnly: false,
        crawlType: 'intelligent-hubs',
        plannerVerbosity: 1
      }
    });
  }
}

module.exports = {
  ExploreCountryHubsOperation
};
