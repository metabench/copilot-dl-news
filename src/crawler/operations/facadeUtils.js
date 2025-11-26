'use strict';

const path = require('path');

let CachedCrawlerFactory = null;
const loadCrawlerFactory = () => {
  if (!CachedCrawlerFactory) {
    CachedCrawlerFactory = require('../CrawlerFactory');
  }
  return CachedCrawlerFactory;
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

const createCrawlerFactory = (crawlerFactory) => {
  if (typeof crawlerFactory === 'function') {
    return crawlerFactory;
  }

  return (startUrl, options) => {
    const { CrawlerFactory } = loadCrawlerFactory();
    const config = { ...(options || {}), startUrl };
    return CrawlerFactory.create(config);
  };
};

module.exports = {
  buildFacadeDefaults,
  createCrawlerFactory
};
