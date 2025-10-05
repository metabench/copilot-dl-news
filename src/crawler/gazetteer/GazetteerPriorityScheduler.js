'use strict';

const progressQueries = require('../../db/sqlite/queries/gazetteer.progress');

/**
 * GazetteerPriorityScheduler
 * 
 * Enforces breadth-first global coverage by managing crawl stages and priorities.
 * Ensures all countries are crawled before any ADM1 subdivisions, all ADM1 before ADM2, etc.
 * 
 * Stage priorities (higher = processed first):
 * - countries: 1000
 * - adm1: 100
 * - adm2: 10
 * - cities: 1
 * 
 * Usage:
 *   const scheduler = new GazetteerPriorityScheduler({ db });
 *   const stage = scheduler.getCurrentStage(); // 'countries' | 'adm1' | 'adm2' | 'cities' | 'complete'
 *   const canProceed = scheduler.canProceedToNextStage('countries');
 *   scheduler.markStageComplete('countries');
 */

class GazetteerPriorityScheduler {
  constructor({ db, logger = console } = {}) {
    if (!db) {
      throw new Error('GazetteerPriorityScheduler requires a database handle');
    }
    this.db = db;
    this.logger = logger;

    // Stage definitions
    this.stages = [
      { name: 'countries', priority: 1000, crawlDepth: 0, kind: 'country' },
      { name: 'adm1', priority: 100, crawlDepth: 1, kind: 'region' },
      { name: 'adm2', priority: 10, crawlDepth: 2, kind: 'region' },
      { name: 'cities', priority: 1, crawlDepth: 3, kind: 'city' }
    ];

    this._ensureStateTable();
  }

  _ensureStateTable() {
    // The gazetteer_crawl_state table is created by ensureGazetteer, but we'll verify
    try {
      this.db.prepare(`
        SELECT COUNT(*) as c FROM sqlite_master 
        WHERE type='table' AND name='gazetteer_crawl_state'
      `).get();
    } catch (err) {
      this.logger.warn('[GazetteerPriorityScheduler] gazetteer_crawl_state table not found:', err.message);
    }
  }

  /**
   * Get the current crawl stage (first incomplete stage)
   * @returns {string} 'countries' | 'adm1' | 'adm2' | 'cities' | 'complete'
   */
  getCurrentStage() {
    try {
      for (const stage of this.stages) {
        const state = progressQueries.getStageState(this.db, stage.name);
        if (!state || state.status !== 'completed') {
          return stage.name;
        }
      }
      return 'complete';
    } catch (err) {
      this.logger.error('[GazetteerPriorityScheduler] Error getting current stage:', err.message);
      return 'countries'; // Default to first stage on error
    }
  }

  /**
   * Get all stage states with progress information
   * @returns {Array} Array of stage state objects
   */
  getAllStages() {
    return this.stages.map(stage => {
      const state = progressQueries.getStageState(this.db, stage.name);
      return {
        name: stage.name,
        priority: stage.priority,
        crawlDepth: stage.crawlDepth,
        kind: stage.kind,
        status: state?.status || 'pending',
        startedAt: state?.started_at || null,
        completedAt: state?.completed_at || null,
        recordsTotal: state?.records_total || 0,
        recordsProcessed: state?.records_processed || 0,
        recordsUpserted: state?.records_upserted || 0,
        errors: state?.errors || 0,
        progressPercent: this._calculateProgress(state)
      };
    });
  }

  _calculateProgress(state) {
    if (!state || !state.records_total || state.records_total === 0) {
      return 0;
    }
    return Math.round((state.records_processed / state.records_total) * 100);
  }

  /**
   * Check if we can proceed from the given stage to the next
   * @param {string} stageName 
   * @returns {boolean}
   */
  canProceedToNextStage(stageName) {
    const state = progressQueries.getStageState(this.db, stageName);
    return state?.status === 'completed';
  }

  /**
   * Initialize a stage (mark as in_progress)
   * @param {string} stageName 
   * @param {number} recordsTotal 
   */
  initStage(stageName, recordsTotal = 0) {
    try {
      progressQueries.initStage(this.db, stageName, recordsTotal);
      this.logger.info(`[GazetteerPriorityScheduler] Stage '${stageName}' initialized with ${recordsTotal} total records`);
    } catch (err) {
      this.logger.error(`[GazetteerPriorityScheduler] Error initializing stage '${stageName}':`, err.message);
    }
  }

  /**
   * Update stage progress
   * @param {string} stageName 
   * @param {object} updates - { recordsProcessed, recordsUpserted, errors }
   */
  updateStageProgress(stageName, updates = {}) {
    try {
      const current = progressQueries.getStageState(this.db, stageName);
      if (!current) {
        this.logger.warn(`[GazetteerPriorityScheduler] Cannot update non-existent stage '${stageName}'`);
        return;
      }

      progressQueries.updateStageProgress(this.db, stageName, updates);
    } catch (err) {
      this.logger.error(`[GazetteerPriorityScheduler] Error updating stage '${stageName}':`, err.message);
    }
  }

  /**
   * Mark a stage as complete
   * @param {string} stageName 
   */
  markStageComplete(stageName) {
    try {
      progressQueries.markStageComplete(this.db, stageName);
      this.logger.info(`[GazetteerPriorityScheduler] Stage '${stageName}' marked complete`);
    } catch (err) {
      this.logger.error(`[GazetteerPriorityScheduler] Error marking stage '${stageName}' complete:`, err.message);
    }
  }

  /**
   * Mark a stage as failed
   * @param {string} stageName 
   * @param {string} errorMessage 
   */
  markStageFailed(stageName, errorMessage) {
    try {
      progressQueries.markStageFailed(this.db, stageName, errorMessage);
      this.logger.error(`[GazetteerPriorityScheduler] Stage '${stageName}' marked failed:`, errorMessage);
    } catch (err) {
      this.logger.error(`[GazetteerPriorityScheduler] Error marking stage '${stageName}' failed:`, err.message);
    }
  }

  /**
   * Calculate priority score for a place based on its crawl depth
   * @param {number} crawlDepth 
   * @returns {number}
   */
  calculatePriorityScore(crawlDepth = 0) {
    const stage = this.stages.find(s => s.crawlDepth === crawlDepth);
    if (!stage) {
      return 1; // Default low priority
    }
    return stage.priority;
  }

  /**
   * Reset all stages (for testing or re-crawling)
   */
  resetAllStages() {
    try {
      progressQueries.resetAllStages(this.db);
      this.logger.info('[GazetteerPriorityScheduler] All stages reset');
    } catch (err) {
      this.logger.error('[GazetteerPriorityScheduler] Error resetting stages:', err.message);
    }
  }

  /**
   * Get overall progress summary
   * @returns {object}
   */
  getOverallProgress() {
    const stages = this.getAllStages();
    const totalStages = stages.length;
    const completedStages = stages.filter(s => s.status === 'completed').length;
    const inProgressStages = stages.filter(s => s.status === 'in_progress').length;
    const currentStage = this.getCurrentStage();

    return {
      totalStages,
      completedStages,
      inProgressStages,
      currentStage,
      overallPercent: Math.round((completedStages / totalStages) * 100),
      stages
    };
  }
}

module.exports = { GazetteerPriorityScheduler };
