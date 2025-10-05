'use strict';

/**
 * Gazetteer crawl progress queries
 * 
 * Manages stage-level progress tracking for breadth-first gazetteer ingestion
 */

/**
 * Get the current state of a specific crawl stage
 * @param {object} db - Better-sqlite3 database handle
 * @param {string} stageName - Stage name (countries, adm1, adm2, cities)
 * @returns {object|null} Stage state or null
 */
function getStageState(db, stageName) {
  return db.prepare(`
    SELECT * FROM gazetteer_crawl_state 
    WHERE stage = ? 
    ORDER BY id DESC 
    LIMIT 1
  `).get(stageName);
}

/**
 * Get all stage states
 * @param {object} db - Better-sqlite3 database handle
 * @returns {Array} Array of stage states
 */
function getAllStageStates(db) {
  return db.prepare(`
    SELECT stage, status, started_at, completed_at, 
           records_total, records_processed, records_upserted, errors
    FROM gazetteer_crawl_state
    ORDER BY id ASC
  `).all();
}

/**
 * Initialize a new stage (insert or update)
 * @param {object} db - Better-sqlite3 database handle
 * @param {string} stageName
 * @param {number} recordsTotal
 */
function initStage(db, stageName, recordsTotal = 0) {
  const existing = getStageState(db, stageName);
  
  if (existing) {
    db.prepare(`
      UPDATE gazetteer_crawl_state 
      SET status = 'in_progress', 
          started_at = ?,
          records_total = ?,
          records_processed = 0,
          records_upserted = 0,
          errors = 0,
          error_message = NULL
      WHERE stage = ?
    `).run(Date.now(), recordsTotal, stageName);
  } else {
    db.prepare(`
      INSERT INTO gazetteer_crawl_state (stage, status, started_at, records_total)
      VALUES (?, 'in_progress', ?, ?)
    `).run(stageName, Date.now(), recordsTotal);
  }
}

/**
 * Update stage progress
 * @param {object} db - Better-sqlite3 database handle
 * @param {string} stageName
 * @param {object} updates - { recordsProcessed, recordsUpserted, errors }
 */
function updateStageProgress(db, stageName, updates = {}) {
  const sets = [];
  const params = [];

  if (updates.recordsProcessed != null) {
    sets.push('records_processed = ?');
    params.push(updates.recordsProcessed);
  }
  if (updates.recordsUpserted != null) {
    sets.push('records_upserted = ?');
    params.push(updates.recordsUpserted);
  }
  if (updates.errors != null) {
    sets.push('errors = ?');
    params.push(updates.errors);
  }

  if (sets.length === 0) return;

  params.push(stageName);
  db.prepare(`
    UPDATE gazetteer_crawl_state 
    SET ${sets.join(', ')}
    WHERE stage = ?
  `).run(...params);
}

/**
 * Mark a stage as complete
 * @param {object} db - Better-sqlite3 database handle
 * @param {string} stageName
 */
function markStageComplete(db, stageName) {
  db.prepare(`
    UPDATE gazetteer_crawl_state 
    SET status = 'completed', completed_at = ?
    WHERE stage = ?
  `).run(Date.now(), stageName);
}

/**
 * Mark a stage as failed
 * @param {object} db - Better-sqlite3 database handle
 * @param {string} stageName
 * @param {string} errorMessage
 */
function markStageFailed(db, stageName, errorMessage) {
  db.prepare(`
    UPDATE gazetteer_crawl_state 
    SET status = 'failed', error_message = ?
    WHERE stage = ?
  `).run(errorMessage, stageName);
}

/**
 * Delete all stage records (for reset)
 * @param {object} db - Better-sqlite3 database handle
 */
function resetAllStages(db) {
  db.prepare(`DELETE FROM gazetteer_crawl_state`).run();
}

/**
 * Get place counts by kind
 * @param {object} db - Better-sqlite3 database handle
 * @returns {object} Counts by kind { country: 100, region: 500, ... }
 */
function getPlaceCountsByKind(db) {
  const rows = db.prepare(`
    SELECT kind, COUNT(*) as count
    FROM places
    GROUP BY kind
  `).all();
  
  const counts = {};
  rows.forEach(row => {
    counts[row.kind] = row.count;
  });
  return counts;
}

/**
 * Get total place count
 * @param {object} db - Better-sqlite3 database handle
 * @returns {number} Total count
 */
function getTotalPlaceCount(db) {
  const result = db.prepare(`SELECT COUNT(*) as count FROM places`).get();
  return result?.count || 0;
}

module.exports = {
  getStageState,
  getAllStageStates,
  initStage,
  updateStageProgress,
  markStageComplete,
  markStageFailed,
  resetAllStages,
  getPlaceCountsByKind,
  getTotalPlaceCount
};
