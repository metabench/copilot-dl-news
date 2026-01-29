'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for ensureCountryHubs operation.
 * Ensures base structure coverage for country hub pages.
 */
module.exports = {
  operation: 'ensureCountryHubs',
  label: 'Ensure Country Hubs',
  description: 'Ensure base structure coverage for country hub pages. Visits known hub URLs to verify they exist and are accessible.',
  category: 'hub-management',
  icon: '🌍',
  options: {
    // Crawl behavior - structure-focused on country hubs
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'intelligent-hubs'
    },
    structureOnly: {
      ...crawlTypeOptions.structureOnly,
      default: true,
      description: 'Map hub structure without downloading articles'
    },
    countryHubExclusiveMode: {
      ...crawlTypeOptions.countryHubExclusiveMode,
      default: true,
      description: 'Focus exclusively on known country hub pages'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 200,
      description: 'Maximum hub pages to verify'
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 2,
      description: 'Shallow depth for hub verification'
    },

    // Performance
    concurrency: commonCrawlerOptions.concurrency,
    preferCache: {
      ...commonCrawlerOptions.preferCache,
      default: false,
      description: 'Disable cache to get fresh hub status'
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
