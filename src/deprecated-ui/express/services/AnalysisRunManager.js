/**
 * Analysis Run Manager
 * 
 * Monitors analysis runs for stuck/stale states and provides recovery mechanisms.
 * Ensures reliability by detecting and handling:
 * - Runs stuck in 'running' state for too long without progress
 * - Duplicate analysis runs analyzing the same content
 * - Orphaned runs that need cleanup
 */

const { listAnalysisRuns, updateAnalysisRun, getAnalysisRun } = require('./analysisRuns');

// Thresholds for stuck detection
const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes without progress
const STALE_RUNNING_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours in running state
const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

class AnalysisRunManager {
  constructor({ getDbRW, logger = console, autoStart = true } = {}) {
    if (!getDbRW || typeof getDbRW !== 'function') {
      throw new Error('AnalysisRunManager requires getDbRW function');
    }
    
    this.getDbRW = getDbRW;
    this.logger = logger;
    this.monitorTimer = null;
    this.isShuttingDown = false;
    
    if (autoStart) {
      this.startMonitoring();
    }
  }

  /**
   * Start monitoring analysis runs
   */
  startMonitoring() {
    if (this.monitorTimer) {
      this.logger.log('[AnalysisRunManager] Monitoring already started');
      return;
    }
    
    this.logger.log('[AnalysisRunManager] Starting analysis run monitoring');
    
    // Run initial check after short delay
    setTimeout(() => this.checkStuckRuns(), 10000);
    
    // Schedule periodic checks
    this.monitorTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.checkStuckRuns();
      }
    }, MONITOR_INTERVAL_MS);
    
    // Unref to prevent blocking process exit
    if (this.monitorTimer.unref) {
      this.monitorTimer.unref();
    }
  }

  /**
   * Stop monitoring (cleanup on shutdown)
   */
  stopMonitoring() {
    this.isShuttingDown = true;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
      this.logger.log('[AnalysisRunManager] Stopped monitoring');
    }
  }

  /**
   * Check for stuck analysis runs and mark them as failed
   */
  async checkStuckRuns() {
    try {
      const db = this.getDbRW();
      if (!db) {
        this.logger.warn('[AnalysisRunManager] Database not available, skipping stuck run check');
        return { checked: 0, fixed: 0 };
      }

      const now = Date.now();
  const result = listAnalysisRuns(db, { limit: 200, includeDetails: true });
      
      let checkedCount = 0;
      let fixedCount = 0;
      const fixedRuns = [];

      for (const run of result.items) {
        if (run.status !== 'running') continue;
        
        checkedCount++;
        
        const startedAt = Date.parse(run.startedAt);
        if (!Number.isFinite(startedAt)) continue;
        
        const runningSinceMs = now - startedAt;
        const lastProgressTime = this._getLastProgressTime(run, db);
        const timeSinceProgressMs = lastProgressTime ? now - lastProgressTime : runningSinceMs;
        
        let shouldFail = false;
        let reason = '';
        
        // Check for runs stuck without progress
        if (timeSinceProgressMs > STUCK_THRESHOLD_MS) {
          shouldFail = true;
          reason = `No progress for ${Math.round(timeSinceProgressMs / 60000)} minutes`;
        }
        
        // Check for runs that have been running too long overall
        if (runningSinceMs > STALE_RUNNING_THRESHOLD_MS) {
          shouldFail = true;
          reason = `Running for ${Math.round(runningSinceMs / 3600000)} hours without completion`;
        }
        
        // Check for runs stuck at 0% progress
        if (runningSinceMs > STUCK_THRESHOLD_MS && this._isStuckAtZero(run)) {
          shouldFail = true;
          reason = `Stuck at 0% progress for ${Math.round(runningSinceMs / 60000)} minutes`;
        }
        
        if (shouldFail) {
          this._markRunAsFailed(db, run.id, reason);
          fixedCount++;
          fixedRuns.push({ id: run.id, reason, runningSinceHours: Math.round(runningSinceMs / 3600000) });
        }
      }
      
      if (fixedCount > 0) {
        this.logger.log(`[AnalysisRunManager] Fixed ${fixedCount} stuck run(s) out of ${checkedCount} checked`);
        for (const fixed of fixedRuns) {
          this.logger.log(`  - ${fixed.id}: ${fixed.reason} (running ${fixed.runningSinceHours}h)`);
        }
      }
      
      return { checked: checkedCount, fixed: fixedCount, fixedRuns };
    } catch (err) {
      this.logger.error('[AnalysisRunManager] Error checking stuck runs:', err);
      return { checked: 0, fixed: 0, error: err.message };
    }
  }

  /**
   * Get the last progress timestamp for a run
   * @private
   */
  _getLastProgressTime(run, db) {
    try {
      // Check last_progress field
      if (run.lastProgress && typeof run.lastProgress === 'object' && run.lastProgress.ts) {
        const ts = Date.parse(run.lastProgress.ts);
        if (Number.isFinite(ts)) return ts;
      }
      
      // Check most recent event
      const runDetail = getAnalysisRun(db, run.id, { limitEvents: 1 });
      if (runDetail && runDetail.events && runDetail.events.length > 0) {
        const ts = Date.parse(runDetail.events[0].ts);
        if (Number.isFinite(ts)) return ts;
      }
      
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Check if run is stuck at 0% progress
   * @private
   */
  _isStuckAtZero(run) {
    if (!run.lastProgress || typeof run.lastProgress !== 'object') return true;
    
    const progress = run.lastProgress;
    
    // Check various progress indicators
    const analyzed = progress.analyzed || progress.pagesAnalyzed || 0;
    const total = progress.total || progress.totalPages || 0;
    const percentage = progress.percentage || progress.progress || 0;
    
    // Stuck at zero if no pages analyzed and has a total
    if (total > 0 && analyzed === 0) return true;
    
    // Stuck at zero if percentage is 0
    if (percentage === 0) return true;
    
    return false;
  }

  /**
   * Mark a run as failed with a reason
   * @private
   */
  _markRunAsFailed(db, runId, reason) {
    try {
      const endedAt = new Date().toISOString();
      updateAnalysisRun(db, runId, {
        status: 'failed',
        stage: 'failed',
        endedAt,
        error: `Auto-failed by AnalysisRunManager: ${reason}`
      });
      
      this.logger.log(`[AnalysisRunManager] Marked run ${runId} as failed: ${reason}`);
    } catch (err) {
      this.logger.error(`[AnalysisRunManager] Failed to mark run ${runId} as failed:`, err);
    }
  }

  /**
   * Manually trigger stuck run check (useful for testing or manual recovery)
   */
  async manualCheck() {
    this.logger.log('[AnalysisRunManager] Manual stuck run check triggered');
    return await this.checkStuckRuns();
  }

  /**
   * Check if two analysis runs would analyze the same content
   * (Prevents duplicate analysis runs)
   */
  wouldAnalyzeSameContent(run1Config, run2Config) {
    if (!run1Config || !run2Config) return false;
    
    // Compare key configuration parameters
    const keys = ['analysisVersion', 'pageLimit', 'domainLimit', 'skipPages', 'skipDomains'];
    
    for (const key of keys) {
      if (run1Config[key] !== run2Config[key]) return false;
    }
    
    return true;
  }

  /**
   * Find running analyses that might conflict with a new run
   */
  findConflictingRuns(db, newRunConfig) {
    try {
  const result = listAnalysisRuns(db, { limit: 50, includeDetails: true });
      const conflicts = [];
      
      for (const run of result.items) {
        if (run.status !== 'running') continue;
        
        if (this.wouldAnalyzeSameContent(newRunConfig, run)) {
          conflicts.push(run);
        }
      }
      
      return conflicts;
    } catch (err) {
      this.logger.error('[AnalysisRunManager] Error finding conflicting runs:', err);
      return [];
    }
  }
}

module.exports = { AnalysisRunManager };
