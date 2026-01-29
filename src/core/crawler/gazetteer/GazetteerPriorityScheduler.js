'use strict';

const { tof, is_array } = require('lang-tools');
const progressQueries = require('../../../data/db/sqlite/v1/queries/gazetteer.progress');
const { getDb } = require('../../../data/db');

const DEFAULT_STAGE_DEFS = Object.freeze([
  { name: 'countries', priority: 1000, crawlDepth: 0, kind: 'country' },
  { name: 'adm1', priority: 100, crawlDepth: 1, kind: 'region' },
  { name: 'adm2', priority: 10, crawlDepth: 2, kind: 'region' },
  { name: 'cities', priority: 1, crawlDepth: 3, kind: 'city' }
]);

const DEFAULT_STAGE_LOOKUP = DEFAULT_STAGE_DEFS.reduce((acc, stage) => {
  acc[stage.name] = stage;
  return acc;
}, {});

function safeParseMetadata(raw) {
  if (!raw) {
    return null;
  }
  if (tof(raw) === 'object') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function buildStageDescriptor(name, index = 0, metadata = null) {
  const meta = safeParseMetadata(metadata);
  const fallback = DEFAULT_STAGE_LOOKUP[name] || {};
  const priority = Number.isFinite(meta?.priority)
    ? meta.priority
    : (Number.isFinite(fallback.priority) ? fallback.priority : Math.max(1, DEFAULT_STAGE_DEFS.length - index));
  const crawlDepth = Number.isFinite(meta?.crawlDepth)
    ? meta.crawlDepth
    : (Number.isFinite(fallback.crawlDepth) ? fallback.crawlDepth : index);
  const kind = typeof meta?.kind === 'string'
    ? meta.kind
    : (fallback.kind || 'place');

  return {
    name,
    priority,
    crawlDepth,
    kind
  };
}

function normalizeStages(inputStages) {
  if (!is_array(inputStages) || inputStages.length === 0) {
    return DEFAULT_STAGE_DEFS.map((stage) => ({ ...stage }));
  }

  const normalized = [];

  for (let index = 0; index < inputStages.length; index += 1) {
    const stage = inputStages[index];
    if (!stage || !stage.name) {
      continue;
    }
    const descriptor = buildStageDescriptor(stage.name, index, stage);
    normalized.push(descriptor);
  }

  return normalized.length ? normalized : DEFAULT_STAGE_DEFS.map((stage) => ({ ...stage }));
}

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
  constructor({ db, logger = console, stages = null } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    if (!this.db) {
      throw new Error('GazetteerPriorityScheduler requires a database handle');
    }
    this.logger = logger;

    // Stage definitions
    this.stages = normalizeStages(stages);
    this._lastStageSignature = JSON.stringify(this.stages);
    this._syncWarningLogged = false;

    this._ensureStateTable();
    this._syncStagesFromDb();
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
    this._syncStagesFromDb();
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
    this._syncStagesFromDb();
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
        progressPercent: this._calculateProgress(state),
        metadata: state?.metadata ? safeParseMetadata(state.metadata) : {
          priority: stage.priority,
          crawlDepth: stage.crawlDepth,
          kind: stage.kind
        }
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
      const stageDef = this.stages.find((entry) => entry.name === stageName) || null;
      const metadata = stageDef
        ? {
            priority: stageDef.priority,
            crawlDepth: stageDef.crawlDepth,
            kind: stageDef.kind
          }
        : null;
      progressQueries.initStage(this.db, stageName, recordsTotal, metadata);
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
    this._syncStagesFromDb();
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

  replaceStages(nextStages = []) {
    this.stages = normalizeStages(nextStages);
    this._lastStageSignature = JSON.stringify(this.stages);
  }

  _syncStagesFromDb() {
    if (!this.db) {
      return;
    }
    try {
      const rows = progressQueries.getAllStageStates(this.db);
      if (!rows || rows.length === 0) {
        return;
      }
      const seen = new Set();
      const descriptors = [];
      for (const row of rows) {
        if (!row || !row.stage || seen.has(row.stage)) {
          continue;
        }
        const descriptor = buildStageDescriptor(row.stage, descriptors.length, row.metadata);
        descriptors.push(descriptor);
        seen.add(row.stage);
      }
      if (!descriptors.length) {
        return;
      }
      const additional = this.stages.filter((stage) => !seen.has(stage.name));
      const merged = normalizeStages([...descriptors, ...additional]);
      const signature = JSON.stringify(merged);
      if (signature !== this._lastStageSignature) {
        this.stages = merged;
        this._lastStageSignature = signature;
      }
    } catch (err) {
      if (!this._syncWarningLogged) {
        this._syncWarningLogged = true;
        this.logger.warn('[GazetteerPriorityScheduler] Failed to sync stages from database:', err.message);
      }
    }
  }
}

module.exports = {
  GazetteerPriorityScheduler,
  DEFAULT_STAGE_DEFS
};
