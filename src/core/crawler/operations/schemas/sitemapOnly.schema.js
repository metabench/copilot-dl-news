'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for sitemapOnly operation.
 * Strict sitemap-only crawl: only URLs from sitemap.xml, no link following.
 */
module.exports = {
  operation: 'sitemapOnly',
  label: 'Sitemap Only',
  description: 'Strict sitemap-only crawl that only fetches URLs discovered in sitemaps. No link following. Use for maximum predictability and minimal server load.',
  category: 'discovery',
  icon: '🗂️',
  options: {
    // Sitemap-specific options
    sitemapOnly: {
      type: 'boolean',
      label: 'Sitemap Only',
      description: 'Only crawl URLs from sitemaps (always true for this operation)',
      default: true,
      category: 'behavior',
      advanced: true
    },
    sitemapMaxUrls: {
      type: 'number',
      label: 'Sitemap Max URLs',
      description: 'Maximum URLs to extract from sitemaps',
      default: 10000,
      min: 100,
      max: 100000,
      step: 500,
      category: 'limits'
    },
    disableIntelligentPlanning: {
      type: 'boolean',
      label: 'Disable Intelligent Planning',
      description: 'Skip hub guessing (always enabled for sitemap-only)',
      default: true,
      category: 'behavior',
      advanced: true
    },
    intMaxSeeds: {
      type: 'number',
      label: 'Intelligent Seeds',
      description: 'Number of country hub candidates (always 0 for sitemap-only)',
      default: 0,
      min: 0,
      max: 0,
      step: 1,
      category: 'behavior',
      advanced: true
    },

    // Standard options
    crawlType: {
      type: 'enum',
      label: 'Crawl Type',
      description: 'Crawl strategy type',
      default: 'sitemap-only',
      options: [
        { value: 'sitemap-only', label: 'Sitemap Only' }
      ],
      category: 'behavior',
      advanced: true
    },
    structureOnly: {
      type: 'boolean',
      label: 'Structure Only',
      description: 'Skip article content extraction',
      default: false,
      category: 'behavior'
    },
    countryHubExclusiveMode: {
      type: 'boolean',
      label: 'Country Hub Exclusive',
      description: 'Focus on country hub pages only',
      default: false,
      category: 'behavior'
    },

    // Limits
    maxDownloads: {
      ...commonCrawlerOptions.maxDownloads,
      default: 1000
    },
    maxDepth: {
      ...commonCrawlerOptions.maxDepth,
      default: 0,
      min: 0,
      max: 0,
      description: 'No depth - sitemap URLs only'
    },

    // Performance
    concurrency: commonCrawlerOptions.concurrency,
    preferCache: commonCrawlerOptions.preferCache,

    // Discovery
    useSitemap: {
      ...commonCrawlerOptions.useSitemap,
      default: true,
      description: 'Load sitemaps (always enabled for this operation)'
    },

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
