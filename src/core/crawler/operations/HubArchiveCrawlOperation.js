'use strict';

const { CrawlOperation } = require('./CrawlOperation');

/**
 * Operation for crawling historical pages from verified place hubs.
 *
 * This operation:
 * 1. Reads verified hubs from place_page_mappings
 * 2. Probes each hub to determine its pagination depth
 * 3. Queues paginated URLs for systematic historical crawling
 * 4. Updates depth metadata after probing
 *
 * The goal is to build a complete archive of news articles organized by place.
 */
class HubArchiveCrawlOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'hubArchiveCrawl',
      summary: 'Crawl historical pages from verified place hubs',
      defaultOptions: {
        // Target specification
        host: null,                    // Optional: filter to single host
        placeKind: 'country',          // country | region | city
        pageKind: 'country-hub',       // Matches place_page_mappings.page_kind

        // Depth probing settings
        probeDepth: true,              // Whether to probe for pagination depth
        maxProbePages: 5000,           // Safety cap on pagination depth
        probeDelayMs: 500,             // Delay between probe requests

        // Archive crawl settings
        crawlArchive: true,            // Whether to crawl historical pages
        pagesPerHub: 100,              // Max pages to crawl per hub (0 = all)
        startPage: 2,                  // Start from page 2 (page 1 is usually current)

        // Prioritization
        hubLimit: 10,                  // Number of hubs to process per run
        orderBy: 'priority',           // priority | oldest_check | depth
        minDepth: 2,                   // Only archive hubs with at least N pages

        // Rate limiting
        requestDelayMs: 1000,          // Delay between archive page requests
        concurrency: 1,                // Concurrent requests per domain

        // Output
        saveArticles: true,            // Extract and save articles from pages
        updateDepthMetadata: true,     // Update place_page_mappings after probe

        // Crawl type marker
        crawlType: 'hub-archive'
      },
      schema: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
            description: 'Filter to a specific domain (e.g., theguardian.com)'
          },
          placeKind: {
            type: 'string',
            enum: ['country', 'region', 'city'],
            description: 'Type of places to archive'
          },
          hubLimit: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            description: 'Number of hubs to process per run'
          },
          pagesPerHub: {
            type: 'number',
            minimum: 0,
            maximum: 10000,
            description: 'Max pages to crawl per hub (0 = all available)'
          },
          probeDepth: {
            type: 'boolean',
            description: 'Whether to probe for pagination depth before crawling'
          },
          minDepth: {
            type: 'number',
            minimum: 1,
            description: 'Only archive hubs with at least this many pages'
          }
        }
      }
    });
  }

  /**
   * Get operation description for UI/logging
   */
  getDescription(options) {
    const host = options.host || 'all hosts';
    const limit = options.hubLimit || this.defaultOptions.hubLimit;
    return `Archive crawl for ${limit} ${options.placeKind || 'country'} hubs on ${host}`;
  }
}

/**
 * Operation for probing hub depth without crawling articles.
 * Useful for populating depth metadata before planning archive crawls.
 */
class HubDepthProbeOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'hubDepthProbe',
      summary: 'Probe pagination depth of verified place hubs',
      defaultOptions: {
        host: null,
        pageKind: 'country-hub',
        hubLimit: 50,
        maxProbePages: 5000,
        probeDelayMs: 500,
        orderBy: 'oldest_check',
        depthCheckMaxAgeHours: 168,    // 7 days
        crawlType: 'hub-depth-probe'
      },
      schema: {
        type: 'object',
        properties: {
          host: {
            type: 'string',
            description: 'Filter to a specific domain'
          },
          hubLimit: {
            type: 'number',
            minimum: 1,
            maximum: 500,
            description: 'Number of hubs to probe'
          },
          depthCheckMaxAgeHours: {
            type: 'number',
            minimum: 1,
            description: 'Re-probe hubs not checked within this many hours'
          }
        }
      }
    });
  }

  getDescription(options) {
    const host = options.host || 'all hosts';
    const limit = options.hubLimit || this.defaultOptions.hubLimit;
    return `Probe depth for ${limit} hubs on ${host}`;
  }
}

module.exports = {
  HubArchiveCrawlOperation,
  HubDepthProbeOperation
};
