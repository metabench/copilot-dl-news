'use strict';

const { EventEmitter } = require('events');
const { resolveMultiModalQueries } = require('./multiModalQueries');

// Lazy-load heavy dependencies to avoid circular requires
let analysisObservableModule = null;
let CountryHubGapAnalyzer = null;
let RegionHubGapAnalyzer = null;

function getAnalysisObservable() {
  if (!analysisObservableModule) {
    try {
      analysisObservableModule = require('../../../labs/analysis-observable/analysis-observable');
    } catch (e) {
      // Fallback: module not available
      analysisObservableModule = { createAnalysisObservable: null };
    }
  }
  return analysisObservableModule;
}

function getHubGapAnalyzers() {
  if (!CountryHubGapAnalyzer) {
    try {
      CountryHubGapAnalyzer = require('../../services/CountryHubGapAnalyzer').CountryHubGapAnalyzer;
    } catch (e) {
      CountryHubGapAnalyzer = null;
    }
  }
  if (!RegionHubGapAnalyzer) {
    try {
      RegionHubGapAnalyzer = require('../../services/RegionHubGapAnalyzer').RegionHubGapAnalyzer;
    } catch (e) {
      RegionHubGapAnalyzer = null;
    }
  }
  return { CountryHubGapAnalyzer, RegionHubGapAnalyzer };
}

/**
 * Multi-Modal Intelligent Crawl Orchestrator
 *
 * Coordinates a continuous crawl cycle:
 * 1. DOWNLOAD - Fetch a batch of pages (default 1000)
 * 2. ANALYZE - Run content analysis on new pages
 * 3. LEARN - Extract patterns, update playbooks
 * 4. DISCOVER - Find new hub structures
 * 5. RE-ANALYZE - Reprocess pages when patterns improve
 *
 * Then repeat, balancing historical backfill with newest articles.
 *
 * @fires MultiModalCrawlOrchestrator#phase-change
 * @fires MultiModalCrawlOrchestrator#batch-complete
 * @fires MultiModalCrawlOrchestrator#pattern-learned
 * @fires MultiModalCrawlOrchestrator#hub-discovered
 * @fires MultiModalCrawlOrchestrator#reanalysis-triggered
 * @fires MultiModalCrawlOrchestrator#progress
 */
class MultiModalCrawlOrchestrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database connection
   * @param {Object} options.crawlOperations - CrawlOperations facade
   * @param {Object} [options.playbook] - CrawlPlaybookService instance
   * @param {Object} [options.patternTracker] - PatternDeltaTracker instance
   * @param {Object} [options.balancer] - CrawlBalancer instance
   * @param {Object} [options.hubGapAnalyzer] - Hub gap analyzer instance
   * @param {Object} [options.queries] - Multi-modal crawl query helpers
   * @param {Object} [options.config] - Configuration overrides
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({
    db,
    crawlOperations,
    playbook = null,
    patternTracker = null,
    balancer = null,
    hubGapAnalyzer = null,
    queries = null,
    config = {},
    logger = console
  } = {}) {
    super();
    this.db = db;
    this.crawlOperations = crawlOperations;
    this.playbook = playbook;
    this.patternTracker = patternTracker;
    this.balancer = balancer;
    this.hubGapAnalyzer = hubGapAnalyzer;
    this.multiModalQueries = queries || resolveMultiModalQueries(db);
    this.logger = logger;

    // Analysis observable instance (created per analysis run)
    this.currentAnalysisObs = null;

    // Configuration with defaults
    this.config = {
      batchSize: 1000,
      analysisBatchSize: null,
      maxBatchDurationMs: 30 * 60 * 1000, // 30 minutes
      historicalRatio: 0.3, // 30% historical, 70% newest
      hubRefreshIntervalMs: 60 * 60 * 1000, // 1 hour
      hubDiscoveryPriorityBatches: 2,
      hubDiscoverySequence: 'intelligentCountryHubDiscovery',
      hubDiscoveryMaxDownloads: 250,
      hubDiscoverySharedOverrides: null,
      hubDiscoveryStepOverrides: null,
      hubGuessingEnabled: true,
      hubGuessingApply: true,
      hubGuessingKinds: ['country', 'region'],
      hubGuessingLimit: 50,
      hubGuessingMode: 'standard',
      hubGuessingLang: 'en',
      hubGuessingParentPlace: null,
      crawlOverrides: {
        outputVerbosity: 'extra-terse',
        loggingQueue: false,
        loggingNetwork: false,
        loggingFetching: false
      },
      minNewSignatures: 3,
      reanalysisThreshold: 0.8,
      analysisVersion: 1,
      maxTotalBatches: null, // null = indefinite
      maxTotalPages: null,
      stopOnExhaustion: false,
      hubDiscoveryPerBatch: true,
      learnLayoutMasks: true,
      pauseBetweenBatchesMs: 5000, // 5 second pause between batches
      ...config
    };

    // State
    this.phase = 'idle'; // idle, downloading, analyzing, learning, discovering, reanalyzing
    this.isRunning = false;
    this.isPaused = false;
    this.batchNumber = 0;
    this.totalPagesDownloaded = 0;
    this.totalPagesAnalyzed = 0;
    this.totalPatternsLearned = 0;
    this.totalHubsDiscovered = 0;
    this.totalReanalyzed = 0;
    this.startTime = null;
    this.lastHubRefresh = null;
    this.currentDomain = null;

    // Session tracking
    this.sessionId = null;
    this.batchHistory = [];
    this.learningInsights = [];
  }

  /**
   * Start the multi-modal crawl
   * @param {string} domain - Domain to crawl
   * @param {Object} [options] - Override options
   * @returns {Promise<Object>} Final statistics
   */
  async start(domain, options = {}) {
    if (this.isRunning) {
      throw new Error('Multi-modal crawl already running');
    }

    this.currentDomain = domain;
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.sessionId = `mm-${domain}-${Date.now()}`;
    this.batchNumber = options.resumeFromBatch || 0;

    // Apply option overrides
    Object.assign(this.config, options);

    this.logger.log(`[MultiModal] Starting multi-modal crawl for ${domain}`);
    this.logger.log(`[MultiModal] Session ID: ${this.sessionId}`);
    this.logger.log(`[MultiModal] Config:`, this.config);

    this._setPhase('starting');

    try {
      // Main orchestration loop
      while (this.isRunning && !this._shouldStop()) {
        if (this.isPaused) {
          await this._waitForResume();
          continue;
        }

        // Phase 1: Download batch
        const downloadResult = await this._runDownloadPhase();
        if (!downloadResult.success) {
          if (downloadResult.exhausted && this.config.stopOnExhaustion) {
            this.logger.log('[MultiModal] Queue exhausted, stopping');
            break;
          }
        }

        // Phase 2: Analyze content
        const analysisResult = await this._runAnalysisPhase();

        // Phase 3: Learn patterns
        const learningResult = await this._runLearningPhase(analysisResult);

        // Phase 4: Hub discovery (if enabled and interval passed)
        if (this._shouldRunHubDiscovery()) {
          await this._runHubDiscoveryPhase();
        }

        // Phase 5: Re-analyze if patterns improved significantly
        if (learningResult.significantPatterns.length > 0) {
          await this._runReanalysisPhase(learningResult);
        }

        // Record batch completion
        this._recordBatchComplete();

        // Brief pause between batches
        if (this.isRunning) {
          this._setPhase('pausing');
          await this._sleep(this.config.pauseBetweenBatchesMs);
        }
      }
    } catch (error) {
      this.logger.error('[MultiModal] Orchestration error:', error);
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
      this._setPhase('idle');
    }

    return this.getStatistics();
  }

  /**
   * Stop the crawl gracefully
   */
  stop() {
    this.logger.log('[MultiModal] Stop requested');
    this.isRunning = false;
    this.emit('stop-requested');
  }

  /**
   * Pause the crawl (can resume later)
   */
  pause() {
    this.logger.log('[MultiModal] Pause requested');
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * Resume a paused crawl
   */
  resume() {
    this.logger.log('[MultiModal] Resume requested');
    this.isPaused = false;
    this.emit('resumed');
  }

  /**
   * Get current statistics
   * @returns {Object}
   */
  getStatistics() {
    const now = Date.now();
    const runtimeMs = this.startTime ? now - this.startTime : 0;

    return {
      sessionId: this.sessionId,
      domain: this.currentDomain,
      phase: this.phase,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      batchNumber: this.batchNumber,
      totalPagesDownloaded: this.totalPagesDownloaded,
      totalPagesAnalyzed: this.totalPagesAnalyzed,
      totalPatternsLearned: this.totalPatternsLearned,
      totalHubsDiscovered: this.totalHubsDiscovered,
      totalReanalyzed: this.totalReanalyzed,
      runtimeMs,
      runtimeFormatted: this._formatDuration(runtimeMs),
      pagesPerMinute: runtimeMs > 0 ? (this.totalPagesDownloaded / (runtimeMs / 60000)).toFixed(1) : 0,
      config: this.config,
      batchHistory: this.batchHistory.slice(-10), // Last 10 batches
      learningInsights: this.learningInsights.slice(-20) // Last 20 insights
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Private: Phase implementations
  // ─────────────────────────────────────────────────────────────

  async _runDownloadPhase() {
    this._setPhase('downloading');
    this.batchNumber++;

    const batchStart = Date.now();
    const result = {
      success: false,
      pagesDownloaded: 0,
      articlesFound: 0,
      hubsFound: 0,
      exhausted: false
    };

    try {
      // Determine balance for this batch
      const balance = this.balancer
        ? this.balancer.getBalance(this.batchNumber)
        : { historical: this.config.historicalRatio, newest: 1 - this.config.historicalRatio };

      this.emit('progress', {
        phase: 'downloading',
        batch: this.batchNumber,
        balance,
        target: this.config.batchSize
      });

      // Run crawl operation for this batch
      // Use a custom crawl with batch limits
      const crawlOverrides = {
        ...(this.config.crawlOverrides || {}),
        maxPages: this.config.batchSize,
        maxDurationMs: this.config.maxBatchDurationMs,
        historicalRatio: balance.historical,
        jobId: `${this.sessionId}-batch-${this.batchNumber}`,
        crawlType: 'multi-modal-batch'
      };

      const crawlResult = await this.crawlOperations.runCustom(
        `https://${this.currentDomain}`,
        crawlOverrides
      );

      result.pagesDownloaded = crawlResult.stats?.pagesDownloaded || 0;
      result.articlesFound = crawlResult.stats?.articlesSaved || 0;
      result.hubsFound = crawlResult.stats?.hubsDiscovered || 0;
      result.exhausted = crawlResult.queueExhausted || false;
      result.success = result.pagesDownloaded > 0;

      this.totalPagesDownloaded += result.pagesDownloaded;

      this.emit('batch-download-complete', {
        batch: this.batchNumber,
        ...result,
        durationMs: Date.now() - batchStart
      });

    } catch (error) {
      this.logger.error('[MultiModal] Download phase error:', error);
      result.error = error.message;
    }

    return result;
  }

  async _runAnalysisPhase() {
    this._setPhase('analyzing');

    const result = {
      pagesAnalyzed: 0,
      newSignatures: [],
      signatureDistribution: {}
    };

    try {
      // Get pages needing analysis from this batch
      const pendingAnalysis = this._getPendingAnalysisCount();

      this.emit('progress', {
        phase: 'analyzing',
        batch: this.batchNumber,
        pendingCount: pendingAnalysis
      });

      // Run analysis
      // Note: This integrates with the analysis-observable pattern
      const analysisResult = await this._runAnalysis({
        limit: pendingAnalysis,
        computeSkeletonHash: true
      });

      result.pagesAnalyzed = analysisResult.processed || 0;
      result.newSignatures = analysisResult.newSignatures || [];
      result.signatureDistribution = analysisResult.signatureDistribution || {};

      this.totalPagesAnalyzed += result.pagesAnalyzed;

      this.emit('analysis-complete', {
        batch: this.batchNumber,
        ...result
      });

    } catch (error) {
      this.logger.error('[MultiModal] Analysis phase error:', error);
      result.error = error.message;
    }

    return result;
  }

  async _runLearningPhase(analysisResult) {
    this._setPhase('learning');

    const result = {
      patternsLearned: 0,
      significantPatterns: [],
      playbookUpdates: []
    };

    try {
      // Check for new layout signatures
      const newSignatures = analysisResult.newSignatures || [];

      if (newSignatures.length >= this.config.minNewSignatures) {
        // Learn from new signatures
        for (const sig of newSignatures) {
          if (sig.seenCount >= 3) {
            result.significantPatterns.push(sig);
            result.patternsLearned++;

            this._addLearningInsight({
              type: 'layout-signature',
              description: `New layout pattern: ${sig.hash.substring(0, 8)}...`,
              examples: sig.exampleUrls?.slice(0, 3) || [],
              confidence: sig.seenCount / 10 // Simple confidence metric
            });
          }
        }
      }

      // Update playbook with discoveries
      if (this.playbook && result.significantPatterns.length > 0) {
        for (const pattern of result.significantPatterns) {
          await this.playbook.learnFromDiscovery({
            domain: this.currentDomain,
            discoveryMethod: 'multi-modal-batch',
            hubType: 'layout-pattern',
            metadata: {
              signatureHash: pattern.hash,
              seenCount: pattern.seenCount,
              batchNumber: this.batchNumber
            }
          });
          result.playbookUpdates.push(pattern.hash);
        }
      }

      // Track pattern deltas
      if (this.patternTracker) {
        this.patternTracker.recordPatterns(this.batchNumber, result.significantPatterns);
      }

      this.totalPatternsLearned += result.patternsLearned;

      if (result.patternsLearned > 0) {
        this.emit('pattern-learned', {
          batch: this.batchNumber,
          ...result
        });
      }

    } catch (error) {
      this.logger.error('[MultiModal] Learning phase error:', error);
      result.error = error.message;
    }

    return result;
  }

  async _runHubDiscoveryPhase() {
    this._setPhase('discovering');

    const result = {
      hubsDiscovered: 0,
      newHubs: [],
      guessSummary: null,
      sequenceSummary: null
    };

    try {
      this.emit('progress', {
        phase: 'discovering',
        batch: this.batchNumber
      });

      const sequenceResult = await this._runHubDiscoverySequence();
      if (sequenceResult) {
        const steps = Array.isArray(sequenceResult.steps) ? sequenceResult.steps : [];
        const hubsFromSequence = steps.reduce((sum, step) => {
          const count = step?.stats?.hubsDiscovered;
          return sum + (Number.isFinite(count) ? count : 0);
        }, 0);

        result.sequenceSummary = {
          status: sequenceResult.status || null,
          elapsedMs: sequenceResult.elapsedMs || null,
          hubsDiscovered: hubsFromSequence,
          steps: steps.map((step) => ({
            operation: step.operation,
            status: step.status,
            elapsedMs: step.elapsedMs,
            hubsDiscovered: step?.stats?.hubsDiscovered ?? 0,
            pagesDownloaded: step?.stats?.pagesDownloaded ?? 0
          }))
        };
      }

      const guessResult = await this._runHubGuessing();
      if (guessResult && guessResult.result) {
        result.guessSummary = {
          insertedHubs: guessResult.result.insertedHubs ?? 0,
          updatedHubs: guessResult.result.updatedHubs ?? 0,
          fetched: guessResult.result.fetched ?? 0,
          cached: guessResult.result.cached ?? 0,
          status: guessResult.status || null
        };
      } else if (guessResult && guessResult.status) {
        result.guessSummary = {
          insertedHubs: 0,
          updatedHubs: 0,
          fetched: 0,
          cached: 0,
          status: guessResult.status
        };
      }

      // Run hub gap analysis
      // This integrates with CountryHubGapService, TopicHubGapAnalyzer, etc.
      const gaps = await this._runHubGapAnalysis();

      const gapCount = gaps.newHubs?.length || 0;
      const sequenceCount = result.sequenceSummary?.hubsDiscovered || 0;
      const guessInserted = result.guessSummary?.insertedHubs || 0;
      const guessUpdated = result.guessSummary?.updatedHubs || 0;
      result.hubsDiscovered = gapCount + sequenceCount + guessInserted + guessUpdated;
      result.newHubs = gaps.newHubs || [];

      this.totalHubsDiscovered += result.hubsDiscovered;
      this.lastHubRefresh = Date.now();

      const guessTotal = guessInserted + guessUpdated;
      if (guessTotal > 0) {
        this._addLearningInsight({
          type: 'hub-guessing',
          description: `Hub guessing inserted ${guessInserted} and updated ${guessUpdated} hubs`,
          confidence: 0.7
        });
      }

      if (sequenceCount > 0) {
        this._addLearningInsight({
          type: 'hub-exploration',
          description: `Hub sequence discovered ${sequenceCount} hubs`,
          confidence: 0.7
        });
      }

      if (result.hubsDiscovered > 0) {
        for (const hub of result.newHubs) {
          this._addLearningInsight({
            type: 'hub-discovered',
            description: `New ${hub.type} hub: ${hub.url}`,
            confidence: hub.confidence || 0.8
          });
        }

        this.emit('hub-discovered', {
          batch: this.batchNumber,
          ...result
        });
      }

    } catch (error) {
      this.logger.error('[MultiModal] Hub discovery error:', error);
      result.error = error.message;
    }

    return result;
  }

  async _runReanalysisPhase(learningResult) {
    this._setPhase('reanalyzing');

    const result = {
      pagesReanalyzed: 0,
      improvements: []
    };

    try {
      // Find pages that could benefit from new patterns
      const pagesToReanalyze = this._findPagesForReanalysis(learningResult.significantPatterns);

      if (pagesToReanalyze.length === 0) {
        return result;
      }

      this.emit('reanalysis-triggered', {
        batch: this.batchNumber,
        pageCount: pagesToReanalyze.length,
        reason: 'significant-patterns-learned'
      });

      // Cap re-analysis to prevent unbounded growth
      const maxReanalysis = Math.min(pagesToReanalyze.length, this.config.batchSize / 2);

      // Run re-analysis
      const reanalysisResult = await this._runAnalysis({
        urls: pagesToReanalyze.slice(0, maxReanalysis),
        forceReanalysis: true
      });

      result.pagesReanalyzed = reanalysisResult.processed || 0;
      result.improvements = reanalysisResult.improvements || [];

      this.totalReanalyzed += result.pagesReanalyzed;

      this._addLearningInsight({
        type: 'reanalysis',
        description: `Re-analyzed ${result.pagesReanalyzed} pages with new patterns`,
        improvements: result.improvements.length
      });

    } catch (error) {
      this.logger.error('[MultiModal] Re-analysis error:', error);
      result.error = error.message;
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Private: Helper methods
  // ─────────────────────────────────────────────────────────────

  _setPhase(phase) {
    const previousPhase = this.phase;
    this.phase = phase;
    this.emit('phase-change', { from: previousPhase, to: phase, batch: this.batchNumber });
  }

  _shouldStop() {
    if (this.config.maxTotalBatches && this.batchNumber >= this.config.maxTotalBatches) {
      return true;
    }
    if (this.config.maxTotalPages && this.totalPagesDownloaded >= this.config.maxTotalPages) {
      return true;
    }
    return false;
  }

  _shouldRunHubDiscovery() {
    if (!this.config.hubDiscoveryPerBatch) {
      return false;
    }
    const priorityBatches = Number.isFinite(this.config.hubDiscoveryPriorityBatches)
      ? Math.max(0, Math.floor(this.config.hubDiscoveryPriorityBatches))
      : 0;
    if (priorityBatches > 0 && this.batchNumber <= priorityBatches) {
      return true;
    }
    if (!this.lastHubRefresh) {
      return true;
    }
    return (Date.now() - this.lastHubRefresh) >= this.config.hubRefreshIntervalMs;
  }

  _recordBatchComplete() {
    const batchRecord = {
      batch: this.batchNumber,
      timestamp: new Date().toISOString(),
      pagesDownloaded: this.totalPagesDownloaded,
      pagesAnalyzed: this.totalPagesAnalyzed,
      patternsLearned: this.totalPatternsLearned,
      hubsDiscovered: this.totalHubsDiscovered
    };

    this.batchHistory.push(batchRecord);

    this.emit('batch-complete', batchRecord);
  }

  _addLearningInsight(insight) {
    this.learningInsights.push({
      ...insight,
      timestamp: new Date().toISOString(),
      batch: this.batchNumber
    });
  }

  _getPendingAnalysisCount() {
    const cap = Number.isFinite(this.config.analysisBatchSize)
      ? this.config.analysisBatchSize
      : this.config.batchSize;

    if (!this.multiModalQueries) return cap;
    const count = this.multiModalQueries.getPendingAnalysisCount(this.currentDomain, {
      analysisVersion: this.config.analysisVersion
    });
    const target = Number.isFinite(count) ? count : cap;
    return Math.min(target, cap);
  }

  async _runAnalysis(options) {
    const { limit, urls, forceReanalysis, computeSkeletonHash } = options;

    // Try to use the analysis observable for real analysis
    const { createAnalysisObservable } = getAnalysisObservable();

    if (createAnalysisObservable) {
      return this._runAnalysisWithObservable({
        limit,
        urls,
        forceReanalysis,
        computeSkeletonHash
      });
    }

    // Fallback: use direct analysis if observable not available
    return this._runDirectAnalysis({
      limit,
      urls,
      forceReanalysis
    });
  }

  /**
   * Run analysis using the observable pattern for progress tracking
   */
  async _runAnalysisWithObservable({ limit, urls, forceReanalysis, computeSkeletonHash }) {
    const { createAnalysisObservable } = getAnalysisObservable();

    const result = {
      processed: 0,
      newSignatures: [],
      signatureDistribution: {},
      improvements: []
    };

    return new Promise((resolve, reject) => {
      // Determine what to analyze
      const analysisLimit = urls ? urls.length : (limit || this.config.batchSize);

      this.currentAnalysisObs = createAnalysisObservable({
        limit: analysisLimit,
        verbose: false,
        dryRun: false,
        emitIntervalMs: 200,
        analysisVersion: this.config.analysisVersion,
        analysisOptions: {
          computeSkeletonHash: computeSkeletonHash !== false,
          urls: urls || null,
          forceReanalysis: forceReanalysis || false
        }
      });

      // Track progress and collect signatures
      const signaturesFound = new Map();

      this.currentAnalysisObs.subscribe({
        next: (msg) => {
          if (msg.type === 'next' && msg.value) {
            const state = msg.value;
            result.processed = state.processed || result.processed;

            // Emit progress to subscribers
            this.emit('analysis-progress', {
              batch: this.batchNumber,
              processed: state.processed,
              total: state.total,
              recordsPerSecond: state.recordsPerSecond,
              etaMs: state.etaMs,
              currentUrl: state.currentUrl
            });

            // Track layout signatures if available
            if (state.layoutSignature) {
              const hash = state.layoutSignature;
              if (!signaturesFound.has(hash)) {
                signaturesFound.set(hash, {
                  hash,
                  seenCount: 0,
                  exampleUrls: []
                });
              }
              const sig = signaturesFound.get(hash);
              sig.seenCount++;
              if (sig.exampleUrls.length < 5 && state.currentUrl) {
                sig.exampleUrls.push(state.currentUrl);
              }
            }
          }
        },
        complete: () => {
          // Convert signature map to array
          result.newSignatures = Array.from(signaturesFound.values())
            .filter(s => s.seenCount >= 2);

          // Build distribution
          for (const sig of signaturesFound.values()) {
            result.signatureDistribution[sig.hash] = sig.seenCount;
          }

          this.currentAnalysisObs = null;
          resolve(result);
        },
        error: (err) => {
          this.currentAnalysisObs = null;
          this.logger.error('[MultiModal] Analysis observable error:', err);
          resolve(result); // Resolve anyway with partial results
        }
      });

      // Start the analysis
      this.currentAnalysisObs.start().catch((err) => {
        this.logger.error('[MultiModal] Analysis start error:', err);
        this.currentAnalysisObs = null;
        resolve(result);
      });
    });
  }

  /**
   * Fallback direct analysis when observable not available
   */
  async _runDirectAnalysis({ limit, urls, forceReanalysis }) {
    const result = {
      processed: 0,
      newSignatures: [],
      signatureDistribution: {},
      improvements: []
    };

    try {
      // Try to use analyse-pages-core directly
      const analysePages = require('../../tools/analyse-pages-core').analysePages;

      const summary = await analysePages({
        limit: urls ? urls.length : (limit || this.config.batchSize),
        verbose: false,
        dryRun: false,
        analysisVersion: this.config.analysisVersion,
        onProgress: (info) => {
          result.processed = info.processed || result.processed;
          this.emit('analysis-progress', {
            batch: this.batchNumber,
            processed: info.processed,
            total: info.total
          });
        }
      });

      result.processed = summary?.steps?.pages?.processed || 0;

    } catch (err) {
      this.logger.warn('[MultiModal] Direct analysis fallback failed:', err.message);
    }

    return result;
  }

  _resolveDbPath() {
    if (this.config.dbPath) {
      return this.config.dbPath;
    }
    if (this.db?.dbFilePath) {
      return this.db.dbFilePath;
    }
    if (this.db?.name) {
      return this.db.name;
    }
    if (this.db?.db?.name) {
      return this.db.db?.name;
    }
    return null;
  }

  async _runHubDiscoverySequence() {
    if (!this.crawlOperations || typeof this.crawlOperations.runSequencePreset !== 'function') {
      return null;
    }

    const sequenceName = this.config.hubDiscoverySequence;
    if (!sequenceName) {
      return null;
    }

    const sharedDefaults = {
      ...(this.config.crawlOverrides || {}),
      maxDownloads: this.config.hubDiscoveryMaxDownloads
    };
    const sharedOverrides = {
      ...sharedDefaults,
      ...(this.config.hubDiscoverySharedOverrides || {})
    };

    const stepOverrides = this.config.hubDiscoveryStepOverrides || {};
    const startUrl = `https://${this.currentDomain}`;

    try {
      return await this.crawlOperations.runSequencePreset(sequenceName, {
        startUrl,
        sharedOverrides,
        stepOverrides,
        continueOnError: Boolean(this.config.hubDiscoveryContinueOnError),
        context: {
          source: 'multi-modal',
          domain: this.currentDomain,
          batch: this.batchNumber
        }
      });
    } catch (error) {
      this.logger.warn('[MultiModal] Hub discovery sequence failed:', error?.message || error);
      return { status: 'error', error: error?.message || String(error) };
    }
  }

  async _runHubGuessing() {
    if (!this.config.hubGuessingEnabled) {
      return null;
    }
    if (!this.crawlOperations || typeof this.crawlOperations.guessPlaceHubs !== 'function') {
      return null;
    }

    const dbPath = this._resolveDbPath();
    const startUrl = `https://${this.currentDomain}`;
    const kinds = Array.isArray(this.config.hubGuessingKinds)
      ? this.config.hubGuessingKinds
      : (this.config.hubGuessingKinds ? [this.config.hubGuessingKinds] : undefined);

    try {
      return await this.crawlOperations.guessPlaceHubs(startUrl, {
        ...(dbPath ? { dbPath } : {}),
        domain: this.currentDomain,
        mode: this.config.hubGuessingMode,
        apply: this.config.hubGuessingApply,
        ...(kinds ? { kinds } : {}),
        limit: this.config.hubGuessingLimit,
        lang: this.config.hubGuessingLang,
        parentPlace: this.config.hubGuessingParentPlace,
        verbose: false
      });
    } catch (error) {
      this.logger.warn('[MultiModal] Hub guessing failed:', error?.message || error);
      return { status: 'error', error: error?.message || String(error) };
    }
  }

  async _runHubGapAnalysis() {
    const result = {
      newHubs: [],
      gaps: [],
      predictions: []
    };

    // Use provided analyzer or try to create one
    let analyzer = this.hubGapAnalyzer;

    if (!analyzer && this.db) {
      const { CountryHubGapAnalyzer: Analyzer } = getHubGapAnalyzers();
      if (Analyzer) {
        try {
          analyzer = new Analyzer({ db: this.db, logger: this.logger });
        } catch (e) {
          this.logger.warn('[MultiModal] Could not create hub gap analyzer:', e.message);
        }
      }
    }

    if (!analyzer) {
      return result;
    }

    try {
      // Get gap analysis for the current domain
      const gaps = await analyzer.analyzeGaps(this.currentDomain);

      if (gaps && gaps.length > 0) {
        result.gaps = gaps;

        // Get predictions for each gap
        for (const gap of gaps.slice(0, 10)) { // Limit to top 10 gaps
          try {
            const predictions = await analyzer.predictUrls(this.currentDomain, gap);
            if (predictions && predictions.length > 0) {
              result.predictions.push({
                gap,
                predictions: predictions.slice(0, 3) // Top 3 predictions per gap
              });

              // Convert high-confidence predictions to new hubs
              for (const pred of predictions) {
                if (pred.confidence >= 0.7) {
                  result.newHubs.push({
                    type: gap.type || 'country',
                    url: pred.url,
                    confidence: pred.confidence,
                    placeName: gap.name || gap.entity,
                    source: 'hub-gap-analysis'
                  });
                }
              }
            }
          } catch (e) {
            this.logger.warn(`[MultiModal] Prediction failed for gap ${gap.name}:`, e.message);
          }
        }
      }

      // Also try to find hubs from existing URL patterns
      const patternHubs = await this._discoverHubsFromPatterns();
      result.newHubs.push(...patternHubs);

    } catch (err) {
      this.logger.error('[MultiModal] Hub gap analysis error:', err.message);
    }

    return result;
  }

  /**
   * Discover potential hubs from URL patterns in recently crawled pages
   */
  async _discoverHubsFromPatterns() {
    const hubs = [];

    if (!this.multiModalQueries) return hubs;

    const minLinkCount = Number.isFinite(this.config.hubCandidateMinLinks)
      ? this.config.hubCandidateMinLinks
      : 5;
    const scanLimit = Number.isFinite(this.config.hubCandidateScanLimit)
      ? this.config.hubCandidateScanLimit
      : 25;
    const maxDepth = Number.isFinite(this.config.hubCandidateMaxDepth)
      ? this.config.hubCandidateMaxDepth
      : 2;
    const maxSegmentLength = Number.isFinite(this.config.hubCandidateMaxSegmentLength)
      ? this.config.hubCandidateMaxSegmentLength
      : 40;

    const rows = this.multiModalQueries.getPatternHubCandidates(this.currentDomain, {
      minLinkCount,
      limit: scanLimit
    });

    const isArticleLike = (segments) => {
      const hasYear = segments.some(seg => /^\d{4}$/.test(seg));
      const hasMonthDay = segments.some(seg => /^\d{2}$/.test(seg));
      const hasFileExt = segments.some(seg => /\.[a-z0-9]+$/i.test(seg));
      const hasLongNumeric = segments.some(seg => /\d/.test(seg) && seg.length > 3);
      return (hasYear && hasMonthDay) || hasFileExt || hasLongNumeric;
    };

    for (const row of rows) {
      if (row.is_verified) continue;
      if (!row.url) continue;

      let parsed;
      try {
        parsed = new URL(row.url);
      } catch (_) {
        continue;
      }

      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length === 0) continue;
      if (segments.length > maxDepth) continue;
      if (segments.some(seg => seg.length > maxSegmentLength)) continue;
      if (segments.some(seg => seg.toLowerCase() === 'amp')) continue;
      if (isArticleLike(segments)) continue;

      const linkCount = row.link_count || 0;
      const depthPenalty = 1 - Math.min(0.2, (segments.length - 1) * 0.1);
      const confidence = Math.min(0.95, (0.45 + linkCount / 50) * depthPenalty);

      hubs.push({
        type: 'pattern-discovered',
        url: row.url,
        confidence,
        linkCount,
        source: 'pattern-discovery'
      });
    }

    return hubs;
  }

  _findPagesForReanalysis(patterns) {
    // First try to use the pattern tracker
    if (this.patternTracker && patterns.length > 0) {
      const pages = this.patternTracker.getPagesForReanalysis(patterns, {
        limit: Math.floor(this.config.batchSize / 2),
        domain: this.currentDomain
      });

      if (pages.length > 0) {
        return pages;
      }
    }

    // Fallback: find pages with low confidence scores or old analysis
    if (!this.multiModalQueries) return [];

    return this.multiModalQueries.getReanalysisUrls(this.currentDomain, {
      minConfidence: 0.6,
      limit: Math.floor(this.config.batchSize / 2)
    });
  }

  async _waitForResume() {
    return new Promise((resolve) => {
      const checkResume = () => {
        if (!this.isPaused || !this.isRunning) {
          resolve();
        } else {
          setTimeout(checkResume, 1000);
        }
      };
      checkResume();
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = { MultiModalCrawlOrchestrator };
