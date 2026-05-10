'use strict';

/**
 * Compatibility wrapper for crawl schedule DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS helper exports used by copilot-dl-news callers.
 */

const {
  ensureScheduleSchema,
  normalizeScheduleRow,
  saveSchedule,
  getSchedule,
  getOverdueSchedules,
  getScheduleBatch,
  getAllSchedules,
  deleteSchedule,
  incrementCrawlCount,
  getScheduleStats,
  updatePriorityScore,
  pruneInactiveSchedules
} = require('news-crawler-db');

module.exports = {
  ensureScheduleSchema,
  normalizeScheduleRow,
  saveSchedule,
  getSchedule,
  getOverdueSchedules,
  getScheduleBatch,
  getAllSchedules,
  deleteSchedule,
  incrementCrawlCount,
  getScheduleStats,
  updatePriorityScore,
  pruneInactiveSchedules
};
