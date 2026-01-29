'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for crawlCountryHubsHistory operation.
 * Refreshes historical content for multiple country hubs sequentially.
 */
module.exports = {
  operation: 'crawlCountryHubsHistory',
  label: 'Crawl Country Hubs History (Batch)',
  description: 'Refresh historical content for multiple country hubs in sequence. Iterates through known hubs and fetches older articles.',
  category: 'content-refresh',
  icon: '📚',
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
      description: 'Stay within country hub pages'
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

    // Batch-specific options
    hubLimit: {
      type: 'number',
      label: 'Hub Limit',
      description: 'Maximum number of hubs to process in this batch',
      default: 10,
      min: 1,
      max: 100,
      step: 1,
      category: 'limits'
    },
    continueOnError: {
      type: 'boolean',
      label: 'Continue on Error',
      description: 'Continue to next hub if one fails',
      default: true,
      category: 'behavior'
    },

    // Limits (per hub)
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 500,
      description: 'Maximum articles to fetch per hub'
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
