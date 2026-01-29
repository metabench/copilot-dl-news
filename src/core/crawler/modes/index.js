'use strict';

/**
 * Crawler mode strategies module.
 * 
 * Provides strategy pattern implementations for different crawl modes:
 * - BasicCrawlMode: Standard web crawling
 * - GazetteerCrawlMode: Geography-based crawling
 * - IntelligentCrawlMode: AI-planned crawling
 * 
 * @module crawler/modes
 */

const CrawlModeStrategy = require('./CrawlModeStrategy');
const BasicCrawlMode = require('./BasicCrawlMode');
const GazetteerCrawlMode = require('./GazetteerCrawlMode');
const IntelligentCrawlMode = require('./IntelligentCrawlMode');

/**
 * Create a mode strategy based on crawl type.
 * Factory function that wraps CrawlModeStrategy.create().
 * 
 * @param {string} crawlType - The crawl type from config
 * @param {Object} context - The mode context
 * @returns {CrawlModeStrategy} The appropriate strategy instance
 */
function createModeStrategy(crawlType, context) {
  return CrawlModeStrategy.create(crawlType, context);
}

module.exports = {
  CrawlModeStrategy,
  BasicCrawlMode,
  GazetteerCrawlMode,
  IntelligentCrawlMode,
  createModeStrategy
};
