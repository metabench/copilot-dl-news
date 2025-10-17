'use strict';

const { PlannerOrchestrator } = require('../planner/PlannerOrchestrator');
const { PlannerTelemetryBridge } = require('../planner/PlannerTelemetryBridge');
const { PlannerHost } = require('../../planner/PlannerHost');
const { GazetteerReasonerPlugin } = require('../../planner/plugins/GazetteerReasonerPlugin');
const { MetaPlanCoordinator } = require('../../planner/meta/MetaPlanCoordinator');

/**
 * GazetteerPlanRunner provides planning capabilities for geography/gazetteer data ingestion.
 * 
 * Unlike IntelligentPlanRunner (designed for web crawling with URLs), GazetteerPlanRunner
 * focuses on planning geographic data fetches from structured sources (Wikidata, OSM, etc.).
 * 
 * Planning capabilities:
 * - Stage ordering and dependencies (e.g., countries before administrative divisions)
 * - Data source priority (primary sources vs fallbacks)
 * - Batch sizing and rate limiting
 * - Cache utilization vs fresh fetches
 * - Incremental updates vs full refreshes
 * 
 * Mode support:
 * - Basic mode: Uses PlannerOrchestrator for telemetry + simple heuristics
 * - Advanced mode (future): Could integrate with PlannerHost for meta-planning
 */
class GazetteerPlanRunner {
  constructor({
    telemetry,
    logger = console,
    config = {},
    useAdvancedPlanning = false,
    dbAdapter = null
  } = {}) {
    this.logger = logger;
    this.config = config;
    this.useAdvancedPlanning = !!useAdvancedPlanning;
    this.dbAdapter = dbAdapter;
    this.telemetry = telemetry;
    
    // Create telemetry bridge for planner events
    const telemetryBridge = telemetry
      ? new PlannerTelemetryBridge({ telemetry })
      : new PlannerTelemetryBridge({ telemetry: null });
    
    // PlannerOrchestrator wraps stage execution with telemetry
    this.orchestrator = new PlannerOrchestrator({
      telemetryBridge,
      logger,
      enabled: true
    });
    
    // Initialize PlannerHost for advanced planning (GOFAI meta-planning)
    if (this.useAdvancedPlanning) {
      this.plannerHost = this._createPlannerHost();
      this.metaCoordinator = new MetaPlanCoordinator({
        logger,
        dbAdapter: this.dbAdapter
      });
      this.logger.info('[GazetteerPlanRunner] Advanced planning enabled: PlannerHost + MetaPlanCoordinator initialized');
    } else {
      this.plannerHost = null;
      this.metaCoordinator = null;
    }
    
    this._summaryData = {
      stages: {},
      totalDurationMs: 0,
      totalStages: 0,
      metaPlanResults: null
    };
  }

  /**
   * Wraps stage execution with planning telemetry and optional optimization.
   * 
   * For basic planning:
   * - Emits start/complete/failed events via PlannerOrchestrator
   * - Tracks stage-level metrics
   * - No sophisticated optimization (just telemetry)
   * 
   * For advanced planning (future):
   * - Could analyze data source availability before execution
   * - Could optimize batch sizes based on rate limits
   * - Could decide cache vs fresh fetch strategies
   * - Could reorder stages based on dependencies
   * 
   * @param {string} stageName - Name of the stage (e.g., 'countries', 'adm1', 'boundaries')
   * @param {object} contextDetails - Context about the stage (ingestor count, data source, etc.)
   * @param {function} fn - Core stage execution function
   * @param {object} options - Options for result mapping and summary updates
   * @returns {Promise<any>} - Result from stage execution
   */
  async runStage(stageName, contextDetails, fn, options = {}) {
    if (typeof fn !== 'function') {
      throw new Error('GazetteerPlanRunner.runStage() requires a function');
    }

    // Use orchestrator for telemetry + execution
    const result = await this.orchestrator.runStage(stageName, contextDetails, fn, options);
    
    // Track stage completion in summary
    if (!this._summaryData.stages[stageName]) {
      this._summaryData.stages[stageName] = {
        attempts: 0,
        completions: 0,
        failures: 0
      };
    }
    this._summaryData.stages[stageName].attempts += 1;
    this._summaryData.stages[stageName].completions += 1;
    
    return result;
  }

  /**
   * Builds a summary of all planning/execution activity.
   * 
   * @param {object} initialSummary - Initial summary data from caller
   * @returns {object} - Planning summary with stage metrics
   */
  buildSummary(initialSummary = {}) {
    const orchestratorSummary = this.orchestrator.buildSummary(initialSummary);
    
    return {
      ...orchestratorSummary,
      mode: this.useAdvancedPlanning ? 'advanced' : 'basic',
      stages: this._summaryData.stages,
      totalStages: Object.keys(this._summaryData.stages).length
    };
  }

  /**
   * Enables or disables planning.
   * When disabled, stages still execute but without planning telemetry.
   * 
   * @param {boolean} enabled - Whether planning is enabled
   */
  setEnabled(enabled) {
    this.orchestrator.setEnabled(!!enabled);
  }

  /**
   * Registers a summary reducer function.
   * Reducers transform the planning summary (e.g., add computed metrics).
   * 
   * @param {function} reducer - Reducer function (summary) => transformedSummary
   */
  registerSummaryReducer(reducer) {
    this.orchestrator.registerSummaryReducer(reducer);
  }

  /**
   * Create PlannerHost with gazetteer-specific plugins.
   * Used in advanced planning mode for meta-planning coordination.
   * 
   * @private
   * @returns {PlannerHost}
   */
  _createPlannerHost() {
    const plugins = [
      new GazetteerReasonerPlugin({ priority: 85 })
    ];

    const emit = (type, data) => {
      if (this.telemetry) {
        this.telemetry.plannerStage({ type, ...data });
      }
    };

    return new PlannerHost({
      plugins,
      options: this.config || {},
      emit,
      fetchPage: null, // Gazetteer doesn't fetch pages
      dbAdapter: this.dbAdapter,
      logger: this.logger,
      budgetMs: 3500,
      preview: false
    });
  }

  /**
   * Run meta-planning analysis before stage execution.
   * Uses PlannerHost (GOFAI reasoning) + MetaPlanCoordinator (validation/evaluation).
   * 
   * @param {Array} stages - Stage definitions to analyze
   * @returns {Promise<Object>} Meta-plan results with prioritization recommendations
   */
  async runMetaPlanning(stages = []) {
    if (!this.useAdvancedPlanning || !this.plannerHost || !this.metaCoordinator) {
      this.logger.info('[GazetteerPlanRunner] Advanced planning disabled, skipping meta-planning');
      return null;
    }

    try {
      this.logger.info('[GazetteerPlanRunner] Running meta-planning analysis...');
      
      // Phase 1: Run PlannerHost to generate proposals
      const hostResult = await this.plannerHost.run();
      
      if (!hostResult || !hostResult.blackboard) {
        this.logger.warn('[GazetteerPlanRunner] PlannerHost returned empty result');
        return null;
      }

      // Build blueprint from PlannerHost output
      const blueprint = {
        proposedHubs: hostResult.blackboard.proposedHubs || [],
        gapAnalysis: hostResult.blackboard.gapAnalysis || {},
        stageOrdering: hostResult.blackboard.stageOrdering || [],
        rationale: hostResult.blackboard.rationale || [],
        gazetteerState: hostResult.blackboard.gazetteerState || {}
      };

      this.logger.info('[GazetteerPlanRunner] PlannerHost proposed:', {
        hubsCount: blueprint.proposedHubs.length,
        stagesCount: blueprint.stageOrdering.length
      });

      // Phase 2: Run MetaPlanCoordinator for validation/evaluation
      const metaResult = await this.metaCoordinator.process({
        blueprint,
        context: {
          options: { jobId: 'gazetteer-meta-plan' },
          history: {},
          telemetry: {}
        },
        alternativePlans: [] // No alternatives for gazetteer planning yet
      });

      if (metaResult) {
        this.logger.info('[GazetteerPlanRunner] Meta-planning complete:', {
          validatorResult: metaResult.validatorResult?.valid,
          decision: metaResult.decision?.verdict
        });
      }

      // Store results for summary
      this._summaryData.metaPlanResults = {
        blueprint,
        metaResult,
        hostElapsedMs: hostResult.elapsedMs
      };

      return {
        blueprint,
        metaResult,
        proposedPriorities: this._extractPriorities(blueprint)
      };
    } catch (err) {
      this.logger.error('[GazetteerPlanRunner] Meta-planning failed:', err.message);
      return null;
    }
  }

  /**
   * Extract priority recommendations from meta-planning blueprint.
   * @private
   */
  _extractPriorities(blueprint) {
    const priorities = {};
    
    if (blueprint.proposedHubs) {
      for (const hub of blueprint.proposedHubs) {
        if (hub.type && hub.priority) {
          priorities[hub.type] = hub.priority;
        }
      }
    }

    if (blueprint.stageOrdering) {
      for (const stage of blueprint.stageOrdering) {
        if (stage.name && stage.priority) {
          priorities[stage.name] = stage.priority;
        }
      }
    }

    return priorities;
  }
}

module.exports = {
  GazetteerPlanRunner
};
