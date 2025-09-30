class IntelligentPlanRunner {
  constructor({
    telemetry,
    domain,
    baseUrl,
    startUrl,
    plannerEnabled,
    plannerVerbosity,
    intTargetHosts,
    fetchPage,
    getCachedArticle,
    dbAdapter,
    plannerKnowledgeService,
    enqueueRequest,
    normalizeUrl,
    state,
    intMaxSeeds = 50,
    logger = console,
    PlannerTelemetryBridge,
    PlannerOrchestrator,
    PlannerBootstrap,
    PatternInference,
    CountryHubPlanner,
    HubSeeder
  } = {}) {
    if (!telemetry || !domain || !baseUrl || !startUrl) {
      throw new Error('IntelligentPlanRunner requires telemetry, domain, baseUrl, and startUrl');
    }
    if (typeof fetchPage !== 'function') {
      throw new Error('IntelligentPlanRunner requires a fetchPage function');
    }
    if (typeof getCachedArticle !== 'function') {
      throw new Error('IntelligentPlanRunner requires a getCachedArticle function');
    }
    if (typeof enqueueRequest !== 'function' || typeof normalizeUrl !== 'function') {
      throw new Error('IntelligentPlanRunner requires enqueueRequest and normalizeUrl functions');
    }
    if (!PlannerTelemetryBridge || !PlannerOrchestrator || !PlannerBootstrap || !PatternInference || !CountryHubPlanner || !HubSeeder) {
      throw new Error('IntelligentPlanRunner requires planner constructors');
    }

    this.telemetry = telemetry;
    this.domain = domain;
    this.baseUrl = baseUrl;
    this.startUrl = startUrl;
    this.plannerEnabled = plannerEnabled;
    this.plannerVerbosity = typeof plannerVerbosity === 'number' ? plannerVerbosity : 0;
    this.intTargetHosts = Array.isArray(intTargetHosts) ? intTargetHosts : null;
    this.fetchPage = fetchPage;
    this.getCachedArticle = getCachedArticle;
    this.dbAdapter = dbAdapter;
    this.plannerKnowledgeService = plannerKnowledgeService;
    this.enqueueRequest = enqueueRequest;
    this.normalizeUrl = normalizeUrl;
    this.state = state;
    this.intMaxSeeds = typeof intMaxSeeds === 'number' ? intMaxSeeds : 50;
    this.logger = logger;

    this.PlannerTelemetryBridge = PlannerTelemetryBridge;
    this.PlannerOrchestrator = PlannerOrchestrator;
    this.PlannerBootstrap = PlannerBootstrap;
    this.PatternInference = PatternInference;
    this.CountryHubPlanner = CountryHubPlanner;
    this.HubSeeder = HubSeeder;
  }

  async run() {
    const host = this.domain.toLowerCase();
    this._log(`Intelligent crawl planning for host=${host}`);

    const telemetryBridge = new this.PlannerTelemetryBridge({
      telemetry: this.telemetry,
      domain: host,
      logger: this.logger
    });

    const orchestrator = new this.PlannerOrchestrator({
      telemetryBridge,
      logger: this.logger,
      enabled: this.plannerEnabled
    });

    const plannerBootstrap = new this.PlannerBootstrap({
      telemetry: telemetryBridge,
      plannerVerbosity: this.plannerVerbosity
    });

    const bootstrapResult = await orchestrator.runStage('bootstrap', {
      host,
      targetHosts: Array.isArray(this.intTargetHosts) && this.intTargetHosts.length ? this.intTargetHosts : undefined
    }, () => plannerBootstrap.run({
      host,
      targetHosts: this.intTargetHosts
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          allowed: res.allowed !== false,
          skipped: !!res.skipPlan,
          plannerVerbosity: res.plannerVerbosity,
          targetHosts: Array.isArray(res.targetHosts) && res.targetHosts.length ? res.targetHosts : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        bootstrap: {
          allowed: res?.allowed !== false,
          skipPlan: !!res?.skipPlan,
          targetHosts: Array.isArray(res?.targetHosts) && res.targetHosts.length ? res.targetHosts : null,
          plannerVerbosity: res?.plannerVerbosity ?? this.plannerVerbosity
        }
      })
    });

    if (bootstrapResult?.skipPlan) {
      const summary = orchestrator.buildSummary({
        seededCount: 0,
        requestedCount: 0,
        sectionHubCount: 0,
        countryCandidateCount: 0,
        sampleSeeded: [],
        learnedSectionCount: 0,
        learnedSectionsPreview: []
      });
      return {
        plannerSummary: summary,
        intelligentSummary: summary
      };
    }

    const patternInference = new this.PatternInference({
      fetchPage: this.fetchPage,
      getCachedArticle: this.getCachedArticle,
      telemetry: telemetryBridge,
      baseUrl: this.baseUrl,
      domain: this.domain,
      logger: this.logger
    });

    const patternResult = await orchestrator.runStage('infer-patterns', {
      startUrl: this.startUrl
    }, () => patternInference.run({
      startUrl: this.startUrl
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        const sections = Array.isArray(res.learned?.sections) ? res.learned.sections : [];
        const hints = Array.isArray(res.learned?.articleHints) ? res.learned.articleHints : [];
        return {
          sectionCount: sections.length,
          sectionsPreview: sections.slice(0, 6),
          articleHintsCount: hints.length,
          articleHintsPreview: hints.slice(0, 6),
          homepageSource: res.fetchMeta?.source || null,
          notModified: !!res.fetchMeta?.notModified,
          hadError: !!res.fetchMeta?.error
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        learnedSections: Array.isArray(res?.learned?.sections) ? res.learned.sections : [],
        articleHints: Array.isArray(res?.learned?.articleHints) ? res.learned.articleHints : []
      })
    });

    const learnedSections = Array.isArray(patternResult?.learned?.sections) ? patternResult.learned.sections : [];

    const countryHubPlanner = new this.CountryHubPlanner({
      baseUrl: this.baseUrl,
      db: this.dbAdapter,
      knowledgeService: this.plannerKnowledgeService
    });

    const countryCandidates = await orchestrator.runStage('country-hubs', {
      host
    }, () => countryHubPlanner.computeCandidates(host), {
      mapResultForEvent: (res) => {
        if (!Array.isArray(res)) {
          return {
            candidateCount: 0
          };
        }
        return {
          candidateCount: res.length,
          sample: res.slice(0, 5).map((c) => c?.url).filter(Boolean)
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        countryCandidates: Array.isArray(res) ? res : []
      })
    }) || [];

    const maxSeeds = this.intMaxSeeds;
    const hubSeeder = new this.HubSeeder({
      enqueueRequest: this.enqueueRequest,
      normalizeUrl: this.normalizeUrl,
      state: this.state,
      telemetry: telemetryBridge,
      db: this.dbAdapter,
      baseUrl: this.baseUrl,
      logger: this.logger
    });

    const seedResult = await orchestrator.runStage('seed-hubs', {
      sectionsFromPatterns: learnedSections.length,
      candidateCount: countryCandidates.length,
      maxSeeds
    }, () => hubSeeder.seedPlan({
      host,
      sectionSlugs: learnedSections,
      countryCandidates,
      maxSeeds
    }), {
      mapResultForEvent: (res) => {
        if (!res) return null;
        return {
          seededCount: res.seededCount || 0,
          requestedCount: res.requestedCount || 0,
          sectionHubCount: res.sectionHubCount || 0,
          countryCandidateCount: res.countryCandidateCount || 0,
          sampleSeeded: Array.isArray(res.sampleSeeded) ? res.sampleSeeded.slice(0, 3) : undefined
        };
      },
      updateSummaryWithResult: (summary = {}, res) => ({
        ...summary,
        seedResult: res || null
      })
    });

    const plannerSummary = orchestrator.buildSummary({
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8)
    });

    const intelligentSummary = {
      seededCount: seedResult?.seededCount || 0,
      requestedCount: seedResult?.requestedCount || 0,
      sectionHubCount: seedResult?.sectionHubCount || learnedSections.length,
      countryCandidateCount: seedResult?.countryCandidateCount || countryCandidates.length,
      sampleSeeded: Array.isArray(seedResult?.sampleSeeded) ? seedResult.sampleSeeded.slice(0, 5) : [],
      learnedSectionCount: learnedSections.length,
      learnedSectionsPreview: learnedSections.slice(0, 8),
      ...plannerSummary
    };

    return {
      plannerSummary,
      intelligentSummary
    };
  }

  _log(message) {
    try {
      if (typeof this.logger?.log === 'function') {
        this.logger.log(message);
      }
    } catch (_) {}
  }
}

module.exports = {
  IntelligentPlanRunner
};
