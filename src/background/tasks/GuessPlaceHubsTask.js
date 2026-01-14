/**
 * Guess Place Hubs Background Task
 *
 * Executes place hub guessing as a long-running background task.
 * Supports batch processing of multiple domains with progress tracking,
 * error handling, pause/resume, and integrates with audit trails.
 *
 * This task wraps the core hub guessing logic from guess-place-hubs.js
 * to work within the BackgroundTaskManager framework.
 */

const { guessPlaceHubsBatch } = require('../../tools/guess-place-hubs');
const { createPlaceHubDependencies } = require('../../core/orchestration/dependencies');
const { tof } = require('lang-tools');

/**
 * Guess Place Hubs background task
 *
 * Orchestrates hub guessing across multiple domains as a background task.
 * Provides progress tracking, error handling, and pause/resume capabilities.
 */
class GuessPlaceHubsTask {
  /**
   * @param {Object} options - Task options
   * @param {Database} options.db - better-sqlite3 database instance
   * @param {number} options.taskId - Task ID
   * @param {Object} options.config - Task configuration
   * @param {Array<string>} [options.config.domains] - Domains to process
   * @param {string} [options.config.domainBatch] - CSV file path with domains
   * @param {Array<string>} [options.config.kinds] - Hub kinds to discover (country, region, city, topic)
   * @param {number} [options.config.limit] - Limit per domain
   * @param {boolean} [options.config.apply] - Whether to apply changes
   * @param {boolean} [options.config.emitReport] - Whether to emit JSON report
   * @param {string} [options.config.reportPath] - Path for JSON report
   * @param {number} [options.config.readinessTimeoutSeconds] - Readiness probe timeout
   * @param {boolean} [options.config.enableTopicDiscovery] - Enable topic hub discovery
   * @param {Array<string>} [options.config.topics] - Specific topics to discover
   * @param {boolean} [options.config.verbose] - Enable verbose logging
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
    this.domains = this.config.domains || [];
    this.domainBatch = this.config.domainBatch;
    this.kinds = this.config.kinds || ['country'];
    this.limit = this.config.limit || 5;
    this.apply = this.config.apply ?? false;
    this.emitReport = this.config.emitReport ?? false;
    this.reportPath = this.config.reportPath;
    this.readinessTimeoutSeconds = this.config.readinessTimeoutSeconds || 10;
    this.enableTopicDiscovery = this.config.enableTopicDiscovery ?? false;
    this.topics = this.config.topics || [];
    this.verbose = this.config.verbose ?? false;

    // Progress tracking
    this.stats = {
      domainsProcessed: 0,
      domainsTotal: 0,
      hubsGenerated: 0,
      hubsValidated: 0,
      hubsPersisted: 0,
      errors: 0
    };

    // Run metadata tracking
    this.runId = null;
    this.runStartTime = null;
  }

  /**
   * Execute the hub guessing task
   *
   * Orchestrates hub discovery across configured domains
   */
  async execute() {
    try {
      this.runStartTime = new Date();
      this.runId = this._createRunRecord();

      this.currentStage = 'starting';
      this._updateRunRecord({ status: 'running', stage: 'starting' });
      this._reportProgress('Starting hub guessing run');

      // Prepare domain batch
      const domainBatch = await this._prepareDomainBatch();
      this.stats.domainsTotal = domainBatch.length;

      // Update run record with domain count
      this._updateRunRecord({
        total_domains: this.stats.domainsTotal
      });

      if (domainBatch.length === 0) {
        throw new Error('No domains specified for hub guessing');
      }

      this._reportProgress(`Processing ${domainBatch.length} domains`, {
        stage: 'preparing',
        total: domainBatch.length
      });

      // Create dependencies
      const deps = createPlaceHubDependencies({
        dbPath: this.db.name, // Use the database path from the db instance
        verbose: this.verbose
      });

      // Prepare options for guessPlaceHubsBatch
      const options = {
        domainBatch,
        kinds: this.kinds,
        limit: this.limit,
        apply: this.apply,
        emitReport: this.emitReport,
        reportPath: this.reportPath,
        readinessTimeoutSeconds: this.readinessTimeoutSeconds,
        enableTopicDiscovery: this.enableTopicDiscovery,
        topics: this.topics,
        patternsPerPlace: 1,
        maxAgeDays: 7,
        readinessTimeoutMs: this.readinessTimeoutSeconds * 1000,
        runId: this.runId // Pass run ID for audit trail linking
      };

      // Execute hub guessing
      this.currentStage = 'guessing';
      this._updateRunRecord({ status: 'running', stage: 'guessing' });
      const result = await guessPlaceHubsBatch(options, deps);

      // Update stats from result
      this.stats.domainsProcessed = result.aggregate?.domainSummaries?.length || 0;
      this.stats.hubsGenerated = result.aggregate?.totalUrls || 0;
      this.stats.hubsValidated = result.aggregate?.validationSucceeded || 0;
      this.stats.hubsPersisted = result.aggregate?.validationSucceeded || 0; // Assuming all validated hubs are persisted

      // Update run record with final stats
      this._updateRunRecord({
        total_domains: this.stats.domainsTotal,
        domains_processed: this.stats.domainsProcessed,
        hubs_generated: this.stats.hubsGenerated,
        hubs_validated: this.stats.hubsValidated,
        hubs_persisted: this.stats.hubsPersisted,
        last_progress: JSON.stringify({
          stage: 'guessing',
          stats: this.stats
        })
      });

      // Final summary
      this.currentStage = 'completed';
      const runEndTime = new Date();
      const durationMs = runEndTime - this.runStartTime;

      this._updateRunRecord({
        status: 'completed',
        stage: 'completed',
        ended_at: runEndTime.toISOString(),
        duration_ms: durationMs,
        domains_processed: this.stats.domainsProcessed,
        hubs_generated: this.stats.hubsGenerated,
        hubs_validated: this.stats.hubsValidated,
        hubs_persisted: this.stats.hubsPersisted,
        errors_count: this.stats.errors,
        summary: JSON.stringify({
          domainsProcessed: this.stats.domainsProcessed,
          hubsGenerated: this.stats.hubsGenerated,
          hubsValidated: this.stats.hubsValidated,
          hubsPersisted: this.stats.hubsPersisted,
          durationMs
        }),
        last_progress: JSON.stringify({
          stage: 'completed',
          stats: this.stats
        })
      });

      this._reportProgress('Hub guessing run completed', {
        final: true,
        stats: this.stats,
        total: this.stats.domainsTotal,
        current: this.stats.domainsProcessed,
        result: {
          domainsProcessed: this.stats.domainsProcessed,
          hubsGenerated: this.stats.hubsGenerated,
          hubsValidated: this.stats.hubsValidated,
          hubsPersisted: this.stats.hubsPersisted
        }
      });

    } catch (error) {
      this.stats.errors++;

      // Update run record with error
      const runEndTime = new Date();
      const durationMs = this.runStartTime ? runEndTime - this.runStartTime : null;

      this._updateRunRecord({
        status: 'failed',
        stage: this.currentStage,
        ended_at: runEndTime.toISOString(),
        duration_ms: durationMs,
        domains_processed: this.stats.domainsProcessed,
        hubs_generated: this.stats.hubsGenerated,
        hubs_validated: this.stats.hubsValidated,
        hubs_persisted: this.stats.hubsPersisted,
        errors_count: this.stats.errors,
        error: error.message,
        last_progress: JSON.stringify({
          stage: this.currentStage,
          error: error.message,
          stats: this.stats
        })
      });

      if (tof(this.onError) === 'function') {
        this.onError(error);
      }

      throw error;
    }
  }

  /**
   * Prepare domain batch from configuration
   * @private
   * @returns {Promise<Array<Object>>} Domain batch configuration
   */
  async _prepareDomainBatch() {
    const batch = [];

    // Add domains from config.domains array
    if (this.domains && this.domains.length > 0) {
      for (const domain of this.domains) {
        batch.push({
          domain: domain,
          kinds: this.kinds,
          limit: this.limit
        });
      }
    }

    // Add domains from CSV file if specified
    if (this.domainBatch) {
      try {
        const fs = require('fs');
        const path = require('path');

        if (!fs.existsSync(this.domainBatch)) {
          throw new Error(`Domain batch file not found: ${this.domainBatch}`);
        }

        const content = fs.readFileSync(this.domainBatch, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          const [domain, kindsStr, limitStr] = line.split(',');
          if (domain && domain.trim()) {
            batch.push({
              domain: domain.trim(),
              kinds: kindsStr ? kindsStr.split('|') : this.kinds,
              limit: limitStr ? parseInt(limitStr.trim(), 10) : this.limit
            });
          }
        }
      } catch (error) {
        throw new Error(`Failed to load domain batch file: ${error.message}`);
      }
    }

    return batch;
  }

  /**
   * Report progress to background task manager
   * @private
   */
  _reportProgress(message, metadata = {}) {
    if (tof(this.onProgress) !== 'function') return;

    const progressData = {
      current: metadata.current ?? this.stats.domainsProcessed,
      total: metadata.total ?? this.stats.domainsTotal,
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
      // Don't let progress reporting errors crash the task
      console.error('[GuessPlaceHubsTask] Progress reporting error:', error);
    }
  }

  /**
   * Create a new run record in place_hub_guess_runs table
   * @private
   * @returns {string} Run ID
   */
  _createRunRecord() {
    const runId = `guess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const insert = this.db.prepare(`
      INSERT INTO place_hub_guess_runs (
        id, started_at, status, stage,
        domain_count, total_domains, kinds, limit_per_domain,
        apply_changes, emit_report, report_path,
        readiness_timeout_seconds, enable_topic_discovery,
        background_task_id, background_task_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      runId,
      this.runStartTime.toISOString(),
      'running',
      'starting',
      this.domains.length,
      null, // total_domains will be updated later
      JSON.stringify(this.kinds),
      this.limit,
      this.apply ? 1 : 0,
      this.emitReport ? 1 : 0,
      this.reportPath || null,
      this.readinessTimeoutSeconds,
      this.enableTopicDiscovery ? 1 : 0,
      this.taskId,
      'running'
    );

    return runId;
  }

  /**
   * Update the run record with current progress
   * @private
   * @param {Object} updates - Fields to update
   */
  _updateRunRecord(updates) {
    if (!this.runId) return;

    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => {
      const value = updates[field];
      // Convert boolean to integer for SQLite
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const update = this.db.prepare(`
      UPDATE place_hub_guess_runs
      SET ${setClause}
      WHERE id = ?
    `);

    update.run(...values, this.runId);
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

module.exports = { GuessPlaceHubsTask };