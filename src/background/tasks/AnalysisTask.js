/**
 * Analysis Run Background Task
 * 
 * Executes page and domain analysis as a long-running background task.
 * Tracks progress, handles errors, supports pause/resume, and integrates with milestone tracking.
 * 
 * This task wraps the core analysis logic from analysis-run.js to work within the
 * BackgroundTaskManager framework, while keeping the analysis modules usable throughout
 * the system for targeted, lightweight analysis operations.
 */

const { analysePages } = require('../../tools/analyse-pages-core');
const { awardMilestones } = require('../../tools/milestones');
const { countArticlesNeedingAnalysis } = require('../../db/queries/analysisQueries');
const { tof } = require('lang-tools');

/**
 * Analysis background task
 * 
 * Orchestrates page analysis and milestone tracking as a background task.
 * Provides progress tracking, error handling, and pause/resume capabilities.
 */
class AnalysisTask {
  /**
   * @param {Object} options - Task options
   * @param {Database} options.db - better-sqlite3 database instance
   * @param {number} options.taskId - Task ID
   * @param {Object} options.config - Task configuration
   * @param {number} [options.config.analysisVersion=1] - Analysis version to use
   * @param {number} [options.config.pageLimit] - Maximum pages to analyze
   * @param {number} [options.config.domainLimit] - Maximum domains to analyze
   * @param {boolean} [options.config.skipPages=false] - Skip page analysis
   * @param {boolean} [options.config.skipDomains=false] - Skip domain analysis
   * @param {boolean} [options.config.skipMilestones=false] - Skip milestone awarding
   * @param {boolean} [options.config.verbose=false] - Enable verbose logging
   * @param {string} [options.config.dbPath] - Database path (default: uses db instance)
   * @param {AbortSignal} options.signal - Abort signal for cancellation
   * @param {Function} options.onProgress - Progress callback
   * @param {Function} options.onError - Error callback
   */
  constructor(options) {
    this.db = options.db;
    this.taskId = options.taskId;
    this.config = options.config || {};
    this.signal = options.signal;
    this.onProgress = options.onProgress;
    this.onError = options.onError;
    
    this.paused = false;
    this.currentStage = 'starting';
    
    // Configuration with defaults
    this.analysisVersion = this.config.analysisVersion ?? 1;
    this.pageLimit = this.config.pageLimit;
    this.domainLimit = this.config.domainLimit;
    this.skipPages = this.config.skipPages ?? false;
    this.skipDomains = this.config.skipDomains ?? false;
    this.skipMilestones = this.config.skipMilestones ?? false;
    this.verbose = this.config.verbose ?? false;
    this.dbPath = this.config.dbPath;
    
    // Progress tracking
    this.stats = {
      pagesProcessed: 0,
      pagesUpdated: 0,
      placesExtracted: 0,
      domainsAnalyzed: 0,
      milestonesAwarded: 0,
      errors: 0
    };
  }
  
  /**
   * Execute the analysis task
   * 
   * Orchestrates page analysis → domain analysis → milestone awarding
   */
  async execute() {
    try {
      this.currentStage = 'starting';
      this._reportProgress('Starting analysis run');
      
      // Count total work upfront for progress tracking
      let totalToAnalyze = 0;
      if (!this.skipPages) {
        try {
          const result = countArticlesNeedingAnalysis(this.db, {
            analysisVersion: this.analysisVersion,
            limit: this.pageLimit
          });
          totalToAnalyze = result.needingAnalysis;
          
          if (this.verbose) {
            console.log(`[AnalysisTask] Found ${totalToAnalyze} articles needing analysis`);
          }
        } catch (error) {
          console.warn(`[AnalysisTask] Could not count articles:`, error.message);
        }
      }
      
      // Stage 1: Page Analysis
      if (!this.skipPages) {
        await this._runPageAnalysis(totalToAnalyze);
      } else {
        this._reportProgress('Page analysis skipped', { skipped: 'pages' });
      }
      
      // Check for cancellation
      if (this.signal.aborted || this.paused) {
        return;
      }
      
      // Stage 2: Domain Analysis
      if (!this.skipDomains) {
        await this._runDomainAnalysis();
      } else {
        this._reportProgress('Domain analysis skipped', { skipped: 'domains' });
      }
      
      // Check for cancellation
      if (this.signal.aborted || this.paused) {
        return;
      }
      
      // Stage 3: Milestone Awarding
      if (!this.skipMilestones) {
        await this._runMilestoneAwarding();
      } else {
        this._reportProgress('Milestone awarding skipped', { skipped: 'milestones' });
      }
      
      // Final summary
      this.currentStage = 'completed';
      this._reportProgress('Analysis run completed', {
        final: true,
        stats: this.stats,
        total: Math.max(this.stats.pagesProcessed, 1),
        current: Math.max(this.stats.pagesProcessed, 1)
      });
      
    } catch (error) {
      this.stats.errors++;
      
      if (tof(this.onError) === 'function') {
        this.onError(error);
      }
      
      throw error;
    }
  }
  
  /**
   * Run page analysis stage
   * @private
   */
  async _runPageAnalysis(totalToAnalyze) {
    this.currentStage = 'page-analysis';
    this._reportProgress(`Analyzing ${totalToAnalyze} pages`, {
      stage: 'page-analysis',
      total: totalToAnalyze
    });
    
    try {
      const result = await analysePages({
        dbPath: this.dbPath,
        analysisVersion: this.analysisVersion,
        limit: this.pageLimit,
        verbose: this.verbose,
        onProgress: (progress) => {
          // Update stats from page analysis progress
          if (progress.processed != null) {
            this.stats.pagesProcessed = progress.processed;
          }
          if (progress.updated != null) {
            this.stats.pagesUpdated = progress.updated;
          }
          if (progress.placesInserted != null) {
            this.stats.placesExtracted = progress.placesInserted;
          }
          
          // Report to background task manager
          this._reportProgress(
            `Pages: ${this.stats.pagesProcessed}/${totalToAnalyze}`,
            {
              stage: 'page-analysis',
              current: this.stats.pagesProcessed,
              total: totalToAnalyze
            }
          );
          
          // Check for pause/cancellation during long-running operation
          if (this.paused || this.signal.aborted) {
            // Note: analysePages doesn't support cancellation mid-batch
            // This check allows us to skip subsequent batches
            throw new Error('Analysis paused or cancelled');
          }
        },
        logger: this.verbose ? console : { 
          log: () => {}, 
          warn: console.warn, 
          error: console.error 
        }
      });
      
      // Update stats from final result
      this.stats.pagesProcessed = result.processed ?? result.analysed ?? 0;
      this.stats.pagesUpdated = result.updated ?? 0;
      this.stats.placesExtracted = result.placesInserted ?? 0;
      
      this._reportProgress(`Page analysis complete: ${this.stats.pagesProcessed} pages`, {
        stage: 'page-analysis',
        completed: true,
        result
      });
      
    } catch (error) {
      if (error.message === 'Analysis paused or cancelled') {
        // Expected cancellation, not an error
        this._reportProgress('Page analysis paused', { stage: 'page-analysis', paused: true });
      } else {
        this.stats.errors++;
        console.error('[AnalysisTask] Page analysis failed:', error);
        throw error;
      }
    }
  }
  
  /**
   * Run domain analysis stage
   * @private
   */
  async _runDomainAnalysis() {
    this.currentStage = 'domain-analysis';
    this._reportProgress('Starting domain analysis', { stage: 'domain-analysis' });
    
    try {
      // TODO: Implement domain analysis when domain analyzer is available
      // For now, this is a placeholder that acknowledges the stage
      
      // Domain analysis would:
      // 1. Aggregate article analysis to domain level
      // 2. Calculate domain metrics (quality, coverage, etc.)
      // 3. Update domain records with analysis results
      
      this.stats.domainsAnalyzed = 0; // Placeholder
      
      this._reportProgress('Domain analysis complete', {
        stage: 'domain-analysis',
        completed: true
      });
      
    } catch (error) {
      this.stats.errors++;
      console.error('[AnalysisTask] Domain analysis failed:', error);
      throw error;
    }
  }
  
  /**
   * Run milestone awarding stage
   * @private
   */
  async _runMilestoneAwarding() {
    this.currentStage = 'milestones';
    this._reportProgress('Awarding milestones', { stage: 'milestones' });
    
    try {
      const awarded = await awardMilestones({
        db: this.db,
        dryRun: false,
        verbose: this.verbose
      });
      
      this.stats.milestonesAwarded = Array.isArray(awarded) ? awarded.length : 0;
      
      this._reportProgress(`Milestones awarded: ${this.stats.milestonesAwarded}`, {
        stage: 'milestones',
        completed: true,
        awarded
      });
      
    } catch (error) {
      this.stats.errors++;
      console.error('[AnalysisTask] Milestone awarding failed:', error);
      throw error;
    }
  }
  
  /**
   * Report progress to background task manager
   * @private
   */
  _reportProgress(message, metadata = {}) {
    if (tof(this.onProgress) !== 'function') return;
    
    const progressData = {
      current: metadata.current ?? this.stats.pagesProcessed,
      total: metadata.total ?? 0,
      message,
      metadata: {
        stage: this.currentStage,
        stats: this.stats,
        ...metadata
      }
    };
    
    try {
      this.onProgress(progressData);
    } catch (error) {
      // Don't let progress reporting errors crash the analysis
      console.error('[AnalysisTask] Progress reporting error:', error);
    }
  }
  
  /**
   * Pause the task
   */
  pause() {
    this.paused = true;
  }
  
  /**
   * Resume the task
   */
  resume() {
    this.paused = false;
  }
}

module.exports = { AnalysisTask };
