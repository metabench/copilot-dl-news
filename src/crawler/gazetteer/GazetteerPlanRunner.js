'use strict';

const { PlannerOrchestrator } = require('../planner/PlannerOrchestrator');
const { PlannerTelemetryBridge } = require('../planner/PlannerTelemetryBridge');

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
    useAdvancedPlanning = false
  } = {}) {
    this.logger = logger;
    this.config = config;
    this.useAdvancedPlanning = !!useAdvancedPlanning;
    
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
    
    this._summaryData = {
      stages: {},
      totalDurationMs: 0,
      totalStages: 0
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
}

module.exports = {
  GazetteerPlanRunner
};
