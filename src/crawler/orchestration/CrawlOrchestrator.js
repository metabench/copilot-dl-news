'use strict';

const EventEmitter = require('events');
const { CrawlContext } = require('../context');
const { CrawlPlan, GOALS } = require('../plan');
const { ProgressModel, PHASES } = require('../progress');
const { ResourceBudget, BudgetExhaustedError } = require('../budget');

/**
 * CrawlOrchestrator - Central coordinator for Phase 6+ abstractions.
 *
 * Integrates:
 * - CrawlContext (Phase 1): Unified state tracking
 * - CrawlPlan (Phase 6): Declarative crawl intent
 * - ProgressModel (Phase 6): Unified progress view with ETA
 * - ResourceBudget (Phase 6): Resource limit enforcement
 *
 * And implements:
 * - Structured Concurrency: Controls parallel worker lifecycle
 * - Goal-Driven Stopping: Detects goal satisfaction and stops early
 * - Checkpointing: Serializes state for resume capability
 *
 * @extends EventEmitter
 */
class CrawlOrchestrator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.crawler - NewsCrawler instance
   * @param {Object} options.plan - CrawlPlan instance (or config to build one)
   * @param {Object} options.budget - ResourceBudget instance (or config to build one)
   * @param {Object} options.config - Additional configuration
   */
  constructor(options = {}) {
    super();

    this.crawler = options.crawler;
    this._config = options.config || {};

    // Initialize or adopt CrawlContext
    this.context = options.context || this._createContext();

    // Initialize or adopt CrawlPlan
    this.plan = options.plan || this._createPlan();

    // Initialize or adopt ResourceBudget
    this.budget = options.budget || this._createBudget();

    // Wire budget callbacks (for both injected and created budgets)
    this._wireBudgetCallbacks();

    // Initialize ProgressModel
    this.progress = new ProgressModel(this.context, this.plan, {
      stallThresholdMs: this._config.stallThresholdMs || 60000,
      etaAlpha: this._config.etaAlpha || 0.3
    });

    // Structured concurrency state
    this._workers = [];
    this._workerPromises = [];
    this._activeWorkers = 0;
    this._workerAbortController = null;

    // Goal-driven stopping
    this._goalCheckInterval = null;
    this._goalCheckFrequencyMs = this._config.goalCheckFrequencyMs || 5000;
    this._lastGoalCheck = 0;

    // Checkpoint state
    this._checkpointPath = this._config.checkpointPath || null;
    this._checkpointInterval = null;
    this._checkpointFrequencyMs = this._config.checkpointFrequencyMs || 30000;
    this._lastCheckpoint = null;

    // Wire up event listeners
    this._wireEvents();
  }

  // ============================================================
  // CONTEXT FACTORY
  // ============================================================

  /**
   * Create CrawlContext from crawler config.
   * @private
   */
  _createContext() {
    if (!this.crawler) return null;

    return CrawlContext.create({
      jobId: this.crawler.jobId,
      startUrl: this.crawler.startUrl,
      crawlType: this.crawler.crawlType,
      maxDepth: this.crawler.maxDepth,
      maxPages: this.crawler.maxDownloads
    });
  }

  // ============================================================
  // PLAN FACTORY
  // ============================================================

  /**
   * Create CrawlPlan from crawler config.
   * @private
   */
  _createPlan() {
    if (!this.crawler) return null;

    const builder = CrawlPlan.builder();

    // Map crawler config to plan goals
    if (this.crawler.crawlType?.includes('intelligent')) {
      builder.addGoal(GOALS.DISCOVER_ARTICLES, { weight: 1.0 });
      builder.addGoal(GOALS.MAP_STRUCTURE, { weight: 0.5 });
    } else if (this.crawler.isGazetteerMode) {
      builder.addGoal(GOALS.GEOGRAPHIC_COVERAGE, { weight: 1.0 });
    } else if (this.crawler.structureOnly) {
      builder.addGoal(GOALS.MAP_STRUCTURE, { weight: 1.0 });
    } else {
      builder.addGoal(GOALS.DISCOVER_ARTICLES, { weight: 1.0 });
    }

    // Set constraints from crawler config
    if (this.crawler.maxDownloads) {
      builder.setConstraint('maxPages', this.crawler.maxDownloads);
    }
    if (this.crawler.maxDepth) {
      builder.setConstraint('maxDepth', this.crawler.maxDepth);
    }
    if (this.crawler.maxAgeMs) {
      builder.setConstraint('maxTime', this.crawler.maxAgeMs);
    }

    // Add seed
    if (this.crawler.startUrl) {
      builder.addSeed(this.crawler.startUrl, { priority: 0 });
    }

    return builder.build();
  }

  // ============================================================
  // BUDGET FACTORY
  // ============================================================

  /**
   * Create ResourceBudget from crawler config.
   * @private
   */
  _createBudget() {
    if (!this.crawler) return null;

    const limits = {};

    // Map crawler config to budget limits
    if (this.crawler.maxDownloads) {
      limits.pages = this.crawler.maxDownloads;
    }
    if (this.crawler.maxAgeMs) {
      limits.time = this.crawler.maxAgeMs;
    }
    if (this._config.maxErrors) {
      limits.errors = this._config.maxErrors;
    }
    if (this._config.maxRetries) {
      limits.retries = this._config.maxRetries;
    }

    const budget = new ResourceBudget({
      limits,
      warningThreshold: this._config.warningThreshold || 0.8,
      enforcement: this._config.budgetEnforcement || 'warn'
    });

    // Callbacks are wired by _wireBudgetCallbacks() after assignment
    return budget;
  }

  /**
   * Wire budget exhaustion callbacks.
   * Called after budget is assigned (whether created or injected).
   * @private
   */
  _wireBudgetCallbacks() {
    if (!this.budget) return;

    // Wire up exhaustion callbacks for each resource type
    const resources = ['pages', 'time', 'errors', 'retries', 'tokens'];

    for (const resource of resources) {
      // Only wire if this resource has a limit defined
      const limit = this.budget.getLimit(resource);
      if (limit !== undefined && limit !== null && limit !== Infinity) {
        this.budget.onExhausted(resource, () => {
          this.emit('budget:exhausted', { resource });
          this._handleBudgetExhausted(resource);
        });
      }
    }
  }

  // ============================================================
  // EVENT WIRING
  // ============================================================

  /**
   * Wire up internal event listeners.
   * @private
   */
  _wireEvents() {
    // Mirror context events
    if (this.context) {
      this.context.on('url:visited', (data) => {
        // Track in budget
        if (this.budget) {
          this.budget.spend('pages', 1);
        }

        // Update progress
        this._updateProgress();

        // Check goals
        this._checkGoals();

        this.emit('url:visited', data);
      });

      this.context.on('url:error', (data) => {
        if (this.budget) {
          this.budget.spend('errors', 1);
        }
        this.emit('url:error', data);
      });

      this.context.on('finished', (data) => {
        this._stopGoalChecking();
        this._stopCheckpointing();
        this.emit('finished', data);
      });
    }

    // Mirror progress events
    if (this.progress) {
      this.progress.on('phase:changed', (data) => {
        this.emit('phase:changed', data);

        // Auto-stop on stalled
        if (data.phase === PHASES.STALLED && this._config.stopOnStall !== false) {
          this.emit('stalled', data);
        }
      });

      this.progress.on('completed', () => {
        this.emit('completed:progress', { completion: 100 });
      });
    }

    // Mirror plan events
    if (this.plan) {
      this.plan.on('goal:satisfied', (data) => {
        this.emit('goal:satisfied', data);
        this._checkAllGoalsSatisfied();
      });
    }
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  /**
   * Start the orchestrator.
   */
  start() {
    if (this.context) {
      this.context.start();
    }

    // Freeze plan
    if (this.plan && !this.plan.isFrozen) {
      this.plan.freeze();
    }

    // Start goal checking
    this._startGoalChecking();

    // Start checkpointing if configured
    if (this._checkpointPath) {
      this._startCheckpointing();
    }

    this.emit('started', {
      jobId: this.context?.jobId,
      plan: this.plan?.toJSON(),
      budget: this.budget?.summary
    });
  }

  /**
   * Stop the orchestrator.
   */
  stop(reason = 'manual', details = {}) {
    // Stop workers
    this._stopWorkers();

    // Stop monitoring
    this._stopGoalChecking();
    this._stopCheckpointing();

    // Finish context
    if (this.context && !this.context.isFinished) {
      this.context.finish(reason === 'completed' ? 'completed' : 'aborted', reason);
    }

    // Create final checkpoint
    if (this._checkpointPath) {
      this._saveCheckpoint();
    }

    this.emit('stopped', { reason, details });
  }

  /**
   * Pause the orchestrator.
   */
  pause() {
    if (this.context) {
      this.context.pause();
    }
    this._stopGoalChecking();
    this.emit('paused');
  }

  /**
   * Resume the orchestrator.
   */
  resume() {
    if (this.context) {
      this.context.resume();
    }
    this._startGoalChecking();
    this.emit('resumed');
  }

  // ============================================================
  // STRUCTURED CONCURRENCY
  // ============================================================

  /**
   * Create a worker scope for structured concurrency.
   * Workers are tracked and can be collectively cancelled.
   *
   * @param {Function} workerFn - Async function that performs work
   * @param {Object} options - Worker options
   * @returns {number} Worker ID
   */
  spawnWorker(workerFn, options = {}) {
    const workerId = this._workers.length;
    const worker = {
      id: workerId,
      name: options.name || `worker-${workerId}`,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      error: null,
      abortController: new AbortController()
    };

    this._workers.push(worker);

    // Create wrapped promise
    const workerPromise = (async () => {
      worker.status = 'running';
      worker.startedAt = Date.now();
      this._activeWorkers++;
      this.emit('worker:started', { workerId, name: worker.name });

      try {
        const result = await workerFn({
          signal: worker.abortController.signal,
          workerId,
          budget: this.budget,
          context: this.context,
          shouldContinue: () => this._shouldWorkerContinue(workerId)
        });

        worker.status = 'completed';
        worker.finishedAt = Date.now();
        this.emit('worker:completed', { workerId, name: worker.name });
        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          worker.status = 'cancelled';
        } else {
          worker.status = 'failed';
          worker.error = error;
        }
        worker.finishedAt = Date.now();
        this.emit('worker:error', { workerId, name: worker.name, error });
        throw error;
      } finally {
        this._activeWorkers--;
        if (this._activeWorkers === 0) {
          this.emit('workers:idle');
        }
      }
    })();

    this._workerPromises.push(workerPromise.catch(() => {})); // Prevent unhandled rejection

    return workerId;
  }

  /**
   * Wait for all workers to complete.
   */
  async awaitWorkers() {
    await Promise.allSettled(this._workerPromises);
    return this._workers.map(w => ({
      id: w.id,
      name: w.name,
      status: w.status,
      duration: w.finishedAt ? w.finishedAt - w.startedAt : null,
      error: w.error?.message
    }));
  }

  /**
   * Stop all workers.
   * @private
   */
  _stopWorkers() {
    for (const worker of this._workers) {
      if (worker.status === 'running') {
        worker.abortController.abort();
      }
    }
  }

  /**
   * Check if a worker should continue.
   * @private
   */
  _shouldWorkerContinue(workerId) {
    const worker = this._workers[workerId];
    if (!worker || worker.abortController.signal.aborted) {
      return false;
    }

    // Check context status
    if (this.context?.isFinished || this.context?.isPaused) {
      return false;
    }

    // Check budget
    if (this.budget?.anyExhausted?.()) {
      return false;
    }

    // Check goals
    if (this._allGoalsSatisfied) {
      return false;
    }

    return true;
  }

  /**
   * Get active worker count.
   */
  get activeWorkerCount() {
    return this._activeWorkers;
  }

  /**
   * Get worker statuses.
   */
  getWorkerStatuses() {
    return this._workers.map(w => ({
      id: w.id,
      name: w.name,
      status: w.status
    }));
  }

  // ============================================================
  // GOAL-DRIVEN STOPPING
  // ============================================================

  /**
   * Start periodic goal checking.
   * @private
   */
  _startGoalChecking() {
    if (this._goalCheckInterval) return;

    this._goalCheckInterval = setInterval(() => {
      this._checkGoals();
    }, this._goalCheckFrequencyMs);
  }

  /**
   * Stop goal checking.
   * @private
   */
  _stopGoalChecking() {
    if (this._goalCheckInterval) {
      clearInterval(this._goalCheckInterval);
      this._goalCheckInterval = null;
    }
  }

  /**
   * Check all goals for satisfaction.
   * @private
   */
  _checkGoals() {
    if (!this.plan || !this.context) return;

    const now = Date.now();
    if (now - this._lastGoalCheck < 1000) return; // Debounce
    this._lastGoalCheck = now;

    // Check each goal
    for (const goal of this.plan.goals) {
      if (goal.status === 'satisfied') continue;

      const isSatisfied = this._evaluateGoal(goal);
      if (isSatisfied && goal.status !== 'satisfied') {
        this.plan.updateGoalStatus(goal.id, 'satisfied');
      }
    }

    // Check if all goals satisfied
    this._checkAllGoalsSatisfied();
  }

  /**
   * Evaluate if a goal is satisfied.
   * @private
   */
  _evaluateGoal(goal) {
    const stats = this.context?.stats || {};
    const target = goal.target || {};

    switch (goal.type) {
      case GOALS.DISCOVER_ARTICLES:
        if (target.count) {
          return stats.articles >= target.count;
        }
        if (target.minArticles) {
          return stats.articles >= target.minArticles;
        }
        return false;

      case GOALS.MAP_STRUCTURE:
        if (target.pages) {
          return stats.visited >= target.pages;
        }
        if (target.coverage) {
          // Percentage-based completion
          const completion = this.progress?.completion || 0;
          return completion >= target.coverage;
        }
        return false;

      case GOALS.GEOGRAPHIC_COVERAGE:
        if (target.countries) {
          // Would need domain-specific logic
          return false;
        }
        return false;

      case GOALS.DEPTH_FIRST:
      case GOALS.BREADTH_FIRST:
        // Strategy goals are satisfied when crawl completes
        return this.context?.isFinished || false;

      case GOALS.SITEMAP_ONLY:
        // Satisfied when sitemap URLs are processed
        const sitemapUrls = this.context?._content?.sitemapUrls?.size || 0;
        return sitemapUrls > 0 && stats.visited >= sitemapUrls;

      default:
        return false;
    }
  }

  /**
   * Check if all goals are satisfied and trigger early stop.
   * @private
   */
  _checkAllGoalsSatisfied() {
    if (!this.plan) return;

    const allSatisfied = this.plan.isSatisfied?.(this.context) ||
      this.plan.goals.every(g => g.status === 'satisfied' || g.status === 'abandoned');

    if (allSatisfied && !this._allGoalsSatisfied) {
      this._allGoalsSatisfied = true;
      this.emit('goals:allSatisfied', {
        goals: this.plan.goals.map(g => ({ type: g.type, status: g.status })),
        stats: this.context?.stats
      });

      // Trigger early stop if configured
      if (this._config.stopOnGoalsSatisfied !== false) {
        this.stop('goals-satisfied');
      }
    }
  }

  /**
   * Handle budget exhaustion.
   * @private
   */
  _handleBudgetExhausted(resource) {
    if (this._config.stopOnBudgetExhausted !== false) {
      this.stop('budget-exhausted', { resource });
    }
  }

  // ============================================================
  // PROGRESS TRACKING
  // ============================================================

  /**
   * Update progress model.
   * @private
   */
  _updateProgress() {
    if (!this.progress) return;

    // Access instantRate to trigger snapshot/rate calculation
    const rate = this.progress.instantRate || this.progress.rate;

    // Emit progress event
    this.emit('progress', {
      completion: this.progress.completion,
      eta: this.progress.eta,
      phase: this.progress.phase,
      rate,
      healthScore: this.progress.healthScore
    });
  }

  /**
   * Get current progress summary.
   */
  getProgressSummary() {
    return {
      completion: this.progress?.completion || 0,
      eta: this.progress?.eta,
      phase: this.progress?.phase || 'unknown',
      rate: this.progress?.rate || 0,
      healthScore: this.progress?.healthScore,
      goalProgress: this.progress?.goalProgress,
      summary: this.progress?.summary
    };
  }

  // ============================================================
  // CHECKPOINTING
  // ============================================================

  /**
   * Start periodic checkpointing.
   * @private
   */
  _startCheckpointing() {
    if (this._checkpointInterval || !this._checkpointPath) return;

    this._checkpointInterval = setInterval(() => {
      this._saveCheckpoint();
    }, this._checkpointFrequencyMs);
  }

  /**
   * Stop checkpointing.
   * @private
   */
  _stopCheckpointing() {
    if (this._checkpointInterval) {
      clearInterval(this._checkpointInterval);
      this._checkpointInterval = null;
    }
  }

  /**
   * Save a checkpoint.
   * @private
   */
  _saveCheckpoint() {
    const checkpoint = this.toCheckpoint();
    this._lastCheckpoint = checkpoint;

    // Emit checkpoint event (file saving is handled externally)
    this.emit('checkpoint', checkpoint);

    return checkpoint;
  }

  /**
   * Create checkpoint data for persistence.
   */
  toCheckpoint() {
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      jobId: this.context?.jobId,

      // Context state
      context: this.context?.toJSON(),

      // Plan state
      plan: this.plan?.toJSON(),

      // Budget state (use explicit structure for checkpoint compatibility)
      budget: this.budget ? {
        limits: this.budget._limits,
        spent: this.budget._spent,
        reserved: this.budget._reserved
      } : null,

      // Progress state
      progress: {
        completion: this.progress?.completion,
        phase: this.progress?.phase,
        eta: this.progress?.eta
      },

      // Worker state
      workers: this._workers.map(w => ({
        id: w.id,
        name: w.name,
        status: w.status
      })),

      // Resumption hints
      resumeHints: {
        activeWorkers: this._activeWorkers,
        allGoalsSatisfied: this._allGoalsSatisfied || false
      }
    };
  }

  /**
   * Restore from checkpoint.
   * @param {Object} checkpoint - Checkpoint data
   */
  static fromCheckpoint(checkpoint, options = {}) {
    // Restore context
    const context = new CrawlContext(checkpoint.context || {});

    // Restore plan (immutable, just recreate)
    let plan = null;
    if (checkpoint.plan) {
      plan = CrawlPlan.fromJSON(checkpoint.plan);
    }

    // Restore budget
    let budget = null;
    if (checkpoint.budget) {
      budget = new ResourceBudget({
        limits: checkpoint.budget.limits || {}
      });
      // Restore spent amounts
      for (const [resource, amount] of Object.entries(checkpoint.budget.spent || {})) {
        budget._spent[resource] = amount;
      }
    }

    const orchestrator = new CrawlOrchestrator({
      ...options,
      context,
      plan,
      budget
    });

    // Restore flags
    if (checkpoint.resumeHints) {
      orchestrator._allGoalsSatisfied = checkpoint.resumeHints.allGoalsSatisfied || false;
    }

    return orchestrator;
  }

  // ============================================================
  // INTEGRATION WITH EXISTING CRAWLER
  // ============================================================

  /**
   * Install on an existing crawler.
   * This wires up event listeners to track state.
   */
  installOnCrawler() {
    const crawler = this.crawler;
    if (!crawler) return;

    // Mirror state from crawler events
    if (crawler.events) {
      // Track page visits
      crawler.events.on('page:processed', (data) => {
        if (this.context && data?.url) {
          this.context.markVisited(data.url, data);
        }
      });

      // Track articles
      crawler.events.on('article:found', (data) => {
        if (this.context && data?.url) {
          this.context.recordArticle(data.url, data);
        }
      });

      // Track errors
      crawler.events.on('error', (data) => {
        if (this.context && data?.url) {
          this.context.recordError(data.url, data.error);
        }
      });
    }

    // Mirror telemetry
    if (crawler.telemetry) {
      const origProgress = crawler.telemetry.progress?.bind(crawler.telemetry);
      if (origProgress) {
        crawler.telemetry.progress = (data) => {
          // Update our progress
          this._updateProgress();
          // Call original
          return origProgress(data);
        };
      }
    }

    // Expose on crawler
    crawler.orchestrator = this;

    // Override shouldContinue checks
    const origIsPaused = crawler.isPaused?.bind(crawler);
    if (origIsPaused) {
      crawler.isPaused = () => {
        if (this._allGoalsSatisfied) return true;
        if (this.budget?.anyExhausted?.()) return true;
        return origIsPaused();
      };
    }

    return this;
  }

  // ============================================================
  // FACTORY
  // ============================================================

  /**
   * Create orchestrator from crawler.
   */
  static fromCrawler(crawler, config = {}) {
    const orchestrator = new CrawlOrchestrator({
      crawler,
      config
    });
    return orchestrator;
  }
}

module.exports = CrawlOrchestrator;
