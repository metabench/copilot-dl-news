const { IntelligentPlanRunner } = require('../IntelligentPlanRunner');

describe('Process contract: IntelligentPlanRunner place hub verification', () => {
  function createPlannerFakes() {
    class FakePlannerTelemetryBridge {
      constructor(args) {
        this.args = args;
        this.milestoneCalls = [];
      }

      milestone(evt) {
        this.milestoneCalls.push(evt);
      }
    }

    class FakePlannerOrchestrator {
      constructor({ telemetryBridge, logger, enabled }) {
        this.telemetryBridge = telemetryBridge;
        this.logger = logger;
        this.enabled = enabled;
        this.summary = {};
        this.stages = [];
      }

      async runStage(name, ctx, stageFn, { updateSummaryWithResult } = {}) {
        this.stages.push({ name, ctx });
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

    class FakePlannerBootstrap {
      constructor() {}
      run() {
        return { skipPlan: false };
      }
    }

    class FakePatternInference {
      constructor() {}
      run() {
        return {
          learned: { sections: ['world'], articleHints: [] },
          fetchMeta: {}
        };
      }
    }

    class FakeNavigationDiscoveryRunner {
      constructor() {}
      run() {
        return { merged: { links: [] }, summary: { totalLinks: 0 }, analysedPages: [] };
      }
    }

    class FakeCountryHubPlanner {
      constructor() {}
      computeCandidates() {
        return [
          { url: 'https://example.com/country/fr', slug: 'fr', name: 'France', reason: 'test' },
          { url: 'https://example.com/country/de', slug: 'de', name: 'Germany', reason: 'test' }
        ];
      }
    }

    class FakeHubSeeder {
      constructor({ enqueueRequest } = {}) {
        this.enqueueRequest = typeof enqueueRequest === 'function' ? enqueueRequest : null;
      }

      seedPlan() {
        // Simulate hub seeding enqueues so the contract can assert ordering.
        this.enqueueRequest?.({
          url: 'https://example.com/seed/world',
          depth: 0,
          type: {
            kind: 'hub-seed',
            hubKind: 'section',
            source: 'pattern-inference',
            reason: 'pattern-section'
          }
        });
        this.enqueueRequest?.({
          url: 'https://example.com/seed/country/fr',
          depth: 0,
          type: {
            kind: 'hub-seed',
            hubKind: 'country',
            source: 'country-planner',
            reason: 'country-candidate'
          }
        });

        return {
          seededCount: 0,
          requestedCount: 0,
          sectionHubCount: 0,
          countryCandidateCount: 2,
          navigationCandidateCount: 0,
          navigationSeededCount: 0,
          navigationSample: [],
          sampleSeeded: []
        };
      }
    }

    class FakeTargetedAnalysisRunner {
      constructor() {
        this.maxSamples = 1;
      }
      run() {
        return null;
      }
    }

    return {
      FakePlannerTelemetryBridge,
      FakePlannerOrchestrator,
      FakePlannerBootstrap,
      FakePatternInference,
      FakeCountryHubPlanner,
      FakeHubSeeder,
      FakeTargetedAnalysisRunner,
      FakeNavigationDiscoveryRunner
    };
  }

  test('predicts: missing country hubs are enqueued with priority 250 before seeding', async () => {
    const enqueueRequest = jest.fn();

    const {
      FakePlannerTelemetryBridge,
      FakePlannerOrchestrator,
      FakePlannerBootstrap,
      FakePatternInference,
      FakeCountryHubPlanner,
      FakeHubSeeder,
      FakeTargetedAnalysisRunner,
      FakeNavigationDiscoveryRunner
    } = createPlannerFakes();

    const runner = new IntelligentPlanRunner({
      telemetry: { emit: jest.fn() },
      domain: 'example.com',
      baseUrl: 'https://example.com',
      startUrl: 'https://example.com/news',
      plannerEnabled: true,
      plannerVerbosity: 0,
      fetchPage: jest.fn(async () => ({ ok: true })),
      getCachedArticle: jest.fn(async () => null),
      dbAdapter: {},
      plannerKnowledgeService: {},
      enqueueRequest,
      normalizeUrl: (url) => url,
      state: {},
      intMaxSeeds: 10,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      PlannerTelemetryBridge: FakePlannerTelemetryBridge,
      PlannerOrchestrator: FakePlannerOrchestrator,
      PlannerBootstrap: FakePlannerBootstrap,
      PatternInference: FakePatternInference,
      CountryHubPlanner: FakeCountryHubPlanner,
      HubSeeder: FakeHubSeeder,
      TargetedAnalysisRunner: FakeTargetedAnalysisRunner,
      NavigationDiscoveryRunner: FakeNavigationDiscoveryRunner,
      enableTargetedAnalysis: false
    });

    const result = await runner.run();

    expect(result.plannerSummary).toBeTruthy();

    const orderedEnqueuePayloads = enqueueRequest.mock.calls.map(([req]) => req);

    // Contract: two candidates -> two high-priority verification enqueues.
    const verificationCalls = orderedEnqueuePayloads
      .filter((req) => req?.priority === 250 && req?.type?.kind === 'place-hub-verification');

    expect(verificationCalls).toHaveLength(2);
    expect(verificationCalls.map((c) => c.url).sort()).toEqual([
      'https://example.com/country/de',
      'https://example.com/country/fr'
    ]);

    // Contract: verification enqueues happen before any hub seeding enqueues.
    const firstHubSeedIndex = orderedEnqueuePayloads.findIndex((req) => req?.type?.kind === 'hub-seed');
    expect(firstHubSeedIndex).toBeGreaterThanOrEqual(0);

    const verificationCountBeforeSeeds = orderedEnqueuePayloads
      .slice(0, firstHubSeedIndex)
      .filter((req) => req?.type?.kind === 'place-hub-verification' && req?.priority === 250).length;
    expect(verificationCountBeforeSeeds).toBe(2);
  });
});
