'use strict';

/**
 * The crawl-operations facade.
 *
 * The operation CLASSES live in news-crawler-itself/crawl-operations as of
 * 2026-08-11. This file stays because the two things it still does belong to the
 * application rather than to the engine library:
 *
 *   - GuessPlaceHubsOperation reaches adapters/remoteFetch ->
 *     tools/crawl/lib/fleet-host-resolver, a monorepo surface no extraction has
 *     resolved, so it cannot leave (see DEC-ENGINE-BOUNDARY).
 *   - createDefaultOperations() composes the default list, and that list
 *     includes the local operation above. Composition stays with the thing that
 *     composes.
 *
 * Its exported shape is deliberately unchanged from before the extraction —
 * every consumer of `require('.../operations')` sees exactly what it saw.
 */

const {
  CrawlOperation,
  cloneOptions,
  EnsureCountryHubsOperation,
  ExploreCountryHubsOperation,
  CrawlCountryHubHistoryOperation,
  CrawlCountryHubsHistoryOperation,
  FindTopicHubsOperation,
  FindPlaceAndTopicHubsOperation,
  SiteExplorerOperation,
  BasicArticleCrawlOperation,
  SitemapDiscoveryOperation,
  SitemapOnlyOperation,
  CustomCrawlOperation,
  HubArchiveCrawlOperation,
  HubDepthProbeOperation,
  CrawlSequenceRunner,
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
} = require('news-crawler-itself/crawl-operations');

const { GuessPlaceHubsOperation } = require('./GuessPlaceHubsOperation');

const createDefaultOperations = () => (
  [
    new BasicArticleCrawlOperation(),
    new EnsureCountryHubsOperation(),
    new ExploreCountryHubsOperation(),
    new CrawlCountryHubHistoryOperation(),
    new CrawlCountryHubsHistoryOperation(),
    new FindTopicHubsOperation(),
    new FindPlaceAndTopicHubsOperation(),
    new GuessPlaceHubsOperation(),
    new SiteExplorerOperation(),
    new SitemapDiscoveryOperation(),
    new SitemapOnlyOperation(),
    new HubArchiveCrawlOperation(),
    new HubDepthProbeOperation()
  ]
);

module.exports = {
  CrawlOperation,
  cloneOptions,
  CustomCrawlOperation,
  createDefaultOperations,
  CrawlSequenceRunner,
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
};
