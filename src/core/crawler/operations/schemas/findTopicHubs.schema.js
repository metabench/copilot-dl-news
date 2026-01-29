'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for findTopicHubs operation.
 * Discovers topic hub coverage using intelligent planner.
 */
module.exports = {
  operation: 'findTopicHubs',
  label: 'Find Topic Hubs',
  description: 'Discover topic hub pages (e.g., /politics, /sports, /technology) using intelligent link analysis and URL patterns.',
  category: 'hub-discovery',
  icon: '📑',
  options: {
    // Crawl behavior - topic-focused
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'intelligent-topic'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: true,
      description: 'Map topic hub structure without downloading articles'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 300,
      description: 'Maximum pages to explore for topic discovery'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 4,
      description: 'Depth to explore for topic hub detection'
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
