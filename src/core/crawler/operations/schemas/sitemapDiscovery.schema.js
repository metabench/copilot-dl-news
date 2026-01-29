'use strict';

const {
  commonCrawlerOptions,
  plannerOptions,
  loggingOptions
} = require('./common.schema');

/**
 * Schema for sitemapDiscovery operation.
 * Sitemap-first crawl: discover pages via sitemap.xml before link following.
 */
module.exports = {
  operation: 'sitemapDiscovery',
  label: 'Sitemap Discovery',
  description: 'Sitemap-first crawl strategy that prioritizes sitemap-based URL discovery. Fetches robots.txt, parses sitemaps, then follows links. Use when sites have good sitemap coverage.',
  category: 'discovery',
  icon: '📍',
  options: {
    // Sitemap-specific options
    sitemapOnly: {
      type: 'boolean',
      label: 'Sitemap Only',
      description: 'If true, only crawl URLs from sitemaps. If false, also follow links from homepage.',
      default: false,
      category: 'behavior'
    },
    sitemapMaxUrls: {
      type: 'number',
      label: 'Sitemap Max URLs',
      description: 'Maximum URLs to extract from sitemaps',
      default: 5000,
      min: 100,
      max: 100000,
      step: 500,
      category: 'limits'
    },
    disableIntelligentPlanning: {
      type: 'boolean',
      label: 'Disable Intelligent Planning',
      description: 'Skip APS hub guessing to avoid 404s on sites with good sitemaps',
      default: true,
      category: 'behavior',
      advanced: true
    },
    intMaxSeeds: {
      type: 'number',
      label: 'Intelligent Seeds',
      description: 'Number of country hub candidates to generate (0 = none)',
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      category: 'behavior',
      advanced: true
    },

    // Standard options
    crawlType: {
      type: 'enum',
      label: 'Crawl Type',
      description: 'Crawl strategy type',
      default: 'sitemap-discovery',
      options: [
        { value: 'sitemap-discovery', label: 'Sitemap Discovery' }
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
      default: 2,
      description: 'Shallow depth since sitemap provides breadth'
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
