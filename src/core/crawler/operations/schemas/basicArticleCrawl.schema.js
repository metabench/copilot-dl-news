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

    // Freshness: stored articles older than this are revalidated with a
    // conditional GET (304 = cheap "unchanged"); unset = never re-fetched.
    maxAgeArticleMs: {
      type: 'number',
      label: 'Article max age (ms)',
      description: 'Revalidate stored articles older than this many milliseconds (0 = always revalidate). Leave unset to never re-fetch stored articles.',
      default: undefined
    },

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
