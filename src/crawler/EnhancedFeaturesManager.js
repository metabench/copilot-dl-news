class EnhancedFeaturesManager {
  constructor({
    ConfigManager,
    EnhancedDatabaseAdapter,
    PriorityScorer,
    ProblemClusteringService,
    PlannerKnowledgeService,
    ProblemResolutionService,
    CrawlPlaybookService,
    CountryHubGapService,
    logger = console
  } = {}) {
    if (!ConfigManager || !EnhancedDatabaseAdapter || !PriorityScorer || !ProblemClusteringService || !PlannerKnowledgeService || !ProblemResolutionService) {
      throw new Error('EnhancedFeaturesManager requires configuration and service constructors');
    }

    this.ConfigManager = ConfigManager;
    this.EnhancedDatabaseAdapter = EnhancedDatabaseAdapter;
    this.PriorityScorer = PriorityScorer;
    this.ProblemClusteringService = ProblemClusteringService;
    this.PlannerKnowledgeService = PlannerKnowledgeService;
    this.ProblemResolutionService = ProblemResolutionService;
    this.CrawlPlaybookService = CrawlPlaybookService;
    this.CountryHubGapService = CountryHubGapService;
    this.logger = logger;

    this._resetState();
  }

  _resetState() {
    this.featuresEnabled = {
      advancedPlanningSuite: false, // Config flag: enables PlannerHost mode
      gapDrivenPrioritization: false,
      plannerKnowledgeReuse: false,
      realTimeCoverageAnalytics: false,
      problemClustering: false,
      problemResolution: false,
      crawlPlaybooks: false,
      patternDiscovery: false,
      countryHubGaps: false
    };
    this.configManager = null;
    this.enhancedDbAdapter = null;
    this.priorityScorer = null;
    this.problemClusteringService = null;
    this.plannerKnowledgeService = null;
    this.problemResolutionService = null;
    this.crawlPlaybookService = null;
    this.countryHubGapService = null;
    this.jobId = null;
  }

  getEnabledFeatures() {
    return this.featuresEnabled;
  }

  getEnhancedDbAdapter() {
    return this.enhancedDbAdapter;
  }

  getProblemClusteringService() {
    return this.problemClusteringService;
  }

  getPlannerKnowledgeService() {
    return this.plannerKnowledgeService;
  }

  getProblemResolutionService() {
    return this.problemResolutionService;
  }

  getCrawlPlaybookService() {
    return this.crawlPlaybookService;
  }

  getCountryHubGapService() {
    return this.countryHubGapService;
  }

  async initialize({ dbAdapter, jobId, state = null, telemetry = null } = {}) {
    this._resetState();
    this.jobId = jobId || null;
    const initializationFailures = [];

    try {
      this.configManager = new this.ConfigManager();
      const featureFlags = this.configManager.getFeatureFlags();
      this.logger.log('Enhanced features configuration:', featureFlags);

      const anyFeatureRequested = Object.values(featureFlags || {}).some(Boolean);
      const dbHasIsEnabled = typeof dbAdapter?.isEnabled === 'function';
      const dbEnabled = dbHasIsEnabled ? dbAdapter.isEnabled() : Boolean(dbAdapter);

      if (anyFeatureRequested && dbEnabled) {
        try {
          this.enhancedDbAdapter = new this.EnhancedDatabaseAdapter(dbAdapter);
          this.logger.log('Enhanced database adapter initialized');
        } catch (error) {
          console.warn('\x1b[38;5;214mEnhanced DB adapter unavailable (optional), crawl continues normally\x1b[0m');
          console.warn('Reason:', error.message);
          this.enhancedDbAdapter = null;
        }
      }

      // Track config-only flags (no service initialization needed)
      this.featuresEnabled.advancedPlanningSuite = Boolean(featureFlags.advancedPlanningSuite);
      this.featuresEnabled.graphReasonerPlugin = Boolean(featureFlags.graphReasonerPlugin);
      this.featuresEnabled.gazetteerAwareReasoner = Boolean(featureFlags.gazetteerAwareReasoner);

      await this._initializeFeatureServices(featureFlags || {}, { dbAdapter, state, telemetry }, initializationFailures);

      const enabledFeatures = Object.keys(this.featuresEnabled).filter((key) => this.featuresEnabled[key]);
      const requestedFeatures = Object.keys(featureFlags || {}).filter(key => featureFlags[key]);
      const requestedButNotEnabled = requestedFeatures.filter(f => !this.featuresEnabled[f]);
      
      // If features were requested but not enabled, and no explicit failures recorded, they failed silently
      if (requestedButNotEnabled.length > 0 && initializationFailures.length === 0) {
        requestedButNotEnabled.forEach(feature => {
          initializationFailures.push({ 
            feature, 
            error: 'Required dependencies not available (likely missing enhanced DB adapter)'
          });
        });
      }
      
      // Separate config flags from service-based features for clearer reporting
      const configFlags = ['advancedPlanningSuite', 'graphReasonerPlugin', 'gazetteerAwareReasoner'];
      const serviceFeatures = enabledFeatures.filter(f => !configFlags.includes(f));
      const enabledConfigFlags = enabledFeatures.filter(f => configFlags.includes(f));

      if (initializationFailures.length > 0) {
        // Some features failed - show detailed error
        console.error('\x1b[31mEnhanced features initialization failed:\x1b[0m');
        initializationFailures.forEach(failure => {
          console.error(`  \x1b[31m✗\x1b[0m ${failure.feature}: ${failure.error}`);
        });
        if (serviceFeatures.length > 0 || enabledConfigFlags.length > 0) {
          const parts = [];
          if (enabledConfigFlags.length > 0) parts.push(`\x1b[36m${enabledConfigFlags.join(', ')}\x1b[0m (mode)`);
          if (serviceFeatures.length > 0) parts.push(serviceFeatures.join(', '));
          console.log(`\x1b[32m✓\x1b[0m Partial success - enabled: ${parts.join(', ')}`);
        }
      } else if (enabledFeatures.length > 0) {
        // All requested features succeeded
        const parts = [];
        if (enabledConfigFlags.length > 0) parts.push(`\x1b[36m${enabledConfigFlags.join(', ')}\x1b[0m (mode)`);
        if (serviceFeatures.length > 0) parts.push(serviceFeatures.join(', '));
        console.log(`\x1b[32m✓ Enhanced features enabled:\x1b[0m ${parts.join(', ')}`);
      } else {
        this.logger.log('Enhanced features disabled or unavailable');
      }
    } catch (error) {
      console.error('\x1b[31mEnhanced features initialization failed (unexpected error):\x1b[0m', error?.message || String(error));
      if (error?.stack) {
        console.error('Stack:', error.stack);
      }
      this._resetState();
    }
  }

  async _initializeFeatureServices(features, { dbAdapter, state = null, telemetry = null } = {}, failures = []) {
    const baseNewsDb = typeof dbAdapter?.getDb === 'function' ? dbAdapter.getDb() : null;

    if (features.gapDrivenPrioritization && this.enhancedDbAdapter) {
      try {
        this.priorityScorer = new this.PriorityScorer(this.configManager, this.enhancedDbAdapter);
        this.featuresEnabled.gapDrivenPrioritization = true;
        this.logger.log('Priority scorer initialized for gap-driven prioritization');
      } catch (error) {
        failures.push({ feature: 'gapDrivenPrioritization', error: error.message });
        this._warn('Failed to initialize priority scorer:', error);
        this.priorityScorer = null;
        this.featuresEnabled.gapDrivenPrioritization = false;
      }
    }

    if (features.problemClustering && this.enhancedDbAdapter) {
      try {
        this.problemClusteringService = new this.ProblemClusteringService(this.enhancedDbAdapter, this.configManager);
        this.featuresEnabled.problemClustering = true;
        this.logger.log('Problem clustering service initialized');
      } catch (error) {
        failures.push({ feature: 'problemClustering', error: error.message });
        this._warn('Failed to initialize problem clustering service:', error);
        this.problemClusteringService = null;
        this.featuresEnabled.problemClustering = false;
      }
    }

    if (features.plannerKnowledgeReuse && this.enhancedDbAdapter) {
      try {
        this.plannerKnowledgeService = new this.PlannerKnowledgeService(this.enhancedDbAdapter, this.configManager);
        this.featuresEnabled.plannerKnowledgeReuse = true;
        this.logger.log('Planner knowledge service initialized');
      } catch (error) {
        failures.push({ feature: 'plannerKnowledgeReuse', error: error.message });
        this._warn('Failed to initialize planner knowledge service:', error);
        this.plannerKnowledgeService = null;
        this.featuresEnabled.plannerKnowledgeReuse = false;
      }
    }

    this.featuresEnabled.realTimeCoverageAnalytics = Boolean(features.realTimeCoverageAnalytics && this.enhancedDbAdapter);

    if (features.problemResolution && (baseNewsDb || this.enhancedDbAdapter)) {
      try {
        const recordSeed = typeof dbAdapter?.recordPlaceHubSeed === 'function'
          ? (_handle, payload) => {
              try {
                return dbAdapter.recordPlaceHubSeed(payload);
              } catch (err) {
                this._warn('Failed to record hub seed via crawler db:', err);
                return false;
              }
            }
          : null;

        this.problemResolutionService = new this.ProblemResolutionService({
          db: baseNewsDb || this.enhancedDbAdapter?.newsDb?.getDb?.() || this.enhancedDbAdapter?.newsDb,
          recordSeed,
          logger: this.logger
        });
        this.featuresEnabled.problemResolution = true;
        this.logger.log('Problem resolution service initialized');
      } catch (error) {
        failures.push({ feature: 'problemResolution', error: error.message });
        this._warn('Failed to initialize problem resolution service:', error);
        this.problemResolutionService = null;
        this.featuresEnabled.problemResolution = false;
      }
    }

    if (this.CrawlPlaybookService && (features.crawlPlaybooks || features.plannerKnowledgeReuse) && baseNewsDb) {
      try {
        this.crawlPlaybookService = new this.CrawlPlaybookService({
          db: baseNewsDb,
          plannerKnowledgeService: this.plannerKnowledgeService,
          problemClusteringService: this.problemClusteringService,
          problemResolutionService: this.problemResolutionService,
          logger: this.logger
        });
        this.featuresEnabled.crawlPlaybooks = true;
        this.logger.log('Crawl playbook service initialized');
      } catch (error) {
        failures.push({ feature: 'crawlPlaybooks', error: error.message });
        this._warn('Failed to initialize crawl playbook service:', error);
        this.crawlPlaybookService = null;
        this.featuresEnabled.crawlPlaybooks = false;
      }
    }

    // Initialize CountryHubGapService when gap-driven prioritization and pattern discovery are enabled
    if (this.CountryHubGapService && 
        (features.gapDrivenPrioritization || features.patternDiscovery) && 
        (state && telemetry)) {
      try {
        this.countryHubGapService = new this.CountryHubGapService({
          state,
          telemetry,
          enhancedDb: this.enhancedDbAdapter,
          plannerKnowledge: this.plannerKnowledgeService,
          logger: this.logger
        });
        this.featuresEnabled.countryHubGaps = true;
        this.featuresEnabled.patternDiscovery = Boolean(features.patternDiscovery);
        this.logger.log('Country hub gap service initialized');
      } catch (error) {
        failures.push({ feature: 'countryHubGaps', error: error.message });
        this._warn('Failed to initialize country hub gap service:', error);
        this.countryHubGapService = null;
        this.featuresEnabled.countryHubGaps = false;
      }
    }
  }

  computePriority(args, { computeBasePriority, jobId } = {}) {
    if (this.featuresEnabled.gapDrivenPrioritization && this.priorityScorer) {
      try {
        return this.priorityScorer.computeEnhancedPriority({
          ...args,
          jobId: jobId || this.jobId || null
        });
      } catch (error) {
        this._warn('Enhanced priority computation failed, falling back to base:', error);
      }
    }

    const basePriority = computeBasePriority(args);
    return {
      priority: basePriority,
      prioritySource: 'base',
      bonusApplied: 0,
      basePriority
    };
  }

  cleanup() {
    try {
      if (this.countryHubGapService?.close) {
        this.countryHubGapService.close();
      }
      if (this.crawlPlaybookService?.close) {
        this.crawlPlaybookService.close();
      }
      if (this.problemClusteringService?.close) {
        this.problemClusteringService.close();
      }
      if (this.plannerKnowledgeService?.close) {
        this.plannerKnowledgeService.close();
      }
      if (this.priorityScorer?.close) {
        this.priorityScorer.close();
      }
      if (this.problemResolutionService?.close) {
        this.problemResolutionService.close();
      }
      if (this.configManager?.close) {
        this.configManager.close();
      }
    } catch (error) {
      this._warn('Error during enhanced features cleanup:', error);
    } finally {
      this._resetState();
    }
  }

  _warn(message, error) {
    const text = error?.message || String(error || 'unknown error');
    if (typeof this.logger?.warn === 'function') {
      this.logger.warn(message, text);
    } else if (typeof this.logger?.log === 'function') {
      this.logger.log(message, text);
    }
  }
}

module.exports = {
  EnhancedFeaturesManager
};
