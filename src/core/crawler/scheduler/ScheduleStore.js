'use strict';

/**
 * ScheduleStore
 * 
 * Wraps scheduleAdapter for database access to crawl schedules.
 * Provides a clean interface for the CrawlScheduler.
 * 
 * @module ScheduleStore
 */

const scheduleAdapter = require('../../../data/db/sqlite/v1/queries/scheduleAdapter');

class ScheduleStore {
  /**
   * Create a ScheduleStore
   * @param {import('better-sqlite3').Database} db - Database instance
   */
  constructor(db) {
    if (!db) {
      throw new Error('ScheduleStore requires a database instance');
    }
    this.db = db;
    scheduleAdapter.ensureScheduleSchema(db);
  }

  /**
   * Save or update a schedule
   * @param {Object} schedule - Schedule data
   * @returns {Object} Saved schedule
   */
  save(schedule) {
    return scheduleAdapter.saveSchedule(this.db, schedule);
  }

  /**
   * Get a schedule by domain
   * @param {string} domain - Domain to look up
   * @returns {Object|null} Schedule or null
   */
  get(domain) {
    return scheduleAdapter.getSchedule(this.db, domain);
  }

  /**
   * Get overdue schedules
   * @param {Object} [opts] - Options
   * @param {number} [opts.limit=50] - Maximum results
   * @param {string} [opts.asOf] - Reference time
   * @returns {Object[]} List of overdue schedules
   */
  getOverdue(opts = {}) {
    return scheduleAdapter.getOverdueSchedules(this.db, opts);
  }

  /**
   * Get a batch of schedules due for crawling
   * @param {number} limit - Batch size
   * @param {Object} [opts] - Options
   * @returns {Object[]} List of schedules
   */
  getBatch(limit, opts = {}) {
    return scheduleAdapter.getScheduleBatch(this.db, limit, opts);
  }

  /**
   * Get all schedules
   * @param {Object} [opts] - Pagination options
   * @returns {Object[]} List of schedules
   */
  getAll(opts = {}) {
    return scheduleAdapter.getAllSchedules(this.db, opts);
  }

  /**
   * Delete a schedule
   * @param {string} domain - Domain to delete
   * @returns {boolean} True if deleted
   */
  delete(domain) {
    return scheduleAdapter.deleteSchedule(this.db, domain);
  }

  /**
   * Increment crawl count and update last crawl time
   * @param {string} domain - Domain
   * @param {boolean} success - Whether crawl succeeded
   * @param {number} [articleCount=0] - Number of articles found
   * @returns {Object|null} Updated schedule
   */
  recordCrawlResult(domain, success, articleCount = 0) {
    return scheduleAdapter.incrementCrawlCount(this.db, domain, success, articleCount);
  }

  /**
   * Update priority score
   * @param {string} domain - Domain
   * @param {number} score - New score
   * @returns {Object|null} Updated schedule
   */
  updatePriority(domain, score) {
    return scheduleAdapter.updatePriorityScore(this.db, domain, score);
  }

  /**
   * Get statistics
   * @returns {Object} Stats
   */
  getStats() {
    return scheduleAdapter.getScheduleStats(this.db);
  }

  /**
   * Prune inactive schedules
   * @param {number} [daysInactive=90] - Days threshold
   * @returns {number} Number pruned
   */
  prune(daysInactive = 90) {
    return scheduleAdapter.pruneInactiveSchedules(this.db, daysInactive);
  }
}

module.exports = ScheduleStore;
