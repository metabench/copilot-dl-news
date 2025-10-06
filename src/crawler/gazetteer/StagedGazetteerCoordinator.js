'use strict';

const { is_array } = require('lang-tools');
const { GazetteerPriorityScheduler, DEFAULT_STAGE_DEFS } = require('./GazetteerPriorityScheduler');

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
 */
class StagedGazetteerCoordinator {
  constructor({
    db,
    stages = [],
    telemetry = null,
    logger = console
  } = {}) {
    if (!db) {
      throw new Error('StagedGazetteerCoordinator requires a database handle');
    }
    this.db = db;
    this.logger = logger;
    this.telemetry = telemetry;

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

    const overallTotals = {
      stagesAttempted: 0,
      stagesCompleted: 0,
      ingestorsAttempted: 0,
      ingestorsCompleted: 0,
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0
    };

    // Execute stages sequentially (breadth-first enforcement)
    for (const stage of this._stages) {
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

      // Initialize stage in scheduler
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
        // Run all ingestors for this stage
  for (const ingestor of stage.ingestors) {
          if (signal?.aborted) {
            throw new Error('Aborted during stage execution');
          }

          const ingestorId = ingestor.id || ingestor.name || 'anonymous';
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
                
                // Update scheduler progress
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
            this._emitProgress(onProgress, {
              phase: 'ingestor-error',
              stage: stageName,
              ingestor: ingestorId,
              error: ingestorError?.message || String(ingestorError)
            });

            // Continue with other ingestors in this stage
          }
        }

        // Mark stage complete
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

        this.logger.info(`[StagedGazetteerCoordinator] Stage '${stageName}' complete:`, stageTotals);
        this._emitProgress(onProgress, {
          phase: 'stage-complete',
          stage: stageName,
          durationMs: stageResult.durationMs,
          totals: stageTotals
        });

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

        // Stop processing further stages on error
        throw stageError;
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

    this._lastSummary = summary;
    this._emitProgress(onProgress, {
      phase: 'complete',
      summary
    });

    this.logger.info('[StagedGazetteerCoordinator] All stages complete:', overallTotals);
    return summary;
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

  _syncSchedulerStages() {
    this.scheduler.replaceStages(deriveSchedulerStages(this._stages));
  }
}

module.exports = { StagedGazetteerCoordinator };
