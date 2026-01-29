'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for findPlaceAndTopicHubs operation.
 * Discovers both place and topic hubs in a single crawl pass.
 */
module.exports = {
  operation: 'findPlaceAndTopicHubs',
  label: 'Find Place & Topic Hubs',
  description: 'Discover both geographic place hubs and topic hubs in a single intelligent crawl. Combines place detection with topic analysis.',
  category: 'hub-discovery',
  icon: '🌐',
  options: {
    // Crawl behavior - combined discovery
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'intelligent-place-topic'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: true,
      description: 'Map hub structure without downloading articles'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 400,
      description: 'Maximum pages for combined hub discovery'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 4,
      description: 'Depth to explore for hub detection'
    },

    // Performance
    concurrency: commonCrawlerOptions.concurrency,
    preferCache: commonCrawlerOptions.preferCache,

    // Discovery
    useSitemap: commonCrawlerOptions.useSitemap,

    // Storage
    enableDb: commonCrawlerOptions.enableDb,

    // Planner
    plannerVerbosity: {
      ...plannerOptions.plannerVerbosity,
      default: 2
    },

    // Logging
    progressJson: loggingOptions.progressJson,
    telemetryJson: loggingOptions.telemetryJson
  }
};
