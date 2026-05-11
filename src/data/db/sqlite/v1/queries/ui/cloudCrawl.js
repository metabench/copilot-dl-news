"use strict";

const {
  DEFAULT_CLOUD_CRAWL_TARGETS,
  getCloudCrawlStatusSnapshot,
  normalizeCloudCrawlDomains
} = require("news-crawler-db");

module.exports = {
  DEFAULT_CLOUD_CRAWL_TARGETS,
  getCloudCrawlStatusSnapshot,
  normalizeDomains: normalizeCloudCrawlDomains
};
