'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for basicArticleCrawl operation.
 * General purpose article crawler without hub discovery features.
 */
module.exports = {
  operation: 'basicArticleCrawl',
  label: 'Basic Article Crawl',
  description: 'General article crawl without hub discovery features. Suitable for broad content collection from any website.',
  category: 'article-crawl',
  icon: '📰',
  options: {
    // Crawl behavior
    crawlType: {
      ...crawlTypeOptions.crawlType,
      default: 'basic'
    },
    structureOnly: crawlTypeOptions.structureOnly,
    countryHubExclusiveMode: crawlTypeOptions.countryHubExclusiveMode,

    // Limits
    maxDownloads: commonCrawlerOptions.maxDownloads,
    maxDepth: commonCrawlerOptions.maxDepth,

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
      default: 0
    },
    useSequenceRunner: plannerOptions.useSequenceRunner,

    // Logging
    progressJson: loggingOptions.progressJson,
    telemetryJson: loggingOptions.telemetryJson
  }
};
