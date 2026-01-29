'use strict';

const { CrawlOperation } = require('./CrawlOperation');

/**
 * SitemapDiscoveryOperation — Sitemap-first crawl strategy
 * 
 * This operation prioritizes sitemap-based URL discovery over hub guessing:
 * 1. Fetches robots.txt to find sitemap references
 * 2. Parses all sitemaps (including news sitemaps, sitemap indexes)
 * 3. Enqueues URLs from sitemaps before any link following
 * 4. Falls back to homepage link discovery if no sitemaps found
 * 
 * Use this when:
 * - APS hub guessing generates too many 404s
 * - Site has good sitemap coverage
 * - You want predictable, structure-aware crawling
 * 
 * @example
 *   node tools/dev/mini-crawl.js https://bbc.com -o sitemapDiscovery -n 100
 *   node tools/dev/crawl-sites.js bbc reuters --sitemap --pages 100
 */
class SitemapDiscoveryOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'sitemapDiscovery',
      summary: 'Sitemap-first crawl: discover pages via sitemap.xml before link following',
      defaultOptions: {
        // Core sitemap settings
        crawlType: 'sitemap-discovery',
        useSitemap: true,
        sitemapOnly: false,  // false = also follow links from homepage
        sitemapMaxUrls: 5000,
        
        // Crawl behavior
        plannerVerbosity: 0,
        useSequenceRunner: false,
        structureOnly: false,
        countryHubExclusiveMode: false,
        
        // Database
        enableDb: true,
        preferCache: true,
        
        // Depth control (shallow - sitemap provides the breadth)
        maxDepth: 2,
        
        // No intelligent planning (avoids APS hub guessing)
        disableIntelligentPlanning: true,
        intMaxSeeds: 0  // Don't generate country hub candidates
      }
    });
  }
}

/**
 * SitemapOnlyOperation — Strict sitemap-only crawl
 * 
 * Only crawls URLs discovered in sitemaps, no link following.
 * Use when you want maximum predictability and minimal server load.
 */
class SitemapOnlyOperation extends CrawlOperation {
  constructor() {
    super({
      name: 'sitemapOnly',
      summary: 'Strict sitemap-only crawl: only URLs from sitemap.xml, no link following',
      defaultOptions: {
        crawlType: 'sitemap-only',
        useSitemap: true,
        sitemapOnly: true,  // STRICT: no link following
        sitemapMaxUrls: 10000,
        
        plannerVerbosity: 0,
        useSequenceRunner: false,
        structureOnly: false,
        countryHubExclusiveMode: false,
        
        enableDb: true,
        preferCache: true,
        
        maxDepth: 0,  // No depth - sitemap URLs only
        
        disableIntelligentPlanning: true,
        intMaxSeeds: 0
      }
    });
  }
}

module.exports = {
  SitemapDiscoveryOperation,
  SitemapOnlyOperation
};
