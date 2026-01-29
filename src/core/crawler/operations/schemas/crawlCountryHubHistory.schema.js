'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for crawlCountryHubHistory operation.
 * Refreshes historical content for a specific country hub.
 */
module.exports = {
  operation: 'crawlCountryHubHistory',
  label: 'Crawl Country Hub History',
  description: 'Refresh historical content for a specific country hub. Fetches older articles that may have been missed or need updating.',
  category: 'content-refresh',
  icon: '📜',
  options: {
    // Crawl behavior - history-focused
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'intelligent-history'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: false,
      description: 'Download article content (required for history refresh)'
    },
    countryHubExclusiveMode: {
      ...crawlTypeOptions.countryHubExclusiveMode,
      default: true,
      description: 'Stay within the target country hub pages'
    },

    // History-specific options
    maxAgeHubMs: {
      type: 'number',
      label: 'Max Hub Age (ms)',
      description: 'Only refresh hubs not updated within this time. 0 = always refresh.',
      default: 0,
      min: 0,
      max: 604800000, // 7 days in ms
      step: 3600000,  // 1 hour steps
      category: 'freshness'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 1000,
      description: 'Maximum articles to fetch from hub history'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 5,
      description: 'Depth to explore in hub archives'
    },

    // Performance
    concurrency: commonCrawlerOptions.concurrency,
    preferCache: {
      ...commonCrawlerOptions.preferCache,
      default: false,
      description: 'Disable cache to get fresh historical content'
    },

    // Discovery
    useSitemap: commonCrawlerOptions.useSitemap,

    // Storage
    enableDb: commonCrawlerOptions.enableDb,

    // Planner
    plannerVerbosity: {
      ...plannerOptions.plannerVerbosity,
      default: 1
    },

    // Logging
    progressJson: loggingOptions.progressJson,
    telemetryJson: loggingOptions.telemetryJson
  }
};
