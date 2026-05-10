'use strict';

/**
 * Compatibility wrapper for billing DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS exports used by copilot-dl-news callers.
 */

const {
  createBillingAdapter,
  ensureBillingSchema,
  PLANS,
  METRICS,
  SUBSCRIPTION_STATUS,
  getCurrentPeriod
} = require('news-crawler-db');

module.exports = {
  createBillingAdapter,
  ensureBillingSchema,
  PLANS,
  METRICS,
  SUBSCRIPTION_STATUS,
  getCurrentPeriod
};
