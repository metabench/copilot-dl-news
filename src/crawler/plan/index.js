'use strict';

/**
 * Plan module - First-class crawl intent representation.
 *
 * @module crawler/plan
 */

const CrawlPlan = require('./CrawlPlan');

module.exports = {
  CrawlPlan,

  // Re-export constants for convenience
  GOALS: CrawlPlan.GOALS,
  STATUS: CrawlPlan.STATUS,
  PRIORITIES: CrawlPlan.PRIORITIES
};
