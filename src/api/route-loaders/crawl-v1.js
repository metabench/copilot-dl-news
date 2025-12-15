'use strict';

const { registerOperationRoutes } = require('../../server/crawl-api/v1/express/routes/operations');

/**
 * Register crawl API v1 Express routes on the provided app or router.
 *
 * @param {import('express').Application|import('express').Router} app - Express app or router.
 * @param {Object} [options]
 * @param {string} [options.basePath='/api/v1/crawl'] - Base path to mount the routes under.
 * @param {Console} [options.logger=console] - Logger passed through to the crawl routes.
 * @param {Object} [options.crawlService] - Optional prebuilt crawl service instance.
 * @param {Function} [options.createCrawlService] - Factory used to create the crawl service.
 * @param {Object} [options.serviceOptions] - Options forwarded into the crawl service factory.
 * @param {Object} [options.inProcessJobRegistry] - Optional in-process job registry for long-running crawl jobs.
 */
function registerCrawlApiV1Routes(app, options = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('An Express app or router with a use() method is required to register crawl API routes.');
  }

  const {
    basePath = '/api/v1/crawl',
    logger = console,
    crawlService,
    createCrawlService,
    serviceOptions,
    inProcessJobRegistry
  } = options;

  registerOperationRoutes(app, {
    basePath,
    logger,
    version: 'v1',
    crawlService,
    createCrawlService,
    serviceOptions,
    inProcessJobRegistry
  });
}

module.exports = {
  registerCrawlApiV1Routes
};
