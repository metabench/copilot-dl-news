const { IntelligentPlanRunner } = require('../IntelligentPlanRunner');

describe('IntelligentPlanRunner', () => {
  const baseDependencies = () => ({
    telemetry: { emit: jest.fn() },
    domain: 'Example.com',
    baseUrl: 'https://example.com',
    startUrl: 'https://example.com/news',
    plannerEnabled: true,
    plannerVerbosity: 2,
    intTargetHosts: ['foo.example.com'],
    fetchPage: jest.fn(),
    getCachedArticle: jest.fn(),
    dbAdapter: {},
    plannerKnowledgeService: {},
    enqueueRequest: jest.fn(),
    normalizeUrl: jest.fn(),
    state: {},
    intMaxSeeds: 10,
    logger: { log: jest.fn() }
  });

  class FakePlannerTelemetryBridge {
    constructor(args) {
      this.args = args;
    }
  }

  class FakePlannerOrchestrator {
    constructor({ telemetryBridge, logger, enabled }) {
      this.telemetryBridge = telemetryBridge;
      this.logger = logger;
      this.enabled = enabled;
      this.summary = {};
    }

    async runStage(name, _ctx, stageFn, { updateSummaryWithResult } = {}) {
      this.lastStage = name;
      const result = await stageFn();
      if (updateSummaryWithResult) {
        this.summary = updateSummaryWithResult(this.summary, result);
      }
      return result;
    }

    buildSummary(extra = {}) {
      return {
        ...this.summary,
        ...extra
      };
    }
  }

  const plannerBootstrapRun = jest.fn();
  class FakePlannerBootstrap {
    constructor(args) {
      this.args = args;
    }

    run(...args) {
      return plannerBootstrapRun(...args);
    }
  }

  const patternInferenceRun = jest.fn();
  class FakePatternInference {
    constructor(args) {
      this.args = args;
    }

    run(...args) {
      return patternInferenceRun(...args);
    }
  }

  const countryHubPlannerComputeCandidates = jest.fn();
  class FakeCountryHubPlanner {
    constructor(args) {
      this.args = args;
    }

    computeCandidates(...args) {
      return countryHubPlannerComputeCandidates(...args);
    }
  }

  const hubSeederSeedPlan = jest.fn();
  class FakeHubSeeder {
    constructor(args) {
      this.args = args;
    }

    seedPlan(...args) {
      return hubSeederSeedPlan(...args);
    }
  }

  const plannerConstructors = {
    PlannerTelemetryBridge: FakePlannerTelemetryBridge,
    PlannerOrchestrator: FakePlannerOrchestrator,
    PlannerBootstrap: FakePlannerBootstrap,
    PatternInference: FakePatternInference,
    CountryHubPlanner: FakeCountryHubPlanner,
    HubSeeder: FakeHubSeeder
  };

  beforeEach(() => {
    plannerBootstrapRun.mockReset();
    patternInferenceRun.mockReset();
    countryHubPlannerComputeCandidates.mockReset();
    hubSeederSeedPlan.mockReset();
  });

  it('returns skip summary when bootstrap requests skip', async () => {
    const deps = baseDependencies();
    const runner = new IntelligentPlanRunner({
      ...deps,
      ...plannerConstructors
    });

    plannerBootstrapRun.mockResolvedValue({
      skipPlan: true,
      allowed: true
    });

    const result = await runner.run();

    expect(result.plannerSummary).toMatchObject({
      seededCount: 0,
      requestedCount: 0,
      sectionHubCount: 0,
      countryCandidateCount: 0
    });
    expect(result.intelligentSummary).toEqual(result.plannerSummary);
    expect(plannerBootstrapRun).toHaveBeenCalled();
  });

  it('runs full planner pipeline and produces summaries', async () => {
    const deps = baseDependencies();
    const runner = new IntelligentPlanRunner({
      ...deps,
      ...plannerConstructors
    });

    const patternSections = ['politics', 'world'];
    const articleHints = ['https://example.com/a', 'https://example.com/b'];

    plannerBootstrapRun.mockResolvedValue({
      skipPlan: false
    });

    patternInferenceRun.mockResolvedValue({
      learned: {
        sections: patternSections,
        articleHints
      },
      fetchMeta: {}
    });

    const candidates = [
      { url: 'https://example.com/country/fr' },
      { url: 'https://example.com/country/de' }
    ];
    countryHubPlannerComputeCandidates.mockResolvedValue(candidates);

    hubSeederSeedPlan.mockResolvedValue({
      seededCount: 3,
      requestedCount: 5,
      sectionHubCount: 2,
      countryCandidateCount: candidates.length,
      sampleSeeded: ['https://example.com/s1', 'https://example.com/s2']
    });

    const result = await runner.run();

    expect(patternInferenceRun).toHaveBeenCalledWith({
      startUrl: deps.startUrl
    });
    expect(countryHubPlannerComputeCandidates).toHaveBeenCalledWith(deps.domain.toLowerCase());
    expect(hubSeederSeedPlan).toHaveBeenCalledWith({
      host: deps.domain.toLowerCase(),
      sectionSlugs: patternSections,
      countryCandidates: candidates,
      maxSeeds: deps.intMaxSeeds
    });

    expect(result.plannerSummary).toMatchObject({
      learnedSections: patternSections,
      learnedSectionCount: patternSections.length,
      learnedSectionsPreview: patternSections.slice(0, 8)
    });

    expect(result.intelligentSummary).toMatchObject({
      seededCount: 3,
      requestedCount: 5,
      sampleSeeded: ['https://example.com/s1', 'https://example.com/s2'],
      learnedSectionCount: patternSections.length
    });
  });
});
