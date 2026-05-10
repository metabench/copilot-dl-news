'use strict';

/**
 * Compatibility wrapper for crawler healing event DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS helper exports used by healing callers.
 */

const {
  ensureHealingSchema,
  normalizeHealingEventRow,
  recordHealingEvent,
  getRecentHealingEvents,
  getHealingEventsByDomain,
  getHealingEventsByType,
  getHealingStats,
  pruneHealingEvents,
  getRecentFailureCount
} = require('news-crawler-db');

module.exports = {
  ensureHealingSchema,
  normalizeHealingEventRow,
  recordHealingEvent,
  getRecentHealingEvents,
  getHealingEventsByDomain,
  getHealingEventsByType,
  getHealingStats,
  pruneHealingEvents,
  getRecentFailureCount
};
