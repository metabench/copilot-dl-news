'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for exploreCountryHubs operation.
 * Explores country hubs beyond basic structure to find articles.
 */
module.exports = {
  operation: 'exploreCountryHubs',
  label: 'Explore Country Hubs',
  description: 'Explore country hub pages to discover and download articles. Goes deeper than ensureCountryHubs to collect content.',
  category: 'hub-management',
  icon: '🔍',
  options: {
    // Crawl behavior - content-focused on country hubs
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'intelligent-hubs'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: false,
      description: 'Extract article content (enabled for exploration)'
    },
    countryHubExclusiveMode: {
      ...crawlTypeOptions.countryHubExclusiveMode,
      default: true,
      description: 'Focus on country hub pages and their articles'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 500,
      description: 'Maximum pages to explore per hub'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 3,
      description: 'Depth to explore from hub pages'
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
