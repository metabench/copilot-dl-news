'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class FindTopicHubsOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'findTopicHubs',
      summary: 'Discover topic hub coverage using intelligent planner',
      defaultOptions: {
        structureOnly: true,
        crawlType: 'intelligent-topic',
        plannerVerbosity: 2
      }
    });
  }
}

module.exports = {
  FindTopicHubsOperation
};
