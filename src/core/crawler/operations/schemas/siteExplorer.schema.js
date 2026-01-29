'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for siteExplorer operation.
 * Explores site structure without downloading article content.
 */
module.exports = {
  operation: 'siteExplorer',
  label: 'Site Explorer',
  description: 'Explore website structure without downloading article content. Maps navigation, sections, and hub pages.',
  category: 'discovery',
  icon: '🗺️',
  options: {
    // Crawl behavior - structure-focused
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'discover-structure'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: true,
      description: 'Skip article content extraction (enabled by default for site exploration)'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 500,
      description: 'Maximum pages to visit for structure mapping'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 5,
      description: 'Maximum depth for structure exploration'
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
      default: 1
    },

    // Logging
    progressJson: loggingOptions.progressJson,
    telemetryJson: loggingOptions.telemetryJson
  }
};
