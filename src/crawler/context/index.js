'use strict';

/**
 * Crawler context module.
 *
 * Provides unified state management for crawl operations.
 *
 * @module crawler/context
 */

const CrawlContext = require('./CrawlContext');

module.exports = {
  CrawlContext,
  createContext: CrawlContext.create,
  fromConfig: CrawlContext.fromConfig
};
