'use strict';

const progressQueries = require('../../../data/db/sqlite/v1/queries/gazetteer.progress');

/**
 * Data helper for gazetteer progress endpoints
 * 
 * Aggregates stage progress with place counts for progress UI
 */

/**
 * Get full progress summary including stages and place counts
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} scheduler - GazetteerPriorityScheduler instance
 * @returns {object} Progress summary with stages and counts
 */
function getProgressSummary(db, scheduler) {
  // Get stage progress from scheduler
  const overallProgress = scheduler.getOverallProgress();
  
  // Get place counts by kind
  const placeCountsByKind = progressQueries.getPlaceCountsByKind(db);
  
  // Get total place count
  const totalPlaces = progressQueries.getTotalPlaceCount(db);

  return {
    ...overallProgress,
    placeCountsByKind,
    totalPlaces
  };
}

/**
 * Get place counts grouped by kind
 * @param {object} db - Better-sqlite3 database handle
 * @returns {Array} Array of {kind, count} objects
 */
function getPlaceCountsByKind(db) {
  return progressQueries.getPlaceCountsByKind(db);
}

/**
 * Get total place count
 * @param {object} db - Better-sqlite3 database handle
 * @returns {number} Total count of all places
 */
function getTotalPlaceCount(db) {
  return progressQueries.getTotalPlaceCount(db);
}

module.exports = {
  getProgressSummary,
  getPlaceCountsByKind,
  getTotalPlaceCount
};
