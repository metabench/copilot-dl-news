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

  const targetedAnalysisRun = jest.fn();
  class FakeTargetedAnalysisRunner {
    constructor(args) {
      this.args = args;
      this.maxSamples = 3;
    }

    run(...args) {
      return targetedAnalysisRun(...args);
    }
  }

  const navigationDiscoveryRun = jest.fn();
  class FakeNavigationDiscoveryRunner {
    constructor(args) {
      this.args = args;
    }

    run(...args) {
      return navigationDiscoveryRun(...args);
    }
  }

  const plannerConstructors = {
    PlannerTelemetryBridge: FakePlannerTelemetryBridge,
    PlannerOrchestrator: FakePlannerOrchestrator,
    PlannerBootstrap: FakePlannerBootstrap,
    PatternInference: FakePatternInference,
    CountryHubPlanner: FakeCountryHubPlanner,
    HubSeeder: FakeHubSeeder,
    TargetedAnalysisRunner: FakeTargetedAnalysisRunner,
    NavigationDiscoveryRunner: FakeNavigationDiscoveryRunner
  };

  beforeEach(() => {
    plannerBootstrapRun.mockReset();
    patternInferenceRun.mockReset();
    countryHubPlannerComputeCandidates.mockReset();
    hubSeederSeedPlan.mockReset();
    targetedAnalysisRun.mockReset();
    navigationDiscoveryRun.mockReset();
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
    expect(targetedAnalysisRun).not.toHaveBeenCalled();
    expect(navigationDiscoveryRun).not.toHaveBeenCalled();
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
      navigationCandidateCount: 2,
      navigationSeededCount: 1,
      navigationSample: ['https://example.com/world/'],
      sampleSeeded: ['https://example.com/s1', 'https://example.com/s2']
    });

    navigationDiscoveryRun.mockResolvedValue({
      analysedPages: [{ url: deps.startUrl }],
      merged: {
        links: [
          {
            url: 'https://example.com/world/',
            labels: ['World'],
            type: 'primary',
            depth: 1,
            occurrences: 4
          },
          {
            url: 'https://example.com/opinion/',
            labels: ['Opinion'],
            type: 'category',
            depth: 2,
            occurrences: 2
          }
        ]
      },
      summary: {
        totalLinks: 6,
        primary: 3,
        secondary: 2,
        categories: 1,
        meta: 0,
        topLinks: [
          {
            url: 'https://example.com/world/',
            labels: ['World'],
            type: 'primary',
            occurrences: 4
          },
          {
            url: 'https://example.com/opinion/',
            labels: ['Opinion'],
            type: 'category',
            occurrences: 2
          }
        ],
        samples: [
          {
            url: deps.startUrl,
            linkCount: 6,
            examples: [
              {
                url: 'https://example.com/world/'
              }
            ]
          }
        ]
      }
    });

    targetedAnalysisRun.mockResolvedValue({
      sampleLimit: 3,
      samples: [
        {
          url: 'https://example.com/s1',
          section: 'politics',
          classification: 'article',
          wordCount: 450,
          keyPhrases: ['election', 'policy']
        }
      ],
      coverage: {
        sampleSize: 1,
        avgWordCount: 450,
        sectionsCovered: [{ section: 'politics', count: 1 }],
        coveragePct: 0.5,
        expectedSections: patternSections.length
      },
      topKeywords: [
        { phrase: 'election', count: 1 },
        { phrase: 'policy', count: 1 }
      ]
    });

    const result = await runner.run();

    expect(patternInferenceRun).toHaveBeenCalledWith({
      startUrl: deps.startUrl
    });
    expect(navigationDiscoveryRun).toHaveBeenCalledWith(expect.objectContaining({
      startUrl: deps.startUrl,
      seeds: expect.arrayContaining([
        'https://example.com/politics',
        'https://example.com/world'
      ])
    }));
    expect(countryHubPlannerComputeCandidates).toHaveBeenCalledWith(deps.domain.toLowerCase());
    expect(hubSeederSeedPlan).toHaveBeenCalledWith(expect.objectContaining({
      host: deps.domain.toLowerCase(),
      sectionSlugs: patternSections,
      countryCandidates: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com/country/fr' }),
        expect.objectContaining({ url: 'https://example.com/country/de' })
      ]),
      navigationLinks: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com/world/' })
      ]),
      maxSeeds: deps.intMaxSeeds
    }));
    expect(targetedAnalysisRun).toHaveBeenCalledWith({
      seeds: ['https://example.com/s1', 'https://example.com/s2'],
      sections: patternSections,
      articleHints: articleHints
    });

    expect(result.plannerSummary).toMatchObject({
      learnedSections: patternSections,
      learnedSectionCount: patternSections.length,
      learnedSectionsPreview: patternSections.slice(0, 8),
      navigation: expect.objectContaining({
        totalLinks: 6,
        primary: 3
      }),
      targetedAnalysis: {
        sampleSize: 1,
        sectionsCovered: [{ section: 'politics', count: 1 }],
        avgWordCount: 450,
        coveragePct: expect.any(Number),
        expectedSections: patternSections.length,
        topKeywords: [
          { phrase: 'election', count: 1 },
          { phrase: 'policy', count: 1 }
        ]
      }
    });

    expect(result.intelligentSummary).toMatchObject({
      seededCount: 3,
      requestedCount: 5,
      sampleSeeded: ['https://example.com/s1', 'https://example.com/s2'],
      learnedSectionCount: patternSections.length,
      navigation: expect.objectContaining({ totalLinks: 6 }),
      navigationEntryPoints: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com/world/' })
      ]),
      targetedAnalysis: {
        sampleSize: 1,
        avgWordCount: 450,
        sectionsCovered: [{ section: 'politics', count: 1 }],
        topKeywords: [
          { phrase: 'election', count: 1 },
          { phrase: 'policy', count: 1 }
        ]
      }
    });
  });
});
