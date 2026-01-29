/**
 * IntelligentPlanningFacade
 * 
 * Facade that switches between legacy planning system and APS (Advanced Planning Suite).
 * Provides a unified interface regardless of which planning backend is active.
 * 
 * Architecture:
 * - Legacy System: src/crawler/planner/ (orchestrator-based, pattern inference)
 * - APS: src/planner/ (PlannerHost, plugins, GOFAI reasoning)
 * 
 * Configuration:
 * - advancedPlanningSuite: true/false (feature flag)
 * - gazetteerAwareReasoner: true/false (APS only - country hub predictions)
 * 
 * TODO (future refactoring):
 * - Consolidate legacy planner into single directory with modular structure
 * - Extract shared utilities between legacy and APS
 * - Consider deprecation timeline for legacy system
 */

const { createPlannerHost } = require('../../intelligence/planner/register');

class IntelligentPlanningFacade {
  constructor({
    useAPS = false,
    telemetry,
    domain,
    baseUrl,
    startUrl,
    fetchPage,
    getCachedArticle,
    dbAdapter,
    plannerKnowledgeService,
    countryHubGapService,
    enqueueRequest,
    normalizeUrl,
    state,
    intMaxSeeds = 50,
    logger = console,
    // Legacy planner constructors
    PlannerTelemetryBridge,
    PlannerOrchestrator,
    PlannerBootstrap,
    PatternInference,
    CountryHubPlanner,
    HubSeeder,
    TargetedAnalysisRunner,
    NavigationDiscoveryRunner,
    enableTargetedAnalysis = true,
    plannerEnabled = true,
    plannerVerbosity = 0,
    intTargetHosts = null
  } = {}) {
    this.useAPS = useAPS;
    this.telemetry = telemetry;
    this.domain = domain;
    this.baseUrl = baseUrl;
    this.startUrl = startUrl;
    this.fetchPage = fetchPage;
    this.getCachedArticle = getCachedArticle;
    this.dbAdapter = dbAdapter;
    this.plannerKnowledgeService = plannerKnowledgeService;
    this.countryHubGapService = countryHubGapService;
    this.enqueueRequest = enqueueRequest;
    this.normalizeUrl = normalizeUrl;
    this.state = state;
    this.intMaxSeeds = intMaxSeeds;
    this.logger = logger;
    
    // Legacy planner dependencies
    this.PlannerTelemetryBridge = PlannerTelemetryBridge;
    this.PlannerOrchestrator = PlannerOrchestrator;
    this.PlannerBootstrap = PlannerBootstrap;
    this.PatternInference = PatternInference;
    this.CountryHubPlanner = CountryHubPlanner;
    this.HubSeeder = HubSeeder;
    this.TargetedAnalysisRunner = TargetedAnalysisRunner;
    this.NavigationDiscoveryRunner = NavigationDiscoveryRunner;
    this.enableTargetedAnalysis = enableTargetedAnalysis;
    this.plannerEnabled = plannerEnabled;
    this.plannerVerbosity = plannerVerbosity;
    this.intTargetHosts = intTargetHosts;
    
    // Initialize appropriate backend
    if (this.useAPS) {
      this._initializeAPS();
    } else {
      this._initializeLegacy();
    }
  }

  /**
   * Initialize APS (Advanced Planning Suite)
   * Uses PlannerHost with plugin architecture and GOFAI reasoning
   */
  _initializeAPS() {
    this.logger.log?.('[IntelligentPlanning] Using APS (Advanced Planning Suite)');
    
    // Create PlannerHost with gazetteer-aware reasoning
    this.plannerHost = createPlannerHost({
      dbAdapter: this.dbAdapter,
      logger: this.logger,
      useGazetteerAwareness: true,
      countryHubGapService: this.countryHubGapService,
      useGraphReasoner: true,
      useQueryCostEstimator: true
    });
    
    this.backend = 'aps';
  }

  /**
   * Initialize legacy planning system
   * Uses orchestrator-based approach with pattern inference
   */
  _initializeLegacy() {
    this.logger.log?.('[IntelligentPlanning] Using legacy planning system');
    
    // Legacy planner components will be initialized on-demand
    // by IntelligentPlanRunner (existing code)
    this.backend = 'legacy';
  }

  /**
   * Run intelligent planning for a crawl
   * Delegates to appropriate backend
   */
  async runPlanning(options = {}) {
    if (this.useAPS) {
      return await this._runAPSPlanning(options);
    } else {
      return await this._runLegacyPlanning(options);
    }
  }

  /**
   * APS planning workflow
   * Focus on country hub coverage as priority
   */
  async _runAPSPlanning(options = {}) {
    const startTime = Date.now();

    this.logger.log?.('[APS] Starting country hub prioritization planning');

    try {
      // Phase 1: Country Hub Discovery (PRIORITY FOCUS)
      this.logger.log?.('[APS] 🔍 Discovering and prioritizing country hubs...');
      const countryHubResult = await this._apsCountryHubPhase();

      // Phase 2: Pattern inference and hub seeding
      this.logger.log?.('[APS] 📊 Building hub discovery patterns...');
      const patternResult = await this._apsPatternPhase(countryHubResult);

      // Phase 3: Generate final plan
      this.logger.log?.('[APS] 🎯 Finalizing country hub prioritization plan...');
      const plan = await this._apsBuildPlan(countryHubResult, patternResult);

      const elapsed = Date.now() - startTime;
      this.logger.log?.(`[APS] Country hub prioritization complete in ${elapsed}ms`);

      return {
        backend: 'aps',
        countryHubCoverage: countryHubResult,
        patterns: patternResult,
        plan,
        elapsedMs: elapsed
      };
    } catch (error) {
      this.logger.error?.('[APS] Country hub planning failed:', error.message);
      this.logger.error?.(error.stack);
      throw error;
    }
  }

  /**
   * APS Phase 1: Country Hub Discovery
   * Uses GazetteerAwareReasonerPlugin to ensure all country hubs are found
   */
  async _apsCountryHubPhase() {
    this.logger.log?.('[APS] 🌍 Evaluating country hub coverage...');

    if (!this.countryHubGapService) {
      this.logger.warn?.('[APS] No countryHubGapService available, skipping country hub phase');
      return {
        complete: false,
        found: 0,
        total: 0,
        message: 'Country hub service not available'
      };
    }

    // Get all countries from gazetteer
    const allCountries = this.countryHubGapService.getAllCountries();
    const total = allCountries.length;

    // Get predictions for top countries - use intMaxSeeds or 0 for all
    // If intMaxSeeds is 0, null, or >= total, use all countries
    const useAllCountries = !this.intMaxSeeds || this.intMaxSeeds >= total;
    const topCountries = useAllCountries 
      ? allCountries 
      : this.countryHubGapService.getTopCountries(this.intMaxSeeds);

    // Display evaluation upfront
    this.logger.log?.('');
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.('  COUNTRY HUB DISCOVERY EVALUATION');
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.(`  Gazetteer: ${total} countries available globally`);
    this.logger.log?.(`  Target: ${useAllCountries ? 'ALL' : topCountries.length} countries`);
    this.logger.log?.(`  Domain: ${this.domain}`);
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.('');

    // Show progress during URL generation
    this.logger.log?.(`[APS] 🎯 Generating country hub URL predictions for ${this.domain}...`);

    // Generate URL predictions for this domain
    const predictions = [];
    for (const country of topCountries) {
      const urls = this.countryHubGapService.predictCountryHubUrls(
        this.domain,
        country.name,
        country.code
      );
      predictions.push(...urls.map(url => ({
        url,
        country: country.name,
        code: country.code,
        importance: country.importance
      })));
    }

    this.logger.log?.(`[APS] ✅ Generated ${predictions.length} country hub URL predictions`);
    this.logger.log?.(`[APS] 📋 Queueing country hub URLs with high priority for immediate discovery...`);

    // Queue predicted country hub URLs
    let queued = 0;
    for (const pred of predictions) {
      try {
        const normalized = this.normalizeUrl(pred.url);
        await this.enqueueRequest({
          url: normalized,
          kind: 'hub-seed',
          source: 'aps-country-hub-prediction',
          priority: 5, // High priority
          meta: {
            hubKind: 'country',
            countryName: pred.country,
            countryCode: pred.code,
            apsPhase: 'country-hub-discovery'
          }
        });
        queued++;
      } catch (err) {
        this.logger.warn?.(`[APS] Failed to queue ${pred.url}:`, err.message);
      }
    }

    this.logger.log?.('');
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.(`  ✓ QUEUED: ${queued} country hub URLs`);
    this.logger.log?.(`  ✓ TARGET: ${topCountries.length} countries`);
    this.logger.log?.(`  ✓ TOTAL: ${total} countries in gazetteer`);
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.('  🚀 Starting prioritized country hub downloads...');
    this.logger.log?.('═══════════════════════════════════════════════════════════════');
    this.logger.log?.('');

    const message = `Country hubs: ${queued} URLs queued from ${topCountries.length} top countries (${total} total in gazetteer)`;
    this.logger.log?.(`[APS] 🎯 ${message}`);

    // Emit single-line milestone
    this.telemetry?.milestone?.({
      kind: 'aps-country-hub-complete',
      scope: 'planning',
      message,
      details: {
        queued,
        topCountries: topCountries.length,
        totalCountries: total,
        backend: 'aps'
      }
    });

    return {
      complete: true,
      found: queued,
      total,
      topCountries: topCountries.length,
      message
    };
  }

  /**
   * APS Phase 2: Pattern inference
   * Placeholder - integrate with PlannerHost later
   */
  async _apsPatternPhase(countryHubResult) {
    this.logger.log?.('[APS] Phase 2: Pattern inference (delegated to GraphReasonerPlugin)');
    
    // PlannerHost plugins handle this automatically
    return {
      patterns: [],
      message: 'Pattern inference handled by GraphReasonerPlugin'
    };
  }

  /**
   * APS Phase 3: Build final plan
   */
  async _apsBuildPlan(countryHubResult, patternResult) {
    return {
      countryHubs: countryHubResult,
      patterns: patternResult,
      sections: []
    };
  }

  /**
   * Legacy planning workflow
   * Delegates to existing IntelligentPlanRunner logic
   */
  async _runLegacyPlanning(options = {}) {
    this.logger.log?.('[Legacy] Using existing IntelligentPlanRunner workflow');
    
    // Return marker indicating legacy runner should handle this
    return {
      backend: 'legacy',
      delegateToRunner: true
    };
  }

  /**
   * Get backend info for debugging
   */
  getBackendInfo() {
    return {
      backend: this.backend,
      useAPS: this.useAPS,
      hasCountryHubService: !!this.countryHubGapService,
      hasPlannerHost: !!this.plannerHost
    };
  }
}

module.exports = { IntelligentPlanningFacade };
