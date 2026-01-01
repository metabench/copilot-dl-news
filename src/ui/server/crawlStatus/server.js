'use strict';

const express = require('express');

const { renderCrawlStatusPageHtml } = require('./CrawlStatusPage');

function createCrawlStatusRouter(options = {}) {
  const router = express.Router();

  const {
    jobsApiPath = '/api/v1/crawl/jobs',
    extraJobsApiPath = null,
    eventsPath = '/api/crawl-telemetry/events',
    telemetryHistoryPath = '/api/crawl-telemetry/history',
    includeRootRoute = true
  } = options;

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      res
        .type('html')
        .send(
          renderCrawlStatusPageHtml({
            jobsApiPath,
            extraJobsApiPath,
            eventsPath,
            telemetryHistoryPath,
            req,
            res
          })
        );
    });
  }

  return router;
}

module.exports = {
  createCrawlStatusRouter
};
