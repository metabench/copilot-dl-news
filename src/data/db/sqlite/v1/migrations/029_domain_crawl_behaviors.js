'use strict';

const {
  DOMAIN_CRAWL_BEHAVIORS_UP_SQL: up,
  DOMAIN_CRAWL_BEHAVIORS_DOWN_SQL: down,
  ensureDomainCrawlBehaviorsSchema,
  dropDomainCrawlBehaviorsSchema
} = require('news-crawler-db');

module.exports = {
  up,
  down,
  ensureDomainCrawlBehaviorsSchema,
  dropDomainCrawlBehaviorsSchema
};
