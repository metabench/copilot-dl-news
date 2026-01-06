'use strict';

const { CrawlOperation } = require('./CrawlOperation');

class SiteExplorerOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'siteExplorer',
      summary: 'Explore site structure (sitemaps, hubs) without downloading articles',
      defaultOptions: {
        crawlType: 'discover-structure',
        plannerVerbosity: 1,
        useSequenceRunner: false,
        structureOnly: true,
        countryHubExclusiveMode: false,
        enableDb: true,
        preferCache: true,
        useSitemap: true,
        maxDepth: 3
      }
    });
  }
}

module.exports = {
  SiteExplorerOperation
};
