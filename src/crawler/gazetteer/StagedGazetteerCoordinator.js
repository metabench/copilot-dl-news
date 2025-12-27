'use strict';

const { is_array } = require('lang-tools');
const { GazetteerPriorityScheduler, DEFAULT_STAGE_DEFS } = require('./GazetteerPriorityScheduler');
const { createProgressTreeEvent } = require('../telemetry/CrawlTelemetrySchema');

function normalizeStageConfig(stage, index = 0) {
  if (!stage || !stage.name) {
    return null;
  }
  const ingestors = is_array(stage.ingestors)
    ? stage.ingestors.slice()
    : (stage.ingestors ? [stage.ingestors] : []);
  const fallback = DEFAULT_STAGE_DEFS.find((entry) => entry.name === stage.name) || {};

  return {
    name: stage.name,
    ingestors,
    priority: Number.isFinite(stage.priority) ? stage.priority : fallback.priority,
    crawlDepth: Number.isFinite(stage.crawlDepth) ? stage.crawlDepth : (Number.isFinite(fallback.crawlDepth) ? fallback.crawlDepth : index),
    kind: stage.kind || fallback.kind || 'place'
  };
}

function deriveSchedulerStages(stageConfigs) {
  return stageConfigs
    .map((stage, index) => normalizeStageConfig(stage, index))
    .filter(Boolean)
    .map(({ name, priority, crawlDepth, kind }) => ({ name, priority, crawlDepth, kind }));
}

/**
 * StagedGazetteerCoordinator
 * 
 * Orchestrates breadth-first gazetteer ingestion by running ingestors in stages.
 * Uses GazetteerPriorityScheduler to track progress and enforce stage completion
 * before proceeding to next stage.
 * 
 * Stages:
 * 1. countries - All countries globally
 * 2. adm1 - First-level administrative divisions
 * 3. adm2 - Second-level administrative divisions  
 * 4. cities - Major cities
 * 
 * CONCURRENCY: Stages and ingestors are processed SEQUENTIALLY. The crawler's
 * concurrency setting is treated as a maximum allowed limit but is NOT used for
 * parallelization by default. Each stage completes before the next begins, and
 * within each stage, ingestors run one at a time. This design accommodates:
 * - External API rate limits (Wikidata SPARQL, Overpass API)
 * - Database transaction dependencies (parent → child relationships)
 * - Data consistency requirements (all countries before any regions)
 */
class StagedGazetteerCoordinator {
  constructor({
    db,
    stages = [],
    telemetry = null,
    logger = console,
    planner = null
  } = {}) {
    if (!db) {
      throw new Error('StagedGazetteerCoordinator requires a database handle');
    }
    this.db = db;
  this.logger = logger;
  this.telemetry = telemetry;
  this.planner = planner && typeof planner.runStage === 'function' ? planner : null;

    const initialStages = is_array(stages) ? stages.slice() : [];
    const normalizedStages = initialStages
      .map((stage, index) => normalizeStageConfig(stage, index))
      .filter(Boolean);

    // Initialize priority scheduler with provided stage definitions
    this.scheduler = new GazetteerPriorityScheduler({
      db,
      logger,
      stages: deriveSchedulerStages(normalizedStages)
    });

    // Stages configuration: { name, ingestors[], priority?, crawlDepth?, kind? }
    this._stages = normalizedStages;
    this._lastSummary = null;
    this._lastPlanSummary = null;

    // Progress-tree emission state (used to build nested progress bars)
    // Keyed by `${stage}:${ingestorId}`.
    this._progressTreeStateByKey = new Map();
  }

  registerStage(stageName, ingestors = [], stageOptions = {}) {
    const config = normalizeStageConfig({
      name: stageName,
      ingestors,
      ...stageOptions
    }, this._stages.length);
    if (!config) {
      return;
    }
    this._stages.push(config);
    this._syncSchedulerStages();
  }

  getStages() {
    return this._stages.map(s => ({ name: s.name, ingestorCount: s.ingestors.length }));
  }

  getLastSummary() {
    return this._lastSummary;
  }

  async execute({ signal = null, onProgress = null } = {}) {
    const startedAt = Date.now();
    const stageResults = [];

    this._emitProgress(onProgress, {
      phase: 'start',
      startedAt,
      totalStages: this._stages.length,
      stages: this.getStages()
    });

    // Run meta-planning analysis before stage execution (if advanced planning enabled)
    let metaPlanResults = null;
    if (this.planner && typeof this.planner.runMetaPlanning === 'function') {
      try {
        this.logger.info('[StagedGazetteerCoordinator] Running meta-planning analysis...');
        metaPlanResults = await this.planner.runMetaPlanning(this._stages);
        
        if (metaPlanResults && metaPlanResults.proposedPriorities) {
          this.logger.info('[StagedGazetteerCoordinator] Meta-planning priorities:', metaPlanResults.proposedPriorities);
          
          // Apply priority recommendations to stages
          this._applyMetaPlanPriorities(metaPlanResults.proposedPriorities);
        }
      } catch (err) {
        this.logger.error('[StagedGazetteerCoordinator] Meta-planning failed:', err.message);
        // Continue with default priorities
      }
    }

    const overallTotals = {
      stagesAttempted: 0,
      stagesCompleted: 0,
      ingestorsAttempted: 0,
      ingestorsCompleted: 0,
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0,
      metaPlanResults
    };

    // Execute stages sequentially (breadth-first enforcement)
    for (const stage of this._stages) {
      const runStageCore = () => this._processStage({
        stage,
        signal,
        onProgress,
        overallTotals,
        stageResults
      });

      const plannerStageName = `gazetteer:${stage.name}`;
      const plannerContext = this._plannerStageContext(stage);

      if (this.planner) {
        await this.planner.runStage(
          plannerStageName,
          plannerContext,
          runStageCore,
          {
            mapResultForEvent: (result) => this._plannerResultSnapshot(stage, result),
            updateSummaryWithResult: (summary, result) => this._accumulatePlannerSummary(summary, stage, result)
          }
        );
      } else {
        await runStageCore();
      }
    }

    const finishedAt = Date.now();
    const summary = {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      stages: stageResults,
      totals: overallTotals,
      overallProgress: this.scheduler.getOverallProgress()
    };

    if (this.planner) {
      const planSummary = this.planner.buildSummary({
        totalStages: this._stages.length,
        startedAt,
        finishedAt
      });
      if (planSummary && Object.keys(planSummary).length) {
        summary.plan = planSummary;
        this._lastPlanSummary = planSummary;
      }
    }

    this._lastSummary = summary;
    this._emitProgress(onProgress, {
      phase: 'complete',
      summary
    });

    this.logger.info('[StagedGazetteerCoordinator] All stages complete:', overallTotals);
    return summary;
  }

  getPlannerSummary() {
    if (this._lastPlanSummary) {
      return this._lastPlanSummary;
    }
    if (!this.planner) {
      return null;
    }
    return this.planner.buildSummary({ totalStages: this._stages.length }) || null;
  }

  async _processStage({ stage, signal, onProgress, overallTotals, stageResults }) {
    if (signal?.aborted) {
      const abortErr = new Error('Staged gazetteer ingestion aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const stageName = stage.name;
    overallTotals.stagesAttempted += 1;

    this.logger.info(`[StagedGazetteerCoordinator] Starting stage: ${stageName}`);
    this._emitProgress(onProgress, {
      phase: 'stage-start',
      stage: stageName,
      ingestorCount: stage.ingestors.length
    });

    this.scheduler.initStage(stageName, stage.recordsTotal || 0);

    const stageStartedAt = Date.now();
    const stageTotals = {
      ingestorsAttempted: 0,
      ingestorsCompleted: 0,
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0
    };

    try {
      for (const ingestor of stage.ingestors) {
        if (signal?.aborted) {
          throw new Error('Aborted during stage execution');
        }

        const ingestorId = ingestor.id || ingestor.name || 'anonymous';
        const ingestorClassName = ingestor.constructor.name;
        stageTotals.ingestorsAttempted += 1;
        overallTotals.ingestorsAttempted += 1;
        
        this._emitProgress(onProgress, {
          phase: 'ingestor-start',
          stage: stageName,
          ingestor: ingestorId
        });

        const ingestorStartedAt = Date.now();
        let result = null;

        try {
          result = await ingestor.execute({
            signal,
            emitProgress: (payload = {}) => {
              this._emitProgress(onProgress, {
                phase: 'ingestor-progress',
                stage: stageName,
                ingestor: ingestorId,
                payload
              });

              this._maybeEmitProgressTreeTelemetry({
                stage: stageName,
                ingestor: ingestorId,
                payload
              });

              if (payload.recordsProcessed != null || payload.recordsUpserted != null || payload.errors != null) {
                this.scheduler.updateStageProgress(stageName, {
                  recordsProcessed: payload.recordsProcessed != null ? payload.recordsProcessed : undefined,
                  recordsUpserted: payload.recordsUpserted != null ? payload.recordsUpserted : undefined,
                  errors: payload.errors != null ? payload.errors : undefined
                });
              }
            }
          }) || {};

          stageTotals.ingestorsCompleted += 1;
          overallTotals.ingestorsCompleted += 1;

          if (Number.isFinite(result.recordsProcessed)) {
            stageTotals.recordsProcessed += result.recordsProcessed;
            overallTotals.recordsProcessed += result.recordsProcessed;
          }
          if (Number.isFinite(result.recordsUpserted)) {
            stageTotals.recordsUpserted += result.recordsUpserted;
            overallTotals.recordsUpserted += result.recordsUpserted;
          }
          if (Number.isFinite(result.errors)) {
            stageTotals.errors += result.errors;
            overallTotals.errors += result.errors;
          }

          const ingestorFinishedAt = Date.now();
          this._emitProgress(onProgress, {
            phase: 'ingestor-complete',
            stage: stageName,
            ingestor: ingestorId,
            durationMs: ingestorFinishedAt - ingestorStartedAt,
            result: this._sanitizeSummary(result)
          });

        } catch (ingestorError) {
          stageTotals.errors += 1;
          overallTotals.errors += 1;

          this.logger.error(`[StagedGazetteerCoordinator] Ingestor '${ingestorId}' failed:`, ingestorError.message);
          
          // Emit telemetry for visibility
          if (this.telemetry) {
            try {
              this.telemetry.problem({
                kind: 'ingestor-failed',
                scope: `${stageName}:${ingestorId}`,
                message: `Ingestor failed: ${ingestorError.message}`,
                details: {
                  stage: stageName,
                  ingestor: ingestorId,
                  error: ingestorError.message,
                  stack: ingestorError.stack
                }
              });
            } catch (_) {}
          }
          
          this._emitProgress(onProgress, {
            phase: 'ingestor-error',
            stage: stageName,
            ingestor: ingestorId,
            error: ingestorError?.message || String(ingestorError)
          });
          
          // Re-throw if this is a critical stage (countries)
          if (stageName === 'countries') {
            throw ingestorError;
          }
        }
      }

      const stageFinishedAt = Date.now();
      this.scheduler.markStageComplete(stageName);
      overallTotals.stagesCompleted += 1;

      const stageResult = {
        stage: stageName,
        startedAt: stageStartedAt,
        finishedAt: stageFinishedAt,
        durationMs: stageFinishedAt - stageStartedAt,
        totals: stageTotals
      };
      stageResults.push(stageResult);

      this.logger.info(`[StagedGazetteerCoordinator] Stage '${stageName}' complete: ${JSON.stringify(stageTotals)}`);
      this._emitProgress(onProgress, {
        phase: 'stage-complete',
        stage: stageName,
        durationMs: stageResult.durationMs,
        totals: stageTotals
      });

      return stageResult;
    } catch (stageError) {
      this.logger.error(`[StagedGazetteerCoordinator] Stage '${stageName}' failed:`, stageError.message);
      this.scheduler.markStageFailed(stageName, stageError.message);

      const stageResult = {
        stage: stageName,
        startedAt: stageStartedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - stageStartedAt,
        totals: stageTotals,
        error: stageError.message
      };
      stageResults.push(stageResult);

      this._emitProgress(onProgress, {
        phase: 'stage-error',
        stage: stageName,
        error: stageError.message
      });

      throw stageError;
    }
  }

  _plannerStageContext(stage) {
    if (!stage) return null;
    return {
      priority: stage.priority,
      crawlDepth: stage.crawlDepth,
      kind: stage.kind,
      ingestors: stage.ingestors.map((ingestor) => ({
        id: ingestor.id || ingestor.name || 'anonymous',
        name: ingestor.name || ingestor.id || 'Ingestor'
      }))
    };
  }

  _plannerResultSnapshot(stage, stageResult) {
    if (!stageResult) return null;
    const totals = stageResult.totals || {};
    return {
      stage: stage.name,
      status: stageResult.error ? 'failed' : 'completed',
      durationMs: stageResult.durationMs,
      ingestorsCompleted: totals.ingestorsCompleted,
      ingestorsAttempted: totals.ingestorsAttempted,
      recordsProcessed: totals.recordsProcessed,
      recordsUpserted: totals.recordsUpserted,
      errors: totals.errors
    };
  }

  _accumulatePlannerSummary(summary, stage, stageResult) {
    const base = summary && typeof summary === 'object' ? { ...summary } : {};
    const stages = Array.isArray(base.stages) ? base.stages.slice() : [];
    const totals = stageResult?.totals || {};
    stages.push({
      stage: stage?.name,
      status: stageResult?.error ? 'failed' : 'completed',
      durationMs: stageResult?.durationMs || null,
      totals: {
        recordsProcessed: totals.recordsProcessed || 0,
        recordsUpserted: totals.recordsUpserted || 0,
        errors: totals.errors || 0
      }
    });
    base.stages = stages;
    base.completedStages = (base.completedStages || 0) + (stageResult?.error ? 0 : 1);
    base.failedStages = (base.failedStages || 0) + (stageResult?.error ? 1 : 0);
    base.recordsUpserted = (base.recordsUpserted || 0) + (totals.recordsUpserted || 0);
    base.recordsProcessed = (base.recordsProcessed || 0) + (totals.recordsProcessed || 0);
    base.totalStages = this._stages.length;
    return base;
  }

  _sanitizeSummary(summary) {
    if (!summary || typeof summary !== 'object') {
      return null;
    }
    const output = {};
    if (Number.isFinite(summary.recordsProcessed)) {
      output.recordsProcessed = summary.recordsProcessed;
    }
    if (Number.isFinite(summary.recordsUpserted)) {
      output.recordsUpserted = summary.recordsUpserted;
    }
    if (Number.isFinite(summary.errors)) {
      output.errors = summary.errors;
    }
    if (summary.notes != null) {
      output.notes = summary.notes;
    }
    return Object.keys(output).length ? output : null;
  }

  _emitProgress(handler, payload) {
    if (typeof handler !== 'function' || !payload) {
      return;
    }
    try {
      handler({
        ...payload,
        emittedAt: Date.now()
      });
    } catch (_) {
      // Best effort only
    }
  }

  _maybeEmitProgressTreeTelemetry({ stage, ingestor, payload }) {
    const telemetryEvents = this.telemetry?.events;
    if (!telemetryEvents || typeof telemetryEvents.emitEvent !== 'function') {
      return;
    }

    // Current use-case: countries → cities nested progress.
    // We scope this to the Wikidata cities ingestor to avoid flooding.
    if (ingestor !== 'wikidata-cities') {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const key = `${stage}:${ingestor}`;
    let state = this._progressTreeStateByKey.get(key);
    if (!state) {
      state = {
        lastEmitAt: 0,
        totalCountries: null,
        maxCitiesPerCountry: null,
        minPopulation: null,
        lastCountryCode: null,
        countryOrder: [],
        countryNodesById: new Map()
      };
      this._progressTreeStateByKey.set(key, state);
    }

    // Throttle to keep the telemetry stream light.
    const now = Date.now();
    const minIntervalMs = 250;
    if (payload.phase === 'processing' && (now - state.lastEmitAt) < minIntervalMs) {
      return;
    }

    if (payload.phase === 'discovery') {
      state.totalCountries = Number.isFinite(payload.totalCountries) ? payload.totalCountries : null;
      state.maxCitiesPerCountry = Number.isFinite(payload.maxCitiesPerCountry) ? payload.maxCitiesPerCountry : null;
      state.minPopulation = Number.isFinite(payload.minPopulation) ? payload.minPopulation : null;
      state.lastCountryCode = null;
      state.countryOrder = [];
      state.countryNodesById = new Map();
    }

    const rootId = `${ingestor}`;
    const rootLabel = stage ? `Wikidata Cities (${stage})` : 'Wikidata Cities';

    let rootCurrent = null;
    let rootTotal = null;
    let activeCountryCode = null;
    let activeCountryProcessed = null;

    if (payload.phase === 'processing') {
      rootCurrent = Number.isFinite(payload.current) ? payload.current : null;
      rootTotal = Number.isFinite(payload.totalItems) ? payload.totalItems : (Number.isFinite(state.totalCountries) ? state.totalCountries : null);
      activeCountryCode = payload.countryCode ? String(payload.countryCode).toLowerCase() : null;
      activeCountryProcessed = Number.isFinite(payload.citiesProcessed) ? payload.citiesProcessed : null;

      if (state.lastCountryCode && activeCountryCode && state.lastCountryCode !== activeCountryCode) {
        const lastId = `country:${state.lastCountryCode}`;
        const lastNode = state.countryNodesById.get(lastId);
        if (lastNode) {
          lastNode.status = 'done';
          // Prefer showing a "full" bar on completed nodes.
          if (lastNode.total != null) {
            lastNode.current = lastNode.total;
          }
        }
      }
      if (activeCountryCode) {
        const countryId = `country:${activeCountryCode}`;
        let node = state.countryNodesById.get(countryId);
        if (!node) {
          node = {
            id: countryId,
            label: activeCountryCode.toUpperCase(),
            current: null,
            total: null,
            unit: 'cities',
            status: 'running'
          };
          state.countryNodesById.set(countryId, node);
          state.countryOrder.push(countryId);
        }
        node.status = 'running';
        node.current = activeCountryProcessed;
        node.total = Number.isFinite(state.maxCitiesPerCountry) ? state.maxCitiesPerCountry : null;

        state.lastCountryCode = activeCountryCode;
      }
    } else if (payload.phase === 'discovery') {
      rootCurrent = 0;
      rootTotal = Number.isFinite(state.totalCountries) ? state.totalCountries : null;
    } else if (payload.phase === 'complete') {
      rootCurrent = Number.isFinite(state.totalCountries) ? state.totalCountries : null;
      rootTotal = Number.isFinite(state.totalCountries) ? state.totalCountries : null;
      if (state.lastCountryCode) {
        const lastId = `country:${state.lastCountryCode}`;
        const lastNode = state.countryNodesById.get(lastId);
        if (lastNode) {
          lastNode.status = 'done';
          if (lastNode.total != null) {
            lastNode.current = lastNode.total;
          }
        }
      }
    }

    // Keep the payload bounded: last N countries + current.
    const maxCountryNodes = 80;
    const keepIds = state.countryOrder.slice(-maxCountryNodes);
    const children = [];
    for (const countryId of keepIds) {
      const node = state.countryNodesById.get(countryId);
      if (node) children.push(node);
    }

    const tree = {
      root: {
        id: rootId,
        label: rootLabel,
        current: rootCurrent,
        total: rootTotal,
        unit: 'countries',
        status: payload.phase === 'complete' ? 'done' : 'running',
        children
      },
      activePath: activeCountryCode
        ? [rootId, `country:${activeCountryCode}`]
        : [rootId]
    };

    const completed = payload.phase === 'complete';
    const message = completed
      ? 'Wikidata cities ingestion completed'
      : (payload.message || 'Wikidata cities ingestion progress');

    telemetryEvents.emitEvent(createProgressTreeEvent(tree, {
      completed,
      message,
      source: 'StagedGazetteerCoordinator'
    }));
    state.lastEmitAt = now;
  }

  _syncSchedulerStages() {
    this.scheduler.replaceStages(deriveSchedulerStages(this._stages));
  }

  /**
   * Apply meta-planning priority recommendations to stages.
   * Updates stage priority scores based on planner analysis.
   * 
   * @param {Object} proposedPriorities - Map of stage names to priority scores
   * @private
   */
  _applyMetaPlanPriorities(proposedPriorities) {
    if (!proposedPriorities || typeof proposedPriorities !== 'object') {
      return;
    }

    for (const stage of this._stages) {
      const stageName = stage.name;
      if (proposedPriorities[stageName] !== undefined) {
        const oldPriority = stage.priority;
        stage.priority = proposedPriorities[stageName];
        this.logger.info(`[StagedGazetteerCoordinator] Updated stage '${stageName}' priority: ${oldPriority} → ${stage.priority}`);
      }
    }

    // Re-sort stages by new priorities (descending)
    this._stages.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.logger.info('[StagedGazetteerCoordinator] Stages reordered by meta-plan priorities:', 
      this._stages.map(s => `${s.name}(${s.priority})`).join(', '));
  }
}

module.exports = { StagedGazetteerCoordinator };
