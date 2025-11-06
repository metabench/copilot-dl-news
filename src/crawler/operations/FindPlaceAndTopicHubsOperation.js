'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class FindPlaceAndTopicHubsOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'findPlaceAndTopicHubs',
      summary: 'Discover place and topic hubs using intelligent planner',
      defaultOptions: {
        structureOnly: true,
        crawlType: 'intelligent-place-topic',
        plannerVerbosity: 2
      }
    });
  }
}

module.exports = {
  FindPlaceAndTopicHubsOperation
};
