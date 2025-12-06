'use strict';

const path = require('path');

let CachedNewsCrawler = null;
const loadNewsCrawler = () => {
  if (!CachedNewsCrawler) {
    CachedNewsCrawler = require('../NewsCrawler');
  }
  return CachedNewsCrawler;
};

const buildFacadeDefaults = (defaults = {}) => {
  const dataDir = defaults.dataDir || path.resolve(process.cwd(), 'data');

  return Object.freeze({
    dataDir,
    enableDb: defaults.enableDb !== false,
    preferCache: defaults.preferCache !== false,
    slowMode: Boolean(defaults.slowMode),
    rateLimitMs: defaults.rateLimitMs || undefined,
    maxDownloads: defaults.maxDownloads || undefined,
    requestTimeoutMs: defaults.requestTimeoutMs || undefined,
    jobId: defaults.jobId || undefined,
    ...defaults
  });
};

/**
 * Creates a crawler factory function.
 * If a custom factory is provided, uses that; otherwise creates NewsCrawler instances directly.
 * @param {Function} [crawlerFactory] - Optional custom factory function
 * @returns {Function} Factory function (startUrl, options) => crawler
 */
const createCrawlerFactory = (crawlerFactory) => {
  if (typeof crawlerFactory === 'function') {
    return crawlerFactory;
  }

  return (startUrl, options) => {
    const NewsCrawler = loadNewsCrawler();
    return new NewsCrawler(startUrl, options || {});
  };
};

module.exports = {
  buildFacadeDefaults,
  createCrawlerFactory
};
