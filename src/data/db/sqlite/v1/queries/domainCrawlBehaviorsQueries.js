'use strict';

const {
  ensureDomainCrawlBehaviorsTable,
  getDomainBehavior,
  checkPuppeteerNeeded,
  recordPuppeteerNeeded,
  recordPuppeteerSuccess,
  recordHttpSuccess,
  recordHeadNotSupported,
  getPuppeteerDomains,
  getDomainBehaviorStats,
  clearPuppeteerRequirement
} = require('news-crawler-db');

module.exports = {
  ensureTable: ensureDomainCrawlBehaviorsTable,
  getDomainBehavior,
  checkPuppeteerNeeded,
  recordPuppeteerNeeded,
  recordPuppeteerSuccess,
  recordHttpSuccess,
  recordHeadNotSupported,
  getPuppeteerDomains,
  getDomainBehaviorStats,
  clearPuppeteerRequirement
};
