'use strict';

/**
 * PipelineOrchestrator - Unified multi-stage pipeline for crawl→analysis→disambiguation
 * 
 * Coordinates sequential execution of pipeline stages with:
 * - Progress event streaming for UI integration
 * - Graceful stop support at stage boundaries
 * - Error handling with configurable continue-on-error
 * 
 * @example
 * const { PipelineOrchestrator, STAGES } = require('./PipelineOrchestrator');
 * const pipeline = new PipelineOrchestrator({
 *   crawlUrl: 'https://bbc.com',
 *   maxPages: 100,
 *   analyze: true
 * });
 * 
 * pipeline.on('progress', (p) => console.log(p));
 * const result = await pipeline.run();
 * 
 * @module pipelines/PipelineOrchestrator
 */

const EventEmitter = require('events');
const path = require('path');

// Default stage configuration
const STAGES = ['init', 'crawl', 'analyze', 'disambiguate', 'report', 'complete'];

// Stage state constants
const STAGE_STATE = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * Pipeline configuration defaults
 */
const DEFAULT_CONFIG = {
  // Crawl settings
  crawlOperation: 'siteExplorer',
  maxPages: 100,
  maxDepth: 3,
  daemonPort: 3099,
  
  // Analysis settings
  analysisVersion: null, // null = auto-detect next version
  analysisLimit: null,   // null = analyze all new content
  
  // Disambiguation settings
  disambiguate: false,
  disambiguationBatchSize: 100,
  minConfidence: 0.7,
  
  // Pipeline behavior
  skipStages: [],
  stopOnError: true,
  continueOnError: false,
  
  // Daemon management
  manageDaemon: true, // Start/stop daemon automatically
  
  // Timeouts (ms)
  daemonStartTimeout: 10000,
  jobPollInterval: 2000
};

/**
 * Orchestrates multi-stage pipeline execution
 * @extends EventEmitter
 */
class PipelineOrchestrator extends EventEmitter {
  /**
   * @param {Object} options - Pipeline configuration
   * @param {string} options.crawlUrl - Starting URL for crawl
   * @param {string} [options.crawlOperation='siteExplorer'] - Crawl operation name
   * @param {number} [options.maxPages=100] - Maximum pages to crawl
   * @param {boolean} [options.analyze=true] - Run analysis after crawl
   * @param {boolean} [options.disambiguate=false] - Run disambiguation after analysis
   * @param {string[]} [options.skipStages=[]] - Stages to skip
   * @param {boolean} [options.stopOnError=true] - Stop pipeline on stage error
   */
  constructor(options = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.stages = STAGES.filter(s => !this.config.skipStages.includes(s));
    
    this.currentStage = null;
    this.currentStageIndex = -1;
    this.stageResults = {};
    this.stageStates = {};
    
    this.isRunning = false;
    this.stopRequested = false;
    this.startTime = null;
    
    // Initialize stage states
    for (const stage of STAGES) {
      this.stageStates[stage] = this.config.skipStages.includes(stage) 
        ? STAGE_STATE.SKIPPED 
        : STAGE_STATE.PENDING;
    }
    
    // Internal state
    this._daemon = null;
    this._currentJob = null;
  }
  
  /**
   * Run the complete pipeline
   * @returns {Promise<Object>} Pipeline results by stage
   */
  async run() {
    if (this.isRunning) {
      throw new Error('Pipeline is already running');
    }
    
    this.isRunning = true;
    this.stopRequested = false;
    this.startTime = Date.now();
    
    this.emit('pipeline:start', {
      stages: this.stages,
      config: this._sanitizeConfig()
    });
    
    try {
      // Stage: Init
      await this._runStage('init', () => this._initStage());
      
      // Stage: Crawl
      if (this._shouldRunStage('crawl')) {
        await this._runStage('crawl', () => this._crawlStage());
      }
      
      // Stage: Analyze
      if (this._shouldRunStage('analyze') && this.config.analyze !== false) {
        await this._runStage('analyze', () => this._analyzeStage());
      }
      
      // Stage: Disambiguate
      if (this._shouldRunStage('disambiguate') && this.config.disambiguate) {
        await this._runStage('disambiguate', () => this._disambiguateStage());
      }
      
      // Stage: Report
      if (this._shouldRunStage('report')) {
        await this._runStage('report', () => this._reportStage());
      }
      
      // Stage: Complete
      await this._runStage('complete', () => this._completeStage());
      
      const totalDuration = Date.now() - this.startTime;
      
      this.emit('pipeline:complete', {
        success: true,
        totalDuration,
        stages: this.stageResults
      });
      
      return this.stageResults;
      
    } catch (error) {
      this.emit('pipeline:error', {
        stage: this.currentStage,
        error: error.message,
        stack: error.stack
      });
      
      if (this.config.stopOnError) {
        throw error;
      }
      
      return this.stageResults;
      
    } finally {
      this.isRunning = false;
      await this._cleanup();
    }
  }
  
  /**
   * Request graceful stop at next stage boundary
   */
  stop() {
    this.stopRequested = true;
    this.emit('pipeline:stop-requested', { stage: this.currentStage });
    
    // Stop current job if crawling
    if (this._currentJob) {
      this._stopCurrentJob().catch(console.error);
    }
  }
  
  /**
   * Get current pipeline progress
   * @returns {Object} Progress information
   */
  getProgress() {
    return {
      isRunning: this.isRunning,
      currentStage: this.currentStage,
      stageIndex: this.currentStageIndex,
      totalStages: this.stages.length,
      stageStates: { ...this.stageStates },
      stageResults: { ...this.stageResults },
      elapsed: this.startTime ? Date.now() - this.startTime : 0
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Stage Implementations
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Init stage: Ensure daemon is running
   */
  async _initStage() {
    const { isDaemonRunning, startDaemonDetached } = require('../../cli/crawl/daemon');
    
    const running = await isDaemonRunning();
    
    if (!running && this.config.manageDaemon) {
      await startDaemonDetached();
      await this._waitForDaemon();
    } else if (!running) {
      throw new Error('Daemon not running and manageDaemon=false. Start daemon manually.');
    }
    
    return { daemonReady: true, port: this.config.daemonPort };
  }
  
  /**
   * Crawl stage: Start and monitor crawl job
   */
  async _crawlStage() {
    if (!this.config.crawlUrl) {
      throw new Error('crawlUrl is required for crawl stage');
    }
    
    // Start crawl job via API
    const jobResponse = await this._startCrawlJob();
    this._currentJob = jobResponse;
    
    this.emit('progress', {
      stage: 'crawl',
      jobId: jobResponse.jobId,
      status: 'started'
    });
    
    // Poll until completion
    let lastProgress = null;
    while (!this.stopRequested) {
      const status = await this._getJobStatus(jobResponse.jobId);
      
      if (status.progress && JSON.stringify(status.progress) !== JSON.stringify(lastProgress)) {
        lastProgress = status.progress;
        this.emit('progress', {
          stage: 'crawl',
          jobId: jobResponse.jobId,
          current: status.progress.pagesVisited || 0,
          total: this.config.maxPages,
          rate: status.progress.rate || 0,
          eta: status.progress.eta || null,
          status: status.status
        });
      }
      
      if (status.status === 'completed' || status.status === 'stopped' || status.status === 'failed') {
        this._currentJob = null;
        return {
          jobId: jobResponse.jobId,
          status: status.status,
          pagesDownloaded: status.progress?.pagesVisited || 0,
          duration: status.duration || 0
        };
      }
      
      await this._sleep(this.config.jobPollInterval);
    }
    
    // Stop requested
    await this._stopCurrentJob();
    return { stopped: true, jobId: jobResponse.jobId };
  }
  
  /**
   * Analysis stage: Run content analysis
   */
  async _analyzeStage() {
    // Dynamic import of analysis observable
    const analysisObservablePath = path.resolve(__dirname, '../../labs/analysis-observable/analysis-observable.js');
    const { AnalysisObservable } = require(analysisObservablePath);
    
    const observable = new AnalysisObservable({
      analysisVersion: this.config.analysisVersion,
      limit: this.config.analysisLimit || this.stageResults.crawl?.pagesDownloaded
    });
    
    return new Promise((resolve, reject) => {
      let lastUpdate = Date.now();
      
      const unsubscribe = observable.subscribe({
        next: (data) => {
          if (this.stopRequested) {
            observable.stop();
            resolve({ stopped: true, processed: data.current || 0 });
            return;
          }
          
          // Throttle progress updates to every 250ms
          if (Date.now() - lastUpdate > 250) {
            lastUpdate = Date.now();
            this.emit('progress', {
              stage: 'analyze',
              current: data.current || 0,
              total: data.total || 0,
              rate: data.rate || 0,
              eta: data.eta || null,
              method: data.method || null
            });
          }
        },
        complete: (result) => {
          resolve({
            analyzed: result.processed || 0,
            errors: result.errors || 0,
            duration: result.duration || 0
          });
        },
        error: (err) => {
          reject(err);
        }
      });
      
      observable.start().catch(reject);
    });
  }
  
  /**
   * Disambiguation stage: Resolve place mentions
   */
  async _disambiguateStage() {
    // Placeholder - disambiguation engine integration
    // Will be implemented when DisambiguationEngine is ready
    this.emit('progress', {
      stage: 'disambiguate',
      status: 'not-implemented',
      message: 'Disambiguation stage requires DisambiguationEngine (see Chapter 10)'
    });
    
    return {
      implemented: false,
      message: 'Disambiguation engine not yet integrated. See Chapter 10 for implementation plan.'
    };
  }
  
  /**
   * Report stage: Generate summary
   */
  async _reportStage() {
    const totalDuration = Date.now() - this.startTime;
    
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration,
      stages: {}
    };
    
    for (const stage of STAGES) {
      if (this.stageResults[stage]) {
        report.stages[stage] = {
          state: this.stageStates[stage],
          ...this.stageResults[stage]
        };
      }
    }
    
    return report;
  }
  
  /**
   * Complete stage: Cleanup and final state
   */
  async _completeStage() {
    const shouldStopDaemon = this.config.manageDaemon && this.config.stopDaemonOnComplete;
    
    if (shouldStopDaemon) {
      const { stopDaemon } = require('../../cli/crawl/daemon');
      await stopDaemon().catch(() => {}); // Ignore errors
    }
    
    return {
      totalDuration: Date.now() - this.startTime,
      stagesCompleted: Object.values(this.stageStates)
        .filter(s => s === STAGE_STATE.COMPLETED).length,
      stagesSkipped: Object.values(this.stageStates)
        .filter(s => s === STAGE_STATE.SKIPPED).length
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────────
  
  async _runStage(stageName, fn) {
    if (this.stopRequested && stageName !== 'complete') {
      this.stageStates[stageName] = STAGE_STATE.SKIPPED;
      return null;
    }
    
    this.currentStage = stageName;
    this.currentStageIndex = this.stages.indexOf(stageName);
    this.stageStates[stageName] = STAGE_STATE.RUNNING;
    
    const stageStart = Date.now();
    
    this.emit('stage:start', {
      stage: stageName,
      index: this.currentStageIndex,
      total: this.stages.length
    });
    
    try {
      const result = await fn();
      
      this.stageResults[stageName] = {
        ...result,
        durationMs: Date.now() - stageStart
      };
      
      this.stageStates[stageName] = STAGE_STATE.COMPLETED;
      
      this.emit('stage:complete', {
        stage: stageName,
        result: this.stageResults[stageName]
      });
      
      return result;
      
    } catch (error) {
      this.stageStates[stageName] = STAGE_STATE.FAILED;
      
      this.stageResults[stageName] = {
        error: error.message,
        durationMs: Date.now() - stageStart
      };
      
      this.emit('stage:error', {
        stage: stageName,
        error: error.message
      });
      
      if (!this.config.continueOnError) {
        throw error;
      }
      
      return null;
    }
  }
  
  _shouldRunStage(stageName) {
    return this.stages.includes(stageName) && !this.config.skipStages.includes(stageName);
  }
  
  async _waitForDaemon() {
    const start = Date.now();
    const timeout = this.config.daemonStartTimeout;
    
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://localhost:${this.config.daemonPort}/healthz`);
        if (response.ok) return;
      } catch {
        // Daemon not ready yet
      }
      await this._sleep(500);
    }
    
    throw new Error(`Daemon did not become ready within ${timeout}ms`);
  }
  
  async _startCrawlJob() {
    const url = `http://localhost:${this.config.daemonPort}/api/v1/crawl/operations/${this.config.crawlOperation}/start`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrl: this.config.crawlUrl,
        overrides: {
          maxPages: this.config.maxPages,
          maxDepth: this.config.maxDepth
        }
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to start crawl job: ${response.status} ${text}`);
    }
    
    return response.json();
  }
  
  async _getJobStatus(jobId) {
    const response = await fetch(`http://localhost:${this.config.daemonPort}/api/crawls/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status}`);
    }
    return response.json();
  }
  
  async _stopCurrentJob() {
    if (!this._currentJob) return;
    
    try {
      await fetch(`http://localhost:${this.config.daemonPort}/api/crawls/${this._currentJob.jobId}/stop`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Error stopping job:', error.message);
    }
    
    this._currentJob = null;
  }
  
  async _cleanup() {
    // Cleanup any remaining resources
    this._currentJob = null;
  }
  
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  _sanitizeConfig() {
    // Return config without sensitive data
    const { ...safe } = this.config;
    return safe;
  }
}

module.exports = { PipelineOrchestrator, STAGES, STAGE_STATE, DEFAULT_CONFIG };
