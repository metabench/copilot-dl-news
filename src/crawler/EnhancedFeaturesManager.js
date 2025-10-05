class EnhancedFeaturesManager {
  constructor({
    ConfigManager,
    EnhancedDatabaseAdapter,
    PriorityScorer,
    ProblemClusteringService,
    PlannerKnowledgeService,
    ProblemResolutionService,
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
    this.logger = logger;

    this._resetState();
  }

  _resetState() {
    this.featuresEnabled = {
      gapDrivenPrioritization: false,
      plannerKnowledgeReuse: false,
      realTimeCoverageAnalytics: false,
      problemClustering: false,
      problemResolution: false
    };
    this.configManager = null;
    this.enhancedDbAdapter = null;
    this.priorityScorer = null;
    this.problemClusteringService = null;
    this.plannerKnowledgeService = null;
    this.problemResolutionService = null;
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

  async initialize({ dbAdapter, jobId } = {}) {
    this._resetState();
    this.jobId = jobId || null;

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
          this._warn('Failed to initialize enhanced database adapter:', error);
          this.enhancedDbAdapter = null;
        }
      }

      await this._initializeFeatureServices(featureFlags || {}, { dbAdapter });

      const enabledFeatures = Object.keys(this.featuresEnabled).filter((key) => this.featuresEnabled[key]);
      if (enabledFeatures.length > 0) {
        this.logger.log(`Enhanced features enabled: ${enabledFeatures.join(', ')}`);
      } else {
        this.logger.log('Enhanced features disabled or unavailable');
      }
    } catch (error) {
      this._warn('Enhanced features initialization failed:', error);
      this._resetState();
    }
  }

  async _initializeFeatureServices(features, { dbAdapter } = {}) {
    const baseNewsDb = typeof dbAdapter?.getDb === 'function' ? dbAdapter.getDb() : null;

    if (features.gapDrivenPrioritization && this.enhancedDbAdapter) {
      try {
        this.priorityScorer = new this.PriorityScorer(this.configManager, this.enhancedDbAdapter);
        this.featuresEnabled.gapDrivenPrioritization = true;
        this.logger.log('Priority scorer initialized for gap-driven prioritization');
      } catch (error) {
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
        this._warn('Failed to initialize problem resolution service:', error);
        this.problemResolutionService = null;
        this.featuresEnabled.problemResolution = false;
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
