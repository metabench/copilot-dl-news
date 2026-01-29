'use strict';

/**
 * Common option schema definitions shared across multiple crawl operations.
 * These can be spread into operation-specific schemas to avoid duplication.
 */

const commonCrawlerOptions = {
  maxDownloads: {
    type: 'number',
    label: 'Max Pages',
    description: 'Maximum number of pages to download before stopping',
    default: 1000,
    min: 1,
    max: 100000,
    step: 100,
    category: 'limits'
  },
  maxDepth: {
    type: 'number',
    label: 'Max Depth',
    description: 'Maximum link depth to follow from the start URL',
    default: 10,
    min: 1,
    max: 50,
    step: 1,
    category: 'limits'
  },
  concurrency: {
    type: 'number',
    label: 'Concurrency',
    description: 'Number of parallel fetch requests',
    default: 4,
    min: 1,
    max: 20,
    step: 1,
    category: 'performance'
  },
  enableDb: {
    type: 'boolean',
    label: 'Save to Database',
    description: 'Persist fetched pages and articles to the database',
    default: true,
    category: 'storage'
  },
  preferCache: {
    type: 'boolean',
    label: 'Prefer Cache',
    description: 'Use cached content when available instead of refetching',
    default: true,
    category: 'performance'
  },
  useSitemap: {
    type: 'boolean',
    label: 'Use Sitemap',
    description: 'Load and follow sitemap.xml for URL discovery',
    default: true,
    category: 'discovery'
  }
};

const plannerOptions = {
  plannerVerbosity: {
    type: 'enum',
    label: 'Planner Verbosity',
    description: 'Level of detail in planner logging output',
    default: 0,
    options: [
      { value: 0, label: 'Quiet' },
      { value: 1, label: 'Normal' },
      { value: 2, label: 'Verbose' }
    ],
    category: 'logging'
  },
  useSequenceRunner: {
    type: 'boolean',
    label: 'Use Sequence Runner',
    description: 'Execute as part of a multi-step sequence',
    default: false,
    category: 'advanced',
    advanced: true
  }
};

const crawlTypeOptions = {
  crawlType: {
    type: 'enum',
    label: 'Crawl Type',
    description: 'Strategy for link selection and prioritization',
    default: 'basic',
    options: [
      { value: 'basic', label: 'Basic', description: 'Follow all valid links' },
      { value: 'intelligent-hubs', label: 'Intelligent Hubs', description: 'Prioritize hub pages' },
      { value: 'discover-structure', label: 'Structure Discovery', description: 'Focus on site structure' },
      { value: 'intelligent-topic', label: 'Topic Discovery', description: 'Focus on topic hubs' },
      { value: 'intelligent-place-topic', label: 'Place + Topic', description: 'Combined place/topic discovery' },
      { value: 'intelligent-history', label: 'History Refresh', description: 'Crawl historical content' }
    ],
    category: 'behavior'
  },
  structureOnly: {
    type: 'boolean',
    label: 'Structure Only',
    description: 'Skip article content extraction, only map site structure',
    default: false,
    category: 'behavior'
  },
  countryHubExclusiveMode: {
    type: 'boolean',
    label: 'Country Hub Exclusive',
    description: 'Focus crawling exclusively on country hub pages',
    default: false,
    category: 'behavior'
  }
};

const loggingOptions = {
  progressJson: {
    type: 'boolean',
    label: 'JSON Progress',
    description: 'Output progress updates as JSON lines to stdout',
    default: false,
    category: 'logging',
    advanced: true
  },
  telemetryJson: {
    type: 'boolean',
    label: 'JSON Telemetry',
    description: 'Output telemetry events as JSON lines to stdout',
    default: false,
    category: 'logging',
    advanced: true
  }
};

module.exports = {
  commonCrawlerOptions,
  plannerOptions,
  crawlTypeOptions,
  loggingOptions
};
